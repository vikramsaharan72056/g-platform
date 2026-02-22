import { Module } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
    imports: [WalletModule],
    controllers: [DepositController],
    providers: [DepositService],
    exports: [DepositService],
})
export class DepositModule { }
