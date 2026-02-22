import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GameService } from '../game.service';
import { GameGateway } from '../game.gateway';

export interface DiceResult {
    dice1: number;
    dice2: number;
    total: number;
    outcome: 'down' | 'seven' | 'up';
}

@Injectable()
export class SevenUpDownEngine {
    private readonly logger = new Logger(SevenUpDownEngine.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gameService: GameService,
        private readonly gateway: GameGateway,
    ) { }

    /**
     * Roll two dice and determine the outcome
     */
    rollDice(): DiceResult {
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2;

        let outcome: 'down' | 'seven' | 'up';
        if (total < 7) {
            outcome = 'down';
        } else if (total === 7) {
            outcome = 'seven';
        } else {
            outcome = 'up';
        }

        return { dice1, dice2, total, outcome };
    }

    /**
     * Get winning bet types from dice result
     */
    getWinningBetTypes(result: DiceResult): string[] {
        switch (result.outcome) {
            case 'down':
                return ['down'];
            case 'seven':
                return ['seven'];
            case 'up':
                return ['up'];
        }
    }

    /**
     * Execute a complete game round
     */
    async executeRound(gameId: string) {
        // Get next round number
        const lastRound = await this.prisma.gameRound.findFirst({
            where: { gameId },
            orderBy: { roundNumber: 'desc' },
        });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;

        this.logger.log(`Starting 7 Up Down Round #${roundNumber}`);

        // Create round (opens betting)
        const round = await this.gameService.createRound(gameId, roundNumber);

        // Broadcast round created
        this.gateway.broadcastToGame(gameId, 'round:created', {
            roundId: round.id,
            roundNumber,
            status: 'BETTING',
            bettingEndsAt: round.bettingEndAt,
        });

        // Wait for betting window (get game config)
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
        });
        const bettingWindow = game?.bettingWindow || 30;

        // Schedule: Lock bets after betting window
        setTimeout(async () => {
            await this.lockBets(round.id, gameId);
        }, bettingWindow * 1000);

        return round;
    }

    /**
     * Lock bets and proceed to playing phase
     */
    private async lockBets(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'LOCKED');

        this.gateway.broadcastToGame(gameId, 'round:locked', {
            roundId,
            message: 'Bets are locked!',
        });

        this.logger.log(`Round ${roundId}: Bets locked, starting play phase`);

        // Wait 3 seconds for "animation", then reveal result
        setTimeout(async () => {
            await this.playRound(roundId, gameId);
        }, 3000);
    }

    /**
     * Play round: roll dice, determine result, settle bets
     */
    private async playRound(roundId: string, gameId: string) {
        await this.gameService.updateRoundStatus(roundId, 'PLAYING');

        // Roll dice
        const result = this.rollDice();

        this.logger.log(
            `Round ${roundId}: Dice rolled - ${result.dice1} + ${result.dice2} = ${result.total} (${result.outcome})`,
        );

        // Save result
        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: {
                result: result as any,
                status: 'RESULT',
                resultAt: new Date(),
            },
        });

        // Save detailed round result
        await this.prisma.roundResult.create({
            data: {
                gameRoundId: roundId,
                resultType: 'dice_roll',
                resultData: result as any,
            },
        });

        // Broadcast result
        this.gateway.broadcastToGame(gameId, 'round:result', {
            roundId,
            result,
        });

        // Settle bets
        const winningBetTypes = this.getWinningBetTypes(result);
        const settlement = await this.gameService.settleBets(
            roundId,
            winningBetTypes,
        );

        // Broadcast settlement
        this.gateway.broadcastToGame(gameId, 'round:settled', {
            roundId,
            result,
            settlement,
        });

        this.logger.log(
            `Round ${roundId}: Settled - ${settlement.totalBets} bets, payout: ₹${settlement.totalPayout}`,
        );

        // Wait a bit, then start next round
        setTimeout(async () => {
            await this.executeRound(gameId);
        }, 5000);
    }
}
