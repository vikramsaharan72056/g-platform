import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SevenUpDownService } from './seven-up-down.service.js';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: { origin: '*' },
    namespace: 'seven-up-down',
})
export class SevenUpDownGateway implements OnGatewayInit, OnGatewayConnection {
    private readonly logger = new Logger(SevenUpDownGateway.name);

    @WebSocketServer()
    server: Server;

    constructor(private readonly gameService: SevenUpDownService) { }

    afterInit() {
        this.gameService.state$.subscribe((state) => {
            this.server.emit('state', state);
        });
    }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    @SubscribeMessage('placeBet')
    async handlePlaceBet(client: Socket, payload: { userId: string; amount: number; roundId: string; betType: string }) {
        try {
            const bet = await this.gameService.placeBet(payload.userId, payload.amount, payload.roundId, payload.betType);
            client.emit('betPlaced', bet);
        } catch (err: any) {
            client.emit('error', { message: err.message });
        }
    }
}
