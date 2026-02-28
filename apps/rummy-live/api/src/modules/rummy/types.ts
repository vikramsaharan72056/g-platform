export type TableStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
export type DrawPile = 'closed' | 'open';
export type DropType = 'FIRST' | 'MIDDLE' | 'FULL' | 'TIMEOUT' | 'INVALID_DECLARE';
export type SeatStatus = 'ACTIVE' | 'DROPPED';
export type BetChangeStatus = 'PENDING_PLAYERS' | 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED';

export interface PlayerIdentity {
    userId: string;
    name: string;
}

export interface TableSeat {
    seatNo: number;
    userId: string;
    name: string;
    hand: string[];
    score: number;
    status: SeatStatus;
    turnsPlayed: number;
    dropType: DropType | null;
    dropPenalty: number;
    droppedAt: string | null;
    reclaimCode: string | null;
    connected: boolean;
    lastSeenAt: string | null;
    timeoutCount: number;
}

export interface TurnState {
    userId: string;
    hasDrawn: boolean;
    turnNo: number;
    startedAt: string;
    expiresAt: string;
    timeoutMs: number;
}

export interface BetChangeProposal {
    id: string;
    requestedAmount: number;
    currentAmount: number;
    proposedByUserId: string;
    proposedByName: string;
    status: BetChangeStatus;
    playerApprovals: string[];
    playerRejections: string[];
    adminDecisionBy: string | null;
    adminDecisionReason: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface BetControlState {
    isBlocked: boolean;
    blockedBy: string | null;
    blockedReason: string | null;
    blockedAt: string | null;
    activeProposal: BetChangeProposal | null;
    lastResolvedProposal: BetChangeProposal | null;
}

export interface TableChatMessage {
    id: string;
    tableId: string;
    userId: string;
    userName: string;
    role: 'PLAYER' | 'ADMIN' | 'SYSTEM';
    message: string;
    createdAt: string;
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

export interface TableGameState {
    closedPile: string[];
    openPile: string[];
    jokerCard: string | null;
    jokerRank: string | null;
    activePlayerIds: string[];
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
}

export interface RummyTable {
    id: string;
    name: string;
    hostUserId: string;
    maxPlayers: number;
    betAmount: number;
    status: TableStatus;
    createdAt: string;
    updatedAt: string;
    seats: TableSeat[];
    game: TableGameState | null;
    betControl: BetControlState;
}

export interface TableSummary {
    id: string;
    name: string;
    status: TableStatus;
    maxPlayers: number;
    currentPlayers: number;
    betAmount: number;
    createdAt: string;
    playerIds: string[];
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
    betControl: BetControlState;
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

export interface HandEvaluation {
    isValid: boolean;
    pureSequences: number;
    sequences: number;
    sets: number;
    deadwood: number;
    score: number;
}
