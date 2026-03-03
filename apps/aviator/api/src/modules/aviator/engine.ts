import { Logger } from './logger.js';
import type { PrismaClient } from '@prisma/client';
import type { Server as SocketIOServer } from 'socket.io';

export interface AviatorResult {
    crashPoint: number;
    duration: number;
    seed: string;
    hash: string;
}

export class AviatorEngine {
    private readonly logger = new Logger('AviatorEngine');
    private activeRounds: Map<string, { roundId: string; crashPoint: number; startTime: number; crashed: boolean }> = new Map();
    private currentMultiplier: number = 1.0;

    constructor(
        private readonly prisma: PrismaClient,
        private readonly io: SocketIOServer
    ) { }

    /**
     * Generate a provably fair crash point
     */
    generateCrashPoint(): { crashPoint: number; seed: string; hash: string } {
        const seed = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        const hash = this.simpleHash(seed);

        const rand = Math.random() * 100;
        let crashPoint: number;

        if (rand < 3) {
            crashPoint = 1.0;
        } else {
            crashPoint = Math.max(1.0, Math.floor((10000 / (100 - rand))) / 100);
        }

        crashPoint = Math.min(crashPoint, 100.0);

        return { crashPoint, seed, hash };
    }

    private simpleHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    private calculateDuration(crashPoint: number): number {
        return Math.floor(Math.log(crashPoint) * 5000) + 1000;
    }

    private getMultiplierAtTime(elapsedMs: number, maxMultiplier: number): number {
        // Multiplier formula: e^(t/5) where t is in seconds
        const t = elapsedMs / 5000;
        const multiplier = Math.exp(t);
        return Math.min(multiplier, maxMultiplier);
    }

    async startNewRound() {
        const lastRound = await this.prisma.gameRound.findFirst({
            orderBy: { roundNumber: 'desc' },
        });
        const roundNumber = (lastRound?.roundNumber || 0) + 1;

        const { crashPoint, seed, hash } = this.generateCrashPoint();

        const round = await this.prisma.gameRound.create({
            data: {
                roundNumber,
                crashPoint,
                seed,
                hash,
                status: 'BETTING',
                bettingEndAt: new Date(Date.now() + 10000) // 10s betting window
            }
        });

        this.io.emit('round:created', {
            roundId: round.id,
            roundNumber,
            status: 'BETTING',
            bettingEndsAt: round.bettingEndAt,
            hash,
        });

        this.logger.log(`Aviator Round #${roundNumber} created. Betting starts.`);

        setTimeout(async () => {
            await this.startFlight(round.id, crashPoint, seed, hash);
        }, 10000);
    }

    private async startFlight(roundId: string, crashPoint: number, seed: string, hash: string) {
        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: { status: 'FLYING' }
        });

        this.io.emit('aviator:takeoff', {
            roundId,
            message: 'Takeoff! 🛫',
        });

        const startTime = Date.now();
        const duration = this.calculateDuration(crashPoint);
        this.activeRounds.set('global', { roundId, crashPoint, startTime, crashed: false });

        const interval = setInterval(async () => {
            const elapsed = Date.now() - startTime;
            const multiplier = this.getMultiplierAtTime(elapsed, crashPoint);
            this.currentMultiplier = Math.round(multiplier * 100) / 100;

            if (elapsed >= duration || multiplier >= crashPoint) {
                clearInterval(interval);
                await this.crash(roundId, crashPoint, seed, hash, duration);
            } else {
                this.io.emit('aviator:multiplier', {
                    multiplier: this.currentMultiplier,
                    elapsed,
                });
            }
        }, 100);
    }

    private async crash(roundId: string, crashPoint: number, seed: string, hash: string, duration: number) {
        this.activeRounds.set('global', { roundId, crashPoint, startTime: 0, crashed: true });

        await this.prisma.gameRound.update({
            where: { id: roundId },
            data: {
                status: 'CRASHED',
                resultAt: new Date(),
            },
        });

        this.io.emit('aviator:crash', {
            roundId,
            crashPoint,
            seed,
        });

        this.logger.log(`Aviator Round ${roundId} CRASHED at ${crashPoint}x`);

        // Settle losing bets
        await this.prisma.bet.updateMany({
            where: { roundId, status: 'PLACED' },
            data: { status: 'LOST', payout: 0, settledAt: new Date() }
        });

        this.activeRounds.delete('global');

        setTimeout(async () => {
            await this.startNewRound();
        }, 5000);
    }

    getCurrentMultiplier(): number {
        return this.currentMultiplier;
    }
}
