import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DragonTigerEngine } from './dragon-tiger.engine.js';
import { HubClient } from '../../core/hub-client.js';
import { Subject } from 'rxjs';

@Injectable()
export class DragonTigerService implements OnModuleInit {
    private readonly logger = new Logger(DragonTigerService.name);
    private currentRoundId: string | null = null;
    public state$ = new Subject<any>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly engine: DragonTigerEngine,
        private readonly hub: HubClient,
    ) { }

    async onModuleInit() {
        this.gameLoop();
    }

    private async gameLoop() {
        while (true) {
            try {
                await this.executeRound();
            } catch (err) {
                this.logger.error('Error in Dragon Tiger game loop', err);
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    }

    private async executeRound() {
        // 1. Betting Phase (15s)
        const round = await this.prisma.gameRound.create({
            data: {
                roundNumber: Math.floor(Date.now() / 1000),
                status: 'BETTING',
                bettingEndAt: new Date(Date.now() + 15000),
            },
        });
        this.currentRoundId = round.id;
        this.broadcast('BETTING', { roundId: round.id, endsAt: round.bettingEndAt });
        await new Promise((resolve) => setTimeout(resolve, 15000));

        // 2. Locking Phase (3s)
        await this.prisma.gameRound.update({
            where: { id: round.id },
            data: { status: 'LOCKED' },
        });
        this.broadcast('LOCKED', { roundId: round.id });
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // 3. Result Phase
        const result = this.engine.generateResult();
        await this.prisma.gameRound.update({
            where: { id: round.id },
            data: {
                status: 'RESULT',
                dragonCard: JSON.stringify(result.dragonCard),
                tigerCard: JSON.stringify(result.tigerCard),
                winner: result.winner,
                resultData: JSON.stringify(result.winningBetTypes),
            },
        });

        this.broadcast('RESULT', { roundId: round.id, result });
        await this.settleBets(round.id, result.winningBetTypes);

        // 4. Cool Down (5s)
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    private async settleBets(roundId: string, winningTypes: string[]) {
        const bets = await this.prisma.bet.findMany({
            where: { roundId, status: 'PLACED' },
        });

        for (const bet of bets) {
            const isWinner = winningTypes.includes(bet.betType.toLowerCase());
            if (isWinner) {
                const payoutRate = this.getPayoutRate(bet.betType);
                const payout = bet.amount * payoutRate;

                await this.prisma.bet.update({ where: { id: bet.id }, data: { status: 'WON', payout, settledAt: new Date() } });

                // Hub credit
                try {
                    await this.hub.creditWallet(bet.userId, payout, roundId, `DragonTiger Win ${bet.betType}`);
                } catch (e) {
                    this.logger.error(`Failed to credit user ${bet.userId} for bet ${bet.id}`, e);
                }
            } else {
                await this.prisma.bet.update({ where: { id: bet.id }, data: { status: 'LOST', settledAt: new Date() } });
            }
        }
    }

    private getPayoutRate(type: string): number {
        if (type === 'tie') return 9;
        return 2;
    }

    async placeBet(userId: string, amount: number, roundId: string, betType: string) {
        // Hub debit
        try {
            await this.hub.debitWallet(userId, amount, roundId, `DragonTiger Bet ${betType}`);
        } catch (e: any) {
            throw new Error(e.message || 'Insufficient Hub balance');
        }

        return await this.prisma.bet.create({
            data: { userId, roundId, amount, betType, status: 'PLACED' }
        });
    }

    private broadcast(status: string, data: any) {
        this.state$.next({ status, ...data });
    }
}
