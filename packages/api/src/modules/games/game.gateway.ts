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
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { AviatorEngine } from './engines/aviator.engine';
import { RedisService } from '../../redis/redis.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(GameGateway.name);

    constructor(
        @Inject(forwardRef(() => AviatorEngine))
        private readonly aviatorEngine: AviatorEngine,
        private readonly redis: RedisService,
    ) { }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('join:game')
    async handleJoinGame(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string },
    ) {
        client.join(`game:${data.gameId}`);
        await this.redis.incrementPlayerCount(data.gameId);
        this.logger.log(`Client ${client.id} joined game room: ${data.gameId}`);
        client.emit('joined', { gameId: data.gameId, message: 'Joined game room' });
    }

    @SubscribeMessage('leave:game')
    async handleLeaveGame(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string },
    ) {
        client.leave(`game:${data.gameId}`);
        await this.redis.decrementPlayerCount(data.gameId);
        this.logger.log(`Client ${client.id} left game room: ${data.gameId}`);
    }

    @SubscribeMessage('aviator:cashout')
    async handleAviatorCashout(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string; betId: string; userId: string },
    ) {
        this.logger.log(`Aviator cashout request: user=${data.userId}, bet=${data.betId}`);
        const result = await this.aviatorEngine.handleCashout(data.gameId, data.betId, data.userId);
        if (result) {
            client.emit('aviator:cashout:success', result);
        } else {
            client.emit('aviator:cashout:failed', { message: 'Cashout failed — plane may have already crashed' });
        }
    }

    /**
     * Broadcast event to all players in a game room
     */
    broadcastToGame(gameId: string, event: string, data: any) {
        const payload =
            data && typeof data === 'object' && !Array.isArray(data)
                ? { ...data, gameId }
                : { data, gameId };
        this.server.to(`game:${gameId}`).emit(event, payload);
    }

    /**
     * Send event to a specific user
     */
    sendToUser(socketId: string, event: string, data: any) {
        this.server.to(socketId).emit(event, data);
    }
}

