import { createHash, createHmac } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { createDeck, parseCard, shuffle } from './cards.js';
import { evaluateHand } from './evaluator.js';
import {
  type AuditRow,
  type DisputeRow,
  type LedgerRow,
  type RummyRepository,
  type WalletBalanceRow,
  type WalletTransactionRow,
} from './repository.js';
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
  pointValue: number;
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
    private readonly repository: RummyRepository,
    config: Partial<EngineConfig> = {},
  ) {
    this.turnTimeoutSeconds = Math.max(10, config.turnTimeoutSeconds ?? 30);
    this.ledgerSigningSecret = config.ledgerSigningSecret || 'rummy-live-ledger-dev-secret';
    this.walletInitialBalance = Math.max(0, Math.floor(config.walletInitialBalance ?? 10000));
    this.loadPersistedTables();
  }

  private loadPersistedTables(): void {
    const saved = this.repository.loadTables();
    for (const table of saved) {
      const normalized = this.normalizeTable(table);
      this.tables.set(normalized.id, normalized);
    }

    for (const table of this.tables.values()) {
      for (const seat of table.seats) {
        seat.connected = false;
      }
      if (table.status === 'IN_PROGRESS' && table.game) {
        const active = table.seats
          .filter((s) => s.status === 'ACTIVE')
          .map((s) => s.userId);
        table.game.activePlayerIds = active;

        if (active.length <= 1) {
          const winner = active[0] || table.seats[0]?.userId;
          if (winner) {
            this.finishGame(table, winner, 'Recovered game with single active player');
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
        this.repository.saveTable(table);
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
      dropType: seat.dropType ?? null,
      dropPenalty: seat.dropPenalty ?? 0,
      droppedAt: seat.droppedAt ?? null,
      reclaimCode: seat.reclaimCode ?? this.newReclaimCode(),
      connected: seat.connected ?? false,
      lastSeenAt: seat.lastSeenAt ?? normalizedAt,
    }));

    if (table.game) {
      const jokerRank = table.game.jokerRank
        || (table.game.jokerCard ? parseCard(table.game.jokerCard).rank : null);
      table.game.jokerRank = jokerRank;
      table.game.activePlayerIds = table.game.activePlayerIds
        || table.seats.filter((s) => s.status === 'ACTIVE').map((s) => s.userId);
      table.game.settlement = table.game.settlement || null;
      table.game.turn.timeoutMs = table.game.turn.timeoutMs || this.turnTimeoutSeconds * 1000;
      table.game.turn.startedAt = table.game.turn.startedAt || nowIso();
      table.game.turn.expiresAt =
        table.game.turn.expiresAt
        || new Date(Date.now() + table.game.turn.timeoutMs).toISOString();
      table.game.resultLedger = table.game.resultLedger || null;
      if (table.game.settlement) {
        table.game.settlement.entries = table.game.settlement.entries.map((entry) => ({
          ...entry,
          walletBefore: entry.walletBefore ?? 0,
          walletAfter: entry.walletAfter ?? 0,
        }));
      }
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
        pointValue: t.pointValue,
        createdAt: t.createdAt,
      }));
  }

  listHistory(tableId: string, limit = 100) {
    this.getTableOrThrow(tableId);
    return this.repository.listHistory(tableId, limit);
  }

  listHistorySince(tableId: string, sinceId = 0, limit = 200) {
    this.getTableOrThrow(tableId);
    return this.repository.listHistorySince(tableId, sinceId, limit);
  }

  getReplay(tableId: string, viewerUserId: string, input: ReplayInput = {}) {
    const table = this.getTableOrThrow(tableId);
    const seat = table.seats.find((s) => s.userId === viewerUserId);
    assertCondition(!!seat, 'You are not seated at this table');

    const sinceId = Math.max(0, Math.floor(input.sinceId ?? 0));
    const limit = Math.max(1, Math.min(1000, Math.floor(input.limit ?? 200)));
    const events = this.repository.listHistorySince(tableId, sinceId, limit);

    return {
      tableId,
      sinceId,
      limit,
      latestEventId: events.length > 0 ? events[events.length - 1]!.id : sinceId,
      events,
      state: this.getTableView(tableId, viewerUserId),
    };
  }

  getWallet(user: PlayerIdentity): WalletBalanceRow {
    return this.repository.ensureWallet(user.userId, user.name, {
      initialBalance: this.walletInitialBalance,
    });
  }

  listWalletTransactions(userId: string, limit = 100): WalletTransactionRow[] {
    return this.repository.listWalletTransactions(userId, limit);
  }

  listResultLedger(tableId: string, limit = 50): LedgerRow[] {
    this.getTableOrThrow(tableId);
    return this.repository.listResultLedger(tableId, limit);
  }

  verifyLedgerEntry(ledgerId: number) {
    const row = this.repository.getResultLedgerById(ledgerId);
    assertCondition(!!row, 'Ledger entry not found');

    const computedPayloadHash = this.hashPayload(row!.payload);
    const expectedSignature = this.signPayloadHash(row!.payloadHash);
    const previous = this.repository.getPreviousLedgerEntry(row!.tableId, row!.id);
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

  createDispute(tableId: string, user: PlayerIdentity, reason: string, evidence?: string): DisputeRow {
    this.getTableOrThrow(tableId);
    const dispute = this.repository.createDispute(tableId, user.userId, reason, evidence);
    this.repository.appendAudit('DISPUTE_CREATED', user.userId, tableId, {
      disputeId: dispute.id,
      reason: dispute.reason,
      evidence: dispute.evidence,
    });
    this.repository.appendHistory(tableId, 'DISPUTE_CREATED', {
      disputeId: dispute.id,
      raisedBy: user.userId,
      reason: dispute.reason,
      evidence: dispute.evidence,
    });
    return dispute;
  }

  listDisputes(tableId: string, limit = 100): DisputeRow[] {
    this.getTableOrThrow(tableId);
    return this.repository.listDisputes(tableId, limit);
  }

  resolveDispute(disputeId: number, actor: PlayerIdentity, input: ResolveDisputeInput): DisputeRow {
    const dispute = this.repository.resolveDispute(disputeId, {
      status: input.status,
      resolutionNote: input.resolutionNote,
      resolvedBy: actor.userId,
    });
    this.repository.appendAudit('DISPUTE_RESOLVED', actor.userId, dispute.tableId, {
      disputeId: dispute.id,
      status: dispute.status,
      resolutionNote: dispute.resolutionNote,
    });
    this.repository.appendHistory(dispute.tableId, 'DISPUTE_RESOLVED', {
      disputeId: dispute.id,
      status: dispute.status,
      resolutionNote: dispute.resolutionNote,
      resolvedBy: actor.userId,
    });
    return dispute;
  }

  listAuditLogs(input: { limit?: number; tableId?: string; action?: string } = {}): AuditRow[] {
    return this.repository.listAuditLogs(input);
  }

  reclaimSeat(tableId: string, reclaimCode: string, user: PlayerIdentity): RummyTableView {
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
      this.repository.reassignUser(oldUserId, user.userId, user.name);
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
        if (table.game.settlement) {
          table.game.settlement.entries = table.game.settlement.entries.map((entry) =>
            entry.userId === oldUserId
              ? {
                  ...entry,
                  userId: user.userId,
                  name: user.name,
                }
              : entry,
          );
        }
      }
    }

    this.repository.ensureWallet(user.userId, user.name, {
      initialBalance: this.walletInitialBalance,
    });

    seat!.connected = true;
    seat!.lastSeenAt = nowIso();
    seat!.reclaimCode = this.newReclaimCode();
    this.touch(table);
    this.persist(table, 'TABLE_SEAT_RECLAIMED', {
      seatNo: seat!.seatNo,
      oldUserId,
      oldName,
      newUserId: user.userId,
      newName: user.name,
    });
    return this.getTableView(table.id, user.userId);
  }

  setSeatConnection(tableId: string, userId: string, connected: boolean): void {
    const table = this.tables.get(tableId);
    if (!table) return;
    const seat = table.seats.find((entry) => entry.userId === userId);
    if (!seat) return;

    seat.connected = connected;
    seat.lastSeenAt = nowIso();
    this.touch(table);
    this.repository.saveTable(table);
    this.repository.appendAudit('SEAT_CONNECTION', userId, table.id, {
      seatNo: seat.seatNo,
      connected,
    });
  }

  createTable(host: PlayerIdentity, input: CreateTableInput): RummyTableView {
    const maxPlayers = Math.max(2, Math.min(6, input.maxPlayers));
    const pointValue = Math.max(1, input.pointValue);
    const tableName = input.name.trim();
    assertCondition(tableName.length >= 3, 'Table name must be at least 3 characters');

    this.repository.ensureWallet(host.userId, host.name, {
      initialBalance: this.walletInitialBalance,
    });
    const seat = this.createSeat(host, 1);

    const table: RummyTable = {
      id: uuidv4(),
      name: tableName,
      hostUserId: host.userId,
      maxPlayers,
      pointValue,
      status: 'WAITING',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      seats: [seat],
      game: null,
    };

    this.tables.set(table.id, table);
    this.persist(table, 'TABLE_CREATED', {
      hostUserId: host.userId,
      name: table.name,
      maxPlayers: table.maxPlayers,
      pointValue: table.pointValue,
    });
    return this.getTableView(table.id, host.userId);
  }

  joinTable(tableId: string, user: PlayerIdentity): RummyTableView {
    const table = this.getTableOrThrow(tableId);
    assertCondition(table.status === 'WAITING', 'Table is not accepting joins');

    const alreadyJoined = table.seats.some((s) => s.userId === user.userId);
    this.repository.ensureWallet(user.userId, user.name, {
      initialBalance: this.walletInitialBalance,
    });
    if (!alreadyJoined) {
      assertCondition(table.seats.length < table.maxPlayers, 'Table is full');
      table.seats.push(this.createSeat(user, table.seats.length + 1));
      this.touch(table);
      this.persist(table, 'TABLE_JOINED', { userId: user.userId, name: user.name });
    } else {
      const seat = this.getSeatOrThrow(table, user.userId);
      seat.connected = true;
      seat.lastSeenAt = nowIso();
      this.touch(table);
      this.repository.saveTable(table);
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

  startGame(tableId: string, requesterUserId: string): RummyTableView {
    const table = this.getTableOrThrow(tableId);
    assertCondition(table.status === 'WAITING', 'Game already started');
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
    this.persist(table, 'GAME_STARTED', {
      startedBy: requesterUserId,
      starterUserId: starter.userId,
      jokerCard,
      players: table.seats.map((s) => ({ userId: s.userId, name: s.name })),
    });
    return this.getTableView(table.id, requesterUserId);
  }

  drawCard(tableId: string, userId: string, pile: DrawPile): RummyTableView {
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

    this.touch(table);
    this.persist(table, 'TURN_DRAW', { userId, pile, card });
    return this.getTableView(table.id, userId);
  }

  discardCard(tableId: string, userId: string, card: string): RummyTableView {
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

    assertCondition(seat.hand.length === 13, 'Hand must contain 13 cards after discard');

    if (game.activePlayerIds.length <= 1) {
      const winner = game.activePlayerIds[0];
      if (winner) {
        this.finishGame(table, winner, `Only active player remaining: ${winner}`);
      }
    } else if (game.closedPile.length === 0 && game.openPile.length <= 1) {
      this.finishByBestScore(table, 'No cards left to continue');
    } else {
      this.advanceTurn(table);
    }

    this.touch(table);
    this.persist(table, 'TURN_DISCARD', { userId, card });
    return this.getTableView(table.id, userId);
  }

  declare(tableId: string, userId: string): RummyTableView {
    const table = this.getTableOrThrow(tableId);
    const game = this.getGameOrThrow(table);
    const seat = this.getSeatOrThrow(table, userId);
    this.assertSeatActive(seat);
    this.assertCurrentTurn(game, userId);
    assertCondition(!game.turn.hasDrawn, 'Declaration allowed after discard');
    assertCondition(seat.hand.length === 13, 'Hand must contain 13 cards');

    const result = evaluateHand(seat.hand, { jokerCard: game.jokerCard });
    if (result.isValid) {
      this.finishGame(table, seat.userId, `Valid declaration by ${seat.name}`);
      this.touch(table);
      this.persist(table, 'TURN_DECLARE_VALID', {
        userId,
        eval: result,
      });
      return this.getTableView(table.id, userId);
    }

    // Invalid show: immediate penalty and round finish by best remaining hand.
    seat.status = 'DROPPED';
    seat.dropType = 'INVALID_DECLARE';
    seat.dropPenalty = 80;
    seat.score = 80;
    seat.droppedAt = nowIso();
    game.activePlayerIds = game.activePlayerIds.filter((id) => id !== seat.userId);

    this.finishByBestScore(
      table,
      `Invalid declaration by ${seatLabel(seat)}`,
      game.activePlayerIds,
    );
    this.touch(table);
    this.persist(table, 'TURN_DECLARE_INVALID', {
      userId,
      eval: result,
    });
    return this.getTableView(table.id, userId);
  }

  drop(tableId: string, userId: string, mode: DropMode): RummyTableView {
    const table = this.getTableOrThrow(tableId);
    this.applyDrop(table, userId, mode, false);
    this.touch(table);
    this.persist(table, 'TURN_DROP', { userId, mode });
    return this.getTableView(table.id, userId);
  }

  processTurnTimeouts(): TimeoutResult[] {
    const timedOut: TimeoutResult[] = [];
    const now = Date.now();

    for (const table of this.tables.values()) {
      if (table.status !== 'IN_PROGRESS' || !table.game) continue;
      const expiresAt = new Date(table.game.turn.expiresAt).getTime();
      if (Number.isNaN(expiresAt) || expiresAt > now) continue;

      const timedOutUser = table.game.turn.userId;
      try {
        this.applyDrop(table, timedOutUser, 'timeout', true);
        this.touch(table);
        this.persist(table, 'TURN_TIMEOUT', { userId: timedOutUser });
        timedOut.push({ tableId: table.id, userId: timedOutUser });
      } catch {
        // skip malformed timeout states; table might have been closed mid-loop
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
      pointValue: table.pointValue,
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

  private createTurnState(userId: string, turnNo: number) {
    const startedAt = Date.now();
    const timeoutMs = this.turnTimeoutSeconds * 1000;
    return {
      userId,
      hasDrawn: false,
      turnNo,
      startedAt: new Date(startedAt).toISOString(),
      expiresAt: new Date(startedAt + timeoutMs).toISOString(),
      timeoutMs,
    };
  }

  private getTableOrThrow(tableId: string): RummyTable {
    const table = this.tables.get(tableId);
    assertCondition(!!table, 'Table not found');
    return table!;
  }

  private getSeatOrThrow(table: RummyTable, userId: string): TableSeat {
    const seat = table.seats.find((s) => s.userId === userId);
    assertCondition(!!seat, 'You are not seated at this table');
    return seat!;
  }

  private getGameOrThrow(table: RummyTable): TableGameState {
    assertCondition(table.status === 'IN_PROGRESS' && !!table.game, 'Game is not in progress');
    return table.game!;
  }

  private assertSeatActive(seat: TableSeat): void {
    assertCondition(seat.status === 'ACTIVE', 'Player is not active in this round');
  }

  private assertCurrentTurn(game: TableGameState, userId: string): void {
    assertCondition(game.turn.userId === userId, 'Not your turn');
  }

  private refillClosedPileFromOpen(game: TableGameState): void {
    if (game.closedPile.length > 0) return;
    if (game.openPile.length <= 1) return;
    const top = game.openPile.pop()!;
    game.closedPile = shuffle(game.openPile);
    game.openPile = [top];
  }

  private advanceTurn(table: RummyTable): void {
    const game = table.game!;
    const active = game.activePlayerIds;
    assertCondition(active.length > 0, 'No active players');
    const currentIndex = active.findIndex((id) => id === game.turn.userId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % active.length : 0;
    game.turn = this.createTurnState(active[nextIndex]!, game.turn.turnNo + 1);
  }

  private applyDrop(
    table: RummyTable,
    userId: string,
    mode: DropMode,
    fromTimeout: boolean,
  ): void {
    const game = this.getGameOrThrow(table);
    const seat = this.getSeatOrThrow(table, userId);
    this.assertSeatActive(seat);

    if (!fromTimeout) {
      if (mode === 'full') {
        // Full drop is allowed anytime in this implementation.
      } else {
        this.assertCurrentTurn(game, userId);
        assertCondition(!game.turn.hasDrawn, 'Cannot drop after drawing; discard first');
      }
    } else {
      this.assertCurrentTurn(game, userId);
    }

    let dropType: DropType;
    let penalty: number;

    if (mode === 'timeout') {
      dropType = 'TIMEOUT';
      penalty = 80;
    } else if (mode === 'full') {
      dropType = 'FULL';
      penalty = 80;
    } else if (mode === 'first') {
      assertCondition(seat.turnsPlayed === 0, 'First drop allowed only before first completed turn');
      dropType = 'FIRST';
      penalty = 20;
    } else {
      assertCondition(seat.turnsPlayed > 0, 'Middle drop allowed after first completed turn');
      dropType = 'MIDDLE';
      penalty = 40;
    }

    seat.status = 'DROPPED';
    seat.dropType = dropType;
    seat.dropPenalty = penalty;
    seat.score = penalty;
    seat.droppedAt = nowIso();

    game.activePlayerIds = game.activePlayerIds.filter((id) => id !== userId);

    if (game.activePlayerIds.length <= 1) {
      const winner = game.activePlayerIds[0];
      if (winner) {
        this.finishGame(table, winner, `All others dropped (${dropType})`);
      } else {
        this.finishByBestScore(table, 'All players dropped');
      }
      return;
    }

    if (game.turn.userId === userId) {
      this.advanceTurn(table);
    }
  }

  private finishByBestScore(
    table: RummyTable,
    reason: string,
    candidateUserIds?: string[],
  ): void {
    const candidates = candidateUserIds && candidateUserIds.length > 0
      ? table.seats.filter((s) => candidateUserIds.includes(s.userId))
      : table.seats.filter((s) => s.status === 'ACTIVE');
    assertCondition(candidates.length > 0, 'No players available to score');

    let winner = candidates[0]!;
    let winnerEval = evaluateHand(winner.hand, { jokerCard: table.game?.jokerCard });

    for (const seat of candidates.slice(1)) {
      const seatEval = evaluateHand(seat.hand, { jokerCard: table.game?.jokerCard });
      const winnerValid = winnerEval.isValid;
      const seatValid = seatEval.isValid;
      const seatScore = seatValid ? seatEval.deadwood : 80;
      const winnerScore = winnerValid ? winnerEval.deadwood : 80;

      if ((!winnerValid && seatValid) || (seatValid === winnerValid && seatScore < winnerScore)) {
        winner = seat;
        winnerEval = seatEval;
      }
    }

    this.finishGame(table, winner.userId, reason);
  }

  private finishGame(table: RummyTable, winnerUserId: string, reason: string): void {
    const game = table.game!;
    if (game.settlement) {
      table.status = 'FINISHED';
      game.activePlayerIds = [];
      game.winnerUserId = winnerUserId;
      game.winningReason = reason;
      game.finishedAt = game.finishedAt || nowIso();
      return;
    }

    const entries: SettlementEntry[] = [];
    let totalPoints = 0;

    for (const seat of table.seats) {
      if (seat.userId === winnerUserId) {
        seat.score = 0;
        entries.push({
          userId: seat.userId,
          name: seat.name,
          points: 0,
          amount: 0,
          walletBefore: 0,
          walletAfter: 0,
          result: 'WIN',
        });
        continue;
      }

      let points = 0;
      let result: SettlementEntry['result'] = 'LOSE';

      if (seat.dropType === 'INVALID_DECLARE') {
        points = 80;
        result = 'INVALID';
      } else if (seat.status === 'DROPPED') {
        points = seat.dropPenalty || 80;
        result = 'DROP';
      } else {
        const evalResult = evaluateHand(seat.hand, { jokerCard: game.jokerCard });
        points = evalResult.isValid ? evalResult.deadwood : 80;
        result = 'LOSE';
      }

      points = Math.max(0, Math.min(80, points));
      seat.score = points;
      totalPoints += points;

      entries.push({
        userId: seat.userId,
        name: seat.name,
        points,
        amount: -points * table.pointValue,
        walletBefore: 0,
        walletAfter: 0,
        result,
      });
    }

    const winnerEntry = entries.find((e) => e.userId === winnerUserId);
    if (winnerEntry) {
      winnerEntry.amount = totalPoints * table.pointValue;
      winnerEntry.result = 'WIN';
    }

    const balanceMap = this.repository.applyWalletDeltas(
      entries.map((entry) => ({
        userId: entry.userId,
        displayName: entry.name,
        amount: entry.amount,
        tableId: table.id,
        type: 'GAME_SETTLEMENT',
        payload: {
          winnerUserId,
          reason,
          points: entry.points,
          result: entry.result,
        },
      })),
    );
    for (const entry of entries) {
      const walletState = balanceMap.get(entry.userId);
      entry.walletBefore = walletState?.before ?? 0;
      entry.walletAfter = walletState?.after ?? 0;
    }

    const settlement: SettlementSummary = {
      pointValue: table.pointValue,
      totalPoints,
      totalAmount: totalPoints * table.pointValue,
      entries,
    };

    table.status = 'FINISHED';
    game.activePlayerIds = [];
    game.winnerUserId = winnerUserId;
    game.winningReason = reason;
    game.finishedAt = nowIso();
    game.settlement = settlement;
    const ledgerPayload = {
      tableId: table.id,
      finishedAt: game.finishedAt,
      winnerUserId,
      reason,
      settlement,
    };
    const payloadHash = this.hashPayload(ledgerPayload);
    const signature = this.signPayloadHash(payloadHash);
    const ledgerEntry = this.repository.appendResultLedger({
      tableId: table.id,
      winnerUserId,
      payload: ledgerPayload,
      payloadHash,
      signature,
    });
    game.resultLedger = {
      ledgerId: ledgerEntry.id,
      payloadHash: ledgerEntry.payloadHash,
      signature: ledgerEntry.signature,
      signedAt: ledgerEntry.createdAt,
    };
    this.repository.appendAudit('GAME_SETTLED', winnerUserId, table.id, {
      winnerUserId,
      reason,
      totalPoints,
      totalAmount: settlement.totalAmount,
      ledgerId: ledgerEntry.id,
    });
  }

  private touch(table: RummyTable): void {
    table.updatedAt = nowIso();
  }

  private persist(table: RummyTable, eventType: string, payload: unknown): void {
    this.repository.saveTable(table);
    this.repository.appendHistory(table.id, eventType, payload);
    this.repository.appendAudit(eventType, this.extractActorUserId(payload), table.id, payload);
  }

  private extractActorUserId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const record = payload as Record<string, unknown>;
    const candidate =
      record.userId
      || record.startedBy
      || record.hostUserId
      || record.raisedBy
      || record.resolvedBy;
    return typeof candidate === 'string' ? candidate : null;
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
    };
  }

  private newReclaimCode(): string {
    return uuidv4().replace(/-/g, '');
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(stableStringify(payload)).digest('hex');
  }

  private signPayloadHash(payloadHash: string): string {
    return createHmac('sha256', this.ledgerSigningSecret).update(payloadHash).digest('hex');
  }
}
