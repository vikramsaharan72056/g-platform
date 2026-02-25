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
};

const RANK_POINTS: Record<string, number> = {
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

export interface ParsedCard {
  card: string;
  rank: string;
  suit: string;
  rankValue: number;
  points: number;
}

export function createDeck(deckCount = 1): string[] {
  const cards: string[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push(`${rank}${suit}`);
      }
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

export function parseCard(card: string): ParsedCard {
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
  };
}
