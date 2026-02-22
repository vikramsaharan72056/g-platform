import { create } from 'zustand';
import { getItem, setItem, deleteItem } from '../services/storage';
import { authApi } from '../services/api';

interface User {
    id: string;
    email: string;
    displayName: string;
    phone?: string;
    role: string;
    twoFactorEnabled: boolean;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    login: (email: string, password: string) => Promise<boolean>;
    register: (data: { email: string; password: string; displayName: string; phone?: string }) => Promise<boolean>;
    logout: () => Promise<void>;
    loadUser: () => Promise<void>;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,

    login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
            const res = await authApi.login(email, password);
            const { user, token, refreshToken } = res.data.data || res.data;

            await setItem('accessToken', token);
            if (refreshToken) {
                await setItem('refreshToken', refreshToken);
            }

            set({ user, isAuthenticated: true, isLoading: false });
            return true;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Login failed';
            set({ error: message, isLoading: false });
            return false;
        }
    },

    register: async (data) => {
        set({ isLoading: true, error: null });
        try {
            const res = await authApi.register(data);
            const { user, token, refreshToken } = res.data.data || res.data;

            await setItem('accessToken', token);
            if (refreshToken) {
                await setItem('refreshToken', refreshToken);
            }

            set({ user, isAuthenticated: true, isLoading: false });
            return true;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Registration failed';
            set({ error: message, isLoading: false });
            return false;
        }
    },

    logout: async () => {
        await deleteItem('accessToken');
        await deleteItem('refreshToken');
        set({ user: null, isAuthenticated: false, isLoading: false, error: null });
    },

    loadUser: async () => {
        try {
            const token = await getItem('accessToken');
            if (!token) {
                set({ isLoading: false });
                return;
            }

            const res = await authApi.getProfile();
            const user = res.data.data || res.data;
            set({ user, isAuthenticated: true, isLoading: false });
        } catch {
            await deleteItem('accessToken');
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    },

    clearError: () => set({ error: null }),
}));
