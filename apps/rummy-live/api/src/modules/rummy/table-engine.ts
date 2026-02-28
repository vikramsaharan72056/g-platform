import { createHash, createHmac } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { createDeck, parseCard, shuffle } from './cards.js';
import { evaluateHand } from './evaluator.js';
import {
  type AuditRow,
  type DisputeRow,
  type LedgerRow,
  type TableHistoryRow,
  type WalletBalanceRow,
  type WalletTransactionRow,
  RummyPrismaRepository,
} from '../../infra/database/rummy-prisma.repository.js';
import type {
  BetChangeProposal,
  BetControlState,
  DrawPile,
  DropType,
  PlayerIdentity,
  RummyTable,
  RummyTableView,
  SettlementEntry,
  SettlementSummary,
  TableGameState,
  TableChatMessage,
  TableSeat,
  TableSummary,
} from './types.js';

interface CreateTableInput {
  name: string;
  maxPlayers: number;
  betAmount: number;
}

interface EngineConfig {
  turnTimeoutSeconds: number;
  ledgerSigningSecret: string;
  walletInitialBalance: number;
}

interface TimeoutResult {
  tableId: string;
  userId: string;
}

interface ReplayInput {
  sinceId?: number;
  limit?: number;
}

interface ResolveDisputeInput {
  status: 'REVIEWED' | 'RESOLVED' | 'REJECTED';
  resolutionNote: string;
}

type DropMode = 'first' | 'middle' | 'full' | 'timeout';

