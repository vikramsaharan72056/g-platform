import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GameGateway } from '../game.gateway';

/**
 * Round lifecycle: WAITING → BETTING → LOCKED → PLAYING → RESULT → SETTLED
 */
export interface RoundLifecycle {
    executeRound(gameId: string): Promise<any>;
}

export interface GameResult {
    resultType: string;
    resultData: any;
    winningBetTypes: string[];
}

/**
 * Abstract Base Game Engine
 *
 * All games must extend this class and implement:
 *  - generateResult(): produces game-specific random outcome
 *  - getWinningBetTypes(result): determines which bet types won
 *  - getGameSlug(): returns the game slug
 *
 * The base class provides:
 *  - Common round lifecycle (create → betting → lock → play → settle)
 *  - WebSocket event broadcasting
 *  - Logging
 */
@Injectable()
export abstract class BaseGameEngine implements RoundLifecycle {
    protected readonly logger: Logger;

    constructor(
        protected readonly prisma: PrismaService,
        protected readonly gateway: GameGateway,
    ) {
        this.logger = new Logger(this.constructor.name);
    }

    /**
     * Game slug identifier (e.g. 'seven-up-down', 'teen-patti')
     */
    abstract getGameSlug(): string;

    /**
     * Generate the random result for this game
     */
    abstract generateResult(): GameResult;

    /**
     * Get payout odds for a specific bet type in this game
     */
    abstract getOdds(betType: string): number;

    /**
     * Execute a complete game round with the standard lifecycle:
     * WAITING → BETTING → LOCKED → PLAYING → RESULT → SETTLED
     */
    async executeRound(gameId: string): Promise<any> {
        const lastRound = await this.prisma.gameRound.findFirst({
            where: { gameId },
            orderBy: { roundNumber: 'desc' },
        });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;

        this.logger.log(`Starting ${this.getGameSlug()} Round #${roundNumber}`);

        // Get game config for timing
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
        });

        if (!game || !game.isActive || game.isMaintenanceMode) {
            this.logger.warn(`Game ${gameId} is not active or in maintenance. Skipping round.`);
            return null;
        }

        const bettingWindow = game.bettingWindow || 30;
        const now = new Date();
        const bettingEndAt = new Date(now.getTime() + bettingWindow * 1000);

        // Create round (BETTING phase)
        const round = await this.prisma.gameRound.create({
            data: {
                gameId,
                roundNumber,
                status: 'BETTING',
                bettingStartAt: now,
                bettingEndAt,
            },
        });

        // Broadcast round created
        this.gateway.broadcastToGame(gameId, 'round:created', {
            roundId: round.id,
            roundNumber,
            status: 'BETTING',
            bettingEndsAt: bettingEndAt,
        });

        // Schedule: Lock bets after betting window
        setTimeout(async () => {
            await this.lockAndPlay(round.id, gameId);
        }, bettingWindow * 1000);

        return round;
    }

    /**
     * Lock bets and transition to playing phase
     */
    protected async lockAndPlay(roundId: string, gameId: string): Promise<void> {
        // LOCKED phase
        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: { status: 'LOCKED' },
        });

        this.gateway.broadcastToGame(gameId, 'round:locked', {
            roundId,
            message: 'Bets are locked!',
        });

        this.logger.log(`Round ${roundId}: Bets locked, starting play phase`);

        // Wait for animation/suspense, then resolve
        setTimeout(async () => {
            await this.resolveRound(roundId, gameId);
        }, 3000);
    }

    /**
     * Resolve round: generate result, save, broadcast, settle bets
     */
    protected async resolveRound(roundId: string, gameId: string): Promise<void> {
        // PLAYING phase
        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: { status: 'PLAYING' },
        });

        // Generate result
        const result = this.generateResult();

        this.logger.log(
            `Round ${roundId}: Result generated — ${JSON.stringify(result.resultData)}`,
        );

        // RESULT phase — save result
        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: {
                result: result.resultData,
                status: 'RESULT',
                resultAt: new Date(),
            },
        });

        // Save detailed round result
        await this.prisma.roundResult.create({
            data: {
                gameRoundId: roundId,
                resultType: result.resultType,
                resultData: result.resultData,
            },
        });

        // Broadcast result
        this.gateway.broadcastToGame(gameId, 'round:result', {
            roundId,
            result: result.resultData,
        });

        // SETTLED phase — settle bets
        const settlement = await this.settleBets(roundId, result.winningBetTypes);

        // Update round with settlement stats
        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: {
                status: 'SETTLED',
                settledAt: new Date(),
                totalBets: settlement.totalBets,
                totalBetAmount: settlement.totalBetAmount,
                totalPayout: settlement.totalPayout,
                housePnl: settlement.totalBetAmount - settlement.totalPayout,
            },
        });

        // Broadcast settlement
        this.gateway.broadcastToGame(gameId, 'round:settled', {
            roundId,
            result: result.resultData,
            settlement,
        });

        this.logger.log(
            `Round ${roundId}: Settled — ${settlement.totalBets} bets, payout: ₹${settlement.totalPayout}`,
        );

        // Schedule next round after a brief pause
        setTimeout(async () => {
            await this.executeRound(gameId);
        }, 5000);
    }

    /**
     * Settle all bets for a round based on winning bet types
     */
    protected async settleBets(
        roundId: string,
        winningBetTypes: string[],
    ): Promise<{
        totalBets: number;
        totalBetAmount: number;
        totalPayout: number;
        winners: number;
        losers: number;
    }> {
        const bets = await this.prisma.bet.findMany({
            where: { gameRoundId: roundId, status: 'PLACED' },
        });

        let totalPayout = 0;
        let winners = 0;
        let losers = 0;
        let totalBetAmount = 0;

        for (const bet of bets) {
            const betAmount = Number(bet.amount);
            totalBetAmount += betAmount;

            if (winningBetTypes.includes(bet.betType)) {
                // Winner
                const odds = this.getOdds(bet.betType);
                const payout = betAmount * odds;
                totalPayout += payout;
                winners++;

                await this.prisma.bet.update({
                    where: { id: bet.id },
                    data: {
                        status: 'WON',
                        actualPayout: payout,
                        settledAt: new Date(),
                    },
                });

                // Credit the user's wallet (using raw query for simplicity in base class)
                const wallet = await this.prisma.wallet.findUnique({
                    where: { userId: bet.userId },
                });
                if (wallet) {
                    await this.prisma.wallet.update({
                        where: { userId: bet.userId },
                        data: {
                            balance: { increment: payout },
                            totalWon: { increment: payout },
                            version: { increment: 1 },
                        },
                    });
                    await this.prisma.transaction.create({
                        data: {
                            userId: bet.userId,
                            walletId: wallet.id,
                            type: 'BET_WON',
                            amount: payout,
                            balanceBefore: Number(wallet.balance),
                            balanceAfter: Number(wallet.balance) + payout,
                            status: 'COMPLETED',
                            description: `Won bet on round`,
                            betId: bet.id,
                            gameRoundId: roundId,
                        },
                    });
                }
            } else {
                // Loser
                losers++;
                await this.prisma.bet.update({
                    where: { id: bet.id },
                    data: {
                        status: 'LOST',
                        actualPayout: 0,
                        settledAt: new Date(),
                    },
                });
            }
        }

        return {
            totalBets: bets.length,
            totalBetAmount,
            totalPayout,
            winners,
            losers,
        };
    }
}
