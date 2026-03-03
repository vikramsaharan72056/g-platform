import { create } from 'zustand';
import { gamesApi } from '../services/api';

interface Game {
    id: string;
    gameId?: string; // Links to global game config
    name: string;
    slug: string;
    description: string;
    thumbnail: string;
    isActive: boolean;
    minBet: number;
    maxBet: number;
    serviceUrl?: string; // The URL of the spoke microservice
    wsUrl?: string;      // The WebSocket URL of the spoke
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
            const rawData = res.data.data || res.data;

            // Map Registry response (GameService objects) to Game interface
            const games = Array.isArray(rawData) ? rawData.map((item: any) => {
                if (item.game && item.serviceUrl) {
                    // This is a Registry result
                    return {
                        id: item.id,
                        gameId: item.gameId,
                        name: item.game.name,
                        slug: item.game.slug,
                        description: item.game.description,
                        thumbnail: item.game.thumbnail,
                        isActive: item.game.isActive && item.healthStatus === 'HEALTHY',
                        minBet: item.game.minBet,
                        maxBet: item.game.maxBet,
                        serviceUrl: item.serviceUrl,
                        wsUrl: item.wsUrl
                    };
                }
                return item; // Legacy flat game object
            }) : [];

            set({ games, isLoading: false });
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
