import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { DepositModule } from './modules/deposit/deposit.module';
import { WithdrawalModule } from './modules/withdrawal/withdrawal.module';
import { GameModule } from './modules/games/game.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationModule } from './modules/notification/notification.module';
import { RedisModule } from './redis/redis.module';
import { ServiceRegistryModule } from './modules/service-registry/service-registry.module';
import { InternalModule } from './modules/internal/internal.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,   // 1 minute window
      limit: 60,    // 60 requests per minute
    }]),
    RedisModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    WalletModule,
    DepositModule,
    WithdrawalModule,
    GameModule,
    AuditModule,
    NotificationModule,
    ServiceRegistryModule,
    InternalModule,
  ],
  controllers: [AppController],
})
export class AppModule { }
