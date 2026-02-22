import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { getItem } from './storage';

const getBaseUrl = () => {
    if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
    if (Platform.OS === 'web') return 'http://localhost:3000';
    if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
};

const BASE_URL = getBaseUrl();

let socket: Socket | null = null;

export const connectSocket = async (): Promise<Socket> => {
    if (socket?.connected) return socket;

    const token = await getItem('accessToken');

    socket = io(`${BASE_URL}/game`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
        console.log('🔌 Socket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
        console.error('🔌 Socket error:', err.message);
    });

    return socket;
};

export const joinGame = (gameId: string) => {
    socket?.emit('join:game', { gameId });
};

export const leaveGame = (gameId: string) => {
    socket?.emit('leave:game', { gameId });
};

export const disconnectSocket = () => {
    socket?.disconnect();
    socket = null;
};

export const getSocket = () => socket;
