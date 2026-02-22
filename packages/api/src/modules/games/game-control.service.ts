import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AdminControlType } from '@prisma/client';

@Injectable()
export class GameControlService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditLogService: AuditLogService,
    ) { }

    // ======================== FORCE RESULT ========================

    async forceResult(
        gameId: string,
        config: {
            targetRound?: string;
            winner?: string;
            forceCards?: any;
            reason: string;
        },
        adminId: string,
        ip?: string,
    ) {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
        });
        if (!game) throw new NotFoundException('Game not found');

        const control = await this.prisma.gameAdminControl.create({
            data: {
                gameId,
                controlType: AdminControlType.FORCE_RESULT,
                config: {
                    targetRound: config.targetRound || 'next',
                    winner: config.winner,
                    forceCards: config.forceCards,
                    reason: config.reason,
                },
                isActive: true,
                createdBy: adminId,
            },
        });

        await this.auditLogService.log(
            adminId,
            'game.force_result',
            'game',
            gameId,
            { controlId: control.id, ...config },
            ip,
        );

        return control;
    }

    // ======================== WIN RATE CONTROL ========================

    async setWinRate(
        gameId: string,
        config: {
            maxCrashPoint?: number;
            targetHouseEdge?: number;
            lowCrashProbability?: number;
            mediumCrashProbability?: number;
            highCrashProbability?: number;
            reason: string;
        },
        adminId: string,
        expiresAt?: Date,
        ip?: string,
    ) {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
        });
        if (!game) throw new NotFoundException('Game not found');

        // Deactivate existing win rate controls for this game
        await this.prisma.gameAdminControl.updateMany({
            where: {
                gameId,
                controlType: AdminControlType.WIN_RATE_CONTROL,
                isActive: true,
            },
            data: { isActive: false },
        });

        const control = await this.prisma.gameAdminControl.create({
            data: {
                gameId,
                controlType: AdminControlType.WIN_RATE_CONTROL,
                config,
                isActive: true,
                createdBy: adminId,
                expiresAt,
            },
        });

        await this.auditLogService.log(
            adminId,
            'game.win_rate_control',
            'game',
            gameId,
            { controlId: control.id, ...config },
            ip,
        );

        return control;
    }

    // ======================== PLAYER LIMITS ========================

    async setPlayerLimit(
        config: {
            targetUserId: string;
            maxWinPerRound?: number;
            maxWinPerDay?: number;
            maxWinPerWeek?: number;
            gameIds?: string[];
            reason: string;
        },
        adminId: string,
        expiresAt?: Date,
        ip?: string,
    ) {
        const user = await this.prisma.user.findUnique({
            where: { id: config.targetUserId },
        });
        if (!user) throw new NotFoundException('User not found');

        const control = await this.prisma.gameAdminControl.create({
            data: {
                gameId: config.gameIds?.[0] || 'all',
                controlType: AdminControlType.PLAYER_LIMIT,
                config: {
                    targetUserId: config.targetUserId,
                    maxWinPerRound: config.maxWinPerRound,
                    maxWinPerDay: config.maxWinPerDay,
                    maxWinPerWeek: config.maxWinPerWeek,
                    gameIds: config.gameIds || ['all'],
                    reason: config.reason,
                },
                isActive: true,
                createdBy: adminId,
                expiresAt,
            },
        });

        await this.auditLogService.log(
            adminId,
            'game.player_limit',
            'user',
            config.targetUserId,
            { controlId: control.id, ...config },
            ip,
        );

        return control;
    }

    // ======================== QUERIES ========================

    async getActiveControls(gameId?: string) {
        const where: any = { isActive: true };
        if (gameId) where.gameId = gameId;

        // Also check for expired controls and deactivate them
        await this.prisma.gameAdminControl.updateMany({
            where: {
                isActive: true,
                expiresAt: { lt: new Date() },
            },
            data: { isActive: false },
        });

        return this.prisma.gameAdminControl.findMany({
            where,
            include: { game: { select: { name: true, slug: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getControlById(id: string) {
        const control = await this.prisma.gameAdminControl.findUnique({
            where: { id },
            include: { game: { select: { name: true, slug: true } } },
        });
        if (!control) throw new NotFoundException('Control not found');
        return control;
    }

    async removeControl(id: string, adminId: string, ip?: string) {
        const control = await this.prisma.gameAdminControl.findUnique({
            where: { id },
        });
        if (!control) throw new NotFoundException('Control not found');

        await this.prisma.gameAdminControl.update({
            where: { id },
            data: { isActive: false },
        });

        await this.auditLogService.log(
            adminId,
            'game.control_removed',
            'game_admin_control',
            id,
            { controlType: control.controlType, gameId: control.gameId },
            ip,
        );

        return { message: 'Control deactivated' };
    }

    // ======================== GAME CONFIG ========================

    async updateGameConfig(
        gameId: string,
        config: {
            minBet?: number;
            maxBet?: number;
            roundDuration?: number;
            bettingWindow?: number;
            houseEdge?: number;
            isActive?: boolean;
            isMaintenanceMode?: boolean;
        },
        adminId: string,
        ip?: string,
    ) {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
        });
        if (!game) throw new NotFoundException('Game not found');

        const updated = await this.prisma.game.update({
            where: { id: gameId },
            data: {
                ...(config.minBet !== undefined && { minBet: config.minBet }),
                ...(config.maxBet !== undefined && { maxBet: config.maxBet }),
                ...(config.roundDuration !== undefined && { roundDuration: config.roundDuration }),
                ...(config.bettingWindow !== undefined && { bettingWindow: config.bettingWindow }),
                ...(config.houseEdge !== undefined && { houseEdge: config.houseEdge }),
                ...(config.isActive !== undefined && { isActive: config.isActive }),
                ...(config.isMaintenanceMode !== undefined && { isMaintenanceMode: config.isMaintenanceMode }),
            },
        });

        await this.auditLogService.log(
            adminId,
            'game.config_update',
            'game',
            gameId,
            config,
            ip,
        );

        return updated;
    }

    // ======================== ANALYTICS ========================

    async getDashboardStats() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(todayStart);
        monthStart.setMonth(monthStart.getMonth() - 1);

        const [
            totalUsers,
            activeUsers24h,
            pendingDeposits,
            pendingWithdrawals,
            todayBets,
            todayRevenue,
            weeklyRevenue,
            monthlyRevenue,
            gameStats,
        ] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.count({
                where: { lastLoginAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            }),
            this.prisma.depositRequest.count({ where: { status: 'PENDING' } }),
            this.prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
            this.prisma.bet.count({ where: { createdAt: { gte: todayStart } } }),
            this.prisma.gameRound.aggregate({
                where: { createdAt: { gte: todayStart }, status: 'SETTLED' },
                _sum: { housePnl: true, totalBetAmount: true },
            }),
            this.prisma.gameRound.aggregate({
                where: { createdAt: { gte: weekStart }, status: 'SETTLED' },
                _sum: { housePnl: true },
            }),
            this.prisma.gameRound.aggregate({
                where: { createdAt: { gte: monthStart }, status: 'SETTLED' },
                _sum: { housePnl: true },
            }),
            this.prisma.game.findMany({
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    isActive: true,
                    _count: {
                        select: { rounds: { where: { createdAt: { gte: todayStart } } } },
                    },
                },
            }),
        ]);

        return {
            totalUsers,
            activeUsers24h,
            pendingDeposits,
            pendingWithdrawals,
            todayBets,
            todayRevenue: Number(todayRevenue._sum.housePnl || 0),
            todayBetVolume: Number(todayRevenue._sum.totalBetAmount || 0),
            weeklyRevenue: Number(weeklyRevenue._sum.housePnl || 0),
            monthlyRevenue: Number(monthlyRevenue._sum.housePnl || 0),
            gameStats,
        };
    }

    async getRevenueChart(days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const rounds = await this.prisma.gameRound.findMany({
            where: {
                createdAt: { gte: startDate },
                status: 'SETTLED',
            },
            select: {
                createdAt: true,
                housePnl: true,
                totalBetAmount: true,
                game: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        // Group by date
        const dailyData: Record<string, { revenue: number; betVolume: number }> = {};
        for (const round of rounds) {
            const dateKey = round.createdAt.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { revenue: 0, betVolume: 0 };
            }
            dailyData[dateKey].revenue += Number(round.housePnl);
            dailyData[dateKey].betVolume += Number(round.totalBetAmount);
        }

        return Object.entries(dailyData).map(([date, data]) => ({
            date,
            ...data,
        }));
    }

    async getGameAnalytics(gameId: string, days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [roundStats, betStats, topPlayers] = await Promise.all([
            this.prisma.gameRound.aggregate({
                where: { gameId, createdAt: { gte: startDate }, status: 'SETTLED' },
                _count: { id: true },
                _sum: { housePnl: true, totalBetAmount: true, totalPayout: true },
                _avg: { totalBetAmount: true },
            }),
            this.prisma.bet.groupBy({
                by: ['betType'],
                where: {
                    gameRound: { gameId },
                    createdAt: { gte: startDate },
                },
                _count: { id: true },
                _sum: { amount: true },
            }),
            this.prisma.bet.groupBy({
                by: ['userId'],
                where: {
                    gameRound: { gameId },
                    createdAt: { gte: startDate },
                },
                _sum: { amount: true, actualPayout: true },
                _count: { id: true },
                orderBy: { _sum: { amount: 'desc' } },
                take: 10,
            }),
        ]);

        return { roundStats, betStats, topPlayers };
    }
}
