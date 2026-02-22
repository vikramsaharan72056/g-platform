import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { SevenUpDownEngine } from './engines/seven-up-down.engine';
import { GameScheduler } from './game.scheduler';

@Module({
    imports: [WalletModule],
    controllers: [GameController],
    providers: [
        GameService,
        GameGateway,
        SevenUpDownEngine,
        GameScheduler,
    ],
    exports: [GameService],
})
export class GameModule { }
