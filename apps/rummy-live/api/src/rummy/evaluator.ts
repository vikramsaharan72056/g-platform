import { parseCard } from './cards.js';
import type { HandEvaluation } from './types.js';

function cardKey(card: string): string {
  return card;
}

interface EvaluateOptions {
  jokerCard?: string | null;
}

function getJokerRank(jokerCard?: string | null): string | null {
  if (!jokerCard) return null;
  return parseCard(jokerCard).rank;
}

function isJokerCard(card: string, jokerRank: string | null): boolean {
  if (!jokerRank) return false;
  return parseCard(card).rank === jokerRank;
}

export function evaluateHand(cards: string[], options: EvaluateOptions = {}): HandEvaluation {
  if (cards.length !== 13) {
    return {
      isValid: false,
      pureSequences: 0,
      sequences: 0,
      sets: 0,
      deadwood: 80,
      score: 80,
    };
  }

  const jokerRank = getJokerRank(options.jokerCard);
  const jokerCards = cards.filter((c) => isJokerCard(c, jokerRank));
  const nonJokerCards = cards.filter((c) => !isJokerCard(c, jokerRank));

  const used = new Set<string>();
  let pureSequences = 0;
  let sequences = 0;
  let sets = 0;
  let jokersAvailable = jokerCards.length;

  const parsed = nonJokerCards.map((c) => parseCard(c));
  const bySuit = new Map<string, typeof parsed>();

  for (const p of parsed) {
    const bucket = bySuit.get(p.suit) || [];
    bucket.push(p);
    bySuit.set(p.suit, bucket);
  }

  for (const suitCards of bySuit.values()) {
    const sorted = [...suitCards].sort((a, b) => a.rankValue - b.rankValue);
    let i = 0;
    while (i < sorted.length) {
      const run = [sorted[i]];
      let j = i + 1;

      while (
        j < sorted.length &&
        sorted[j].rankValue === run[run.length - 1].rankValue + 1
      ) {
        run.push(sorted[j]);
        j++;
      }

      if (run.length >= 3) {
        pureSequences++;
        sequences++;
        run.forEach((c) => used.add(cardKey(c.card)));
        i = j;
      } else {
        i++;
      }
    }
  }

  // Build impure sequences by spending jokers to fill gaps.
  for (const suitCards of bySuit.values()) {
    const remaining = suitCards
      .filter((c) => !used.has(cardKey(c.card)))
      .sort((a, b) => a.rankValue - b.rankValue);

    let idx = 0;
    while (idx < remaining.length) {
      const runCards: typeof remaining = [remaining[idx]];
      let currentRank = remaining[idx].rankValue;
      let spentJokers = 0;
      let j = idx + 1;

      while (j < remaining.length) {
        const next = remaining[j];
        if (used.has(cardKey(next.card))) {
          j++;
          continue;
        }
        const gap = next.rankValue - currentRank - 1;
        if (gap < 0) {
          j++;
          continue;
        }
        if (spentJokers + gap <= jokersAvailable) {
          spentJokers += gap;
          runCards.push(next);
          currentRank = next.rankValue;
          j++;
        } else {
          break;
        }
      }

      const lengthWithJokers = runCards.length + Math.min(jokersAvailable - spentJokers, 2);
      if (lengthWithJokers >= 3 && runCards.length >= 1) {
        runCards.forEach((c) => used.add(cardKey(c.card)));
        const jokersNeeded = Math.max(0, 3 - runCards.length) + spentJokers;
        jokersAvailable -= jokersNeeded;
        sequences++;
      }
      idx++;
      if (jokersAvailable <= 0) break;
    }
  }

  const remainingForSets = parsed.filter((p) => !used.has(cardKey(p.card)));
  const byRank = new Map<string, typeof parsed>();
  for (const p of remainingForSets) {
    const bucket = byRank.get(p.rank) || [];
    bucket.push(p);
    byRank.set(p.rank, bucket);
  }

  for (const rankCards of byRank.values()) {
    const bySuitUnique = new Map(rankCards.map((c) => [c.suit, c]));
    const need = Math.max(0, 3 - bySuitUnique.size);
    if (bySuitUnique.size >= 3 || (need > 0 && jokersAvailable >= need)) {
      sets++;
      Array.from(bySuitUnique.values())
        .slice(0, 3)
        .forEach((c) => used.add(cardKey(c.card)));
      jokersAvailable -= need;
    }
  }

  const deadwood = parsed
    .filter((p) => !used.has(cardKey(p.card)))
    .reduce((sum, c) => sum + c.points, 0);

  const isValid = pureSequences >= 1 && sequences >= 2;
  const score = isValid ? deadwood : Math.min(80, deadwood + 40);

  return {
    isValid,
    pureSequences,
    sequences,
    sets,
    deadwood,
    score,
  };
}
