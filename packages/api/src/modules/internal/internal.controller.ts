import {
    Controller,
    Post,
    Body,
    UseGuards,
    Headers,
    UnauthorizedException,
} from '@nestjs/common';
import { WalletService } from '../wallet/wallet.service';
import { AuthService } from '../auth/auth.service';
import { InternalWalletOperationDto, InternalTokenVerifyDto } from './dto/internal-ops.dto';
import { TransactionType } from '@prisma/client';
import { ServiceRegistryService } from '../service-registry/service-registry.service';
import { SignatureGuard } from './guards/signature.guard';

@Controller('internal')
@UseGuards(SignatureGuard)
export class InternalController {
    constructor(
        private readonly walletService: WalletService,
        private readonly authService: AuthService,
        private readonly serviceRegistry: ServiceRegistryService,
    ) { }

    private validateInternalKey(key: string) {
        // In a real scenario, we would check this against the internalKey stored in GameService table
        // or a global config. For now, we'll use a simple env check or static key.
        const masterKey = process.env.INTERNAL_API_KEY || 'g-platform-secret-internal-key';
        if (key !== masterKey) {
            throw new UnauthorizedException('Invalid internal service key');
        }
    }

    @Post('verify-token')
    async verifyToken(
        @Headers('x-internal-key') key: string,
        @Body() dto: InternalTokenVerifyDto
    ) {
        this.validateInternalKey(key);
        // Using authService to validate. In some Nest implementations, 
        // JWT validation is in a strategy, but here we call the service directly.
        try {
            // This is a simplified validation. Depending on authService implementation,
            // we might need to call a specific verify method.
            const user = await this.authService.validateUser(dto.token);
            return user;
        } catch (e) {
            throw new UnauthorizedException('Player authentication failed');
        }
    }

    @Post('wallet/debit')
    async debitWallet(
        @Headers('x-internal-key') key: string,
        @Body() dto: InternalWalletOperationDto
    ) {
        this.validateInternalKey(key);
        return this.walletService.debitBalance(
            dto.userId,
            dto.amount,
            TransactionType.BET_PLACED,
            dto.description || 'Bet placed in game',
            { gameRoundId: dto.gameRoundId }
        );
    }

    @Post('wallet/credit')
    async creditWallet(
        @Headers('x-internal-key') key: string,
        @Body() dto: InternalWalletOperationDto
    ) {
        this.validateInternalKey(key);
        return this.walletService.creditBalance(
            dto.userId,
            dto.amount,
            TransactionType.BET_WON,
            dto.description || 'Winning payout from game',
            { gameRoundId: dto.gameRoundId }
        );
    }

    @Post('register-service')
    async registerService(
        @Headers('x-internal-key') key: string,
        @Body() body: { slug: string; serviceUrl: string; wsUrl?: string; isGlobal?: boolean }
    ) {
        this.validateInternalKey(key);
        return this.serviceRegistry.registerBySlug(body.slug, {
            serviceUrl: body.serviceUrl,
            wsUrl: body.wsUrl,
            isGlobal: body.isGlobal,
            internalKey: key,
        });
    }
}
