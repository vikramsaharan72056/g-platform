import { create } from 'zustand';
import { walletApi } from '../services/api';

interface WalletState {
    balance: number;
    bonusBalance: number;
    totalDeposited: number;
    totalWithdrawn: number;
    totalWon: number;
    totalLost: number;
    transactions: any[];
    isLoading: boolean;

    fetchBalance: () => Promise<void>;
    fetchTransactions: (page?: number) => Promise<void>;
}

export const useWalletStore = create<WalletState>((set) => ({
    balance: 0,
    bonusBalance: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalWon: 0,
    totalLost: 0,
    transactions: [],
    isLoading: false,

    fetchBalance: async () => {
        set({ isLoading: true });
        try {
            const res = await walletApi.getBalance();
            const data = res.data.data || res.data;
            set({
                balance: data.balance || 0,
                bonusBalance: data.bonusBalance || 0,
                totalDeposited: data.totalDeposited || 0,
                totalWithdrawn: data.totalWithdrawn || 0,
                totalWon: data.totalWon || 0,
                totalLost: data.totalLost || 0,
                isLoading: false,
            });
        } catch {
            set({ isLoading: false });
        }
    },

    fetchTransactions: async (page = 1) => {
        try {
            const res = await walletApi.getTransactions(page);
            const data = res.data.data || res.data;
            set({ transactions: data.transactions || data || [] });
        } catch {
            // silent
        }
    },
}));
