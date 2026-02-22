import { create } from 'zustand';
import { gamesApi } from '../services/api';

interface Game {
    id: string;
    name: string;
    slug: string;
    description: string;
    thumbnail: string;
    isActive: boolean;
    minBet: number;
    maxBet: number;
    bettingWindow: number;
}

interface RoundState {
    roundId: string | null;
    roundNumber: number;
    status: 'WAITING' | 'BETTING' | 'LOCKED' | 'PLAYING' | 'RESULT' | 'SETTLED';
    bettingEndsAt: string | null;
    result: any;
    settlement: any;
}

interface GameState {
    games: Game[];
    isLoading: boolean;
    currentRound: RoundState;

    fetchGames: () => Promise<void>;
    setRound: (round: Partial<RoundState>) => void;
    resetRound: () => void;
}

const initialRound: RoundState = {
    roundId: null,
    roundNumber: 0,
    status: 'WAITING',
    bettingEndsAt: null,
    result: null,
    settlement: null,
};

export const useGameStore = create<GameState>((set) => ({
    games: [],
    isLoading: false,
    currentRound: initialRound,

    fetchGames: async () => {
        set({ isLoading: true });
        try {
            const res = await gamesApi.getAll();
            const data = res.data.data || res.data;
            set({ games: Array.isArray(data) ? data : [], isLoading: false });
        } catch {
            set({ isLoading: false });
        }
    },

    setRound: (round) =>
        set((state) => ({
            currentRound: { ...state.currentRound, ...round },
        })),

    resetRound: () => set({ currentRound: initialRound }),
}));
