import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { HubClient } from '../../core/hub-client.js';

@Injectable()
export class LudoService {
    private readonly logger = new Logger(LudoService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly hub: HubClient,
    ) { }

    async placeBet(userId: string, roundId: string, betType: string, amount: number) {
        const round = await this.prisma.gameRound.findUnique({ where: { id: roundId } });
        if (!round || round.status !== 'BETTING') {
            throw new Error('Betting is not open for this round');
        }

        // Debit wallet via Hub
        await this.hub.debitWallet(userId, amount, roundId, `Ludo Bet: ${betType}`);

        return await this.prisma.bet.create({
            data: {
                userId,
                roundId,
                betType,
                amount,
                status: 'PLACED',
            }
        });
    }

    async settleBets(roundId: string, winner: string) {
        const bets = await this.prisma.bet.findMany({
            where: { roundId, status: 'PLACED' }
        });

        const odds = 3.8;
        let totalBets = bets.length;
        let totalPayout = 0;

        for (const bet of bets) {
            let status = 'LOST';
            let payout = 0;

            if (bet.betType === winner) {
                status = 'WON';
                payout = bet.amount * odds;
                totalPayout += payout;

                try {
                    await this.hub.creditWallet(bet.userId, payout, roundId, 'Ludo Win');
                } catch (e) {
                    this.logger.error(`Failed to credit user ${bet.userId} for round ${roundId}`, e);
                }
            }

            await this.prisma.bet.update({
                where: { id: bet.id },
                data: { status, payout, settledAt: new Date() }
            });
        }

        return { totalBets, totalPayout };
    }
}
