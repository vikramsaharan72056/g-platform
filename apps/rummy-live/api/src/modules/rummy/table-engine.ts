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
  DrawPile,
  DropType,
  PlayerIdentity,
  RummyTable,
  RummyTableView,
  SettlementEntry,
  SettlementSummary,
  TableGameState,
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

  listTables(): TableSummary[] {
    return Array.from(this.tables.values())
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
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
    this.getTableOrThrow(tableId);
    return await this.repository.listHistory(tableId, limit);
  }

  async listHistorySince(tableId: string, sinceId = 0, limit = 200): Promise<TableHistoryRow[]> {
    this.getTableOrThrow(tableId);
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
      initialBalance: this.walletInitialBalance,
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

  async createTable(host: PlayerIdentity, input: CreateTableInput): Promise<RummyTableView> {
    const maxPlayers = Math.max(2, Math.min(6, input.maxPlayers));
    const betAmount = Math.max(1, input.betAmount);
    const tableName = input.name.trim();
    assertCondition(tableName.length >= 3, 'Table name must be at least 3 characters');

    await this.repository.ensureWallet(host.userId, host.name, {
      initialBalance: this.walletInitialBalance,
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
      initialBalance: this.walletInitialBalance,
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
