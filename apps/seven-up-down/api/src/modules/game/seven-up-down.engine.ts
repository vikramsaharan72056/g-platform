import { Injectable, Logger } from '@nestjs/common';

export interface SevenUpDownResult {
    dice1: number;
    dice2: number;
    total: number;
    outcome: 'up' | 'down' | 'seven';
    winningBetTypes: string[];
}

@Injectable()
export class SevenUpDownEngine {
    private readonly logger = new Logger(SevenUpDownEngine.name);

    generateResult(): SevenUpDownResult {
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2;

        let outcome: 'up' | 'down' | 'seven';
        if (total < 7) outcome = 'down';
        else if (total > 7) outcome = 'up';
        else outcome = 'seven';

        const winningBetTypes = [outcome];

        // Additional side bets can be added here (e.g., specific doubles, odd/even total)
        if (total % 2 === 0) winningBetTypes.push('even');
        else winningBetTypes.push('odd');

        return {
            dice1,
            dice2,
            total,
            outcome,
            winningBetTypes,
        };
    }
}
