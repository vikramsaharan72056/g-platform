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
    login: (email: string, password: string) =>
        api.post('/auth/login', { email, password }),
    profile: () => api.get('/auth/profile'),
};

// ==================== USERS ====================
export const usersAPI = {
    list: (params?: Record<string, any>) =>
        api.get('/users/admin/list', { params }),
    detail: (id: string) => api.get(`/users/admin/${id}`),
    updateStatus: (id: string, status: string) =>
        api.patch(`/users/admin/${id}/status`, { status }),
};

// ==================== DEPOSITS ====================
export const depositsAPI = {
    queue: (params?: Record<string, any>) =>
        api.get('/deposits/admin/queue', { params }),
    approve: (id: string, remarks?: string) =>
        api.post(`/deposits/admin/${id}/approve`, { remarks }),
    reject: (id: string, remarks: string) =>
        api.post(`/deposits/admin/${id}/reject`, { remarks }),
    getQrs: () => api.get('/deposits/admin/qr'),
    createQr: (data: any) => api.post('/deposits/admin/qr', data),
    toggleQr: (id: string, isActive: boolean) =>
        api.patch(`/deposits/admin/qr/${id}/toggle`, { isActive }),
};

// ==================== WITHDRAWALS ====================
export const withdrawalsAPI = {
    queue: (params?: Record<string, any>) =>
        api.get('/withdrawals/admin/queue', { params }),
    approve: (id: string, paymentRef?: string, remarks?: string) =>
        api.post(`/withdrawals/admin/${id}/approve`, { paymentRef, remarks }),
    reject: (id: string, remarks: string) =>
        api.post(`/withdrawals/admin/${id}/reject`, { remarks }),
};

// ==================== GAMES ====================
export const gamesAPI = {
    list: () => api.get('/games/admin/all'),
    stats: (id: string) => api.get(`/games/admin/${id}/stats`),
};
