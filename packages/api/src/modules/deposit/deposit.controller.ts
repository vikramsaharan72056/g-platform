import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { DepositService } from './deposit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreatePaymentQrDto } from './dto/create-payment-qr.dto';

@ApiTags('deposits')
@Controller('deposits')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DepositController {
    constructor(private readonly depositService: DepositService) { }

    // =============== PLAYER ENDPOINTS ===============

    @Get('qr-codes')
    @ApiOperation({ summary: 'Get active payment QR codes for deposit' })
    async getQrCodes() {
        return this.depositService.getActiveQrCodes();
    }

    @Post('request')
    @ApiOperation({ summary: 'Submit a deposit request' })
    async createDeposit(
        @CurrentUser('userId') userId: string,
        @Body() dto: CreateDepositDto,
    ) {
        return this.depositService.createDepositRequest(userId, dto);
    }

    @Get('history')
    @ApiOperation({ summary: 'Get deposit history' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async getHistory(
        @CurrentUser('userId') userId: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.depositService.getUserDepositHistory(userId, page, limit);
    }

    // =============== ADMIN ENDPOINTS ===============

    @Get('admin/queue')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Get deposit queue' })
    @ApiQuery({ name: 'status', required: false })
    async getQueue(
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('status') status?: string,
    ) {
        return this.depositService.getDepositQueue(page, limit, status);
    }

    @Post('admin/:id/approve')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Approve deposit request' })
    async approve(
        @Param('id') id: string,
        @CurrentUser('userId') adminId: string,
        @Body('remarks') remarks?: string,
    ) {
        return this.depositService.approveDeposit(id, adminId, remarks);
    }

    @Post('admin/:id/reject')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Reject deposit request' })
    async reject(
        @Param('id') id: string,
        @CurrentUser('userId') adminId: string,
        @Body('remarks') remarks: string,
    ) {
        return this.depositService.rejectDeposit(id, adminId, remarks);
    }

    // =============== PAYMENT QR MANAGEMENT ===============

    @Post('admin/qr')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Create payment QR code' })
    async createQr(
        @Body() dto: CreatePaymentQrDto,
        @CurrentUser('userId') adminId: string,
    ) {
        return this.depositService.createPaymentQr(dto, adminId);
    }

    @Get('admin/qr')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Get all payment QR codes' })
    async getQrs() {
        return this.depositService.getPaymentQrs();
    }

    @Patch('admin/qr/:id/toggle')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Enable/disable payment QR' })
    async toggleQr(
        @Param('id') id: string,
        @Body('isActive') isActive: boolean,
    ) {
        return this.depositService.togglePaymentQr(id, isActive);
    }
}
