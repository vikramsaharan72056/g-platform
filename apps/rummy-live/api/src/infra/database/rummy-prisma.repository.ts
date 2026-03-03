import { PrismaClient, TableStatus, DisputeStatus } from '@prisma/client';
import type { RummyTable } from '../../modules/rummy/types.js';

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

export interface WalletDeltaInput {
    userId: string;
    displayName: string;
    amount: number;
    tableId?: string | null;
    type: string;
    payload?: unknown;
}

export interface AppendLedgerInput {
    tableId: string;
    winnerUserId: string;
    payload: unknown;
    payloadHash: string;
    signature: string;
}

export interface ResolveDisputeInput {
    status: 'REVIEWED' | 'RESOLVED' | 'REJECTED';
    resolutionNote: string;
    resolvedBy: string;
}

export interface ListAuditInput {
    limit?: number;
    tableId?: string;
    action?: string;
}

export class RummyPrismaRepository {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    async loadTables(): Promise<RummyTable[]> {
        const tables = await this.prisma.table.findMany({
            orderBy: { updatedAt: 'desc' }
        });
        return tables.map(t => t.payload as unknown as RummyTable);
    }

    async saveTable(table: RummyTable): Promise<void> {
        await this.prisma.table.upsert({
            where: { id: table.id },
            update: {
                status: table.status as TableStatus,
                payload: table as any,
                updatedAt: new Date(table.updatedAt)
            },
            create: {
                id: table.id,
                name: table.name,
                hostUserId: table.hostUserId || 'system',
                maxPlayers: table.maxPlayers,
                pointValue: 1, // Default or pull from table
                status: table.status as TableStatus,
                payload: table as any,
                createdAt: new Date(table.createdAt),
                updatedAt: new Date(table.updatedAt)
            }
        });
    }

    async deleteTable(tableId: string): Promise<void> {
        await this.prisma.table.delete({ where: { id: tableId } });
    }

    async appendHistory(tableId: string, eventType: string, payload: unknown): Promise<number> {
        const history = await this.prisma.gameHistory.create({
            data: {
                tableId,
                eventType,
                payload: payload as any
            }
        });
        return history.id;
    }

    async listHistory(tableId: string, limit = 100): Promise<TableHistoryRow[]> {
        const rows = await this.prisma.gameHistory.findMany({
            where: { tableId },
            orderBy: { id: 'desc' },
            take: limit
        });
        return rows.map(r => ({
            id: r.id,
            tableId: r.tableId,
            eventType: r.eventType,
            payload: r.payload,
            createdAt: r.createdAt.toISOString()
        }));
    }

    async listHistorySince(tableId: string, sinceId = 0, limit = 200): Promise<TableHistoryRow[]> {
        const rows = await this.prisma.gameHistory.findMany({
            where: { tableId, id: { gt: sinceId } },
            orderBy: { id: 'asc' },
            take: limit
        });
        return rows.map(r => ({
            id: r.id,
            tableId: r.tableId,
            eventType: r.eventType,
            payload: r.payload,
            createdAt: r.createdAt.toISOString()
        }));
    }

    async ensureWallet(userId: string, displayName: string, options: { initialBalance?: number } = {}): Promise<WalletBalanceRow> {
        const initialBalance = options.initialBalance ?? 10000;
        const user = await this.prisma.user.upsert({
            where: { userId },
            update: { name: displayName },
            create: {
                userId,
                name: displayName,
                balance: initialBalance
            }
        });
        return {
            userId: user.userId,
            displayName: user.name,
            balance: user.balance,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString()
        };
    }

    async getWallet(userId: string): Promise<WalletBalanceRow> {
        const user = await this.prisma.user.findUnique({ where: { userId } });
        if (!user) throw new Error('Wallet not found');
        return {
            userId: user.userId,
            displayName: user.name,
            balance: user.balance,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString()
        };
    }

