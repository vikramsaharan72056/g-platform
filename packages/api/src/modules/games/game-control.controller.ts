import {
    Controller,
    Get,
    Post,
    Delete,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
    Ip,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GameControlService } from './game-control.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('admin')
@Controller('admin/games')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GameControlController {
    constructor(private readonly gameControlService: GameControlService) { }

    // ======================== DASHBOARD ========================

    @Get('dashboard')
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Get dashboard stats' })
    async getDashboardStats() {
        return this.gameControlService.getDashboardStats();
    }

    @Get('revenue-chart')
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Get revenue chart data' })
    @ApiQuery({ name: 'days', required: false })
    async getRevenueChart(@Query('days') days?: number) {
        return this.gameControlService.getRevenueChart(days || 30);
    }

    @Get(':gameId/analytics')
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Get per-game analytics' })
    @ApiQuery({ name: 'days', required: false })
    async getGameAnalytics(
        @Param('gameId') gameId: string,
        @Query('days') days?: number,
    ) {
        return this.gameControlService.getGameAnalytics(gameId, days || 7);
    }

    // ======================== GAME CONFIG ========================

    @Patch(':gameId/config')
    @Roles('SUPER_ADMIN')
    @ApiOperation({ summary: '[Super Admin] Update game configuration' })
    async updateConfig(
        @Param('gameId') gameId: string,
        @Body() config: any,
        @CurrentUser('userId') adminId: string,
        @Ip() ip: string,
    ) {
        return this.gameControlService.updateGameConfig(gameId, config, adminId, ip);
    }

    // ======================== GAME CONTROLS ========================

    @Get('controls')
    @Roles('SUPER_ADMIN')
    @ApiOperation({ summary: '[Super Admin] List active game controls' })
    @ApiQuery({ name: 'gameId', required: false })
    async getControls(@Query('gameId') gameId?: string) {
        return this.gameControlService.getActiveControls(gameId);
    }

    @Post('controls/force-result')
    @Roles('SUPER_ADMIN')
    @ApiOperation({ summary: '[Super Admin] Force next round result' })
    async forceResult(
        @Body() body: { gameId: string; winner?: string; forceCards?: any; reason: string },
        @CurrentUser('userId') adminId: string,
        @Ip() ip: string,
    ) {
        return this.gameControlService.forceResult(body.gameId, body, adminId, ip);
    }

    @Post('controls/win-rate')
    @Roles('SUPER_ADMIN')
    @ApiOperation({ summary: '[Super Admin] Set win rate control' })
    async setWinRate(
        @Body()
        body: {
            gameId: string;
            maxCrashPoint?: number;
            targetHouseEdge?: number;
            lowCrashProbability?: number;
            mediumCrashProbability?: number;
            highCrashProbability?: number;
            reason: string;
            expiresAt?: string;
        },
        @CurrentUser('userId') adminId: string,
        @Ip() ip: string,
    ) {
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
        return this.gameControlService.setWinRate(
            body.gameId,
            body,
            adminId,
            expiresAt,
            ip,
        );
    }

    @Post('controls/player-limit')
    @Roles('SUPER_ADMIN')
    @ApiOperation({ summary: '[Super Admin] Set player-specific limits' })
    async setPlayerLimit(
        @Body()
        body: {
            targetUserId: string;
            maxWinPerRound?: number;
            maxWinPerDay?: number;
            maxWinPerWeek?: number;
            gameIds?: string[];
            reason: string;
            expiresAt?: string;
        },
        @CurrentUser('userId') adminId: string,
        @Ip() ip: string,
    ) {
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
        return this.gameControlService.setPlayerLimit(body, adminId, expiresAt, ip);
    }

    @Delete('controls/:id')
    @Roles('SUPER_ADMIN')
    @ApiOperation({ summary: '[Super Admin] Remove a game control' })
    async removeControl(
        @Param('id') id: string,
        @CurrentUser('userId') adminId: string,
        @Ip() ip: string,
    ) {
        return this.gameControlService.removeControl(id, adminId, ip);
    }
}
