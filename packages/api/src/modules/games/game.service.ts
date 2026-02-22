import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { RedisService } from '../../redis/redis.service';
import {
    TransactionType,
    RoundStatus,
    BetStatus,
} from '@prisma/client';
import { PlaceBetDto } from './dto/place-bet.dto';

@Injectable()
export class GameService {
    private readonly logger = new Logger(GameService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly walletService: WalletService,
        private readonly redis: RedisService,
    ) { }

    // =============== GAME MANAGEMENT ===============

    async getGames() {
        return this.prisma.game.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                slug: true,
                type: true,
                minBet: true,
                maxBet: true,
                roundDuration: true,
                bettingWindow: true,
                houseEdge: true,
                isActive: true,
                isMaintenanceMode: true,
                thumbnail: true,
                banner: true,
            },
        });
    }

    async getGameBySlug(slug: string) {
        const game = await this.prisma.game.findUnique({
            where: { slug },
        });

        if (!game) throw new NotFoundException('Game not found');
        return game;
    }

    async getCurrentRound(gameId: string) {
        // Try Redis cache first
        const cached = await this.redis.getCurrentRound(gameId);
        if (cached) return cached;

        // Fall back to DB
        const round = await this.prisma.gameRound.findFirst({
            where: {
                gameId,
                status: { in: ['WAITING', 'BETTING', 'LOCKED', 'PLAYING'] },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Write-through cache
        if (round) {
            await this.redis.setCurrentRound(gameId, round);
        }

        return round;
    }

    async getRecentRounds(gameId: string, limit: number = 20) {
        return this.prisma.gameRound.findMany({
            where: {
                gameId,
                status: 'SETTLED',
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                roundNumber: true,
                result: true,
                totalBets: true,
                totalBetAmount: true,
                totalPayout: true,
                housePnl: true,
                createdAt: true,
            },
        });
    }

    // =============== ROUND LIFECYCLE ===============

    async createRound(gameId: string, roundNumber: number) {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
        });

        if (!game) throw new NotFoundException('Game not found');

        const now = new Date();
        const bettingEndAt = new Date(now.getTime() + game.bettingWindow * 1000);

        const round = await this.prisma.gameRound.create({
            data: {
                gameId,
                roundNumber,
                status: 'BETTING',
                bettingStartAt: now,
                bettingEndAt,
            },
        });

        this.logger.log(
            `Round ${roundNumber} created for game ${game.slug} (betting window: ${game.bettingWindow}s)`,
        );

        return round;
    }

    async updateRoundStatus(roundId: string, status: RoundStatus) {
        return this.prisma.gameRound.update({
            where: { id: roundId },
            data: {
                status,
                ...(status === 'PLAYING' && { playStartAt: new Date() }),
                ...(status === 'RESULT' && { resultAt: new Date() }),
                ...(status === 'SETTLED' && { settledAt: new Date() }),
            },
        });
    }

    // =============== BET PLACEMENT ===============

    async placeBet(userId: string, dto: PlaceBetDto) {
        // Get active round
        const round = await this.prisma.gameRound.findUnique({
            where: { id: dto.roundId },
            include: { game: true },
        });

        if (!round) throw new NotFoundException('Round not found');
        if (round.status !== 'BETTING') {
            throw new BadRequestException('Betting is closed for this round');
        }

        // Validate bet amount
        if (dto.amount < Number(round.game.minBet)) {
            throw new BadRequestException(
                `Minimum bet is ₹${round.game.minBet}`,
            );
        }
        if (dto.amount > Number(round.game.maxBet)) {
            throw new BadRequestException(
                `Maximum bet is ₹${round.game.maxBet}`,
            );
        }

        // Calculate odds based on bet type and game
        const odds = this.getOddsForBet(round.game.slug, dto.betType);
        const potentialPayout = dto.amount * odds;

        // Debit wallet
        const { transaction } = await this.walletService.debitBalance(
            userId,
            dto.amount,
            TransactionType.BET_PLACED,
            `Bet on ${round.game.name} - Round #${round.roundNumber} - ${dto.betType}`,
            { gameRoundId: round.id },
        );

        // Create bet record
        const bet = await this.prisma.bet.create({
            data: {
                userId,
                gameRoundId: round.id,
                amount: dto.amount,
                betType: dto.betType,
                betData: dto.betData as any,
                odds,
                potentialPayout,
                placeTxnId: transaction.id,
            },
        });

        // Update round stats
        await this.prisma.gameRound.update({
            where: { id: round.id },
            data: {
                totalBets: { increment: 1 },
                totalBetAmount: { increment: dto.amount },
            },
        });

        this.logger.log(
            `Bet placed: User ${userId} bet ₹${dto.amount} on ${dto.betType} for round ${round.roundNumber}`,
        );

        return {
            message: 'Bet placed successfully',
            bet: {
                id: bet.id,
                amount: bet.amount,
                betType: bet.betType,
                odds,
                potentialPayout,
            },
        };
    }

    // =============== BET SETTLEMENT ===============

    async settleBets(roundId: string, winningBetTypes: string[]) {
        const bets = await this.prisma.bet.findMany({
            where: { gameRoundId: roundId, status: 'PLACED' },
        });

        let totalPayout = 0;

        for (const bet of bets) {
            const isWinner = winningBetTypes.includes(bet.betType);

            if (isWinner) {
                const payout = Number(bet.amount) * Number(bet.odds);
                totalPayout += payout;

                // Credit wallet
                await this.walletService.creditBalance(
                    bet.userId,
                    payout,
                    TransactionType.BET_WON,
                    `Won bet on Round #${roundId} - ${bet.betType}`,
                    { betId: bet.id, gameRoundId: roundId },
                );

                // Update bet
                await this.prisma.bet.update({
                    where: { id: bet.id },
                    data: {
                        status: BetStatus.WON,
                        actualPayout: payout,
                        settledAt: new Date(),
                    },
                });
            } else {
                // Mark as lost
                await this.prisma.bet.update({
                    where: { id: bet.id },
                    data: {
                        status: BetStatus.LOST,
                        settledAt: new Date(),
                    },
                });
            }
        }

        // Update round with final stats
        const round = await this.prisma.gameRound.findUnique({
            where: { id: roundId },
        });

        const housePnl = Number(round?.totalBetAmount || 0) - totalPayout;

        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: {
                totalPayout,
                housePnl,
                status: 'SETTLED',
                settledAt: new Date(),
            },
        });

        this.logger.log(
            `Round ${roundId} settled: ${bets.length} bets, payout: ₹${totalPayout}, house P&L: ₹${housePnl}`,
        );

        return { totalBets: bets.length, totalPayout, housePnl };
    }

    // =============== ODDS LOOKUP ===============

    private getOddsForBet(gameSlug: string, betType: string): number {
        const oddsMap: Record<string, Record<string, number>> = {
            'seven-up-down': {
                up: 2.0,
                down: 2.0,
                seven: 5.0,
            },
            'teen-patti': {
                player_a: 1.95,
                player_b: 1.95,
                tie: 25,
                player_a_pair_plus: 3.5,
                player_b_pair_plus: 3.5,
                any_trail: 50,
            },
            'dragon-tiger': {
                dragon: 1.95,
                tiger: 1.95,
                tie: 11,
                dragon_odd: 1.9,
                dragon_even: 1.9,
                tiger_odd: 1.9,
                tiger_even: 1.9,
                dragon_red: 1.9,
                dragon_black: 1.9,
                tiger_red: 1.9,
                tiger_black: 1.9,
            },
            poker: {
                player_a: 1.95,
                player_b: 1.95,
                tie: 20,
                any_flush_plus: 4,
                full_house_plus: 8,
                four_kind_plus: 30,
                royal_flush: 500,
            },
            aviator: {
                manual: 1.0,
                auto_cashout: 1.0,
            },
        };

        const gameOdds = oddsMap[gameSlug];
        if (!gameOdds || !gameOdds[betType]) {
            throw new BadRequestException(
                `Invalid bet type '${betType}' for game '${gameSlug}'`,
            );
        }

        return gameOdds[betType];
    }

    // =============== ADMIN: GET ALL GAMES ===============

    async getAllGamesAdmin() {
        return this.prisma.game.findMany({
            include: {
                _count: {
                    select: { rounds: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async getGameStats(gameId: string) {
        const [totalRounds, totalBets, revenue] = await Promise.all([
            this.prisma.gameRound.count({
                where: { gameId, status: 'SETTLED' },
            }),
            this.prisma.bet.count({
                where: { gameRound: { gameId } },
            }),
            this.prisma.gameRound.aggregate({
                where: { gameId, status: 'SETTLED' },
                _sum: {
                    totalBetAmount: true,
                    totalPayout: true,
                    housePnl: true,
                },
            }),
        ]);

        return {
            totalRounds,
            totalBets,
            totalBetAmount: revenue._sum.totalBetAmount || 0,
            totalPayout: revenue._sum.totalPayout || 0,
            housePnl: revenue._sum.housePnl || 0,
        };
    }
}
