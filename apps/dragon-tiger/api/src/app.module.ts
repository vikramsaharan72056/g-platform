import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { DragonTigerService } from './modules/game/dragon-tiger.service.js';
import { DragonTigerEngine } from './modules/game/dragon-tiger.engine.js';
import { HubClient } from './core/hub-client.js';

@Module({
    providers: [
        PrismaService,
        DragonTigerService,
        DragonTigerEngine,
        HubClient,
    ],
})
export class AppModule { }
