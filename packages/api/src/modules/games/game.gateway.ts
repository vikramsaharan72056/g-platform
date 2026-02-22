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
import { Logger } from '@nestjs/common';

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

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('join:game')
    handleJoinGame(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string },
    ) {
        client.join(`game:${data.gameId}`);
        this.logger.log(`Client ${client.id} joined game room: ${data.gameId}`);
        client.emit('joined', { gameId: data.gameId, message: 'Joined game room' });
    }

    @SubscribeMessage('leave:game')
    handleLeaveGame(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: string },
    ) {
        client.leave(`game:${data.gameId}`);
        this.logger.log(`Client ${client.id} left game room: ${data.gameId}`);
    }

    /**
     * Broadcast event to all players in a game room
     */
    broadcastToGame(gameId: string, event: string, data: any) {
        this.server.to(`game:${gameId}`).emit(event, data);
    }

    /**
     * Send event to a specific user
     */
    sendToUser(socketId: string, event: string, data: any) {
        this.server.to(socketId).emit(event, data);
    }
}
