import {
    Controller,
    Get,
    UseGuards,
    Query,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransactionType } from '@prisma/client';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    @Get('balance')
    @ApiOperation({ summary: 'Get wallet balance' })
    @ApiResponse({ status: 200, description: 'Wallet balance returned' })
    async getBalance(@CurrentUser('userId') userId: string) {
        return this.walletService.getBalance(userId);
    }

    @Get('transactions')
    @ApiOperation({ summary: 'Get transaction history' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'type', required: false, enum: TransactionType })
    @ApiResponse({ status: 200, description: 'Transaction history returned' })
    async getTransactions(
        @CurrentUser('userId') userId: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('type') type?: TransactionType,
    ) {
        return this.walletService.getTransactions(
            userId,
            page || 1,
            limit || 20,
            type,
        );
    }
}
