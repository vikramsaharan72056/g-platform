const SUITS = ['S', 'H', 'D', 'C'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

const RANK_VALUE: Record<string, number> = {
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
    PJ: 0, // Printed Joker
};

const RANK_POINTS: Record<string, number> = {
    A: 10, // A is usually 10 points in high-stakes Rummy if not in sequence
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
    PJ: 0,
};

export interface ParsedCard {
    card: string;
    rank: string;
    suit: string;
    rankValue: number;
    points: number;
    isJoker: boolean;
}

export function createDeck(deckCount = 1, includePrintedJokers = true): string[] {
    const cards: string[] = [];
    for (let d = 0; d < deckCount; d++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                cards.push(`${rank}${suit}`);
            }
        }
        if (includePrintedJokers) {
            cards.push('PJ1'); // Printed Joker 1
            cards.push('PJ2'); // Printed Joker 2
        }
    }
    return cards;
}

export function shuffle(cards: string[]): string[] {
    const out = [...cards];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export function parseCard(card: string, wildJokerRank: string | null = null): ParsedCard {
    if (card.startsWith('PJ')) {
        return {
            card,
            rank: 'PJ',
            suit: 'J',
            rankValue: 0,
            points: 0,
            isJoker: true,
        };
    }

    const suit = card.slice(-1);
    const rank = card.slice(0, -1);
    if (!RANK_VALUE[rank] || !SUITS.includes(suit as (typeof SUITS)[number])) {
        throw new Error(`Invalid card ${card}`);
    }

    return {
        card,
        rank,
        suit,
        rankValue: RANK_VALUE[rank],
        points: RANK_POINTS[rank],
        isJoker: rank === wildJokerRank,
    };
}
