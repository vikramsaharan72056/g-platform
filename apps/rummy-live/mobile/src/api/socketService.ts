import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/useGameStore';
import type { RummyTableView } from '../types';

class SocketService {
    private socket: Socket | null = null;
    private apiUrl: string = '';

    init(url: string, token: string) {
        this.apiUrl = url;
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io(this.apiUrl, {
            auth: { token },
            transports: ['websocket'],
        });

        this.socket.on('connect', () => {
            console.log('Connected to socket');
        });

        this.socket.on('table:list', (tables) => {
            useGameStore.getState().setTableList(tables);
        });

        this.socket.on('table:state', (state: RummyTableView) => {
            useGameStore.getState().setCurrentTable(state);
        });

        this.socket.on('table:error', (err) => {
            useGameStore.getState().setError(err.message);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from socket');
        });
    }

    subscribeTable(tableId: string) {
        this.socket?.emit('table:subscribe', { tableId });
    }

    unsubscribeTable(tableId: string) {
        this.socket?.emit('table:unsubscribe', { tableId });
    }

    drawCard(tableId: string, pile: 'open' | 'closed') {
        this.socket?.emit('turn:draw', { tableId, pile });
    }

    discardCard(tableId: string, card: string) {
        this.socket?.emit('turn:discard', { tableId, card });
    }

    declare(tableId: string) {
        this.socket?.emit('turn:declare', { tableId });
    }

    drop(tableId: string, dropType: 'first' | 'middle' | 'full') {
        this.socket?.emit('turn:drop', { tableId, dropType });
    }

    disconnect() {
        this.socket?.disconnect();
        this.socket = null;
    }
}

export const socketService = new SocketService();
