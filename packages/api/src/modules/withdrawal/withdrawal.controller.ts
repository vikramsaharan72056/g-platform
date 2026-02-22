import {
    Controller,
    Get,
    Post,
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
import { WithdrawalService } from './withdrawal.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@ApiTags('withdrawals')
@Controller('withdrawals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WithdrawalController {
    constructor(private readonly withdrawalService: WithdrawalService) { }

    // =============== PLAYER ENDPOINTS ===============

    @Post('request')
    @ApiOperation({ summary: 'Submit withdrawal request' })
    async createWithdrawal(
        @CurrentUser('userId') userId: string,
        @Body() dto: CreateWithdrawalDto,
    ) {
        return this.withdrawalService.createWithdrawalRequest(userId, dto);
    }

    @Get('history')
    @ApiOperation({ summary: 'Get withdrawal history' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async getHistory(
        @CurrentUser('userId') userId: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.withdrawalService.getUserWithdrawalHistory(userId, page, limit);
    }

    // =============== ADMIN ENDPOINTS ===============

    @Get('admin/queue')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Get withdrawal queue' })
    @ApiQuery({ name: 'status', required: false })
    async getQueue(
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('status') status?: string,
    ) {
        return this.withdrawalService.getWithdrawalQueue(page, limit, status);
    }

    @Post('admin/:id/approve')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Approve withdrawal' })
    async approve(
        @Param('id') id: string,
        @CurrentUser('userId') adminId: string,
        @Body('paymentRef') paymentRef?: string,
        @Body('remarks') remarks?: string,
    ) {
        return this.withdrawalService.approveWithdrawal(
            id,
            adminId,
            paymentRef,
            remarks,
        );
    }

    @Post('admin/:id/reject')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Reject withdrawal (refunds wallet)' })
    async reject(
        @Param('id') id: string,
        @CurrentUser('userId') adminId: string,
        @Body('remarks') remarks: string,
    ) {
        return this.withdrawalService.rejectWithdrawal(id, adminId, remarks);
    }
}
