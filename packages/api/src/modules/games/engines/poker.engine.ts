import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GameService } from '../game.service';
import { GameGateway } from '../game.gateway';

const SUITS = ['HEARTS', 'DIAMONDS', 'SPADES', 'CLUBS'] as const;
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
const VALUE_RANK: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

interface PokerCard {
    value: string;
    suit: string;
    rank: number;
}

export type PokerHandRank =
    | 'ROYAL_FLUSH'
    | 'STRAIGHT_FLUSH'
    | 'FOUR_OF_A_KIND'
    | 'FULL_HOUSE'
    | 'FLUSH'
    | 'STRAIGHT'
    | 'THREE_OF_A_KIND'
    | 'TWO_PAIR'
    | 'ONE_PAIR'
    | 'HIGH_CARD';

const POKER_RANK_ORDER: Record<PokerHandRank, number> = {
    ROYAL_FLUSH: 10,
    STRAIGHT_FLUSH: 9,
    FOUR_OF_A_KIND: 8,
    FULL_HOUSE: 7,
    FLUSH: 6,
    STRAIGHT: 5,
    THREE_OF_A_KIND: 4,
    TWO_PAIR: 3,
    ONE_PAIR: 2,
    HIGH_CARD: 1,
};

interface EvaluatedHand {
    handRank: PokerHandRank;
    handName: string;
    score: number;
    bestCards: PokerCard[];
}

export interface PokerResult {
    playerA: { holeCards: string[]; bestHand: string[]; handRank: PokerHandRank; handName: string };
    playerB: { holeCards: string[]; bestHand: string[]; handRank: PokerHandRank; handName: string };
    communityCards: string[];
    winner: 'PLAYER_A' | 'PLAYER_B' | 'TIE';
    winningHand: PokerHandRank;
}

@Injectable()
export class PokerEngine {
    private readonly logger = new Logger(PokerEngine.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gameService: GameService,
        private readonly gateway: GameGateway,
    ) { }

    private createDeck(): PokerCard[] {
        const deck: PokerCard[] = [];
        for (const suit of SUITS) {
            for (const value of VALUES) {
                deck.push({ value, suit, rank: VALUE_RANK[value] });
            }
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    private cardStr(card: PokerCard): string {
        return `${card.value}${card.suit[0]}`;
    }

    /**
     * Generate all C(n, 5) combos from n cards
     */
    private getCombinations(cards: PokerCard[], size: number): PokerCard[][] {
        const results: PokerCard[][] = [];
        const combine = (start: number, current: PokerCard[]) => {
            if (current.length === size) {
                results.push([...current]);
                return;
            }
            for (let i = start; i < cards.length; i++) {
                current.push(cards[i]);
                combine(i + 1, current);
                current.pop();
            }
        };
        combine(0, []);
        return results;
    }

    /**
     * Evaluate a 5-card poker hand
     */
    private evaluate5Cards(cards: PokerCard[]): { handRank: PokerHandRank; handName: string; score: number } {
        const sorted = [...cards].sort((a, b) => b.rank - a.rank);
        const ranks = sorted.map((c) => c.rank);
        const suits = sorted.map((c) => c.suit);

        const isFlush = suits.every((s) => s === suits[0]);
        const isStraight = this.isStraight(ranks);
        const groups = this.groupByRank(ranks);

        // Royal Flush
        if (isFlush && isStraight && ranks[0] === 14 && ranks[4] === 10) {
            return { handRank: 'ROYAL_FLUSH', handName: `Royal Flush (${suits[0]})`, score: 10_000_000 };
        }
        // Straight Flush
        if (isFlush && isStraight) {
            return { handRank: 'STRAIGHT_FLUSH', handName: `Straight Flush (${ranks[0]} high)`, score: 9_000_000 + ranks[0] };
        }
        // Four of a Kind
        if (groups[0].count === 4) {
            return { handRank: 'FOUR_OF_A_KIND', handName: `Four ${this.rankName(groups[0].rank)}s`, score: 8_000_000 + groups[0].rank * 15 + groups[1].rank };
        }
        // Full House
        if (groups[0].count === 3 && groups[1].count === 2) {
            return { handRank: 'FULL_HOUSE', handName: `Full House (${this.rankName(groups[0].rank)}s over ${this.rankName(groups[1].rank)}s)`, score: 7_000_000 + groups[0].rank * 15 + groups[1].rank };
        }
        // Flush
        if (isFlush) {
            return { handRank: 'FLUSH', handName: `Flush (${suits[0]})`, score: 6_000_000 + ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4] };
        }
        // Straight
        if (isStraight) {
            return { handRank: 'STRAIGHT', handName: `Straight (${ranks[0]} high)`, score: 5_000_000 + ranks[0] };
        }
        // Three of a Kind
        if (groups[0].count === 3) {
            return { handRank: 'THREE_OF_A_KIND', handName: `Three ${this.rankName(groups[0].rank)}s`, score: 4_000_000 + groups[0].rank * 225 + groups[1].rank * 15 + groups[2].rank };
        }
        // Two Pair
        if (groups[0].count === 2 && groups[1].count === 2) {
            const highPair = Math.max(groups[0].rank, groups[1].rank);
            const lowPair = Math.min(groups[0].rank, groups[1].rank);
            return { handRank: 'TWO_PAIR', handName: `Two Pair (${this.rankName(highPair)}s and ${this.rankName(lowPair)}s)`, score: 3_000_000 + highPair * 225 + lowPair * 15 + groups[2].rank };
        }
        // One Pair
        if (groups[0].count === 2) {
            return { handRank: 'ONE_PAIR', handName: `Pair of ${this.rankName(groups[0].rank)}s`, score: 2_000_000 + groups[0].rank * 3375 + groups[1].rank * 225 + groups[2].rank * 15 + groups[3].rank };
        }
        // High Card
        return { handRank: 'HIGH_CARD', handName: `High Card (${this.rankName(ranks[0])})`, score: 1_000_000 + ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4] };
    }

