import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GameService } from '../game.service';
import { GameGateway } from '../game.gateway';

const SUITS = ['HEARTS', 'DIAMONDS', 'SPADES', 'CLUBS'] as const;
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const VALUE_RANK: Record<string, number> = {
    A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8,
    '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
};

export interface TPCard {
    value: string;
    suit: string;
    rank: number;
}

export type HandRank = 'TRAIL' | 'PURE_SEQUENCE' | 'SEQUENCE' | 'COLOR' | 'PAIR' | 'HIGH_CARD';

const HAND_RANK_ORDER: Record<HandRank, number> = {
    TRAIL: 6,
    PURE_SEQUENCE: 5,
    SEQUENCE: 4,
    COLOR: 3,
    PAIR: 2,
    HIGH_CARD: 1,
};

export interface TPHand {
    cards: TPCard[];
    handRank: HandRank;
    handName: string;
    score: number; // For comparing hands of same rank
}

export interface TeenPattiResult {
    playerA: { cards: string[]; handRank: HandRank; handName: string };
    playerB: { cards: string[]; handRank: HandRank; handName: string };
    winner: 'PLAYER_A' | 'PLAYER_B' | 'TIE';
    winningHand: HandRank;
}

@Injectable()
export class TeenPattiEngine {
    private readonly logger = new Logger(TeenPattiEngine.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gameService: GameService,
        private readonly gateway: GameGateway,
    ) { }

    /**
     * Create and shuffle a 52-card deck
     */
    private createDeck(): TPCard[] {
        const deck: TPCard[] = [];
        for (const suit of SUITS) {
            for (const value of VALUES) {
                deck.push({ value, suit, rank: VALUE_RANK[value] });
            }
        }
        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    /**
     * Check if 3 cards form a sequence (consecutive ranks)
     */
    private isSequence(ranks: number[]): boolean {
        const sorted = [...ranks].sort((a, b) => a - b);
        // Special case: A-2-3 (ranks 14, 2, 3)
        if (sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 14) return true;
        return sorted[2] - sorted[1] === 1 && sorted[1] - sorted[0] === 1;
    }

    /**
     * Evaluate a 3-card Teen Patti hand
     */
    evaluateHand(cards: TPCard[]): TPHand {
        const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
        const suits = cards.map((c) => c.suit);
        const sameSuit = suits[0] === suits[1] && suits[1] === suits[2];
        const isSeq = this.isSequence(ranks);

        let handRank: HandRank;
        let handName: string;
        let score: number;

        // Trail (Three of a kind)
        if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
            handRank = 'TRAIL';
            handName = `Trail of ${cards[0].value}s`;
            score = HAND_RANK_ORDER.TRAIL * 1000 + ranks[0];
        }
        // Pure Sequence (same suit + consecutive)
        else if (sameSuit && isSeq) {
            handRank = 'PURE_SEQUENCE';
            handName = `Pure Sequence (${cards.map((c) => c.value).join('-')} ${suits[0]})`;
            score = HAND_RANK_ORDER.PURE_SEQUENCE * 1000 + Math.max(...ranks);
        }
        // Sequence (consecutive, mixed suits)
        else if (isSeq) {
            handRank = 'SEQUENCE';
            handName = `Sequence (${cards.map((c) => c.value).join('-')})`;
            score = HAND_RANK_ORDER.SEQUENCE * 1000 + Math.max(...ranks);
        }
        // Color / Flush (same suit, not consecutive)
        else if (sameSuit) {
            handRank = 'COLOR';
            handName = `Flush (${suits[0]})`;
            score = HAND_RANK_ORDER.COLOR * 1000 + ranks[0] * 100 + ranks[1] * 10 + ranks[2];
        }
        // Pair
        else if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) {
            handRank = 'PAIR';
            const pairVal = ranks[0] === ranks[1] ? ranks[0] : ranks[1] === ranks[2] ? ranks[1] : ranks[0];
            const kicker = ranks.find((r) => r !== pairVal) || 0;
            handName = `Pair of ${cards.find((c) => c.rank === pairVal)!.value}s`;
            score = HAND_RANK_ORDER.PAIR * 1000 + pairVal * 15 + kicker;
        }
        // High Card
        else {
            handRank = 'HIGH_CARD';
            handName = `High Card (${cards[0].value})`;
            score = HAND_RANK_ORDER.HIGH_CARD * 1000 + ranks[0] * 100 + ranks[1] * 10 + ranks[2];
        }

