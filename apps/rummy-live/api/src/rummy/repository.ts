import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RummyTable } from './types.js';

export interface TableHistoryRow {
  id: number;
  tableId: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export interface WalletBalanceRow {
  userId: string;
  displayName: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionRow {
  id: number;
  userId: string;
  tableId: string | null;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  payload: unknown;
  createdAt: string;
}

export interface LedgerRow {
  id: number;
  tableId: string;
  winnerUserId: string;
  payload: unknown;
  payloadHash: string;
  signature: string;
  previousHash: string | null;
  createdAt: string;
}

export interface DisputeRow {
  id: number;
  tableId: string;
  raisedBy: string;
  reason: string;
  evidence: string | null;
  status: 'OPEN' | 'REVIEWED' | 'RESOLVED' | 'REJECTED';
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AuditRow {
  id: number;
  action: string;
  actorUserId: string | null;
  tableId: string | null;
  payload: unknown;
  createdAt: string;
}

interface TableDbRow {
  id: string;
  payload: string;
}

interface HistoryDbRow {
  id: number;
  table_id: string;
  event_type: string;
  payload: string;
  created_at: string;
}

interface WalletDbRow {
  user_id: string;
  display_name: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

interface WalletTxnDbRow {
  id: number;
  user_id: string;
  table_id: string | null;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  payload: string;
  created_at: string;
}

interface LedgerDbRow {
  id: number;
  table_id: string;
  winner_user_id: string;
  payload: string;
  payload_hash: string;
  signature: string;
  previous_hash: string | null;
  created_at: string;
}

interface DisputeDbRow {
  id: number;
  table_id: string;
  raised_by: string;
  reason: string;
  evidence: string | null;
  status: 'OPEN' | 'REVIEWED' | 'RESOLVED' | 'REJECTED';
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface AuditDbRow {
  id: number;
  action: string;
  actor_user_id: string | null;
  table_id: string | null;
  payload: string;
  created_at: string;
}

interface EnsureWalletOptions {
  initialBalance?: number;
}

interface WalletDeltaInput {
  userId: string;
  displayName: string;
  amount: number;
  tableId?: string | null;
  type: string;
  payload?: unknown;
}

interface AppendLedgerInput {
  tableId: string;
  winnerUserId: string;
  payload: unknown;
  payloadHash: string;
  signature: string;
}

interface ResolveDisputeInput {
  status: 'REVIEWED' | 'RESOLVED' | 'REJECTED';
  resolutionNote: string;
  resolvedBy: string;
}

interface ListAuditInput {
  limit?: number;
  tableId?: string;
  action?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export class RummyRepository {
  private readonly db: DatabaseSync;

  constructor(dbFilePath: string) {
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbFilePath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS tables (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_game_history_table_created
      ON game_history(table_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS wallet_balances (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        balance INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        table_id TEXT,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_before INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_wallet_txn_user_created
      ON wallet_transactions(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS result_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id TEXT NOT NULL,
        winner_user_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        signature TEXT NOT NULL,
        previous_hash TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_result_ledger_table_created
      ON result_ledger(table_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id TEXT NOT NULL,
        raised_by TEXT NOT NULL,
        reason TEXT NOT NULL,
        evidence TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN',
        resolution_note TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_disputes_table_created
      ON disputes(table_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        actor_user_id TEXT,
        table_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_table_created
      ON audit_logs(table_id, created_at DESC);
    `);
  }

  loadTables(): RummyTable[] {
    const stmt = this.db.prepare(
      'SELECT id, payload FROM tables ORDER BY updated_at DESC',
    );
    const rows = stmt.all() as unknown as TableDbRow[];
    return rows.map((row) => parseJson<RummyTable>(row.payload));
  }

  saveTable(table: RummyTable): void {
    const stmt = this.db.prepare(`
      INSERT INTO tables(id, status, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    stmt.run(table.id, table.status, JSON.stringify(table), table.updatedAt);
  }

  deleteTable(tableId: string): void {
    this.db.prepare('DELETE FROM tables WHERE id = ?').run(tableId);
  }

  appendHistory(tableId: string, eventType: string, payload: unknown): number {
    const now = nowIso();
    this.db
      .prepare(`
        INSERT INTO game_history(table_id, event_type, payload, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(tableId, eventType, JSON.stringify(payload), now);

    const idRow = this.db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };
    return idRow.id;
  }

  listHistory(tableId: string, limit = 100): TableHistoryRow[] {
    const safeLimit = Math.max(1, Math.min(500, limit));
    const rows = this.db
      .prepare(`
        SELECT id, table_id, event_type, payload, created_at
        FROM game_history
        WHERE table_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(tableId, safeLimit) as unknown as HistoryDbRow[];

    return rows.map((r) => ({
      id: r.id,
      tableId: r.table_id,
      eventType: r.event_type,
      payload: parseJson(r.payload),
      createdAt: r.created_at,
    }));
  }

  listHistorySince(tableId: string, sinceId = 0, limit = 200): TableHistoryRow[] {
    const safeSince = Math.max(0, sinceId);
    const safeLimit = Math.max(1, Math.min(1000, limit));
    const rows = this.db
      .prepare(`
        SELECT id, table_id, event_type, payload, created_at
        FROM game_history
        WHERE table_id = ? AND id > ?
        ORDER BY id ASC
        LIMIT ?
      `)
      .all(tableId, safeSince, safeLimit) as unknown as HistoryDbRow[];

    return rows.map((r) => ({
      id: r.id,
      tableId: r.table_id,
      eventType: r.event_type,
      payload: parseJson(r.payload),
      createdAt: r.created_at,
    }));
  }

  ensureWallet(userId: string, displayName: string, options: EnsureWalletOptions = {}): WalletBalanceRow {
    const initialBalance = Number.isFinite(options.initialBalance)
      ? Math.floor(options.initialBalance!)
      : 10000;
    const existing = this.getWalletOrNull(userId);
    const now = nowIso();

    if (!existing) {
      this.db
        .prepare(`
          INSERT INTO wallet_balances(user_id, display_name, balance, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(userId, displayName, initialBalance, now, now);
      return {
        userId,
        displayName,
        balance: initialBalance,
        createdAt: now,
        updatedAt: now,
      };
    }

    if (existing.displayName !== displayName) {
      this.db
        .prepare(`
          UPDATE wallet_balances
          SET display_name = ?, updated_at = ?
          WHERE user_id = ?
        `)
        .run(displayName, now, userId);
      return {
        ...existing,
        displayName,
        updatedAt: now,
      };
    }

    return existing;
  }

  getWallet(userId: string): WalletBalanceRow {
    const row = this.getWalletOrNull(userId);
    if (!row) {
      throw new Error('Wallet not found');
    }
    return row;
  }

  private getWalletOrNull(userId: string): WalletBalanceRow | null {
    const row = this.db
      .prepare(`
        SELECT user_id, display_name, balance, created_at, updated_at
        FROM wallet_balances
        WHERE user_id = ?
      `)
      .get(userId) as WalletDbRow | undefined;

    if (!row) return null;
    return {
      userId: row.user_id,
      displayName: row.display_name,
      balance: row.balance,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  applyWalletDeltas(
    entries: WalletDeltaInput[],
  ): Map<string, { before: number; after: number }> {
    const result = new Map<string, { before: number; after: number }>();

    for (const entry of entries) {
      this.ensureWallet(entry.userId, entry.displayName);
      const wallet = this.getWallet(entry.userId);
      const before = wallet.balance;
      const after = before + entry.amount;
      const now = nowIso();

      this.db
        .prepare(`
          UPDATE wallet_balances
          SET balance = ?, updated_at = ?
          WHERE user_id = ?
        `)
        .run(after, now, entry.userId);

      this.db
        .prepare(`
          INSERT INTO wallet_transactions(
            user_id, table_id, type, amount, balance_before, balance_after, payload, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          entry.userId,
          entry.tableId || null,
          entry.type,
          entry.amount,
          before,
          after,
          JSON.stringify(entry.payload || {}),
          now,
        );

      result.set(entry.userId, { before, after });
    }

    return result;
  }

  listWalletTransactions(userId: string, limit = 100): WalletTransactionRow[] {
    const safeLimit = Math.max(1, Math.min(500, limit));
    const rows = this.db
      .prepare(`
        SELECT id, user_id, table_id, type, amount, balance_before, balance_after, payload, created_at
        FROM wallet_transactions
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(userId, safeLimit) as unknown as WalletTxnDbRow[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      tableId: r.table_id,
      type: r.type,
      amount: r.amount,
      balanceBefore: r.balance_before,
      balanceAfter: r.balance_after,
      payload: parseJson(r.payload),
      createdAt: r.created_at,
    }));
  }

  reassignUser(oldUserId: string, newUserId: string, displayName: string): void {
    if (oldUserId === newUserId) {
      this.ensureWallet(newUserId, displayName);
      return;
    }

    const oldWallet = this.getWalletOrNull(oldUserId);
    const newWallet = this.getWalletOrNull(newUserId);
    const now = nowIso();

    if (oldWallet && !newWallet) {
      this.db
        .prepare(`
          UPDATE wallet_balances
          SET user_id = ?, display_name = ?, updated_at = ?
          WHERE user_id = ?
        `)
        .run(newUserId, displayName, now, oldUserId);
    } else if (oldWallet && newWallet) {
      const merged = oldWallet.balance + newWallet.balance;
      this.db
        .prepare(`
          UPDATE wallet_balances
          SET balance = ?, display_name = ?, updated_at = ?
          WHERE user_id = ?
        `)
        .run(merged, displayName, now, newUserId);
      this.db.prepare('DELETE FROM wallet_balances WHERE user_id = ?').run(oldUserId);
    } else if (!oldWallet && !newWallet) {
      this.ensureWallet(newUserId, displayName);
    } else {
      this.ensureWallet(newUserId, displayName);
    }

    this.db
      .prepare('UPDATE wallet_transactions SET user_id = ? WHERE user_id = ?')
      .run(newUserId, oldUserId);
  }

  appendResultLedger(input: AppendLedgerInput): LedgerRow {
    const now = nowIso();
    const prev = this.db
      .prepare(`
        SELECT id, payload_hash
        FROM result_ledger
        WHERE table_id = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(input.tableId) as { id: number; payload_hash: string } | undefined;

    this.db
      .prepare(`
        INSERT INTO result_ledger(
          table_id, winner_user_id, payload, payload_hash, signature, previous_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.tableId,
        input.winnerUserId,
        JSON.stringify(input.payload),
        input.payloadHash,
        input.signature,
        prev?.payload_hash || null,
        now,
      );

    const idRow = this.db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };
    return {
      id: idRow.id,
      tableId: input.tableId,
      winnerUserId: input.winnerUserId,
      payload: input.payload,
      payloadHash: input.payloadHash,
      signature: input.signature,
      previousHash: prev?.payload_hash || null,
      createdAt: now,
    };
  }

  listResultLedger(tableId: string, limit = 50): LedgerRow[] {
    const safeLimit = Math.max(1, Math.min(500, limit));
    const rows = this.db
      .prepare(`
        SELECT id, table_id, winner_user_id, payload, payload_hash, signature, previous_hash, created_at
        FROM result_ledger
        WHERE table_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(tableId, safeLimit) as unknown as LedgerDbRow[];

    return rows.map((r) => ({
      id: r.id,
      tableId: r.table_id,
      winnerUserId: r.winner_user_id,
      payload: parseJson(r.payload),
      payloadHash: r.payload_hash,
      signature: r.signature,
      previousHash: r.previous_hash,
      createdAt: r.created_at,
    }));
  }

  getResultLedgerById(id: number): LedgerRow | null {
    const row = this.db
      .prepare(`
        SELECT id, table_id, winner_user_id, payload, payload_hash, signature, previous_hash, created_at
        FROM result_ledger
        WHERE id = ?
      `)
      .get(id) as LedgerDbRow | undefined;

    if (!row) return null;
    return {
      id: row.id,
      tableId: row.table_id,
      winnerUserId: row.winner_user_id,
      payload: parseJson(row.payload),
      payloadHash: row.payload_hash,
      signature: row.signature,
      previousHash: row.previous_hash,
      createdAt: row.created_at,
    };
  }

  getPreviousLedgerEntry(tableId: string, ledgerId: number): LedgerRow | null {
    const row = this.db
      .prepare(`
        SELECT id, table_id, winner_user_id, payload, payload_hash, signature, previous_hash, created_at
        FROM result_ledger
        WHERE table_id = ? AND id < ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(tableId, ledgerId) as LedgerDbRow | undefined;

    if (!row) return null;
    return {
      id: row.id,
      tableId: row.table_id,
      winnerUserId: row.winner_user_id,
      payload: parseJson(row.payload),
      payloadHash: row.payload_hash,
      signature: row.signature,
      previousHash: row.previous_hash,
      createdAt: row.created_at,
    };
  }

  createDispute(tableId: string, raisedBy: string, reason: string, evidence?: string): DisputeRow {
    const now = nowIso();
    this.db
      .prepare(`
        INSERT INTO disputes(table_id, raised_by, reason, evidence, status, created_at)
        VALUES (?, ?, ?, ?, 'OPEN', ?)
      `)
      .run(tableId, raisedBy, reason, evidence || null, now);

    const idRow = this.db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };
    return {
      id: idRow.id,
      tableId,
      raisedBy,
      reason,
      evidence: evidence || null,
      status: 'OPEN',
      resolutionNote: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
    };
  }

  listDisputes(tableId: string, limit = 100): DisputeRow[] {
    const safeLimit = Math.max(1, Math.min(500, limit));
    const rows = this.db
      .prepare(`
        SELECT id, table_id, raised_by, reason, evidence, status, resolution_note, resolved_by, resolved_at, created_at
        FROM disputes
        WHERE table_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(tableId, safeLimit) as unknown as DisputeDbRow[];

    return rows.map((r) => ({
      id: r.id,
      tableId: r.table_id,
      raisedBy: r.raised_by,
      reason: r.reason,
      evidence: r.evidence,
      status: r.status,
      resolutionNote: r.resolution_note,
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
    }));
  }

  resolveDispute(disputeId: number, input: ResolveDisputeInput): DisputeRow {
    const now = nowIso();
    this.db
      .prepare(`
        UPDATE disputes
        SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = ?
        WHERE id = ?
      `)
      .run(input.status, input.resolutionNote, input.resolvedBy, now, disputeId);

    const row = this.db
      .prepare(`
        SELECT id, table_id, raised_by, reason, evidence, status, resolution_note, resolved_by, resolved_at, created_at
        FROM disputes
        WHERE id = ?
      `)
      .get(disputeId) as DisputeDbRow | undefined;

    if (!row) {
      throw new Error('Dispute not found');
    }

    return {
      id: row.id,
      tableId: row.table_id,
      raisedBy: row.raised_by,
      reason: row.reason,
      evidence: row.evidence,
      status: row.status,
      resolutionNote: row.resolution_note,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
    };
  }

  appendAudit(action: string, actorUserId: string | null, tableId: string | null, payload: unknown): number {
    const now = nowIso();
    this.db
      .prepare(`
        INSERT INTO audit_logs(action, actor_user_id, table_id, payload, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(action, actorUserId, tableId, JSON.stringify(payload), now);

    const idRow = this.db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };
    return idRow.id;
  }

  listAuditLogs(input: ListAuditInput = {}): AuditRow[] {
    const safeLimit = Math.max(1, Math.min(1000, input.limit ?? 100));
    const where: string[] = [];
    const params: Array<string | number | null> = [];

    if (input.tableId) {
      where.push('table_id = ?');
      params.push(input.tableId);
    }
    if (input.action) {
      where.push('action = ?');
      params.push(input.action);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const query = `
      SELECT id, action, actor_user_id, table_id, payload, created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY id DESC
      LIMIT ?
    `;
    const rows = this.db
      .prepare(query)
      .all(...params, safeLimit) as unknown as AuditDbRow[];

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorUserId: r.actor_user_id,
      tableId: r.table_id,
      payload: parseJson(r.payload),
      createdAt: r.created_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}
