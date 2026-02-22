import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '../services/api';

interface User {
    id: string;
    email: string;
    displayName: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
    error: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (token) {
            authAPI.profile()
                .then((res) => {
                    const userData = res.data;
                    if (userData.role === 'ADMIN' || userData.role === 'SUPER_ADMIN') {
                        setUser(userData);
                    } else {
                        logout();
                    }
                })
                .catch(() => logout())
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = async (email: string, password: string) => {
        setError(null);
        try {
            const res = await authAPI.login(email, password);
            const { user: userData, access_token } = res.data;

            if (userData.role !== 'ADMIN' && userData.role !== 'SUPER_ADMIN') {
                throw new Error('Access denied. Admin role required.');
            }

            localStorage.setItem('admin_token', access_token);
            localStorage.setItem('admin_user', JSON.stringify(userData));
            setToken(access_token);
            setUser(userData);
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Login failed';
            setError(msg);
            throw err;
        }
    };

    const logout = () => {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading, error }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
