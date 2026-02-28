import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/useGameStore';
import type { RummyTableView, TableChatMessage } from '../types';

class SocketService {
    private socket: Socket | null = null;
    private apiUrl: string = '';
    private subscribedTables = new Set<string>();

    init(url: string, token: string) {
        this.apiUrl = url;
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io(this.apiUrl, {
            auth: { token },
        });

        this.socket.on('connect', () => {
            console.log('Connected to socket');
            for (const tableId of this.subscribedTables) {
                this.socket?.emit('table:subscribe', { tableId });
            }
        });

        this.socket.on('table:list', (tables) => {
            useGameStore.getState().setTableList(tables);
        });

        this.socket.on('table:state', (state: RummyTableView) => {
            const store = useGameStore.getState();
            store.setCurrentTable(state);
            store.setLoading(false);
        });

        this.socket.on('chat:history', (messages: TableChatMessage[]) => {
            useGameStore.getState().setChatMessages(Array.isArray(messages) ? messages : []);
        });

        this.socket.on('chat:new', (message: TableChatMessage) => {
            if (!message?.id) return;
            useGameStore.getState().appendChatMessage(message);
        });

        this.socket.on('table:error', (err) => {
            const store = useGameStore.getState();
            store.setError(err.message);
            store.setLoading(false);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from socket');
            useGameStore.getState().setLoading(false);
        });
    }

    subscribeTable(tableId: string) {
        this.subscribedTables.add(tableId);
        this.socket?.emit('table:subscribe', { tableId });
    }

    unsubscribeTable(tableId: string) {
        this.subscribedTables.delete(tableId);
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

    sendChat(tableId: string, message: string) {
        this.socket?.emit('chat:send', { tableId, message });
    }

    disconnect() {
        this.subscribedTables.clear();
        this.socket?.disconnect();
        this.socket = null;
        useGameStore.getState().clearChatMessages();
    }
}

export const socketService = new SocketService();
