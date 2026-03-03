import { Module } from '@nestjs/common';
import { SevenUpDownService } from './seven-up-down.service.js';
import { SevenUpDownGateway } from './seven-up-down.gateway.js';
import { SevenUpDownEngine } from './seven-up-down.engine.js';

@Module({
    providers: [SevenUpDownService, SevenUpDownGateway, SevenUpDownEngine],
    exports: [SevenUpDownService],
})
export class SevenUpDownModule { }
