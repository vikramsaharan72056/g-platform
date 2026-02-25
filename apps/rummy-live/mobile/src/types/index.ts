export type TableStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
export type DrawPile = 'closed' | 'open';
export type DropType = 'FIRST' | 'MIDDLE' | 'FULL' | 'TIMEOUT' | 'INVALID_DECLARE';
export type SeatStatus = 'ACTIVE' | 'DROPPED';

export interface TurnState {
    userId: string;
    hasDrawn: boolean;
    turnNo: number;
    startedAt: string;
    expiresAt: string;
    timeoutMs: number;
}

export interface SettlementEntry {
    userId: string;
    name: string;
    points: number;
    amount: number;
    walletBefore: number;
    walletAfter: number;
    result: 'WIN' | 'LOSE' | 'DROP' | 'INVALID';
}

export interface SettlementSummary {
    betAmount: number;
    totalPot: number;
    rake: number;
    entries: SettlementEntry[];
}

export interface SeatView {
    seatNo: number;
    userId: string;
    name: string;
    score: number;
    status: SeatStatus;
    turnsPlayed: number;
    dropType: DropType | null;
    dropPenalty: number;
    droppedAt: string | null;
    connected: boolean;
    lastSeenAt: string | null;
    timeoutCount: number;
    reclaimCode?: string | null;
    hand?: string[];
    handCount?: number;
}

export interface RummyTableView {
    id: string;
    name: string;
    status: TableStatus;
    hostUserId: string;
    maxPlayers: number;
    betAmount: number;
    currentPlayers: number;
    seats: SeatView[];
    mySeat: null | {
        userId: string;
        seatNo: number;
        reclaimCode: string | null;
    };
    game: null | {
        jokerCard: string | null;
        jokerRank: string | null;
        openTop: string | null;
        closedCount: number;
        activePlayers: number;
        turn: TurnState;
        winnerUserId: string | null;
        winningReason: string | null;
        finishedAt: string | null;
        settlement: SettlementSummary | null;
        resultLedger: null | {
            ledgerId: number;
            payloadHash: string;
            signature: string;
            signedAt: string;
        };
    };
}

export interface User {
    userId: string;
    name: string;
    token: string;
    wallet?: {
        balance: number;
    };
}
