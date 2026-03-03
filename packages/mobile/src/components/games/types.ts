export interface RoundState {
    roundId: string | null;
    roundNumber: number;
    status: 'WAITING' | 'BETTING' | 'LOCKED' | 'PLAYING' | 'RESULT' | 'SETTLED';
    bettingEndsAt: string | null;
    result: any;
    settlement: any;
}

export interface BetOption {
    type: string;
    label: string;
    odds: string;
    color: string;
    emoji: string;
}

export interface GameComponentProps {
    round: RoundState;
    slug: string;
    // Aviator-specific props (some games might need extra context)
    extraData?: {
        multiplier?: number;
        hasCashedOut?: boolean;
        onCashout?: () => void;
        activeBetId?: string | null;
        betAmount?: string;
    };
}