function nowIso(): string {
  return new Date().toISOString();
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function seatLabel(seat: TableSeat): string {
  return `${seat.name} (${seat.userId})`;
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSortValue(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = stableSortValue(record[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortValue(value));
}

export class RummyTableEngine {
  private readonly tables = new Map<string, RummyTable>();
  private readonly tableChats = new Map<string, TableChatMessage[]>();
  private readonly turnTimeoutSeconds: number;
  private readonly ledgerSigningSecret: string;
  private readonly walletInitialBalance: number;

  constructor(
    private readonly repository: RummyPrismaRepository,
    config: Partial<EngineConfig> = {},
  ) {
    this.turnTimeoutSeconds = Math.max(10, config.turnTimeoutSeconds ?? 30);
    this.ledgerSigningSecret = config.ledgerSigningSecret || 'rummy-live-ledger-dev-secret';
    this.walletInitialBalance = Math.max(0, Math.floor(config.walletInitialBalance ?? 10000));
  }

  async loadPersistedTables(): Promise<void> {
    const saved = await this.repository.loadTables();
    for (const table of saved) {
      const normalized = this.normalizeTable(table);
      this.tables.set(normalized.id, normalized);
    }

    for (const table of this.tables.values()) {
      for (const seat of table.seats) {
        seat.connected = false;
      }
      if (table.status === 'IN_PROGRESS' && table.game) {
        const active = table.seats.filter((s) => s.status === 'ACTIVE').map((s) => s.userId);
        table.game.activePlayerIds = active;

        if (active.length <= 1) {
          const winner = active[0] || table.seats[0]?.userId;
          if (winner) {
            await this.finishGame(table, winner, 'Recovered game with single active player');
          } else {
            table.status = 'FINISHED';
            table.game.finishedAt = nowIso();
            table.game.winningReason = 'Recovered empty table';
          }
        } else {
          const currentTurnUser = table.game.turn.userId;
          if (!active.includes(currentTurnUser)) {
            table.game.turn = this.createTurnState(active[0]!, table.game.turn.turnNo + 1);
          } else if (!table.game.turn.expiresAt) {
            table.game.turn = this.createTurnState(currentTurnUser, table.game.turn.turnNo);
          }
        }

        this.touch(table);
        await this.repository.saveTable(table);
      }
    }
  }

  private normalizeTable(table: RummyTable): RummyTable {
    const normalizedAt = nowIso();
    table.seats = table.seats.map((seat, idx) => ({
      seatNo: seat.seatNo || idx + 1,
      userId: seat.userId,
      name: seat.name,
      hand: seat.hand || [],
      score: seat.score ?? 0,
      status: seat.status || 'ACTIVE',
      turnsPlayed: seat.turnsPlayed ?? 0,
      dropType: seat.dropType || null,
      dropPenalty: seat.dropPenalty ?? 0,
      droppedAt: seat.droppedAt || null,
      reclaimCode: seat.reclaimCode || this.newReclaimCode(),
      connected: seat.connected || false,
      lastSeenAt: seat.lastSeenAt || normalizedAt,
      timeoutCount: seat.timeoutCount || 0,
    }));

    const normalizeProposal = (proposal: BetChangeProposal | null | undefined): BetChangeProposal | null => {
      if (!proposal) return null;
      return {
        id: proposal.id || uuidv4(),
        requestedAmount: Math.max(1, Math.floor(proposal.requestedAmount || table.betAmount)),
        currentAmount: Math.max(1, Math.floor(proposal.currentAmount || table.betAmount)),
        proposedByUserId: proposal.proposedByUserId || 'unknown',
        proposedByName: proposal.proposedByName || 'Unknown',
        status: proposal.status || 'PENDING_PLAYERS',
        playerApprovals: Array.isArray(proposal.playerApprovals) ? proposal.playerApprovals : [],
        playerRejections: Array.isArray(proposal.playerRejections) ? proposal.playerRejections : [],
        adminDecisionBy: proposal.adminDecisionBy ?? null,
        adminDecisionReason: proposal.adminDecisionReason ?? null,
        createdAt: proposal.createdAt || nowIso(),
        updatedAt: proposal.updatedAt || nowIso(),
      };
    };

    const existingBetControl = table.betControl || ({} as Partial<BetControlState>);
    table.betControl = {
      isBlocked: existingBetControl.isBlocked ?? false,
      blockedBy: existingBetControl.blockedBy ?? null,
      blockedReason: existingBetControl.blockedReason ?? null,
      blockedAt: existingBetControl.blockedAt ?? null,
      activeProposal: normalizeProposal(existingBetControl.activeProposal),
      lastResolvedProposal: normalizeProposal(existingBetControl.lastResolvedProposal),
    };

    if (table.game) {
      const jokerRank =
        table.game.jokerRank || (table.game.jokerCard ? parseCard(table.game.jokerCard).rank : null);
      table.game.jokerRank = jokerRank;
      table.game.activePlayerIds =
        table.game.activePlayerIds || table.seats.filter((s) => s.status === 'ACTIVE').map((s) => s.userId);
      table.game.turn.timeoutMs = table.game.turn.timeoutMs || this.turnTimeoutSeconds * 1000;
      table.game.turn.startedAt = table.game.turn.startedAt || nowIso();
      table.game.turn.expiresAt =
        table.game.turn.expiresAt || new Date(Date.now() + table.game.turn.timeoutMs).toISOString();
    }

    return table;
  }

  async listTables(): Promise<TableSummary[]> {
    const saved = await this.repository.loadTables();
    return saved
      .filter(t => t.status !== 'FINISHED')
      .sort((a, b) => (new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1))
      .map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        maxPlayers: t.maxPlayers,
        currentPlayers: t.seats.length,
        betAmount: t.betAmount,
        createdAt: t.createdAt,
        playerIds: t.seats.map((s) => s.userId),
      }));
  }

  async listHistory(tableId: string, limit = 100): Promise<TableHistoryRow[]> {
    return await this.repository.listHistory(tableId, limit);
  }

  async listHistorySince(tableId: string, sinceId = 0, limit = 200): Promise<TableHistoryRow[]> {
    return await this.repository.listHistorySince(tableId, sinceId, limit);
  }

  async getReplay(tableId: string, viewerUserId: string, input: ReplayInput = {}) {
    const table = this.getTableOrThrow(tableId);
    const seat = table.seats.find((s) => s.userId === viewerUserId);
    assertCondition(!!seat, 'You are not seated at this table');

    const sinceId = Math.max(0, Math.floor(input.sinceId ?? 0));
    const limit = Math.max(1, Math.min(1000, Math.floor(input.limit ?? 200)));
    const events = await this.repository.listHistorySince(tableId, sinceId, limit);

    return {
      tableId,
      sinceId,
      limit,
      latestEventId: events.length > 0 ? events[events.length - 1]!.id : sinceId,
      events,
      state: this.getTableView(tableId, viewerUserId),
    };
  }

  async getWallet(user: PlayerIdentity): Promise<WalletBalanceRow> {
    return await this.repository.ensureWallet(user.userId, user.name, {
      initialBonus: this.walletInitialBalance,
    });
  }

  async listWalletTransactions(userId: string, limit = 100): Promise<WalletTransactionRow[]> {
    return await this.repository.listWalletTransactions(userId, limit);
  }

  async listResultLedger(tableId: string, limit = 50): Promise<LedgerRow[]> {
    this.getTableOrThrow(tableId);
    return await this.repository.listResultLedger(tableId, limit);
  }

  async verifyLedgerEntry(ledgerId: number) {
    const row = await this.repository.getResultLedgerById(ledgerId);
    assertCondition(!!row, 'Ledger entry not found');

    const computedPayloadHash = this.hashPayload(row!.payload);
    const expectedSignature = this.signPayloadHash(row!.payloadHash);
    const previous = await this.repository.getPreviousLedgerEntry(row!.tableId, row!.id);
    const expectedPreviousHash = previous?.payloadHash || null;

    const payloadHashValid = row!.payloadHash === computedPayloadHash;
    const signatureValid = row!.signature === expectedSignature;
    const chainValid = row!.previousHash === expectedPreviousHash;

    return {
      ledgerId: row!.id,
      tableId: row!.tableId,
      winnerUserId: row!.winnerUserId,
      valid: payloadHashValid && signatureValid && chainValid,
      checks: {
        payloadHashValid,
        signatureValid,
        chainValid,
      },
      payloadHash: row!.payloadHash,
      computedPayloadHash,
      signature: row!.signature,
      expectedSignature,
      previousHash: row!.previousHash,
      expectedPreviousHash,
      signedAt: row!.createdAt,
      payload: row!.payload,
    };
  }

  async createDispute(tableId: string, user: PlayerIdentity, reason: string, evidence?: string): Promise<DisputeRow> {
    this.getTableOrThrow(tableId);
    const dispute = await this.repository.createDispute(tableId, user.userId, reason, evidence);
    await this.repository.appendAudit('DISPUTE_CREATED', user.userId, tableId, {
      disputeId: dispute.id,
      reason: dispute.reason,
      evidence: dispute.evidence,
    });
    await this.repository.appendHistory(tableId, 'DISPUTE_CREATED', {
      disputeId: dispute.id,
      raisedBy: user.userId,
      reason: dispute.reason,
      evidence: dispute.evidence,
    });
    return dispute;
  }

  async listDisputes(tableId: string, limit = 100): Promise<DisputeRow[]> {
    this.getTableOrThrow(tableId);
    return await this.repository.listDisputes(tableId, limit);
  }

  async resolveDispute(disputeId: number, actor: PlayerIdentity, input: ResolveDisputeInput): Promise<DisputeRow> {
    const dispute = await this.repository.resolveDispute(disputeId, {
      status: input.status,
      resolutionNote: input.resolutionNote,
      resolvedBy: actor.userId,
    });
    await this.repository.appendAudit('DISPUTE_RESOLVED', actor.userId, dispute.tableId, {
      disputeId: dispute.id,
      status: dispute.status,
      resolutionNote: dispute.resolutionNote,
    });
    await this.repository.appendHistory(dispute.tableId, 'DISPUTE_RESOLVED', {
      disputeId: dispute.id,
      status: dispute.status,
      resolutionNote: dispute.resolutionNote,
      resolvedBy: actor.userId,
    });
    return dispute;
  }

  async listAuditLogs(input: { limit?: number; tableId?: string; action?: string } = {}): Promise<AuditRow[]> {
    return await this.repository.listAuditLogs(input);
  }

  async reclaimSeat(tableId: string, reclaimCode: string, user: PlayerIdentity): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    assertCondition(table.status === 'IN_PROGRESS' || table.status === 'WAITING', 'Cannot reclaim seat');

    const code = reclaimCode.trim();
    assertCondition(code.length >= 8, 'Invalid reclaim code');
    const seat = table.seats.find((s) => s.reclaimCode === code);
    assertCondition(!!seat, 'Seat reclaim code is invalid');

    const occupying = table.seats.find((s) => s.userId === user.userId);
    assertCondition(!occupying || occupying.seatNo === seat!.seatNo, 'This user is already seated elsewhere');

    const oldUserId = seat!.userId;
    const oldName = seat!.name;

    if (oldUserId !== user.userId) {
      await this.repository.reassignUser(oldUserId, user.userId, user.name);
      seat!.userId = user.userId;
      seat!.name = user.name;

      if (table.hostUserId === oldUserId) {
        table.hostUserId = user.userId;
      }

      if (table.game) {
        table.game.activePlayerIds = table.game.activePlayerIds.map((id) =>
          id === oldUserId ? user.userId : id,
        );
        if (table.game.turn.userId === oldUserId) {
          table.game.turn.userId = user.userId;
        }
        if (table.game.winnerUserId === oldUserId) {
          table.game.winnerUserId = user.userId;
        }
      }
    }

    seat!.connected = true;
    seat!.lastSeenAt = nowIso();
    seat!.reclaimCode = this.newReclaimCode();
    this.touch(table);
    await this.persist(table, 'TABLE_SEAT_RECLAIMED', {
      seatNo: seat!.seatNo,
      oldUserId,
      oldName,
      newUserId: user.userId,
      newName: user.name,
    });
    return this.getTableView(table.id, user.userId);
  }

  async setSeatConnection(tableId: string, userId: string, connected: boolean): Promise<void> {
    const table = this.tables.get(tableId);
    if (!table) return;
    const seat = table.seats.find((entry) => entry.userId === userId);
    if (!seat) return;

    seat.connected = connected;
    seat.lastSeenAt = nowIso();
    this.touch(table);
    await this.repository.saveTable(table);
    await this.repository.appendAudit('SEAT_CONNECTION', userId, table.id, {
      seatNo: seat.seatNo,
      connected,
    });
  }

  listTableChat(tableId: string, viewer: PlayerIdentity, isAdmin = false, limit = 100): TableChatMessage[] {
    const table = this.getTableOrThrow(tableId);
    if (!isAdmin) {
      this.getSeatOrThrow(table, viewer.userId);
    }
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const messages = this.tableChats.get(tableId) || [];
    return messages.slice(-safeLimit);
  }

  getLatestTableChatMessage(tableId: string): TableChatMessage | null {
    this.getTableOrThrow(tableId);
    const messages = this.tableChats.get(tableId) || [];
    if (messages.length === 0) return null;
    return messages[messages.length - 1] || null;
  }

  addTableChatMessage(
    tableId: string,
    actor: PlayerIdentity,
    message: string,
    role: 'PLAYER' | 'ADMIN' = 'PLAYER',
  ): TableChatMessage {
    const table = this.getTableOrThrow(tableId);
    if (role === 'PLAYER') {
      this.getSeatOrThrow(table, actor.userId);
    }

    const normalized = message.replace(/\s+/g, ' ').trim();
    assertCondition(normalized.length >= 1, 'Message cannot be empty');
    assertCondition(normalized.length <= 300, 'Message is too long');

    const entry: TableChatMessage = {
      id: uuidv4(),
      tableId: table.id,
      userId: actor.userId,
      userName: actor.name,
      role,
      message: normalized,
      createdAt: nowIso(),
    };

    const existing = this.tableChats.get(table.id) || [];
    existing.push(entry);
    if (existing.length > 300) {
      existing.splice(0, existing.length - 300);
    }
    this.tableChats.set(table.id, existing);
    return entry;
  }

  async proposeBetChange(tableId: string, user: PlayerIdentity, requestedAmount: number): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    this.getSeatOrThrow(table, user.userId);
    assertCondition(table.status !== 'FINISHED', 'Cannot change bet after game is finished');
    assertCondition(!table.betControl.isBlocked, 'Bet amount is currently blocked by admin');

    const nextAmount = Math.floor(requestedAmount);
    assertCondition(nextAmount >= 1 && nextAmount <= 1000000, 'Bet amount must be between 1 and 1000000');
    assertCondition(nextAmount !== table.betAmount, 'New bet amount must be different from current amount');

    const activeProposal = table.betControl.activeProposal;
    assertCondition(
      !activeProposal || !['PENDING_PLAYERS', 'PENDING_ADMIN'].includes(activeProposal.status),
      'Another bet change request is already pending',
    );

    const participantIds = this.getBetChangeParticipantIds(table);
    assertCondition(participantIds.length >= 2, 'At least 2 active players are required for bet change');

    const proposal: BetChangeProposal = {
      id: uuidv4(),
      requestedAmount: nextAmount,
      currentAmount: table.betAmount,
      proposedByUserId: user.userId,
      proposedByName: user.name,
      status: 'PENDING_PLAYERS',
      playerApprovals: [user.userId],
      playerRejections: [],
      adminDecisionBy: null,
      adminDecisionReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    if (participantIds.every((id) => proposal.playerApprovals.includes(id))) {
      proposal.status = 'PENDING_ADMIN';
    }

    table.betControl.activeProposal = proposal;
    this.touch(table);
    await this.persist(table, 'BET_CHANGE_PROPOSED', {
      proposalId: proposal.id,
      proposedByUserId: user.userId,
      currentAmount: proposal.currentAmount,
      requestedAmount: proposal.requestedAmount,
      status: proposal.status,
    });
    this.pushSystemChatMessage(
      table.id,
      `${user.name} requested bet change from Rs ${proposal.currentAmount.toLocaleString()} to Rs ${proposal.requestedAmount.toLocaleString()}.`,
    );

    return this.getTableView(table.id, user.userId);
  }

  async respondBetChange(tableId: string, user: PlayerIdentity, approve: boolean): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    this.getSeatOrThrow(table, user.userId);

    const proposal = table.betControl.activeProposal;
    assertCondition(!!proposal, 'No active bet change request');
    assertCondition(proposal!.status === 'PENDING_PLAYERS', 'Bet change request is no longer awaiting player responses');

    const participantIds = this.getBetChangeParticipantIds(table);
    assertCondition(participantIds.includes(user.userId), 'You are not eligible to vote on this bet change');

    proposal!.updatedAt = nowIso();
    proposal!.playerApprovals = proposal!.playerApprovals.filter((id) => id !== user.userId);
    proposal!.playerRejections = proposal!.playerRejections.filter((id) => id !== user.userId);

    if (approve) {
      proposal!.playerApprovals.push(user.userId);
    } else {
      proposal!.playerRejections.push(user.userId);
    }

    if (proposal!.playerRejections.length > 0) {
      proposal!.status = 'REJECTED';
      table.betControl.lastResolvedProposal = { ...proposal! };
      table.betControl.activeProposal = null;
      this.touch(table);
      await this.persist(table, 'BET_CHANGE_REJECTED_BY_PLAYER', {
        proposalId: proposal!.id,
        rejectedBy: user.userId,
      });
      this.pushSystemChatMessage(
        table.id,
        `Bet change to Rs ${proposal!.requestedAmount.toLocaleString()} was rejected by a player.`,
      );
      return this.getTableView(table.id, user.userId);
    }

    if (participantIds.every((id) => proposal!.playerApprovals.includes(id))) {
      proposal!.status = 'PENDING_ADMIN';
      this.touch(table);
      await this.persist(table, 'BET_CHANGE_PENDING_ADMIN', {
        proposalId: proposal!.id,
        requestedAmount: proposal!.requestedAmount,
        approvals: proposal!.playerApprovals,
      });
      this.pushSystemChatMessage(
        table.id,
        `Bet change to Rs ${proposal!.requestedAmount.toLocaleString()} is awaiting admin approval.`,
      );
      return this.getTableView(table.id, user.userId);
    }

    this.touch(table);
    await this.persist(table, 'BET_CHANGE_PLAYER_RESPONSE', {
      proposalId: proposal!.id,
      userId: user.userId,
      approve,
      approvals: proposal!.playerApprovals,
    });
    return this.getTableView(table.id, user.userId);
  }

  async reviewBetChangeByAdmin(
    tableId: string,
    admin: PlayerIdentity,
    approve: boolean,
    reason?: string,
  ): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    const proposal = table.betControl.activeProposal;
    assertCondition(!!proposal, 'No active bet change request');
    assertCondition(
      proposal!.status === 'PENDING_ADMIN' || proposal!.status === 'PENDING_PLAYERS',
      'Bet change request is not pending review',
    );

    proposal!.updatedAt = nowIso();
    proposal!.adminDecisionBy = admin.userId;
    proposal!.adminDecisionReason = reason?.trim() || null;

    if (!approve) {
      proposal!.status = 'REJECTED';
      table.betControl.lastResolvedProposal = { ...proposal! };
      table.betControl.activeProposal = null;
      this.touch(table);
      await this.persist(table, 'BET_CHANGE_REJECTED_BY_ADMIN', {
        proposalId: proposal!.id,
        adminUserId: admin.userId,
        reason: proposal!.adminDecisionReason,
      });
      this.pushSystemChatMessage(
        table.id,
        `Admin rejected bet change request. ${proposal!.adminDecisionReason || 'No reason provided.'}`,
      );
      return this.getTableView(table.id, admin.userId);
    }

    assertCondition(!table.betControl.isBlocked, 'Bet amount is currently blocked by admin');
    table.betAmount = proposal!.requestedAmount;
    proposal!.status = 'APPROVED';
    table.betControl.lastResolvedProposal = { ...proposal! };
    table.betControl.activeProposal = null;

    this.touch(table);
    await this.persist(table, 'BET_CHANGE_APPROVED_BY_ADMIN', {
      proposalId: proposal!.id,
      adminUserId: admin.userId,
      newBetAmount: table.betAmount,
    });
    this.pushSystemChatMessage(
      table.id,
      `Admin approved bet change. New bet amount is Rs ${table.betAmount.toLocaleString()}.`,
    );
    return this.getTableView(table.id, admin.userId);
  }

  async setBetLock(tableId: string, admin: PlayerIdentity, blocked: boolean, reason?: string): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);

    if (blocked) {
      table.betControl.isBlocked = true;
      table.betControl.blockedBy = admin.userId;
      table.betControl.blockedReason = reason?.trim() || 'Bet amount blocked by admin moderation.';
      table.betControl.blockedAt = nowIso();

      const activeProposal = table.betControl.activeProposal;
      if (activeProposal) {
        activeProposal.status = 'REJECTED';
        activeProposal.updatedAt = nowIso();
        activeProposal.adminDecisionBy = admin.userId;
        activeProposal.adminDecisionReason = 'Auto-rejected because bet amount was blocked by admin.';
        table.betControl.lastResolvedProposal = { ...activeProposal };
        table.betControl.activeProposal = null;
      }
    } else {
      table.betControl.isBlocked = false;
      table.betControl.blockedBy = null;
      table.betControl.blockedReason = null;
      table.betControl.blockedAt = null;
    }

    this.touch(table);
    await this.persist(table, 'BET_LOCK_UPDATED', {
      blocked: table.betControl.isBlocked,
      blockedBy: table.betControl.blockedBy,
      blockedReason: table.betControl.blockedReason,
      blockedAt: table.betControl.blockedAt,
      adminUserId: admin.userId,
    });

    this.pushSystemChatMessage(
      table.id,
      blocked
        ? `Admin notice: Bet amount is blocked for this session. ${table.betControl.blockedReason}`
        : 'Admin notice: Bet amount block was removed for this session.',
    );

    return this.getTableView(table.id, admin.userId);
  }

  async createTable(host: PlayerIdentity, input: CreateTableInput): Promise<RummyTableView> {
    const maxPlayers = Math.max(2, Math.min(6, input.maxPlayers));
    const betAmount = Math.max(1, input.betAmount);
    const tableName = input.name.trim();
    assertCondition(tableName.length >= 3, 'Table name must be at least 3 characters');

    await this.repository.ensureWallet(host.userId, host.name, {
      initialBonus: this.walletInitialBalance,
    });
    const seat = this.createSeat(host, 1);

    const table: RummyTable = {
      id: uuidv4(),
      name: tableName,
      hostUserId: host.userId,
      maxPlayers,
      betAmount,
      status: 'WAITING',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      seats: [seat],
      game: null,
      betControl: {
        isBlocked: false,
        blockedBy: null,
        blockedReason: null,
        blockedAt: null,
        activeProposal: null,
        lastResolvedProposal: null,
      },
    };

    this.tables.set(table.id, table);
    await this.persist(table, 'TABLE_CREATED', {
      hostUserId: host.userId,
      name: table.name,
      maxPlayers: table.maxPlayers,
      betAmount: table.betAmount,
    });
    return this.getTableView(table.id, host.userId);
  }

  async joinTable(tableId: string, user: PlayerIdentity): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    assertCondition(table.status === 'WAITING', 'Table is not accepting joins');

    const alreadyJoined = table.seats.some((s) => s.userId === user.userId);
    await this.repository.ensureWallet(user.userId, user.name, {
      initialBonus: this.walletInitialBalance,
    });
    if (!alreadyJoined) {
      assertCondition(table.seats.length < table.maxPlayers, 'Table is full');
      table.seats.push(this.createSeat(user, table.seats.length + 1));
      this.touch(table);
      await this.persist(table, 'TABLE_JOINED', { userId: user.userId, name: user.name });
    } else {
      const seat = this.getSeatOrThrow(table, user.userId);
      seat.connected = true;
      seat.lastSeenAt = nowIso();
      this.touch(table);
      await this.repository.saveTable(table);
    }

    return this.getTableView(table.id, user.userId);
  }

  leaveTable(tableId: string, userId: string): void {
    const table = this.getTableOrThrow(tableId);
    assertCondition(table.status === 'WAITING', 'Cannot leave after game has started');

    const remaining = table.seats.filter((s) => s.userId !== userId);
    assertCondition(remaining.length !== table.seats.length, 'You are not seated at this table');

    if (remaining.length === 0) {
      this.tables.delete(tableId);
      this.tableChats.delete(tableId);
      this.repository.deleteTable(tableId);
      this.repository.appendHistory(tableId, 'TABLE_DELETED', { reason: 'last player left' });
      return;
    }

    table.seats = remaining.map((s, idx) => ({ ...s, seatNo: idx + 1 }));
    if (table.hostUserId === userId) {
      table.hostUserId = table.seats[0]!.userId;
    }
    this.touch(table);
    this.persist(table, 'TABLE_LEFT', { userId });
  }

  async startGame(tableId: string, requesterUserId: string): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    assertCondition(table.status === 'WAITING', 'Game already started');
    const isPlayer = table.seats.some(s => s.userId === requesterUserId);
    assertCondition(isPlayer, 'Only seated players can start');
    assertCondition(table.hostUserId === requesterUserId, 'Only table host can start');
    assertCondition(table.seats.length >= 2, 'Need at least 2 players to start');

    const requiredCards = table.seats.length * 13 + 30;
    const deckCount = Math.max(1, Math.ceil(requiredCards / 52));
    const deck = shuffle(createDeck(deckCount));

    table.seats.forEach((seat) => {
      seat.hand = deck.splice(0, 13);
      seat.score = 0;
      seat.status = 'ACTIVE';
      seat.turnsPlayed = 0;
      seat.dropType = null;
      seat.dropPenalty = 0;
      seat.droppedAt = null;
      seat.reclaimCode = this.newReclaimCode();
    });

    const jokerCard = deck.pop() || null;
    const openCard = deck.pop();
    assertCondition(!!openCard, 'Could not initialize open pile');

    const starterIndex = Math.floor(Math.random() * table.seats.length);
    const starter = table.seats[starterIndex]!;

    table.status = 'IN_PROGRESS';
    table.game = {
      closedPile: deck,
      openPile: [openCard as string],
      jokerCard,
      jokerRank: jokerCard ? parseCard(jokerCard).rank : null,
      activePlayerIds: table.seats.map((s) => s.userId),
      turn: this.createTurnState(starter.userId, 1),
      winnerUserId: null,
      winningReason: null,
      finishedAt: null,
      settlement: null,
      resultLedger: null,
    };

    this.touch(table);
    await this.persist(table, 'GAME_STARTED', {
      startedBy: requesterUserId,
      starterUserId: starter.userId,
      jokerCard,
      players: table.seats.map((s) => ({ userId: s.userId, name: s.name })),
      betAmount: table.betAmount,
    });
    return this.getTableView(table.id, requesterUserId);
  }

  async drawCard(tableId: string, userId: string, pile: DrawPile): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    const game = this.getGameOrThrow(table);
    const seat = this.getSeatOrThrow(table, userId);
    this.assertSeatActive(seat);
    this.assertCurrentTurn(game, userId);
    assertCondition(!game.turn.hasDrawn, 'Draw already done this turn');

    if (pile === 'closed' && game.closedPile.length === 0) {
      this.refillClosedPileFromOpen(game);
    }

    const card = pile === 'open' ? game.openPile.pop() : game.closedPile.pop();
    assertCondition(!!card, `No cards available in ${pile} pile`);
    seat.hand.push(card as string);
    game.turn.hasDrawn = true;
    seat.timeoutCount = 0; // Reset on movement

    this.touch(table);
    await this.persist(table, 'TURN_DRAW', { userId, pile, card });
    return this.getTableView(table.id, userId);
  }

  async discardCard(tableId: string, userId: string, card: string): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    const game = this.getGameOrThrow(table);
    const seat = this.getSeatOrThrow(table, userId);
    this.assertSeatActive(seat);
    this.assertCurrentTurn(game, userId);
    assertCondition(game.turn.hasDrawn, 'You must draw before discard');

    const idx = seat.hand.indexOf(card);
    assertCondition(idx >= 0, 'Card not in hand');

    seat.hand.splice(idx, 1);
    game.openPile.push(card);
    seat.turnsPlayed += 1;
    game.turn.hasDrawn = false;
    seat.timeoutCount = 0; // Reset on movement

    assertCondition(seat.hand.length === 13, 'Hand must contain 13 cards after discard');

    if (game.activePlayerIds.length <= 1) {
      const winner = game.activePlayerIds[0];
      if (winner) {
        await this.finishGame(table, winner, `Only active player remaining: ${winner}`);
      }
    } else if (game.closedPile.length === 0 && game.openPile.length <= 1) {
      await this.finishByBestScore(table, 'No cards left to continue');
    } else {
      this.advanceTurn(table);
    }

    this.touch(table);
    await this.persist(table, 'TURN_DISCARD', { userId, card });
    return this.getTableView(table.id, userId);
  }

  async declare(tableId: string, userId: string): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    const game = this.getGameOrThrow(table);
    const seat = this.getSeatOrThrow(table, userId);
    this.assertSeatActive(seat);
    this.assertCurrentTurn(game, userId);

    // Rule: Must draw before declaration (you have 14 cards)
    assertCondition(game.turn.hasDrawn, 'You must draw a card before declaring');
    assertCondition(seat.hand.length === 14, 'Hand must contain 14 cards to finish');

    const result = evaluateHand(seat.hand, { jokerCard: game.jokerCard });
    if (result.isValid) {
      await this.finishGame(table, seat.userId, `Valid declaration by ${seat.name}`);
      this.touch(table);
      await this.persist(table, 'TURN_DECLARE_VALID', {
        userId,
        eval: result,
      });
      return this.getTableView(table.id, userId);
    }

    seat.status = 'DROPPED';
    seat.dropType = 'INVALID_DECLARE';
    seat.dropPenalty = 80;
    seat.score = 80;
    seat.droppedAt = nowIso();
    game.activePlayerIds = game.activePlayerIds.filter((id) => id !== seat.userId);

    await this.finishByBestScore(table, `Invalid declaration by ${seat.name}`, game.activePlayerIds);
    this.touch(table);
    await this.persist(table, 'TURN_DECLARE_INVALID', {
      userId,
      eval: result,
    });
    return this.getTableView(table.id, userId);
  }

  async drop(tableId: string, userId: string, mode: DropMode): Promise<RummyTableView> {
    const table = this.getTableOrThrow(tableId);
    await this.applyDrop(table, userId, mode, false);
    this.touch(table);
    await this.persist(table, 'TURN_DROP', { userId, mode });
    return this.getTableView(table.id, userId);
  }

  async processTurnTimeouts(): Promise<TimeoutResult[]> {
    const timedOut: TimeoutResult[] = [];
    const now = Date.now();

    for (const table of this.tables.values()) {
      if (table.status !== 'IN_PROGRESS' || !table.game) continue;
      const expiresAt = new Date(table.game.turn.expiresAt).getTime();
      if (Number.isNaN(expiresAt) || expiresAt > now) continue;

      const timedOutUser = table.game.turn.userId;
      try {
        const seat = this.getSeatOrThrow(table, timedOutUser);
        seat.timeoutCount++;

        if (seat.timeoutCount >= 3) {
          await this.applyDrop(table, timedOutUser, 'timeout', true);
          this.touch(table);
          await this.persist(table, 'TURN_TIMEOUT_DROP', { userId: timedOutUser });
        } else {
          if (table.game.turn.hasDrawn) {
            const lastCard = seat.hand[seat.hand.length - 1];
            seat.hand.pop();
            table.game.openPile.push(lastCard);
            seat.turnsPlayed++;
            table.game.turn.hasDrawn = false;
          }
          this.advanceTurn(table);
          this.touch(table);
          await this.persist(table, 'TURN_TIMEOUT_SKIP', { userId: timedOutUser, count: seat.timeoutCount });
        }
        timedOut.push({ tableId: table.id, userId: timedOutUser });
      } catch {
        // skip malformed timeout states
      }
    }

    return timedOut;
  }

  getTableView(tableId: string, viewerUserId: string): RummyTableView {
    const table = this.getTableOrThrow(tableId);
    const game = table.game;
    const mySeat = table.seats.find((seat) => seat.userId === viewerUserId) || null;
    return {
      id: table.id,
      name: table.name,
      status: table.status,
      hostUserId: table.hostUserId,
      maxPlayers: table.maxPlayers,
      betAmount: table.betAmount,
      currentPlayers: table.seats.length,
      betControl: this.cloneBetControl(table.betControl),
      seats: table.seats.map((seat) => {
        const common = {
          seatNo: seat.seatNo,
          userId: seat.userId,
          name: seat.name,
          score: seat.score,
          status: seat.status,
          turnsPlayed: seat.turnsPlayed,
          dropType: seat.dropType,
          dropPenalty: seat.dropPenalty,
          droppedAt: seat.droppedAt,
          connected: seat.connected,
          lastSeenAt: seat.lastSeenAt,
          timeoutCount: seat.timeoutCount,
        };
        if (seat.userId === viewerUserId || table.status === 'FINISHED') {
          return {
            ...common,
            hand: seat.hand,
            reclaimCode: seat.userId === viewerUserId ? seat.reclaimCode : undefined,
          };
        }
        return {
          ...common,
          handCount: seat.hand.length,
        };
      }),
      mySeat: mySeat
        ? {
          userId: mySeat.userId,
          seatNo: mySeat.seatNo,
          reclaimCode: mySeat.reclaimCode,
        }
        : null,
      game: game
        ? {
          jokerCard: game.jokerCard,
          jokerRank: game.jokerRank,
          openTop: game.openPile[game.openPile.length - 1] || null,
          closedCount: game.closedPile.length,
          activePlayers: game.activePlayerIds.length,
          turn: game.turn,
          winnerUserId: game.winnerUserId,
          winningReason: game.winningReason,
          finishedAt: game.finishedAt,
          settlement: game.settlement,
          resultLedger: game.resultLedger,
        }
        : null,
    };
  }

  private cloneBetControl(source: BetControlState): BetControlState {
    const copyProposal = (proposal: BetChangeProposal | null): BetChangeProposal | null => {
      if (!proposal) return null;
      return {
        ...proposal,
        playerApprovals: [...proposal.playerApprovals],
        playerRejections: [...proposal.playerRejections],
      };
    };

    return {
      isBlocked: source.isBlocked,
      blockedBy: source.blockedBy,
      blockedReason: source.blockedReason,
      blockedAt: source.blockedAt,
      activeProposal: copyProposal(source.activeProposal),
      lastResolvedProposal: copyProposal(source.lastResolvedProposal),
    };
  }

  private getBetChangeParticipantIds(table: RummyTable): string[] {
    if (table.status !== 'IN_PROGRESS') {
      return table.seats.map((seat) => seat.userId);
    }

    const active = table.seats
      .filter((seat) => seat.status === 'ACTIVE')
      .map((seat) => seat.userId);

    return active.length > 0 ? active : table.seats.map((seat) => seat.userId);
  }

  private pushSystemChatMessage(tableId: string, message: string): TableChatMessage {
    const entry: TableChatMessage = {
      id: uuidv4(),
      tableId,
      userId: 'system',
      userName: 'System',
      role: 'SYSTEM',
      message,
      createdAt: nowIso(),
    };

    const existing = this.tableChats.get(tableId) || [];
    existing.push(entry);
    if (existing.length > 300) {
      existing.splice(0, existing.length - 300);
    }
    this.tableChats.set(tableId, existing);
    return entry;
  }

  private advanceTurn(table: RummyTable): void {
    const game = table.game!;
    const activeIds = game.activePlayerIds;
    const currentIdx = activeIds.indexOf(game.turn.userId);
    const nextIdx = (currentIdx + 1) % activeIds.length;
    game.turn = this.createTurnState(activeIds[nextIdx], game.turn.turnNo + 1);
  }

  private createTurnState(userId: string, turnNo: number) {
    return {
      userId,
      hasDrawn: false,
      turnNo,
      startedAt: nowIso(),
      expiresAt: new Date(Date.now() + this.turnTimeoutSeconds * 1000).toISOString(),
      timeoutMs: this.turnTimeoutSeconds * 1000,
    };
  }

  private refillClosedPileFromOpen(game: TableGameState): void {
    if (game.openPile.length <= 1) return;
    const top = game.openPile.pop()!;
    const rest = game.openPile;
    game.closedPile = shuffle(rest);
    game.openPile = [top];
  }

  private getTableOrThrow(tableId: string): RummyTable {
    const table = this.tables.get(tableId);
    assertCondition(!!table, 'Table not found');
    return table!;
  }

  private getGameOrThrow(table: RummyTable): TableGameState {
    assertCondition(!!table.game, 'Game not in progress');
    return table.game!;
  }

  private getSeatOrThrow(table: RummyTable, userId: string): TableSeat {
    const seat = table.seats.find((s) => s.userId === userId);
    assertCondition(!!seat, 'You are not seated at this table');
    return seat!;
  }

  private assertSeatActive(seat: TableSeat): void {
    assertCondition(seat.status === 'ACTIVE', 'You are not active in this game');
  }

  private assertCurrentTurn(game: TableGameState, userId: string): void {
    assertCondition(game.turn.userId === userId, 'It is not your turn');
  }

  private createSeat(user: PlayerIdentity, seatNo: number): TableSeat {
    return {
      seatNo,
      userId: user.userId,
      name: user.name,
      hand: [],
      score: 0,
      status: 'ACTIVE',
      turnsPlayed: 0,
      dropType: null,
      dropPenalty: 0,
      droppedAt: null,
      reclaimCode: this.newReclaimCode(),
      connected: true,
      lastSeenAt: nowIso(),
      timeoutCount: 0,
    };
  }

  private newReclaimCode(): string {
    return uuidv4().replace(/-/g, '').slice(0, 16);
  }

  private async finishByBestScore(table: RummyTable, reason: string, excludedUserIds: string[] = []): Promise<void> {
    const game = table.game!;
    const candidates = table.seats
      .filter((s) => s.status === 'ACTIVE' && !excludedUserIds.includes(s.userId))
      .map((s) => ({
        userId: s.userId,
        eval: evaluateHand(s.hand, { jokerCard: game.jokerCard }),
      }))
      .sort((a, b) => a.eval.score - b.eval.score);

    const winnerId = candidates[0]?.userId || table.seats[0].userId;
    await this.finishGame(table, winnerId, reason);
  }

  private async finishGame(table: RummyTable, winnerUserId: string, reason: string): Promise<void> {
    const game = table.game!;
    table.status = 'FINISHED';
    game.winnerUserId = winnerUserId;
    game.winningReason = reason;
    game.finishedAt = nowIso();

    await this.repository.transaction(async () => {
      table.seats.forEach((seat) => {
        if (seat.status === 'ACTIVE' && seat.userId !== winnerUserId) {
          const res = evaluateHand(seat.hand, { jokerCard: game.jokerCard });
          seat.score = res.score;
          seat.status = 'DROPPED';
          seat.dropType = 'FULL';
          seat.droppedAt = game.finishedAt;
        } else if (seat.userId === winnerUserId) {
          seat.score = 0;
        }
      });

      const entries: SettlementEntry[] = await Promise.all(table.seats.map(async (seat) => {
        const wallet = await this.repository.getWallet(seat.userId);
        let result: SettlementEntry['result'] = 'LOSE';
        if (seat.userId === winnerUserId) result = 'WIN';
        else if (seat.dropType === 'FIRST' || seat.dropType === 'MIDDLE') result = 'DROP';
        else if (seat.dropType === 'INVALID_DECLARE') result = 'INVALID';

        return {
          userId: seat.userId,
          name: seat.name,
          points: seat.score,
          amount: 0,
          walletBefore: wallet.balance,
          walletAfter: wallet.balance,
          result,
        };
      }));

      let totalLosses = 0;
      entries.forEach((e) => {
        if (e.userId === winnerUserId) return;

        let lossMultiplier = 1.0;
        if (e.result === 'DROP') {
          const seat = table.seats.find((s) => s.userId === e.userId);
          if (seat?.dropType === 'FIRST') lossMultiplier = 0.2;
          else if (seat?.dropType === 'MIDDLE') lossMultiplier = 0.4;
        }

        e.amount = -Math.floor(table.betAmount * lossMultiplier);
        totalLosses += Math.abs(e.amount);
      });

      const commission = 0.1; // 10% rake
      const rake = Math.floor(totalLosses * commission);
      const winnerProfit = totalLosses - rake;

      entries.forEach((e) => {
        if (e.userId === winnerUserId) {
          e.amount = winnerProfit;
        }
      });

      const walletUpdates = entries.map((e) => ({
        userId: e.userId,
        displayName: e.name,
        amount: e.amount,
        tableId: table.id,
        type: 'GAME_SETTLEMENT',
        payload: { reason, totalPot: totalLosses, rake, betAmount: table.betAmount },
      }));

      const finalBalances = await this.repository.applyWalletDeltas(walletUpdates);
      entries.forEach((e) => {
        const bal = finalBalances.get(e.userId);
        if (bal) {
          e.walletBefore = bal.before;
          e.walletAfter = bal.after;
        }
      });

      game.settlement = {
        betAmount: table.betAmount,
        totalPot: totalLosses,
        rake,
        entries,
      };

      const payload = {
        tableId: table.id,
        winnerUserId,
        reason,
        settlement: game.settlement,
        finishedAt: game.finishedAt,
      };

      const payloadHash = this.hashPayload(payload);
      const signature = this.signPayloadHash(payloadHash);

      const ledger = await this.repository.appendResultLedger({
        tableId: table.id,
        winnerUserId,
        payload,
        payloadHash,
        signature,
      });

      game.resultLedger = {
        ledgerId: ledger.id,
        payloadHash: ledger.payloadHash,
        signature: ledger.signature,
        signedAt: ledger.createdAt,
      };
    });
  }

  private async applyDrop(table: RummyTable, userId: string, mode: DropMode, fromTimeout: boolean): Promise<void> {
    const game = this.getGameOrThrow(table);
    const seat = this.getSeatOrThrow(table, userId);
    this.assertSeatActive(seat);

    let penalty = 0;
    let dropType: DropType = 'FULL';

    if (mode === 'first') {
      penalty = 20;
      dropType = 'FIRST';
    } else if (mode === 'middle') {
      penalty = 40;
      dropType = 'MIDDLE';
    } else if (mode === 'timeout') {
      penalty = 80;
      dropType = 'TIMEOUT';
    } else {
      penalty = 80;
      dropType = 'FULL';
    }

    seat.status = 'DROPPED';
    seat.dropType = dropType;
    seat.dropPenalty = penalty;
    seat.score = penalty;
    seat.droppedAt = nowIso();
    seat.hand = [];

    game.activePlayerIds = game.activePlayerIds.filter((id) => id !== userId);

    if (game.activePlayerIds.length <= 1) {
      const winner = game.activePlayerIds[0] || table.seats.find((s) => s.userId !== userId)?.userId;
      if (winner) {
        await this.finishGame(table, winner, 'Last player remaining after drop');
      } else {
        table.status = 'FINISHED';
      }
    } else {
      if (game.turn.userId === userId) {
        this.advanceTurn(table);
      }
    }
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(stableStringify(payload)).digest('hex');
  }

  private signPayloadHash(hash: string): string {
    return createHmac('sha256', this.ledgerSigningSecret).update(hash).digest('hex');
  }

  private touch(table: RummyTable): void {
    table.updatedAt = nowIso();
  }

  private async persist(table: RummyTable, eventType: string, payload: unknown): Promise<void> {
    await this.repository.saveTable(table);
    await this.repository.appendHistory(table.id, eventType, payload);
    await this.repository.appendAudit(eventType, null, table.id, payload);
  }
}
