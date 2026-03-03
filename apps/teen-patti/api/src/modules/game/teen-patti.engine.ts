import { Injectable, Logger } from '@nestjs/common';

export interface TeenPattiCard {
    value: string;
    suit: string;
    rank: number;
}

export interface HandRanking {
    score: number;
    type: 'TRAIL' | 'PURE_SEQUENCE' | 'SEQUENCE' | 'COLOR' | 'PAIR' | 'HIGH_CARD';
}

@Injectable()
export class TeenPattiEngine {
    private readonly logger = new Logger(TeenPattiEngine.name);

    /**
     * Evaluates a 3-card hand and returns a ranking score.
     * Higher score = Better hand.
     */
    evaluateHand(cards: TeenPattiCard[]): HandRanking {
        const sorted = [...cards].sort((a, b) => b.rank - a.rank);
        const ranks = sorted.map(c => c.rank);
        const suits = sorted.map(c => c.suit);

        const isTrail = ranks[0] === ranks[1] && ranks[1] === ranks[2];
        const isColor = suits[0] === suits[1] && suits[1] === suits[2];

        const isSequence = (ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1) ||
            (ranks[0] === 13 && ranks[1] === 12 && ranks[2] === 1); // A-K-Q or 3-2-A logic

        if (isTrail) return { score: 600 + ranks[0], type: 'TRAIL' };
        if (isColor && isSequence) return { score: 500 + ranks[0], type: 'PURE_SEQUENCE' };
        if (isSequence) return { score: 400 + ranks[0], type: 'SEQUENCE' };
        if (isColor) return { score: 300 + ranks[0], type: 'COLOR' };

        const isPair = ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2];
        if (isPair) {
            const pairRank = ranks[1]; // Middle card is always part of the pair if it exists
            return { score: 200 + pairRank, type: 'PAIR' };
        }

        return { score: 100 + ranks[0], type: 'HIGH_CARD' };
    }
}
