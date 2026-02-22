import axios from 'axios';
import { Platform } from 'react-native';
import { getItem, deleteItem } from './storage';

// Web → localhost, Android emulator → 10.0.2.2, physical device → set EXPO_PUBLIC_API_URL
const getBaseUrl = () => {
    if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
    if (Platform.OS === 'web') return 'http://localhost:3000';
    if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
    return 'http://localhost:3000'; // iOS simulator
};

const BASE_URL = getBaseUrl();

const api = axios.create({
    baseURL: `${BASE_URL}/api`,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT
api.interceptors.request.use(
    async (config) => {
        const token = await getItem('accessToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor — handle 401
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            await deleteItem('accessToken');
            await deleteItem('refreshToken');
        }
        return Promise.reject(error);
    }
);

// ===================== AUTH =====================
export const authApi = {
    login: (email: string, password: string, twoFactorCode?: string) =>
        api.post('/auth/login', { email, password, twoFactorCode }),

    register: (data: { email: string; password: string; displayName: string; phone?: string }) =>
        api.post('/auth/register', data),

    getProfile: () => api.get('/auth/profile'),

    refreshToken: () => api.post('/auth/refresh'),

    // 2FA
    setup2FA: () => api.post('/auth/2fa/setup'),
    verify2FA: (token: string) => api.post('/auth/2fa/verify', { token }),
    disable2FA: (password: string) => api.post('/auth/2fa/disable', { password }),

    // Password
    forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
    resetPassword: (token: string, newPassword: string) =>
        api.post('/auth/reset-password', { token, newPassword }),

    // Login history
    loginHistory: (page = 1) => api.get(`/auth/login-history?page=${page}`),
};

// ===================== WALLET =====================
export const walletApi = {
    getBalance: () => api.get('/wallet/balance'),
    getTransactions: (page = 1, limit = 20) =>
        api.get(`/wallet/transactions?page=${page}&limit=${limit}`),
};

// ===================== DEPOSIT =====================
export const depositApi = {
    getQrCodes: () => api.get('/deposit/qr-codes'),
    submitRequest: (data: { amount: number; paymentQrId: string; utrNumber: string }) =>
        api.post('/deposit/request', data),
    getHistory: (page = 1) => api.get(`/deposit/history?page=${page}`),
};

// ===================== WITHDRAWAL =====================
export const withdrawalApi = {
    submitRequest: (data: { amount: number; bankName: string; accountNumber: string; ifscCode: string; holderName: string }) =>
        api.post('/withdrawal/request', data),
    getHistory: (page = 1) => api.get(`/withdrawal/history?page=${page}`),
};

// ===================== GAMES =====================
export const gamesApi = {
    getAll: () => api.get('/games'),
    getById: (id: string) => api.get(`/games/${id}`),
    getBySlug: (slug: string) => api.get(`/games/${slug}`),
    getCurrentRound: (slug: string) => api.get(`/games/${slug}/current-round`),
    getHistory: (slug: string, limit?: number) => api.get(`/games/${slug}/history`, { params: { limit } }),
    placeBet: (data: { roundId: string; betType: string; amount: number; betData?: any }) =>
        api.post('/games/bet', data),
};

// ===================== USER =====================
export const userApi = {
    getProfile: () => api.get('/users/profile'),
    updateProfile: (data: { displayName?: string; phone?: string }) =>
        api.patch('/users/profile', data),
};

// ===================== NOTIFICATIONS =====================
export const notificationApi = {
    getAll: (page = 1, limit = 20) => api.get(`/notifications?page=${page}&limit=${limit}`),
    markRead: (id: string) => api.post(`/notifications/${id}/read`),
    markAllRead: () => api.post('/notifications/read-all'),
};

export default api;