    async applyWalletDeltas(entries: WalletDeltaInput[]): Promise<Map<string, { before: number; after: number }>> {
        return await this.prisma.$transaction(async (tx) => {
            const result = new Map<string, { before: number; after: number }>();

            for (const entry of entries) {
                const user = await tx.user.findUnique({ where: { userId: entry.userId } });
                const before = user?.balance ?? 10000;
                const after = before + entry.amount;

                const updatedUser = await tx.user.upsert({
                    where: { userId: entry.userId },
                    update: { balance: after, name: entry.displayName },
                    create: { userId: entry.userId, name: entry.displayName, balance: after }
                });

                await tx.walletTransaction.create({
                    data: {
                        userId: entry.userId,
                        tableId: entry.tableId,
                        type: entry.type,
                        amount: entry.amount,
                        balanceBefore: before,
                        balanceAfter: updatedUser.balance,
                        payload: (entry.payload as any) || {}
                    }
                });

                result.set(entry.userId, { before, after: updatedUser.balance });
            }

            return result;
        });
    }

    async listWalletTransactions(userId: string, limit = 100): Promise<WalletTransactionRow[]> {
        const rows = await this.prisma.walletTransaction.findMany({
            where: { userId },
            orderBy: { id: 'desc' },
            take: limit
        });
        return rows.map(r => ({
            id: r.id,
            userId: r.userId,
            tableId: r.tableId,
            type: r.type,
            amount: r.amount,
            balanceBefore: r.balanceBefore,
            balanceAfter: r.balanceAfter,
            payload: r.payload,
            createdAt: r.createdAt.toISOString()
        }));
    }

    async reassignUser(oldUserId: string, newUserId: string, displayName: string): Promise<void> {
        if (oldUserId === newUserId) {
            await this.ensureWallet(newUserId, displayName);
            return;
        }

        await this.prisma.$transaction(async (tx) => {
            const oldWallet = await tx.user.findUnique({ where: { userId: oldUserId } });
            const newWallet = await tx.user.findUnique({ where: { userId: newUserId } });

            if (oldWallet && !newWallet) {
                await tx.user.update({
                    where: { userId: oldUserId },
                    data: { userId: newUserId, name: displayName }
                });
            } else if (oldWallet && newWallet) {
                const merged = oldWallet.balance + newWallet.balance;
                await tx.user.update({
                    where: { userId: newUserId },
                    data: { balance: merged, name: displayName }
                });
                await tx.user.delete({ where: { userId: oldUserId } });
            } else {
                await this.ensureWallet(newUserId, displayName);
            }

            await tx.walletTransaction.updateMany({
                where: { userId: oldUserId },
                data: { userId: newUserId }
            });
        });
    }

    async appendResultLedger(input: AppendLedgerInput): Promise<LedgerRow> {
        const prev = await this.prisma.resultLedger.findFirst({
            where: { tableId: input.tableId },
            orderBy: { id: 'desc' }
        });

        const ledger = await this.prisma.resultLedger.create({
            data: {
                tableId: input.tableId,
                winnerUserId: input.winnerUserId,
                payload: input.payload as any,
                payloadHash: input.payloadHash,
                signature: input.signature,
                previousHash: prev?.payloadHash || null
            }
        });

        return {
            id: ledger.id,
            tableId: ledger.tableId,
            winnerUserId: ledger.winnerUserId,
            payload: ledger.payload,
            payloadHash: ledger.payloadHash,
            signature: ledger.signature,
            previousHash: ledger.previousHash,
            createdAt: ledger.createdAt.toISOString()
        };
    }

    async getResultLedgerById(id: number): Promise<LedgerRow | null> {
        const r = await this.prisma.resultLedger.findUnique({ where: { id } });
        if (!r) return null;
        return {
            id: r.id,
            tableId: r.tableId,
            winnerUserId: r.winnerUserId,
            payload: r.payload,
            payloadHash: r.payloadHash,
            signature: r.signature,
            previousHash: r.previousHash,
            createdAt: r.createdAt.toISOString()
        };
    }

