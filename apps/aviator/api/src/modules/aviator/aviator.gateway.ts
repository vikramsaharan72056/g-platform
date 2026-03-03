import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AviatorService, GameState } from './aviator.service.js';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: { origin: '*' },
    namespace: 'aviator',
})
export class AviatorGateway implements OnGatewayInit, OnGatewayConnection {
    private readonly logger = new Logger(AviatorGateway.name);

    @WebSocketServer()
    server: Server;

    constructor(private readonly aviatorService: AviatorService) { }

    afterInit() {
        this.aviatorService.state$.subscribe((state) => {
            this.broadcastState(state);
        });
    }

    handleConnection(client: Socket) {
        const currentState = this.aviatorService.getCurrentState();
        if (currentState) {
            client.emit('state', currentState);
        }
    }

    private broadcastState(state: GameState) {
        this.server.emit('state', state);
    }

    @SubscribeMessage('placeBet')
    async handlePlaceBet(client: Socket, payload: { userId: string; amount: number; roundId: string; autoCashout?: number }) {
        try {
            const bet = await this.aviatorService.placeBet(payload.userId, payload.amount, payload.roundId, payload.autoCashout);
            client.emit('betPlaced', bet);
            // Broadcast to room that a new player joined (optional)
        } catch (err: any) {
            client.emit('error', { message: err.message });
        }
    }

    @SubscribeMessage('cashout')
    async handleCashout(client: Socket, payload: { betId: string; userId: string; multiplier: number }) {
        try {
            const result = await this.aviatorService.cashout(payload.betId, payload.userId, payload.multiplier);
            client.emit('cashoutSuccess', result);
        } catch (err: any) {
            client.emit('error', { message: err.message });
        }
    }
}
