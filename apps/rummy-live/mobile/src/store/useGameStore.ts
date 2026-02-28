import { create } from 'zustand';
import type { RummyTableView, TableChatMessage, User } from '../types';

type Screen = 'lobby' | 'deposit' | 'withdraw';

interface GameState {
    user: User | null;
    currentTable: RummyTableView | null;
    tableList: any[];
    chatMessages: TableChatMessage[];
    isLoading: boolean;
    error: string | null;
    screen: Screen;

    // Actions
    setUser: (user: User | null) => void;
    setCurrentTable: (table: RummyTableView | null) => void;
    setTableList: (tables: any[]) => void;
    setChatMessages: (messages: TableChatMessage[]) => void;
    appendChatMessage: (message: TableChatMessage) => void;
    clearChatMessages: () => void;
    setLoading: (isLoading: boolean) => void;
    setError: (error: string | null) => void;
    setScreen: (screen: Screen) => void;
}

export const useGameStore = create<GameState>((set) => ({
    user: null,
    currentTable: null,
    tableList: [],
    chatMessages: [],
    isLoading: false,
    error: null,
    screen: 'lobby',

    setUser: (user) => set({ user }),
    setCurrentTable: (currentTable) => set({ currentTable }),
    setTableList: (tableList) => set({ tableList }),
    setChatMessages: (chatMessages) => set({ chatMessages }),
    appendChatMessage: (message) =>
        set((state) => ({
            chatMessages: [...state.chatMessages, message].slice(-300),
        })),
    clearChatMessages: () => set({ chatMessages: [] }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setScreen: (screen) => set({ screen }),
}));