        return { cards, handRank, handName, score };
    }

    /**
     * Generate a complete Teen Patti result
     */
    generateResult(): TeenPattiResult {
        const deck = this.createDeck();
        const playerACards = deck.slice(0, 3);
        const playerBCards = deck.slice(3, 6);

        const handA = this.evaluateHand(playerACards);
        const handB = this.evaluateHand(playerBCards);

        let winner: 'PLAYER_A' | 'PLAYER_B' | 'TIE';
        if (handA.score > handB.score) winner = 'PLAYER_A';
        else if (handB.score > handA.score) winner = 'PLAYER_B';
        else winner = 'TIE';

        return {
            playerA: {
                cards: playerACards.map((c) => `${c.value}${c.suit[0]}`),
                handRank: handA.handRank,
                handName: handA.handName,
            },
            playerB: {
                cards: playerBCards.map((c) => `${c.value}${c.suit[0]}`),
                handRank: handB.handRank,
                handName: handB.handName,
            },
            winner,
            winningHand: winner === 'PLAYER_B' ? handB.handRank : handA.handRank,
        };
    }

    /**
     * Get winning bet types from result
     */
    getWinningBetTypes(result: TeenPattiResult): string[] {
        const winners: string[] = [];

        if (result.winner === 'PLAYER_A') winners.push('player_a');
        else if (result.winner === 'PLAYER_B') winners.push('player_b');
        else winners.push('tie');

        // Pair+ side bets
        const handA = result.playerA.handRank;
        const handB = result.playerB.handRank;

        if (HAND_RANK_ORDER[handA] >= HAND_RANK_ORDER.PAIR) winners.push('player_a_pair_plus');
        if (HAND_RANK_ORDER[handB] >= HAND_RANK_ORDER.PAIR) winners.push('player_b_pair_plus');

        // Any Trail
        if (handA === 'TRAIL' || handB === 'TRAIL') winners.push('any_trail');

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

        this.logger.log(`Starting Teen Patti Round #${roundNumber}`);

        const round = await this.gameService.createRound(gameId, roundNumber);

        this.gateway.broadcastToGame(gameId, 'round:created', {
            roundId: round.id,
            roundNumber,
            status: 'BETTING',
            bettingEndsAt: round.bettingEndAt,
        });

        const game = await this.prisma.game.findUnique({ where: { id: gameId } });
        const bettingWindow = game?.bettingWindow || 30;

        setTimeout(async () => {
            await this.lockBets(round.id, gameId);
        }, bettingWindow * 1000);

        return round;
    }

    private async lockBets(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'LOCKED');

        this.gateway.broadcastToGame(gameId, 'round:locked', {
            roundId,
            message: 'Bets are locked! Dealing cards...',
        });

        this.logger.log(`Teen Patti Round ${roundId}: Bets locked`);

        setTimeout(async () => {
            await this.playRound(roundId, gameId);
        }, 3000);
    }

    private async playRound(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'PLAYING');

        const result = this.generateResult();

        this.logger.log(
            `Teen Patti Round ${roundId}: A=[${result.playerA.cards.join(',')}] (${result.playerA.handRank}) vs B=[${result.playerB.cards.join(',')}] (${result.playerB.handRank}) → ${result.winner}`,
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

        this.gateway.broadcastToGame(gameId, 'round:result', { roundId, result });

        const winningBetTypes = this.getWinningBetTypes(result);
        const settlement = await this.gameService.settleBets(roundId, winningBetTypes);

        this.gateway.broadcastToGame(gameId, 'round:settled', { roundId, result, settlement });

        this.logger.log(
            `Teen Patti Round ${roundId}: Settled - ${settlement.totalBets} bets, payout: ₹${settlement.totalPayout}`,
        );

        setTimeout(async () => {
            await this.executeRound(gameId);
        }, 5000);
    }
}
