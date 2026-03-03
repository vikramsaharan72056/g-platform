import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AviatorEngine } from './engine/aviator.engine.js';
import { HubClient } from '../../core/hub-client.js';
import { RoundStatus, BetStatus } from '@prisma/client';
import { Subject } from 'rxjs';

export interface GameState {
    roundId: string;
    roundNumber: number;
    status: RoundStatus;
    multiplier: number;
    elapsedMs: number;
    bettingEndsAt?: Date;
    startTime?: number;
}

@Injectable()
export class AviatorService implements OnModuleInit {
    private readonly logger = new Logger(AviatorService.name);
    private currentState: GameState | null = null;
    public state$ = new Subject<GameState>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly engine: AviatorEngine,
        private readonly hub: HubClient,
    ) { }

    async onModuleInit() {
        this.startLifecycle();
    }

    private async startLifecycle() {
        while (true) {
            try {
                await this.runNewRound();
            } catch (err) {
                this.logger.error('Error in game lifecycle', err);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Sleep 2s
            }
        }
    }

    private async runNewRound() {
        // 1. Prepare betting phase
        const lastRound = await this.prisma.gameRound.findFirst({ orderBy: { roundNumber: 'desc' } });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;
        const serverSeed = this.engine.generateServerSeed();
        const { crashPoint, combinedHash } = this.engine.generateCrashPoint(serverSeed);

        const round = await this.prisma.gameRound.create({
            data: {
                roundNumber,
                crashPoint,
                serverSeed,
                combinedHash,
                status: RoundStatus.BETTING,
                bettingStartAt: new Date(),
                bettingEndAt: new Date(Date.now() + 10000), // 10 sec betting
            },
        });

        this.updateState({
            roundId: round.id,
            roundNumber,
            status: RoundStatus.BETTING,
            multiplier: 1.0,
            elapsedMs: 0,
            bettingEndsAt: round.bettingEndAt!,
        });

        // Wait for betting to end
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // 2. Start Flight phase
        await this.prisma.gameRound.update({
            where: { id: round.id },
            data: { status: RoundStatus.FLYING, flightStartAt: new Date() },
        });

        const flightStartTime = Date.now();
        const duration = this.engine.getTimeToMultiplier(crashPoint);

        this.logger.log(`Round ${roundNumber} Takeoff! Crash at ${crashPoint}x in ${Math.round(duration)}ms`);

        return new Promise<void>((resolve) => {
            const interval = setInterval(async () => {
                const elapsed = Date.now() - flightStartTime;
                const currentMultiplier = this.engine.getMultiplierAtTime(elapsed);

                if (elapsed >= duration || currentMultiplier >= crashPoint) {
                    clearInterval(interval);
                    await this.finishRound(round.id, crashPoint, duration);
                    resolve();
                } else {
                    this.updateState({
                        roundId: round.id,
                        roundNumber,
                        status: RoundStatus.FLYING,
                        multiplier: currentMultiplier,
                        elapsedMs: elapsed,
                        startTime: flightStartTime,
                    });
                    // Check auto-cashouts
                    this.processAutoCashouts(round.id, currentMultiplier);
                }
            }, 100); // 100ms ticks
        });
    }

    private async finishRound(roundId: string, crashPoint: number, duration: number) {
        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: {
                status: RoundStatus.CRASHED,
                crashedAt: new Date(),
                durationMs: Math.round(duration),
            },
        });

        // Mark all remaining bets as LOST
        await this.prisma.bet.updateMany({
            where: { roundId, status: BetStatus.PLACED },
            data: { status: BetStatus.LOST },
        });

        this.updateState({
            ...this.currentState!,
            status: RoundStatus.CRASHED,
            multiplier: crashPoint,
        });

        this.logger.log(`Round ${roundId} CRASHED at ${crashPoint}x`);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 5s cool down
    }

    private updateState(state: GameState) {
        this.currentState = state;
        this.state$.next(state);
    }

    private async processAutoCashouts(roundId: string, multiplier: number) {
        const bets = await this.prisma.bet.findMany({
            where: {
                roundId,
                status: BetStatus.PLACED,
                isAutoCashout: true,
                autoCashout: { lte: multiplier },
            },
        });

        for (const bet of bets) {
            try {
                await this.cashout(bet.id, bet.userId, multiplier);
            } catch (e) {
                this.logger.error(`Auto-cashout failed for bet ${bet.id}`, e);
            }
        }
    }

    async cashout(betId: string, userId: string, multiplier: number) {
        const bet = await this.prisma.bet.findUnique({
            where: { id: betId },
            include: { round: true },
        });

        if (!bet || bet.status !== BetStatus.PLACED) throw new Error('Bet not active');
        if (bet.userId !== userId) throw new Error('Ownership mismatch');
        if (bet.round.status !== RoundStatus.FLYING) throw new Error('Not in flight');

        const payout = Math.floor(bet.amount * multiplier * 100) / 100;

        // 1. Update local state
        await this.prisma.bet.update({
            where: { id: betId },
            data: {
                status: BetStatus.WON,
                cashoutPoint: multiplier,
                payout,
                cashedOutAt: new Date(),
            },
        });

        // 2. Call Hub to credit wallet
        try {
            await this.hub.creditWallet(userId, payout, bet.round.id, `Aviator Win x${multiplier}`);
        } catch (e: any) {
            // If Hub call fails, we should ideally retry or mark as PENDING_SETTLEMENT
            this.logger.error(`Critical: Failed to credit wallet for user ${userId} | ${payout} INR`, e);
            throw new Error('Wallet settlement failed. Please contact support.');
        }

        return payout;
    }

    async placeBet(userId: string, amount: number, roundId: string, autoCashout?: number) {
        const round = await this.prisma.gameRound.findUnique({ where: { id: roundId } });
        if (!round || round.status !== RoundStatus.BETTING) throw new Error('Betting closed');

        // 1. Call Hub to debit wallet first (Atomic check)
        try {
            await this.hub.debitWallet(userId, amount, roundId, 'Aviator Bet Placed');
        } catch (e: any) {
            throw new Error(e.message || 'Insufficient balance or wallet error');
        }

        // 2. Create local bet record
        return await this.prisma.bet.create({
            data: {
                userId,
                roundId,
                amount,
                autoCashout,
                isAutoCashout: !!autoCashout,
            },
        });
    }

    getCurrentState() {
        return this.currentState;
    }
}
