import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GameService } from '../game.service';
import { GameGateway } from '../game.gateway';

// Standard 52-card deck helpers
const SUITS = ['HEARTS', 'DIAMONDS', 'SPADES', 'CLUBS'] as const;
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export interface Card {
    value: string;
    suit: string;
    numericValue: number;
}

export interface DragonTigerResult {
    dragonCard: Card;
    tigerCard: Card;
    winner: 'DRAGON' | 'TIGER' | 'TIE';
    isDragonOdd: boolean;
    isDragonEven: boolean;
    isDragonRed: boolean;
    isTigerOdd: boolean;
    isTigerEven: boolean;
    isTigerRed: boolean;
}

@Injectable()
export class DragonTigerEngine {
    private readonly logger = new Logger(DragonTigerEngine.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gameService: GameService,
        private readonly gateway: GameGateway,
    ) { }

    /**
     * Draw a random card from the deck
     */
    private drawCard(): Card {
        const suitIndex = Math.floor(Math.random() * SUITS.length);
        const valueIndex = Math.floor(Math.random() * VALUES.length);
        const suit = SUITS[suitIndex];
        const value = VALUES[valueIndex];

        // A=1, 2-10=face value, J=11, Q=12, K=13
        let numericValue: number;
        if (value === 'A') numericValue = 1;
        else if (value === 'J') numericValue = 11;
        else if (value === 'Q') numericValue = 12;
        else if (value === 'K') numericValue = 13;
        else numericValue = parseInt(value);

        return { value, suit, numericValue };
    }

    /**
     * Draw two distinct cards (no duplicate card)
     */
    private dealCards(): { dragonCard: Card; tigerCard: Card } {
        const dragonCard = this.drawCard();
        let tigerCard = this.drawCard();

        // Ensure different cards (re-draw if same value + suit)
        while (tigerCard.value === dragonCard.value && tigerCard.suit === dragonCard.suit) {
            tigerCard = this.drawCard();
        }

        return { dragonCard, tigerCard };
    }

    /**
     * Determine game result from two cards
     */
    generateResult(): DragonTigerResult {
        const { dragonCard, tigerCard } = this.dealCards();

        let winner: 'DRAGON' | 'TIGER' | 'TIE';
        if (dragonCard.numericValue > tigerCard.numericValue) {
            winner = 'DRAGON';
        } else if (tigerCard.numericValue > dragonCard.numericValue) {
            winner = 'TIGER';
        } else {
            winner = 'TIE';
        }

        const isRed = (suit: string) => suit === 'HEARTS' || suit === 'DIAMONDS';

        return {
            dragonCard,
            tigerCard,
            winner,
            isDragonOdd: dragonCard.numericValue % 2 !== 0,
            isDragonEven: dragonCard.numericValue % 2 === 0,
            isDragonRed: isRed(dragonCard.suit),
            isTigerOdd: tigerCard.numericValue % 2 !== 0,
            isTigerEven: tigerCard.numericValue % 2 === 0,
            isTigerRed: isRed(tigerCard.suit),
        };
    }

    /**
     * Get winning bet types from result
     */
    getWinningBetTypes(result: DragonTigerResult): string[] {
        const winners: string[] = [];

        // Main bet
        if (result.winner === 'DRAGON') winners.push('dragon');
        else if (result.winner === 'TIGER') winners.push('tiger');
        else winners.push('tie');

        // Dragon side bets
        if (result.isDragonOdd) winners.push('dragon_odd');
        if (result.isDragonEven) winners.push('dragon_even');
        if (result.isDragonRed) winners.push('dragon_red');
        if (!result.isDragonRed) winners.push('dragon_black');

        // Tiger side bets
        if (result.isTigerOdd) winners.push('tiger_odd');
        if (result.isTigerEven) winners.push('tiger_even');
        if (result.isTigerRed) winners.push('tiger_red');
        if (!result.isTigerRed) winners.push('tiger_black');

        return winners;
    }

    /**
     * Execute a complete game round
     */
    async executeRound(gameId: string) {
        const lastRound = await this.prisma.gameRound.findFirst({
            where: { gameId },
            orderBy: { roundNumber: 'desc' },
        });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;

        this.logger.log(`Starting Dragon Tiger Round #${roundNumber}`);

        const round = await this.gameService.createRound(gameId, roundNumber);

        this.gateway.broadcastToGame(gameId, 'round:created', {
            roundId: round.id,
            roundNumber,
            status: 'BETTING',
            bettingEndsAt: round.bettingEndAt,
        });

        const game = await this.prisma.game.findUnique({ where: { id: gameId } });
        const bettingWindow = game?.bettingWindow || 15;

        setTimeout(async () => {
            await this.lockBets(round.id, gameId);
        }, bettingWindow * 1000);

        return round;
    }

    private async lockBets(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'LOCKED');

        this.gateway.broadcastToGame(gameId, 'round:locked', {
            roundId,
            message: 'Bets are locked!',
        });

        this.logger.log(`Dragon Tiger Round ${roundId}: Bets locked`);

        setTimeout(async () => {
            await this.playRound(roundId, gameId);
        }, 3000);
    }

    private async playRound(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'PLAYING');

        const result = this.generateResult();

        this.logger.log(
            `Dragon Tiger Round ${roundId}: Dragon=${result.dragonCard.value}${result.dragonCard.suit[0]} Tiger=${result.tigerCard.value}${result.tigerCard.suit[0]} → ${result.winner}`,
        );

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
                resultType: 'card_deal',
                resultData: result as any,
            },
        });

        this.gateway.broadcastToGame(gameId, 'round:result', {
            roundId,
            result,
        });

        const winningBetTypes = this.getWinningBetTypes(result);
        const settlement = await this.gameService.settleBets(roundId, winningBetTypes);

        this.gateway.broadcastToGame(gameId, 'round:settled', {
            roundId,
            result,
            settlement,
        });

        this.logger.log(
            `Dragon Tiger Round ${roundId}: Settled - ${settlement.totalBets} bets, payout: ₹${settlement.totalPayout}`,
        );

        setTimeout(async () => {
            await this.executeRound(gameId);
        }, 5000);
    }
}