    private isStraight(ranks: number[]): boolean {
        const sorted = [...ranks].sort((a, b) => b - a);
        // Normal straight
        if (sorted[0] - sorted[4] === 4 && new Set(sorted).size === 5) return true;
        // Ace-low straight (A-2-3-4-5)
        if (sorted[0] === 14 && sorted[1] === 5 && sorted[2] === 4 && sorted[3] === 3 && sorted[4] === 2) return true;
        return false;
    }

    private groupByRank(ranks: number[]): { rank: number; count: number }[] {
        const counts: Record<number, number> = {};
        for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
        return Object.entries(counts)
            .map(([r, c]) => ({ rank: parseInt(r), count: c }))
            .sort((a, b) => b.count - a.count || b.rank - a.rank);
    }

    private rankName(rank: number): string {
        const names: Record<number, string> = { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack' };
        return names[rank] || rank.toString();
    }

    /**
     * Find best 5-card hand from 7 available cards
     */
    evaluateBestHand(holeCards: PokerCard[], communityCards: PokerCard[]): EvaluatedHand {
        const allCards = [...holeCards, ...communityCards];
        const combos = this.getCombinations(allCards, 5);

        let best: EvaluatedHand | null = null;
        for (const combo of combos) {
            const result = this.evaluate5Cards(combo);
            if (!best || result.score > best.score) {
                best = { ...result, bestCards: combo };
            }
        }

        return best!;
    }

    /**
     * Generate a Poker round result
     */
    generateResult(): PokerResult {
        const deck = this.createDeck();

        const playerAHole = [deck[0], deck[1]];
        const playerBHole = [deck[2], deck[3]];
        const community = [deck[4], deck[5], deck[6], deck[7], deck[8]];

        const handA = this.evaluateBestHand(playerAHole, community);
        const handB = this.evaluateBestHand(playerBHole, community);

        let winner: 'PLAYER_A' | 'PLAYER_B' | 'TIE';
        if (handA.score > handB.score) winner = 'PLAYER_A';
        else if (handB.score > handA.score) winner = 'PLAYER_B';
        else winner = 'TIE';

        return {
            playerA: {
                holeCards: playerAHole.map((c) => this.cardStr(c)),
                bestHand: handA.bestCards.map((c) => this.cardStr(c)),
                handRank: handA.handRank,
                handName: handA.handName,
            },
            playerB: {
                holeCards: playerBHole.map((c) => this.cardStr(c)),
                bestHand: handB.bestCards.map((c) => this.cardStr(c)),
                handRank: handB.handRank,
                handName: handB.handName,
            },
            communityCards: community.map((c) => this.cardStr(c)),
            winner,
            winningHand: winner === 'PLAYER_B' ? handB.handRank : handA.handRank,
        };
    }

    /**
     * Get winning bet types from result
     */
    getWinningBetTypes(result: PokerResult): string[] {
        const winners: string[] = [];

        if (result.winner === 'PLAYER_A') winners.push('player_a');
        else if (result.winner === 'PLAYER_B') winners.push('player_b');
        else winners.push('tie');

        // Side bets — check highest hand between both players
        const bestRank = Math.max(
            POKER_RANK_ORDER[result.playerA.handRank],
            POKER_RANK_ORDER[result.playerB.handRank],
        );

        if (bestRank >= POKER_RANK_ORDER.FLUSH) winners.push('any_flush_plus');
        if (bestRank >= POKER_RANK_ORDER.FULL_HOUSE) winners.push('full_house_plus');
        if (bestRank >= POKER_RANK_ORDER.FOUR_OF_A_KIND) winners.push('four_kind_plus');
        if (bestRank >= POKER_RANK_ORDER.ROYAL_FLUSH) winners.push('royal_flush');

        return winners;
    }

    /**
     * Execute a complete Poker round with multi-phase reveal
     */
    async executeRound(gameId: string) {
        const lastRound = await this.prisma.gameRound.findFirst({
            where: { gameId },
            orderBy: { roundNumber: 'desc' },
        });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;

        this.logger.log(`Starting Poker Round #${roundNumber}`);

        const round = await this.gameService.createRound(gameId, roundNumber);

        this.gateway.broadcastToGame(gameId, 'round:created', {
            roundId: round.id,
            roundNumber,
            status: 'BETTING',
            bettingEndsAt: round.bettingEndAt,
        });

        const game = await this.prisma.game.findUnique({ where: { id: gameId } });
        const bettingWindow = game?.bettingWindow || 25;

        setTimeout(async () => {
            await this.lockBets(round.id, gameId);
        }, bettingWindow * 1000);

        return round;
    }

    private async lockBets(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'LOCKED');

        this.gateway.broadcastToGame(gameId, 'round:locked', {
            roundId,
            message: 'Bets locked! Dealing cards...',
        });

        setTimeout(async () => {
            await this.playRound(roundId, gameId);
        }, 2000);
    }

