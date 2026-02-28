import { create } from 'zustand';
import type {
  AviatorBet,
  AviatorRoundSnapshot,
  AviatorRoundView,
  RoundHistoryItem,
  User,
} from '../types';

interface AviatorState {
  user: User | null;
  round: AviatorRoundView | null;
  bets: AviatorBet[];
  history: RoundHistoryItem[];
  multiplier: number;
  lastCrashPoint: number | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User | null) => void;
  setRoundSnapshot: (snapshot: AviatorRoundSnapshot) => void;
  setRound: (round: AviatorRoundView | null) => void;
  setHistory: (history: RoundHistoryItem[]) => void;
  prependHistoryItem: (item: RoundHistoryItem) => void;
  upsertBet: (bet: AviatorBet) => void;
  updateBet: (betId: string, patch: Partial<AviatorBet>) => void;
  markPlacedBetsLost: (roundId: string) => void;
  setBalance: (balance: number) => void;
  setMultiplier: (multiplier: number) => void;
  setLastCrashPoint: (value: number | null) => void;
  setConnected: (connected: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  resetSession: () => void;
}

export const useAviatorStore = create<AviatorState>((set) => ({
  user: null,
  round: null,
  bets: [],
  history: [],
  multiplier: 1,
  lastCrashPoint: null,
  isConnected: false,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),
  setRoundSnapshot: (snapshot) =>
    set((state) => {
      const nextMultiplier =
        snapshot.round?.currentMultiplier ??
        (snapshot.round?.status === 'PLAYING' ? state.multiplier : 1);

      return {
        round: snapshot.round,
        bets: snapshot.userBets || [],
        multiplier: nextMultiplier,
      };
    }),
  setRound: (round) =>
    set((state) => ({
      round,
      multiplier:
        round?.status === 'PLAYING'
          ? round.currentMultiplier || state.multiplier
          : round?.status === 'BETTING' || !round
            ? 1
            : state.multiplier,
    })),
  setHistory: (history) => set({ history }),
  prependHistoryItem: (item) =>
    set((state) => ({
      history: [item, ...state.history.filter((h) => h.id !== item.id)].slice(0, 30),
    })),
  upsertBet: (bet) =>
    set((state) => {
      const existing = state.bets.find((b) => b.id === bet.id);
      if (!existing) {
        return { bets: [bet, ...state.bets] };
      }
      return {
        bets: state.bets.map((b) => (b.id === bet.id ? { ...b, ...bet } : b)),
      };
    }),
  updateBet: (betId, patch) =>
    set((state) => ({
      bets: state.bets.map((b) => (b.id === betId ? { ...b, ...patch } : b)),
    })),
  markPlacedBetsLost: (roundId) =>
    set((state) => ({
      bets: state.bets.map((b) =>
        b.roundId === roundId && b.status === 'PLACED'
          ? { ...b, status: 'LOST', payout: 0, cashoutMultiplier: null }
          : b,
      ),
    })),
  setBalance: (balance) =>
    set((state) => ({
      user: state.user ? { ...state.user, balance } : state.user,
    })),
  setMultiplier: (multiplier) => set({ multiplier }),
  setLastCrashPoint: (value) => set({ lastCrashPoint: value }),
  setConnected: (connected) => set({ isConnected: connected }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  resetSession: () =>
    set({
      user: null,
      round: null,
      bets: [],
      history: [],
      multiplier: 1,
      lastCrashPoint: null,
      isConnected: false,
      isLoading: false,
      error: null,
    }),
}));
