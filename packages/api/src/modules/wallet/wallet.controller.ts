import {
    Controller,
    Get,
    Post,
    Body,
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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransactionType } from '@prisma/client';
import { AdminWalletOperationDto } from './dto/admin-wallet-operation.dto';

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

    // ===================== ADMIN ENDPOINTS =====================

    @Post('admin/credit')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiTags('admin')
    @ApiOperation({ summary: 'Admin: Credit user wallet' })
    @ApiResponse({ status: 201, description: 'Wallet credited successfully' })
    async adminCredit(
        @Body() dto: AdminWalletOperationDto,
        @CurrentUser('userId') adminId: string,
    ) {
        return this.walletService.creditBalance(
            dto.userId,
            dto.amount,
            TransactionType.ADMIN_CREDIT,
            `Admin credit: ${dto.reason}`,
            { processedBy: adminId },
        );
    }

    @Post('admin/debit')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiTags('admin')
    @ApiOperation({ summary: 'Admin: Debit user wallet' })
    @ApiResponse({ status: 201, description: 'Wallet debited successfully' })
    async adminDebit(
        @Body() dto: AdminWalletOperationDto,
        @CurrentUser('userId') adminId: string,
    ) {
        return this.walletService.debitBalance(
            dto.userId,
            dto.amount,
            TransactionType.ADMIN_DEBIT,
            `Admin debit: ${dto.reason}`,
            { processedBy: adminId },
        );
    }
}

