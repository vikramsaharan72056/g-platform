import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { HubClient } from '../../core/hub-client.js';
import { LudoService } from './ludo.service.js';

@WebSocketGateway({
    cors: { origin: '*' },
    namespace: '/game',
})
export class LudoGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(LudoGateway.name);

    constructor(
        private readonly hub: HubClient,
        private readonly ludoService: LudoService,
    ) { }

    async handleConnection(client: Socket) {
        const token = client.handshake.auth?.token || client.handshake.query?.token;
        if (!token) {
            client.disconnect();
            return;
        }

        try {
            const user = await this.hub.verifyToken(token as string);
            (client as any).user = user;
            this.logger.log(`Client connected: ${user.id}`);
        } catch (e) {
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('join:game')
    handleJoinGame(@ConnectedSocket() client: Socket, @MessageBody() data: { gameId: string }) {
        client.join(`game:${data.gameId}`);
        client.emit('joined', { message: 'Joined Ludo game room' });
    }

    @SubscribeMessage('place:bet')
    async handlePlaceBet(@ConnectedSocket() client: Socket, @MessageBody() data: { roundId: string, betType: string, amount: number }) {
        const user = (client as any).user;
        if (!user) return;

        try {
            const bet = await this.ludoService.placeBet(user.id, data.roundId, data.betType, data.amount);
            client.emit('bet:success', bet);
        } catch (e) {
            client.emit('bet:failed', { message: e.message });
        }
    }

    broadcast(event: string, data: any) {
        this.server.emit(event, data);
    }
}