    async listResultLedger(tableId: string, limit = 50): Promise<LedgerRow[]> {
        const rows = await this.prisma.resultLedger.findMany({
            where: { tableId },
            orderBy: { id: 'desc' },
            take: limit
        });
        return rows.map(r => ({
            id: r.id,
            tableId: r.tableId,
            winnerUserId: r.winnerUserId,
            payload: r.payload,
            payloadHash: r.payloadHash,
            signature: r.signature,
            previousHash: r.previousHash,
            createdAt: r.createdAt.toISOString()
        }));
    }

    async getPreviousLedgerEntry(tableId: string, ledgerId: number): Promise<LedgerRow | null> {
        const row = await this.prisma.resultLedger.findFirst({
            where: {
                tableId,
                id: { lt: ledgerId }
            },
            orderBy: { id: 'desc' }
        });

        if (!row) return null;
        return {
            id: row.id,
            tableId: row.tableId,
            winnerUserId: row.winnerUserId,
            payload: row.payload,
            payloadHash: row.payloadHash,
            signature: row.signature,
            previousHash: row.previousHash,
            createdAt: row.createdAt.toISOString()
        };
    }

    async createDispute(tableId: string, raisedBy: string, reason: string, evidence?: string): Promise<DisputeRow> {
        const dispute = await this.prisma.dispute.create({
            data: {
                tableId,
                raisedBy,
                reason,
                evidence,
                status: DisputeStatus.OPEN
            }
        });
        return {
            id: dispute.id,
            tableId: dispute.tableId,
            raisedBy: dispute.raisedBy,
            reason: dispute.reason,
            evidence: dispute.evidence,
            status: dispute.status as any,
            resolutionNote: dispute.resolutionNote,
            resolvedBy: dispute.resolvedBy,
            resolvedAt: dispute.resolvedAt?.toISOString() || null,
            createdAt: dispute.createdAt.toISOString()
        };
    }

    async listDisputes(tableId: string, limit = 100): Promise<DisputeRow[]> {
        const rows = await this.prisma.dispute.findMany({
            where: { tableId },
            orderBy: { id: 'desc' },
            take: limit
        });
        return rows.map(r => ({
            id: r.id,
            tableId: r.tableId,
            raisedBy: r.raisedBy,
            reason: r.reason,
            evidence: r.evidence,
            status: r.status as any,
            resolutionNote: r.resolutionNote,
            resolvedBy: r.resolvedBy,
            resolvedAt: r.resolvedAt?.toISOString() || null,
            createdAt: r.createdAt.toISOString()
        }));
    }

    async resolveDispute(disputeId: number, input: ResolveDisputeInput): Promise<DisputeRow> {
        const d = await this.prisma.dispute.update({
            where: { id: disputeId },
            data: {
                status: input.status as DisputeStatus,
                resolutionNote: input.resolutionNote,
                resolvedBy: input.resolvedBy,
                resolvedAt: new Date()
            }
        });
        return {
            id: d.id,
            tableId: d.tableId,
            raisedBy: d.raisedBy,
            reason: d.reason,
            evidence: d.evidence,
            status: d.status as any,
            resolutionNote: d.resolutionNote,
            resolvedBy: d.resolvedBy,
            resolvedAt: d.resolvedAt?.toISOString() || null,
            createdAt: d.createdAt.toISOString()
        };
    }

    async appendAudit(action: string, actorUserId: string | null, tableId: string | null, payload: unknown): Promise<number> {
        const audit = await this.prisma.auditLog.create({
            data: {
                action,
                actorUserId,
                tableId,
                payload: payload as any
            }
        });
        return audit.id;
    }

    async listAuditLogs(input: ListAuditInput = {}): Promise<AuditRow[]> {
        const rows = await this.prisma.auditLog.findMany({
            where: {
                tableId: input.tableId,
                action: input.action
            },
            orderBy: { id: 'desc' },
            take: input.limit ?? 100
        });
        return rows.map(r => ({
            id: r.id,
            action: r.action,
            actorUserId: r.actorUserId,
            tableId: r.tableId,
            payload: r.payload,
            createdAt: r.createdAt.toISOString()
        }));
    }

    async transaction<T>(action: () => Promise<T>): Promise<T> {
        return this.prisma.$transaction(action);
    }

    async close() {
        await this.prisma.$disconnect();
    }
}
