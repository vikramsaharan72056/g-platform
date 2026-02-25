import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GameService } from '../game.service';
import { GameGateway } from '../game.gateway';

const SUITS = ['HEARTS', 'DIAMONDS', 'SPADES', 'CLUBS'] as const;
const VALUES = [
    'A',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
] as const;

const VALUE_RANK: Record<string, number> = {
    A: 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    J: 11,
    Q: 12,
    K: 13,
};

const VALUE_POINTS: Record<string, number> = {
    A: 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    J: 10,
    Q: 10,
    K: 10,
};

type RummyWinner = 'PLAYER_A' | 'PLAYER_B' | 'TIE';

interface RummyCard {
    value: string;
    suit: string;
    rank: number;
    points: number;
}

interface RummyHandSummary {
    cards: string[];
    pureSequences: number;
    sequences: number;
    sets: number;
    deadwood: number;
    isValid: boolean;
    score: number;
}

interface RummyResult {
    playerA: RummyHandSummary;
    playerB: RummyHandSummary;
    winner: RummyWinner;
    winningReason: string;
}

@Injectable()
export class RummyEngine {
    private readonly logger = new Logger(RummyEngine.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gameService: GameService,
        private readonly gateway: GameGateway,
    ) { }

    private createDeck(): RummyCard[] {
        const deck: RummyCard[] = [];
        for (const suit of SUITS) {
            for (const value of VALUES) {
                deck.push({
                    value,
                    suit,
                    rank: VALUE_RANK[value],
                    points: VALUE_POINTS[value],
                });
            }
        }

        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        return deck;
    }

    private cardCode(card: RummyCard): string {
        const suitCode: Record<string, string> = {
            HEARTS: 'H',
            DIAMONDS: 'D',
            SPADES: 'S',
            CLUBS: 'C',
        };
        return `${card.value}${suitCode[card.suit] || '?'}`;
    }

    private evaluateHand(cards: RummyCard[]): RummyHandSummary {
        const used = new Set<string>();

        const markUsed = (card: RummyCard) => {
            used.add(this.cardCode(card));
        };

        const bySuit = new Map<string, RummyCard[]>();
        for (const c of cards) {
            if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
            bySuit.get(c.suit)!.push(c);
        }

        let pureSequences = 0;
        let sequences = 0;

        // Greedy extraction of sequences in each suit.
        for (const suitCards of bySuit.values()) {
            const sorted = [...suitCards].sort((a, b) => a.rank - b.rank);
            let i = 0;

            while (i < sorted.length) {
                const run: RummyCard[] = [sorted[i]];
                let j = i + 1;

                while (
                    j < sorted.length &&
                    sorted[j].rank === run[run.length - 1].rank + 1
                ) {
                    run.push(sorted[j]);
                    j++;
                }

                if (run.length >= 3) {
                    pureSequences++;
                    sequences++;
                    run.forEach(markUsed);
                    i = j;
                } else {
                    i++;
                }
            }
        }

        // Extract sets from remaining cards only.
        const remaining = cards.filter((c) => !used.has(this.cardCode(c)));
        const byValue = new Map<string, RummyCard[]>();
        for (const c of remaining) {
            if (!byValue.has(c.value)) byValue.set(c.value, []);
            byValue.get(c.value)!.push(c);
        }

        let sets = 0;
        for (const valueCards of byValue.values()) {
            if (valueCards.length >= 3) {
                sets++;
                valueCards.slice(0, 3).forEach(markUsed);
            }
        }

        const deadwood = cards
            .filter((c) => !used.has(this.cardCode(c)))
            .reduce((sum, c) => sum + c.points, 0);

        // Simplified validity: at least one pure sequence + one more meld.
        const meldCount = pureSequences + sets;
        const isValid = pureSequences >= 1 && meldCount >= 2;

        // Lower score is better. Invalid hands get a fixed penalty.
        const score = isValid ? deadwood : deadwood + 40;

        return {
            cards: cards.map((c) => this.cardCode(c)),
            pureSequences,
            sequences,
            sets,
            deadwood,
            isValid,
            score,
        };
    }

    private generateResult(): RummyResult {
        const deck = this.createDeck();
        const handA = deck.slice(0, 13);
        const handB = deck.slice(13, 26);

        const playerA = this.evaluateHand(handA);
        const playerB = this.evaluateHand(handB);

        let winner: RummyWinner;
        let winningReason: string;

        if (playerA.isValid && !playerB.isValid) {
            winner = 'PLAYER_A';
            winningReason = 'Player A has a valid declaration';
        } else if (playerB.isValid && !playerA.isValid) {
            winner = 'PLAYER_B';
            winningReason = 'Player B has a valid declaration';
        } else if (playerA.score < playerB.score) {
            winner = 'PLAYER_A';
            winningReason = `Lower score (${playerA.score} vs ${playerB.score})`;
        } else if (playerB.score < playerA.score) {
            winner = 'PLAYER_B';
            winningReason = `Lower score (${playerB.score} vs ${playerA.score})`;
        } else {
            winner = 'TIE';
            winningReason = 'Equal score';
        }

        return {
            playerA,
            playerB,
            winner,
            winningReason,
        };
    }

    private getWinningBetTypes(result: RummyResult): string[] {
        if (result.winner === 'PLAYER_A') return ['player_a'];
        if (result.winner === 'PLAYER_B') return ['player_b'];
        return ['tie'];
    }

    async executeRound(gameId: string) {
        const lastRound = await this.prisma.gameRound.findFirst({
            where: { gameId },
            orderBy: { roundNumber: 'desc' },
        });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;

        this.logger.log(`Starting Rummy Round #${roundNumber}`);

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
            message: 'Bets are locked! Evaluating rummy hands...',
        });

        this.logger.log(`Rummy Round ${roundId}: Bets locked`);

        setTimeout(async () => {
            await this.playRound(roundId, gameId);
        }, 3000);
    }

    private async playRound(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'PLAYING');

        const result = this.generateResult();

        this.logger.log(
            `Rummy Round ${roundId}: Winner ${result.winner}, reason=${result.winningReason}`,
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
                resultType: 'rummy_showdown',
                resultData: result as any,
            },
        });

        this.gateway.broadcastToGame(gameId, 'round:result', { roundId, result });

        const winningBetTypes = this.getWinningBetTypes(result);
        const settlement = await this.gameService.settleBets(roundId, winningBetTypes);

        this.gateway.broadcastToGame(gameId, 'round:settled', {
            roundId,
            result,
            settlement,
        });

        this.logger.log(
            `Rummy Round ${roundId}: Settled - ${settlement.totalBets} bets, payout: ₹${settlement.totalPayout}`,
        );

        setTimeout(async () => {
            await this.executeRound(gameId);
        }, 5000);
    }
}
