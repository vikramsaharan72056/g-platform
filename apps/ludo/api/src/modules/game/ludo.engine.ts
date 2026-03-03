import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LudoService } from './ludo.service.js';
import { LudoGateway } from './ludo.gateway.js';

export type LudoColor = 'red' | 'blue' | 'green' | 'yellow';

interface Piece {
    id: number;
    pos: number;
}

interface Player {
    color: LudoColor;
    pieces: Piece[];
    isFinished: boolean;
}

export interface LudoResult {
    winner: LudoColor;
    rankings: LudoColor[];
}

@Injectable()
export class LudoEngine {
    private readonly logger = new Logger(LudoEngine.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => LudoService))
        private readonly ludoService: LudoService,
        @Inject(forwardRef(() => LudoGateway))
        private readonly gateway: LudoGateway,
    ) { }

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
        const maxTurns = 1500;

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
                piecesInBase[0].pos = 1;
                bonusTurn = true;
            } else if (piecesOnBoard.length > 0) {
                const eligible = piecesOnBoard.filter(p => p.pos + dice <= 58);
                if (eligible.length > 0) {
                    const best = eligible.sort((a, b) => b.pos - a.pos)[0];
                    best.pos += dice;
                    if (best.pos === 58) bonusTurn = true;
                }
                if (dice === 6) bonusTurn = true;
            }

            if (pieces.every(p => p.pos === 58)) {
                player.isFinished = true;
                if (!rankings.includes(player.color)) rankings.push(player.color);
            }

            if (!bonusTurn) currentPlayerIndex = (currentPlayerIndex + 1) % 4;
        }

        const remainingColors = colors.filter(c => !rankings.includes(c));
        const remainingPlayers = remainingColors.map(c => players.find(p => p.color === c)!);
        const sortedRemaining = remainingPlayers.sort((a, b) => {
            const sumA = a.pieces.reduce((sum, p) => sum + p.pos, 0);
            const sumB = b.pieces.reduce((sum, p) => sum + p.pos, 0);
            return sumB - sumA;
        });

        for (const p of sortedRemaining) rankings.push(p.color);

        return { winner: rankings[0], rankings };
    }

    async startRoundLoop() {
        while (true) {
            try {
                await this.executeRound();
            } catch (e) {
                this.logger.error('Error in Ludo round loop', e);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    private async executeRound() {
        // 1. Betting Phase
        const lastRound = await this.prisma.gameRound.findFirst({ orderBy: { roundNumber: 'desc' } });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;
        const bettingWindow = 20; // seconds

        const round = await this.prisma.gameRound.create({
            data: {
                roundNumber,
                status: 'BETTING',
                bettingEndAt: new Date(Date.now() + bettingWindow * 1000),
            }
        });

        this.gateway.broadcast('round:created', {
            roundId: round.id,
            roundNumber,
            status: 'BETTING',
            bettingEndsAt: round.bettingEndAt,
        });

        await new Promise(r => setTimeout(r, bettingWindow * 1000));

        // 2. Lock Phase
        await this.prisma.gameRound.update({
            where: { id: round.id },
            data: { status: 'LOCKED' }
        });
        this.gateway.broadcast('round:locked', { roundId: round.id });

        await new Promise(r => setTimeout(r, 2000));

        // 3. Playing Phase
        await this.prisma.gameRound.update({
            where: { id: round.id },
            data: { status: 'PLAYING' }
        });

        const result = this.simulateGame();

        await new Promise(r => setTimeout(r, 5000)); // Animation time

        // 4. Result/Settlement Phase
        await this.prisma.gameRound.update({
            where: { id: round.id },
            data: {
                status: 'RESULT',
                resultData: JSON.stringify(result)
            }
        });

        this.gateway.broadcast('round:result', { roundId: round.id, result });

        const settlement = await this.ludoService.settleBets(round.id, result.winner);

        this.gateway.broadcast('round:settled', {
            roundId: round.id,
            result,
            settlement
        });

        await new Promise(r => setTimeout(r, 10000)); // Gap between rounds
    }
}
