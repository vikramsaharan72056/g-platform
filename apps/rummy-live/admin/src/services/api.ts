import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor — attach JWT token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    },
);

export default api;

// ==================== AUTH ====================
export const authAPI = {
    login: async (email: string, password?: string) => {
        const res = await api.post('/auth/admin-login', { email, password });
        return {
            data: {
                user: res.data.data.user,
                access_token: res.data.data.token
            }
        };
    },
    profile: async () => {
        const res = await api.get('/auth/me');
        return { data: res.data.data };
    },
};

// ==================== USERS ====================
export const usersAPI = {
    list: async (params?: Record<string, any>) => {
        const res = await api.get('/users/admin/list', { params });
        return { data: res.data.data };
    },
    detail: async (id: string) => {
        const res = await api.get(`/users/admin/${id}`);
        return { data: res.data.data };
    },
    updateStatus: async () => {
        throw new Error('User status update is not supported by rummy-live backend');
    },
};

// ==================== DEPOSITS (REAL ENDPOINTS) ====================
export const depositsAPI = {
    queue: async (params?: Record<string, any>) => {
        const res = await api.get('/deposits', { params });
        return { data: res.data.data };
    },
    approve: async (id: string, remarks?: string) => {
        return api.post(`/deposits/${id}/approve`, { remarks });
    },
    reject: async (id: string, reason: string) => {
        return api.post(`/deposits/${id}/reject`, { reason });
    },
    getQrs: async () => {
        const res = await api.get('/payment-qrs/all');
        return { data: res.data.data };
    },
    createQr: async (data: any) => {
        const res = await api.post('/payment-qrs', data);
        return { data: res.data.data };
    },
    toggleQr: async (id: string, isActive: boolean) => {
        return api.patch(`/payment-qrs/${id}`, { isActive });
    },
};

// ==================== WITHDRAWALS (REAL ENDPOINTS) ====================
export const withdrawalsAPI = {
    queue: async (params?: Record<string, any>) => {
        const res = await api.get('/withdrawals', { params });
        return { data: res.data.data };
    },
    approve: async (id: string, paymentRef?: string, remarks?: string) => {
        return api.post(`/withdrawals/${id}/approve`, { paymentRef, remarks });
    },
    reject: async (id: string, reason?: string) => {
        return api.post(`/withdrawals/${id}/reject`, { reason });
    },
};

// ==================== GAMES ====================
export const gamesAPI = {
    list: async () => {
        const res = await api.get('/tables');
        return { data: res.data.data };
    },
    stats: async (id: string) => {
        const res = await api.get(`/tables/${id}`);
        const t = res.data.data;
        return {
            data: {
                totalRounds: 0,
                totalBets: t.currentPlayers || 0,
                totalBetAmount: (t.betAmount || 0) * (t.currentPlayers || 0),
                housePnl: 0
            }
        };
    },
};

// ==================== LIVE MONITOR ====================
export const liveMonitorAPI = {
    tableState: async (tableId: string) => {
        const res = await api.get(`/tables/${tableId}`);
        return { data: res.data.data };
    },
    tableChat: async (tableId: string, limit = 200) => {
        const res = await api.get(`/tables/${tableId}/chat`, { params: { limit } });
        return { data: res.data.data };
    },
    setBetLock: async (tableId: string, blocked: boolean, reason?: string) => {
        const res = await api.post(`/tables/${tableId}/bet-lock`, { blocked, reason });
        return { data: res.data.data };
    },
    reviewBetChange: async (tableId: string, approve: boolean, reason?: string) => {
        const res = await api.post(`/tables/${tableId}/bet-change/admin-review`, { approve, reason });
        return { data: res.data.data };
    },
};

// ==================== ADMIN GAME CONTROLS ====================
export const gameControlsAPI = {
    dashboard: async () => {
        // Fetch real data from multiple endpoints
        const [tablesRes, depositsRes, withdrawalsRes, usersRes] = await Promise.all([
            api.get('/tables'),
            api.get('/deposits', { params: { status: 'PENDING', limit: 1 } }),
            api.get('/withdrawals', { params: { status: 'PENDING', limit: 1 } }),
            api.get('/users/admin/list', { params: { limit: 1 } }),
        ]);

        const tables = tablesRes.data.data || [];
        const depositsMeta = depositsRes.data.data?.meta || {};
        const withdrawalsMeta = withdrawalsRes.data.data?.meta || {};
        const usersMeta = usersRes.data.data?.meta || {};

        const activeTables = tables.filter((t: any) => t.status === 'IN_PROGRESS');
        const finishedTables = tables.filter((t: any) => t.status === 'FINISHED');

        // Estimate revenue from betting
        const totalBetVolume = finishedTables.reduce((sum: number, t: any) => sum + (t.betAmount || 0) * (t.currentPlayers || 0), 0);
        const estimatedRake = Math.floor(totalBetVolume * 0.1);

        return {
            data: {
                totalUsers: usersMeta?.total || 0,
                activeUsers24h: activeTables.length,
                todayRevenue: estimatedRake,
                todayBetVolume: totalBetVolume,
                weeklyRevenue: estimatedRake,
                monthlyRevenue: estimatedRake,
                pendingDeposits: depositsMeta?.total || 0,
                pendingWithdrawals: withdrawalsMeta?.total || 0,
                gameStats: tables.map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    isActive: t.status === 'IN_PROGRESS',
                    _count: { rounds: 0 }
                }))
            }
        };
    },
    revenueChart: async () => {
        throw new Error('Revenue chart endpoint is not available in rummy-live backend');
    },
    gameAnalytics: async () => {
        throw new Error('Game analytics endpoint is not available in rummy-live backend');
    },
    updateConfig: async () => {
        throw new Error('Game config update endpoint is not available in rummy-live backend');
    },
    getControls: async () => {
        throw new Error('Game controls endpoint is not available in rummy-live backend');
    },
    forceResult: async () => {
        throw new Error('Force result endpoint is not available in rummy-live backend');
    },
    setWinRate: async () => {
        throw new Error('Win rate endpoint is not available in rummy-live backend');
    },
    setPlayerLimit: async () => {
        throw new Error('Player limit endpoint is not available in rummy-live backend');
    },
    removeControl: async () => {
        throw new Error('Remove control endpoint is not available in rummy-live backend');
    },
};

// ==================== AUDIT LOGS ====================
export const auditAPI = {
    list: async (params?: Record<string, any>) => {
        const res = await api.get('/audit', { params });
        return {
            data: {
                data: res.data.data || [],
                totalPages: 1
            }
        };
    },
};

// ==================== WALLET ====================
export const walletAPI = {
    adminCredit: (userId: string, amount: number, reason: string) =>
        api.post(`/users/admin/${userId}/wallet-adjust`, { amount, reason }),
    adminDebit: (userId: string, amount: number, reason: string) =>
        api.post(`/users/admin/${userId}/wallet-adjust`, { amount: -amount, reason }),
};
