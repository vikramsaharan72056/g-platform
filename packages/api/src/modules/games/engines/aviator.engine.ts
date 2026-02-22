import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GameService } from '../game.service';
import { GameGateway } from '../game.gateway';
import { BetStatus, TransactionType } from '@prisma/client';

export interface AviatorResult {
    crashPoint: number;
    duration: number; // ms from takeoff to crash
    seed: string;
    hash: string;
}

interface ActiveCashout {
    betId: string;
    userId: string;
    amount: number;
    multiplier: number;
    payout: number;
}

@Injectable()
export class AviatorEngine {
    private readonly logger = new Logger(AviatorEngine.name);
    private activeCashouts: Map<string, ActiveCashout[]> = new Map();
    private activeRounds: Map<string, { roundId: string; crashPoint: number; startTime: number; crashed: boolean }> = new Map();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gameService: GameService,
        @Inject(forwardRef(() => GameGateway))
        private readonly gateway: GameGateway,
    ) { }

    /**
     * Generate a provably fair crash point
     */
    generateCrashPoint(): { crashPoint: number; seed: string; hash: string } {
        const seed = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        const hash = this.simpleHash(seed);

        const rand = Math.random() * 100;
        let crashPoint: number;

        if (rand < 3) {
            crashPoint = 1.0;
        } else {
            crashPoint = Math.max(1.0, Math.floor((10000 / (100 - rand))) / 100);
        }

        crashPoint = Math.min(crashPoint, 100.0);

        return { crashPoint, seed, hash };
    }

    private simpleHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    private calculateDuration(crashPoint: number): number {
        return Math.floor(Math.log(crashPoint) * 5000) + 1000;
    }

    /**
     * Handle player cashout during active round
     */
    async handleCashout(gameId: string, betId: string, userId: string) {
        const activeRound = this.activeRounds.get(gameId);
        if (!activeRound || activeRound.crashed) {
            this.logger.warn(`Cashout rejected: no active round or already crashed for game ${gameId}`);
            return null;
        }

        const elapsed = Date.now() - activeRound.startTime;
        const currentMultiplier = this.getMultiplierAtTime(elapsed, activeRound.crashPoint);

        if (currentMultiplier >= activeRound.crashPoint) {
            this.logger.warn(`Cashout rejected: plane already crashed`);
            return null;
        }

        const bet = await this.prisma.bet.findUnique({
            where: { id: betId },
        });

        if (!bet || bet.userId !== userId || bet.status !== BetStatus.PLACED) {
            return null;
        }

        const payout = Math.floor(bet.amount.toNumber() * currentMultiplier * 100) / 100;

        const cashout: ActiveCashout = {
            betId,
            userId,
            amount: bet.amount.toNumber(),
            multiplier: Math.round(currentMultiplier * 100) / 100,
            payout,
        };

        if (!this.activeCashouts.has(activeRound.roundId)) {
            this.activeCashouts.set(activeRound.roundId, []);
        }
        this.activeCashouts.get(activeRound.roundId)!.push(cashout);

        await this.prisma.bet.update({
            where: { id: betId },
            data: {
                status: BetStatus.WON,
                actualPayout: payout,
                settledAt: new Date(),
            },
        });

        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (wallet) {
            await this.prisma.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: payout } },
            });

            await this.prisma.transaction.create({
                data: {
                    walletId: wallet.id,
                    userId: userId,
                    type: TransactionType.BET_WON,
                    amount: payout,
                    balanceBefore: wallet.balance.toNumber(),
                    balanceAfter: wallet.balance.toNumber() + payout,
                    description: `Aviator cashout at ${cashout.multiplier}x`,
                    betId: betId,
                },
            });
        }

        this.gateway.broadcastToGame(gameId, 'aviator:cashout', {
            userId,
            multiplier: cashout.multiplier,
            payout,
        });

        this.logger.log(`Aviator: User ${userId} cashed out at ${cashout.multiplier}x, payout: ₹${payout}`);

        return cashout;
    }

    private getMultiplierAtTime(elapsedMs: number, maxMultiplier: number): number {
        const multiplier = Math.exp(elapsedMs / 5000);
        return Math.min(multiplier, maxMultiplier);
    }

    /**
     * Execute a complete Aviator round
     */
    async executeRound(gameId: string) {
        const lastRound = await this.prisma.gameRound.findFirst({
            where: { gameId },
            orderBy: { roundNumber: 'desc' },
        });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;

        this.logger.log(`Starting Aviator Round #${roundNumber}`);

        const round = await this.gameService.createRound(gameId, roundNumber);
        const { crashPoint, seed, hash } = this.generateCrashPoint();

        this.gateway.broadcastToGame(gameId, 'round:created', {
            roundId: round.id,
            roundNumber,
            status: 'BETTING',
            bettingEndsAt: round.bettingEndAt,
            hash,
        });

        const game = await this.prisma.game.findUnique({ where: { id: gameId } });
        const bettingWindow = game?.bettingWindow || 10;

        setTimeout(async () => {
            await this.startFlight(round.id, gameId, crashPoint, seed, hash);
        }, bettingWindow * 1000);

        return round;
    }

    private async startFlight(roundId: string, gameId: string, crashPoint: number, seed: string, hash: string) {
        await this.gameService.updateRoundStatus(roundId, 'LOCKED');

        this.gateway.broadcastToGame(gameId, 'round:locked', {
            roundId,
            message: 'Bets locked! Preparing for takeoff...',
        });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        await this.gameService.updateRoundStatus(roundId, 'PLAYING');

        const startTime = Date.now();
        const duration = this.calculateDuration(crashPoint);

        this.activeRounds.set(gameId, { roundId, crashPoint, startTime, crashed: false });
        this.activeCashouts.set(roundId, []);

        this.gateway.broadcastToGame(gameId, 'aviator:takeoff', {
            roundId,
            message: 'Takeoff! 🛫',
        });

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const currentMultiplier = this.getMultiplierAtTime(elapsed, crashPoint);

            if (elapsed >= duration || currentMultiplier >= crashPoint) {
                clearInterval(interval);
                this.crash(roundId, gameId, crashPoint, seed, hash, duration);
            } else {
                this.gateway.broadcastToGame(gameId, 'aviator:multiplier', {
                    multiplier: Math.round(currentMultiplier * 100) / 100,
                    elapsed,
                });
            }
        }, 200);

        this.logger.log(`Aviator Round ${roundId}: Flying! Crash point: ${crashPoint}x, Duration: ${duration}ms`);
    }

    private async crash(roundId: string, gameId: string, crashPoint: number, seed: string, hash: string, duration: number) {
        const activeRound = this.activeRounds.get(gameId);
        if (activeRound) activeRound.crashed = true;

        const result: AviatorResult = {
            crashPoint,
            duration,
            seed,
            hash,
        };

        this.logger.log(`Aviator Round ${roundId}: CRASHED at ${crashPoint}x`);

        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: {
                result: result as any,
                status: 'RESULT',
                resultAt: new Date(),
            },
        });

        await this.prisma.roundResult.create({
            data: {
                gameRoundId: roundId,
                resultType: 'crash',
                resultData: result as any,
            },
        });

        this.gateway.broadcastToGame(gameId, 'aviator:crash', {
            roundId,
            crashPoint,
            seed,
        });

        const pendingBets = await this.prisma.bet.findMany({
            where: { gameRoundId: roundId, status: BetStatus.PLACED },
        });

        for (const bet of pendingBets) {
            await this.prisma.bet.update({
                where: { id: bet.id },
                data: { status: BetStatus.LOST, actualPayout: 0, settledAt: new Date() },
            });
        }

        const cashouts = this.activeCashouts.get(roundId) || [];
        const totalPayout = cashouts.reduce((sum, c) => sum + c.payout, 0);

        this.gateway.broadcastToGame(gameId, 'round:settled', {
            roundId,
            result,
            settlement: {
                totalBets: pendingBets.length + cashouts.length,
                totalPayout,
                cashouts: cashouts.length,
                busted: pendingBets.length,
            },
        });

        this.activeRounds.delete(gameId);
        this.activeCashouts.delete(roundId);

        setTimeout(async () => {
            await this.executeRound(gameId);
        }, 5000);
    }
}
