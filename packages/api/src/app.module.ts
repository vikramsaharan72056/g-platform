import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { DepositModule } from './modules/deposit/deposit.module';
import { WithdrawalModule } from './modules/withdrawal/withdrawal.module';
import { GameModule } from './modules/games/game.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    WalletModule,
    DepositModule,
    WithdrawalModule,
    GameModule,
  ],
  controllers: [AppController],
})
export class AppModule { }
