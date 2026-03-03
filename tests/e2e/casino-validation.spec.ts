import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';

test.describe('Casino Game E2E Validation', () => {
    const API_URL = process.env.GAME_API_URL || 'http://localhost:3402'; // Default to Aviator
    const WS_URL = API_URL.replace('http', 'ws') + '/aviator'; // Example namespace

    test('should connect to WebSocket and receive game state', async () => {
        const socket = io(WS_URL, {
            transports: ['websocket'],
        });

        const statePromise = new Promise((resolve) => {
            socket.on('state', (state) => {
                resolve(state);
            });
        });

        const state: any = await statePromise;
        expect(state).toHaveProperty('roundId');
        expect(state).toHaveProperty('status');
        socket.disconnect();
    });

    test('should place a bet successfully', async ({ request }) => {
        // 1. Get Guest Login
        const loginRes = await request.post(`${API_URL}/auth/guest-login`, {
            data: { name: 'TestPlayer' }
        });
        const { user } = await loginRes.json();
        const userId = user.userId;

        // 2. Get current state to find roundId
        const socket = io(WS_URL, { transports: ['websocket'] });
        const roundId = await new Promise<string>((resolve) => {
            socket.on('state', (s) => {
                if (s.status === 'BETTING') resolve(s.roundId);
            });
        });

        // 3. Place Bet
        const betRes = await request.post(`${API_URL}/bet/place`, {
            data: { userId, amount: 100, roundId }
        });

        expect(betRes.status()).toBe(200);
        const betData = await betRes.json();
        expect(betData.bet).toHaveProperty('id');
        expect(betData.balance).toBe(9900);

        socket.disconnect();
    });
});
