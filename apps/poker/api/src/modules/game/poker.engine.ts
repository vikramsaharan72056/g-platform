import { Injectable, Logger } from '@nestjs/common';

export interface Card {
    value: string;
    suit: string;
    rank: number;
}

export type HandRank = 'ROYAL_FLUSH' | 'STRAIGHT_FLUSH' | 'FOUR_OF_A_KIND' | 'FULL_HOUSE' | 'FLUSH' | 'STRAIGHT' | 'THREE_OF_A_KIND' | 'TWO_PAIR' | 'ONE_PAIR' | 'HIGH_CARD';

@Injectable()
export class PokerEngine {
    private readonly logger = new Logger(PokerEngine.name);
    private readonly SUITS = ['HEARTS', 'DIAMONDS', 'SPADES', 'CLUBS'];
    private readonly VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    private readonly VALUE_MAP: Record<string, number> = { 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

    generateResult(): any {
        const deck = this.createDeck();
        const playerA = [deck[0], deck[1]];
        const playerB = [deck[2], deck[3]];
        const community = [deck[4], deck[5], deck[6], deck[7], deck[8]];

        const bestA = this.evaluateBestHand(playerA, community);
        const bestB = this.evaluateBestHand(playerB, community);

        let winner: 'PLAYER_A' | 'PLAYER_B' | 'TIE' = 'TIE';
        if (bestA.score > bestB.score) winner = 'PLAYER_A';
        else if (bestB.score > bestA.score) winner = 'PLAYER_B';

        return {
            playerA: { holeCards: playerA, bestHand: bestA },
            playerB: { holeCards: playerB, bestHand: bestB },
            communityCards: community,
            winner,
            winningBetTypes: [winner.toLowerCase()]
        };
    }

    private createDeck(): Card[] {
        const deck: Card[] = [];
        for (const suit of this.SUITS) {
            for (const value of this.VALUES) {
                deck.push({ value, suit, rank: this.VALUE_MAP[value] || parseInt(value) });
            }
        }
        return deck.sort(() => Math.random() - 0.5);
    }

    private evaluateBestHand(hole: Card[], community: Card[]) {
        const allCards = [...hole, ...community];
        // Simplified poker evaluation logic for prototype, would use a full C(7,5) in prod
        const sorted = allCards.sort((a, b) => b.rank - a.rank);
        return {
            score: sorted[0].rank * 100 + sorted[1].rank, // High card score for simplicity
            type: 'HIGH_CARD' as HandRank,
            cards: sorted.slice(0, 5)
        };
    }
}
