import { create } from 'zustand';
import type { RummyTableView, User } from '../types';

interface GameState {
    user: User | null;
    currentTable: RummyTableView | null;
    tableList: any[];
    isLoading: boolean;
    error: string | null;

    // Actions
    setUser: (user: User | null) => void;
    setCurrentTable: (table: RummyTableView | null) => void;
    setTableList: (tables: any[]) => void;
    setLoading: (isLoading: boolean) => void;
    setError: (error: string | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
    user: null,
    currentTable: null,
    tableList: [],
    isLoading: false,
    error: null,

    setUser: (user) => set({ user }),
    setCurrentTable: (currentTable) => set({ currentTable }),
    setTableList: (tableList) => set({ tableList }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
}));
