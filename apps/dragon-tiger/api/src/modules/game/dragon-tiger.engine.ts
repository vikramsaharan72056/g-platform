import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface Card {
    value: string;
    suit: 'HEARTS' | 'DIAMONDS' | 'SPADES' | 'CLUBS';
    rank: number; // 1-13
}

export interface DragonTigerRoundResult {
    dragonCard: Card;
    tigerCard: Card;
    winner: 'DRAGON' | 'TIGER' | 'TIE';
    winningBetTypes: string[];
}

@Injectable()
export class DragonTigerEngine {
    private readonly logger = new Logger(DragonTigerEngine.name);
    private readonly suits = ['HEARTS', 'DIAMONDS', 'SPADES', 'CLUBS'] as const;
    private readonly ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    generateResult(): DragonTigerRoundResult {
        const dragonCard = this.drawCard();
        let tigerCard = this.drawCard();

        // Ensure no duplicate card in a single deck draw simulation
        while (dragonCard.value === tigerCard.value && dragonCard.suit === tigerCard.suit) {
            tigerCard = this.drawCard();
        }

        let winner: 'DRAGON' | 'TIGER' | 'TIE';
        if (dragonCard.rank > tigerCard.rank) {
            winner = 'DRAGON';
        } else if (tigerCard.rank > dragonCard.rank) {
            winner = 'TIGER';
        } else {
            winner = 'TIE';
        }

        const winningBetTypes = this.calculateWinningBets(dragonCard, tigerCard, winner);

        return {
            dragonCard,
            tigerCard,
            winner,
            winningBetTypes,
        };
    }

    private drawCard(): Card {
        const suit = this.suits[Math.floor(Math.random() * this.suits.length)];
        const rankIndex = Math.floor(Math.random() * this.ranks.length);
        const value = this.ranks[rankIndex];
        return {
            value,
            suit,
            rank: rankIndex + 1,
        };
    }

    private calculateWinningBets(dragon: Card, tiger: Card, winner: string): string[] {
        const wins: string[] = [winner.toLowerCase()];

        // Side Bets - Dragon
        if (dragon.rank > 7) wins.push('dragon_big');
        if (dragon.rank < 7) wins.push('dragon_small');
        if (dragon.rank % 2 === 0) wins.push('dragon_even');
        else wins.push('dragon_odd');
        if (dragon.suit === 'HEARTS' || dragon.suit === 'DIAMONDS') wins.push('dragon_red');
        else wins.push('dragon_black');

        // Side Bets - Tiger
        if (tiger.rank > 7) wins.push('tiger_big');
        if (tiger.rank < 7) wins.push('tiger_small');
        if (tiger.rank % 2 === 0) wins.push('tiger_even');
        else wins.push('tiger_odd');
        if (tiger.suit === 'HEARTS' || tiger.suit === 'DIAMONDS') wins.push('tiger_red');
        else wins.push('tiger_black');

        return wins;
    }
}
