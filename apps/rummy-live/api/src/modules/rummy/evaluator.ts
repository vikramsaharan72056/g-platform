import { parseCard } from './cards.js';
import type { HandEvaluation } from './types.js';

interface GroupEvaluation {
    type: 'PURE_SEQUENCE' | 'IMPURE_SEQUENCE' | 'SET' | 'INVALID';
    cards: string[];
    points: number;
}

export function evaluateHand(cards: string[], options: { jokerCard?: string | null } = {}): HandEvaluation {
    if (cards.length === 14) {
        // Find best 13-card combination by trying each card as the "finish" card
        let best: HandEvaluation | null = null;
        for (let i = 0; i < 14; i++) {
            const subhand = [...cards];
            subhand.splice(i, 1);
            const res = evaluateHand(subhand, options);
            if (!best || res.score < best.score || (res.isValid && !best.isValid)) {
                best = res;
            }
        }
        return best!;
    }

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

    const wildJokerRank = options.jokerCard ? parseCard(options.jokerCard).rank : null;

    // In a real market-grade app, we might receive groups from the client.
    // If not, we need an algorithm to find the BEST (lowest score) arrangement.
    // For now, we'll implement a more robust greedy algorithm that prioritizes Pure Sequences.

    let bestEval: HandEvaluation = {
        isValid: false,
        pureSequences: 0,
        sequences: 0,
        sets: 0,
        deadwood: 80,
        score: 80,
    };

    // Helper to check if a group is a pure sequence
    const isPureSequence = (group: string[]): boolean => {
        if (group.length < 3) return false;
        const parsed = group.map(c => parseCard(c, wildJokerRank));
        const suit = parsed[0].suit;
        // Strict: No Jokers (Wild or Printed) in a Pure Sequence
        if (parsed.some(c => c.suit !== suit || c.isJoker || c.rank === 'PJ')) return false;

        // Sort by rank value
        const sorted = parsed.sort((a, b) => a.rankValue - b.rankValue);

        // Check for consecutive ranks
        const isConsecutive = (list: typeof sorted) => {
            for (let i = 0; i < list.length - 1; i++) {
                if (list[i + 1].rankValue !== list[i].rankValue + 1) return false;
            }
            return true;
        };

        if (isConsecutive(sorted)) return true;

        // Check for High Ace (Q-K-A)
        // If has A (rank 1), try treating it as rank 14
        if (sorted.some(c => c.rank === 'A')) {
            const highAceSorted = sorted.map(c => ({
                ...c,
                val: c.rank === 'A' ? 14 : c.rankValue
            })).sort((a, b) => a.val - b.val);

            for (let i = 0; i < highAceSorted.length - 1; i++) {
                if (highAceSorted[i + 1].val !== highAceSorted[i].val + 1) return false;
            }
            return true;
        }

        return false;
    };

    // Helper to check if a group is an impure sequence (using jokers)
    const isImpureSequence = (group: string[], wildRank: string | null): boolean => {
        if (group.length < 3) return false;
        const parsed = group.map(c => ({ ...parseCard(c, wildRank) }));
        const jokers = parsed.filter(c => c.isJoker || c.rank === 'PJ');
        const normals = parsed.filter(c => !c.isJoker && c.rank !== 'PJ');

        if (normals.length === 0) return true;

        const suit = normals[0].suit;
        if (normals.some(c => c.suit !== suit)) return false;

        // Simple check: can jokers fill the gaps?
        // Let's try Ace as Low (1) and Ace as High (14)
        const checkSequenceWithGaps = (vals: number[]) => {
            const sorted = vals.sort((a, b) => a - b);
            let gaps = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
                const diff = sorted[i + 1] - sorted[i];
                if (diff === 0) return false; // Duplicates not allowed in sequence
                gaps += (diff - 1);
            }
            return gaps <= jokers.length;
        };

        const normalValsLow = normals.map(c => c.rankValue);
        if (checkSequenceWithGaps(normalValsLow)) return true;

        if (normals.some(c => c.rank === 'A')) {
            const normalValsHigh = normals.map(c => c.rank === 'A' ? 14 : c.rankValue);
            if (checkSequenceWithGaps(normalValsHigh)) return true;
        }

        return false;
    };

    // Helper to check if a group is a set
    const isSet = (group: string[], wildRank: string | null): boolean => {
        if (group.length < 3 || group.length > 4) return false;
        const parsed = group.map(c => ({ ...parseCard(c, wildRank) }));
        const jokers = parsed.filter(c => c.isJoker || c.rank === 'PJ');
        const normals = parsed.filter(c => !c.isJoker && c.rank !== 'PJ');

        if (normals.length === 0) return true;

        const rank = normals[0].rank;
        const suits = new Set(normals.map(c => c.suit));

        return normals.every(c => c.rank === rank) && suits.size === normals.length;
    };

    // For 13 cards, we can't easily brute force all partitions.
    // But we can use the existing greedy logic and improve it.

    const jokerCards = cards.filter(c => {
        const p = parseCard(c, wildJokerRank);
        return p.isJoker || p.rank === 'PJ';
    });
    const normalCards = cards.filter(c => {
        const p = parseCard(c, wildJokerRank);
        return !(p.isJoker || p.rank === 'PJ');
    });

    const used = new Set<string>();
    let pSeqs = 0;
    let iSeqs = 0;
    let sSets = 0;
    let jokersLeft = jokerCards.length;

    // 1. Find Pure Sequences first (Mandatory for valid declare)
    const bySuit: Record<string, string[]> = {};
    normalCards.forEach(c => {
        const p = parseCard(c);
        if (!bySuit[p.suit]) bySuit[p.suit] = [];
        bySuit[p.suit].push(c);
    });

    for (const suit in bySuit) {
        const sorted = bySuit[suit].sort((a, b) => parseCard(a).rankValue - parseCard(b).rankValue);

        // Try to find the longest pure sequence first
        let i = 0;
        while (i < sorted.length) {
            let run = [sorted[i]];
            let j = i + 1;
            while (j < sorted.length) {
                const currentRank = parseCard(sorted[j - 1]).rankValue;
                const nextRank = parseCard(sorted[j]).rankValue;
                if (nextRank === currentRank + 1) {
                    run.push(sorted[j]);
                    j++;
                } else if (nextRank === currentRank) {
                    j++; // skip duplicate for sequence
                } else {
                    break;
                }
            }

            // Also check for Q-K-A tail if A exists
            if (sorted.some(c => parseCard(c).rank === 'A') && !run.some(c => parseCard(c).rank === 'A')) {
                const hasQ = run.some(c => parseCard(c).rank === 'Q');
                const hasK = run.some(c => parseCard(c).rank === 'K');
                if (hasQ && hasK) {
                    const ace = sorted.find(c => parseCard(c).rank === 'A')!;
                    run.push(ace);
                }
            }

            if (run.length >= 3 && isPureSequence(run)) {
                pSeqs++;
                run.forEach(c => used.add(c));
                i += run.length;
            } else {
                i++;
            }
        }
    }

    // 2. Find Impure Sequences using remaining cards and jokers
    const remainingNormals = normalCards.filter(c => !used.has(c));
    const remainingBySuit: Record<string, string[]> = {};
    remainingNormals.forEach(c => {
        const p = parseCard(c);
        if (!remainingBySuit[p.suit]) remainingBySuit[p.suit] = [];
        remainingBySuit[p.suit].push(c);
    });

    for (const suit in remainingBySuit) {
        const sorted = remainingBySuit[suit].sort((a, b) => parseCard(a).rankValue - parseCard(b).rankValue);
        // This is complex to find optimal impure sequences. 
        // Let's look for "potential" sequences that need minimal jokers.
        // Simplified: if we have a pair with a gap of 1 or 2, use a joker.
        let i = 0;
        while (i < sorted.length && jokersLeft > 0) {
            // try to build a 3-card sequence starting at i
            const current = sorted[i];
            const next = sorted.find((c, idx) => idx > i && parseCard(c).rankValue === parseCard(current).rankValue + 1);
            const nextNext = sorted.find((c, idx) => idx > i && parseCard(c).rankValue === parseCard(current).rankValue + 2);

            if (next && jokersLeft >= 1) {
                iSeqs++;
                jokersLeft--;
                used.add(current);
                used.add(next);
                // Move i past these
                i++;
            } else if (nextNext && jokersLeft >= 1) {
                iSeqs++;
                jokersLeft--;
                used.add(current);
                used.add(nextNext);
                i++;
            } else if (jokersLeft >= 2) {
                // single card + 2 jokers
                iSeqs++;
                jokersLeft -= 2;
                used.add(current);
                i++;
            } else {
                i++;
            }
        }
    }

    // 3. Find Sets
    const forSets = remainingNormals.filter(c => !used.has(c));
    const byRank: Record<string, string[]> = {};
    forSets.forEach(c => {
        const p = parseCard(c);
        if (!byRank[p.rank]) byRank[p.rank] = [];
        byRank[p.rank].push(c);
    });

    for (const rank in byRank) {
        const group = byRank[rank];
        const uniqueSuits = Array.from(new Set(group.map(c => parseCard(c).suit)));
        if (uniqueSuits.length >= 3) {
            sSets++;
            group.forEach(c => used.add(c));
        } else if (uniqueSuits.length + jokersLeft >= 3) {
            sSets++;
            jokersLeft -= (3 - uniqueSuits.length);
            group.forEach(c => used.add(c));
        }
    }

    const deadwoodCards = normalCards.filter(c => !used.has(c));
    const deadwood = deadwoodCards.reduce((sum, c) => sum + parseCard(c).points, 0);

    const totalSeqs = pSeqs + iSeqs;
    const isValid = pSeqs >= 1 && totalSeqs >= 2;

    // Score calculation:
    // If valid, score is just weight of remaining cards.
    // If invalid, standard Rummy penalty is often 80 points.
    const score = isValid ? deadwood : 80;

    return {
        isValid,
        pureSequences: pSeqs,
        sequences: totalSeqs,
        sets: sSets,
        deadwood,
        score,
    };
}
