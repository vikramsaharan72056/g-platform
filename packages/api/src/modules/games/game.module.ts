import { Module, forwardRef } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { AuditModule } from '../audit/audit.module';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { GameControlService } from './game-control.service';
import { GameControlController } from './game-control.controller';
import { SevenUpDownEngine } from './engines/seven-up-down.engine';
import { DragonTigerEngine } from './engines/dragon-tiger.engine';
import { TeenPattiEngine } from './engines/teen-patti.engine';
import { AviatorEngine } from './engines/aviator.engine';
import { PokerEngine } from './engines/poker.engine';
import { RummyEngine } from './engines/rummy.engine';
import { GameScheduler } from './game.scheduler';

@Module({
    imports: [WalletModule, AuditModule],
    controllers: [GameController, GameControlController],
    providers: [
        GameService,
        GameGateway,
        GameControlService,
        SevenUpDownEngine,
        DragonTigerEngine,
        TeenPattiEngine,
        AviatorEngine,
        PokerEngine,
        RummyEngine,
        GameScheduler,
    ],
    exports: [GameService, GameControlService],
})
export class GameModule { }
