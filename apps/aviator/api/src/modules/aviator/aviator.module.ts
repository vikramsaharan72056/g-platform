import { Module } from '@nestjs/common';
import { AviatorService } from './aviator.service.js';
import { AviatorGateway } from './aviator.gateway.js';
import { AviatorEngine } from './engine/aviator.engine.js';
import { HubClient } from '../../core/hub-client.js';

@Module({
    providers: [AviatorService, AviatorGateway, AviatorEngine, HubClient],
    exports: [AviatorService],
})
export class AviatorModule { }
