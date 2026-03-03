import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PokerEngine } from './poker.engine.js';
import { Subject } from 'rxjs';

@Injectable()
export class PokerService implements OnModuleInit {
    private readonly logger = new Logger(PokerService.name);
    public state$ = new Subject<any>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly engine: PokerEngine,
    ) { }

    async onModuleInit() {
        this.gameLoop();
    }

    private async gameLoop() {
        while (true) {
            try {
                await this.executeRound();
            } catch (err) {
                this.logger.error('Error in Poker game loop', err);
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    }

    private async executeRound() {
        // 1. Betting Phase (20s)
        const round = await this.prisma.gameRound.create({
            data: {
                roundNumber: Math.floor(Date.now() / 1000),
                status: 'BETTING',
                bettingEndAt: new Date(Date.now() + 20000),
            },
        });

        this.broadcast('BETTING', { roundId: round.id, endsAt: round.bettingEndAt });
        await new Promise((resolve) => setTimeout(resolve, 20000));

        // 2. Result Phase
        const result = this.engine.generateResult();
        await this.prisma.gameRound.update({
            where: { id: round.id },
            data: {
                status: 'RESULT',
                resultData: JSON.stringify(result),
            },
        });

        this.broadcast('RESULT', { roundId: round.id, result });
        await this.settleBets(round.id, result.winningBetTypes);

        // 3. Cool Down (5s)
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    private async settleBets(roundId: string, winningTypes: string[]) {
        const bets = await this.prisma.bet.findMany({
            where: { roundId, status: 'PLACED' },
        });

        for (const bet of bets) {
            const isWinner = winningTypes.includes(bet.betType.toLowerCase());
            if (isWinner) {
                const payout = bet.amount * 2; // Flat 1:1 payout for prototype
                await this.prisma.$transaction(async (tx) => {
                    await tx.bet.update({ where: { id: bet.id }, data: { status: 'WON', payout, settledAt: new Date() } });
                    await tx.user.update({ where: { userId: bet.userId }, data: { balance: { increment: payout } } });
                });
            } else {
                await this.prisma.bet.update({ where: { id: bet.id }, data: { status: 'LOST', settledAt: new Date() } });
            }
        }
    }

    private broadcast(status: string, data: any) {
        this.state$.next({ status, ...data });
    }

    async placeBet(userId: string, amount: number, roundId: string, betType: string) {
        return await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { userId } });
            if (!user || user.balance < amount) throw new Error('Insufficient balance');

            const bet = await tx.bet.create({
                data: { userId, roundId, amount, betType, status: 'PLACED' }
            });

            await tx.user.update({
                where: { userId },
                data: { balance: { decrement: amount } }
            });

            return bet;
        });
    }
}
