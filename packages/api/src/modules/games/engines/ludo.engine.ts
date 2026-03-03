import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GameService } from '../game.service';
import { GameGateway } from '../game.gateway';

export type LudoColor = 'red' | 'blue' | 'green' | 'yellow';

interface Piece {
    id: number;
    pos: number; // 0 = base, 1-51 = path, 52-57 = home path, 58 = home
}

interface Player {
    color: LudoColor;
    pieces: Piece[];
    isFinished: boolean;
}

export interface LudoResult {
    winner: LudoColor;
    rankings: LudoColor[];
    history: any[];
}

@Injectable()
export class LudoEngine {
    private readonly logger = new Logger(LudoEngine.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => GameService))
        private readonly gameService: GameService,
        @Inject(forwardRef(() => GameGateway))
        private readonly gateway: GameGateway,
    ) { }

    /**
     * Simulate a Ludo race between 4 colors
     */
    simulateGame(): LudoResult {
        const colors: LudoColor[] = ['red', 'blue', 'green', 'yellow'];
        const players: Player[] = colors.map(color => ({
            color,
            pieces: Array.from({ length: 4 }, (_, i) => ({ id: i, pos: 0 })),
            isFinished: false,
        }));

        const rankings: LudoColor[] = [];
        let currentPlayerIndex = Math.floor(Math.random() * 4);
        let turns = 0;
        const maxTurns = 2000;

        while (rankings.length < 3 && turns < maxTurns) {
            turns++;
            const player = players[currentPlayerIndex];
            if (player.isFinished) {
                currentPlayerIndex = (currentPlayerIndex + 1) % 4;
                continue;
            }

            const dice = Math.floor(Math.random() * 6) + 1;
            let bonusTurn = false;

            const pieces = player.pieces;
            const piecesInBase = pieces.filter(p => p.pos === 0);
            const piecesOnBoard = pieces.filter(p => p.pos > 0 && p.pos < 58);

            if (dice === 6 && piecesInBase.length > 0) {
                // Prioritize bringing a piece out
                piecesInBase[0].pos = 1;
                bonusTurn = true;
            } else if (piecesOnBoard.length > 0) {
                // Move the piece closest to home that can move
                const eligible = piecesOnBoard.filter(p => p.pos + dice <= 58);
                if (eligible.length > 0) {
                    const best = eligible.sort((a, b) => b.pos - a.pos)[0];
                    best.pos += dice;

                    // Bonus turn for reaching home (pos 58)
                    if (best.pos === 58) {
                        bonusTurn = true;
                    }

                    // Check for cutting (very simplified: if any opponent piece is at this global pos)
                    // Note: In real Ludo, pos is relative. This is a simulation.
                    // We'll skip complex cutting for now to keep simulation fast.
                }

                if (dice === 6) bonusTurn = true;
            }

            // Check if player finished
            if (pieces.every(p => p.pos === 58)) {
                player.isFinished = true;
                if (!rankings.includes(player.color)) {
                    rankings.push(player.color);
                }
            }

            if (!bonusTurn) {
                currentPlayerIndex = (currentPlayerIndex + 1) % 4;
            }
        }

        // Add remaining players in order of their progress
        const remainingColors = colors.filter(c => !rankings.includes(c));
        const remainingPlayers = remainingColors.map(c => players.find(p => p.color === c)!);
        const sortedRemaining = remainingPlayers.sort((a, b) => {
            const sumA = a.pieces.reduce((sum, p) => sum + p.pos, 0);
            const sumB = b.pieces.reduce((sum, p) => sum + p.pos, 0);
            return sumB - sumA;
        });

        for (const p of sortedRemaining) {
            rankings.push(p.color);
        }

        return {
            winner: rankings[0],
            rankings,
            history: [] // We could populate this for Replay features
        };
    }

    async executeRound(gameId: string) {
        // Prevent concurrent execution for the same game
        const activeRound = await this.prisma.gameRound.findFirst({
            where: {
                gameId,
                status: { in: ['WAITING', 'BETTING', 'LOCKED', 'PLAYING'] }
            },
        });

        if (activeRound) {
            this.logger.warn(`Game ${gameId} already has an active round ${activeRound.id}. skipping.`);
            return activeRound;
        }

        const lastRound = await this.prisma.gameRound.findFirst({
            where: { gameId },
            orderBy: { roundNumber: 'desc' },
        });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;

        this.logger.log(`Starting Ludo Round #${roundNumber}`);

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
        try {
            await this.gameService.updateRoundStatus(roundId, 'LOCKED');

            this.gateway.broadcastToGame(gameId, 'round:locked', {
                roundId,
                message: 'Bets are locked! Rolling dice...',
            });

            this.logger.log(`Ludo Round ${roundId}: Bets locked`);

            setTimeout(async () => {
                await this.playRound(roundId, gameId);
            }, 3000);
        } catch (error) {
            this.logger.error(`Failed to lock bets for round ${roundId}: ${error.message}`);
        }
    }

    private async playRound(roundId: string, gameId: string) {
        try {
            await this.gameService.updateRoundStatus(roundId, 'PLAYING');

            // Simulate the game result
            const result = this.simulateGame();

            this.logger.log(
                `Ludo Round ${roundId}: Result generated - Winner: ${result.winner.toUpperCase()}`,
            );

            // Save result to DB
            await this.prisma.gameRound.update({
                where: { id: roundId },
                data: {
                    result: result as any,
                    status: 'RESULT',
                    resultAt: new Date(),
                },
            });

            // Save detailed result record
            await this.prisma.roundResult.create({
                data: {
                    gameRoundId: roundId,
                    resultType: 'ludo_race',
                    resultData: result as any,
                },
            });

            // Broadcast result to players
            this.gateway.broadcastToGame(gameId, 'round:result', {
                roundId,
                result,
            });

            // Settle bets for the winner color
            // Winning bet types are just the winner color slug
            const winningBetTypes = [result.winner];
            const settlement = await this.gameService.settleBets(roundId, winningBetTypes);

            // Broadcast final settlement
            this.gateway.broadcastToGame(gameId, 'round:settled', {
                roundId,
                result,
                settlement,
            });

            this.logger.log(
                `Ludo Round ${roundId}: Settled - ${settlement.totalBets} bets, payout: ₹${settlement.totalPayout}`,
            );

            // Schedule next round after a pause
            setTimeout(async () => {
                await this.executeRound(gameId);
            }, 5000);
        } catch (error) {
            this.logger.error(`Failed to play/settle round ${roundId}: ${error.message}`);
        }
    }
}
