import { Module, OnModuleInit } from '@nestjs/common';
import { LudoService } from './ludo.service.js';
import { LudoGateway } from './ludo.gateway.js';
import { LudoEngine } from './ludo.engine.js';
import { HubClient } from '../../core/hub-client.js';

@Module({
    providers: [LudoService, LudoGateway, LudoEngine, HubClient],
    exports: [LudoService],
})
export class LudoModule implements OnModuleInit {
    constructor(private readonly engine: LudoEngine) { }

    onModuleInit() {
        // Start the game loop
        this.engine.startRoundLoop();
    }
}