    private async playRound(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'PLAYING');

        const result = this.generateResult();

        // Phase 1: Reveal hole cards
        this.gateway.broadcastToGame(gameId, 'poker:hole_cards', {
            roundId,
            playerA: result.playerA.holeCards,
            playerB: result.playerB.holeCards,
        });

        // Phase 2: Flop (3 cards) after 3s
        await new Promise((r) => setTimeout(r, 3000));
        this.gateway.broadcastToGame(gameId, 'poker:flop', {
            roundId,
            cards: result.communityCards.slice(0, 3),
        });

        // Phase 3: Turn (4th card) after 3s
        await new Promise((r) => setTimeout(r, 3000));
        this.gateway.broadcastToGame(gameId, 'poker:turn', {
            roundId,
            card: result.communityCards[3],
        });

        // Phase 4: River (5th card) after 3s
        await new Promise((r) => setTimeout(r, 3000));
        this.gateway.broadcastToGame(gameId, 'poker:river', {
            roundId,
            card: result.communityCards[4],
        });

        // Pause for reveal
        await new Promise((r) => setTimeout(r, 2000));

        this.logger.log(
            `Poker Round ${roundId}: A=${result.playerA.handName} vs B=${result.playerB.handName} → ${result.winner}`,
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
            `Poker Round ${roundId}: Settled - ${settlement.totalBets} bets, payout: ₹${settlement.totalPayout}`,
        );

        setTimeout(async () => {
            await this.executeRound(gameId);
        }, 5000);
    }
}
