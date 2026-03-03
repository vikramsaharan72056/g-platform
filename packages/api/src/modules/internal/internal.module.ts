import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { InternalController } from './internal.controller';
import { ServiceRegistryModule } from '../service-registry/service-registry.module';

@Module({
    imports: [WalletModule, AuthModule, ServiceRegistryModule],
    controllers: [InternalController],
})
export class InternalModule { }
