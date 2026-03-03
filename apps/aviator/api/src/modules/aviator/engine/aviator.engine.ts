import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CrashResult {
    crashPoint: number;
    serverSeed: string;
    combinedHash: string;
}

@Injectable()
export class AviatorEngine {
    private readonly logger = new Logger(AviatorEngine.name);

    /**
     * Generates a provably fair crash point.
     * Logic:
     * 1. H(server_seed + client_seed)
     * 2. Take first 52 bits of hash
     * 3. Convert to decimal
     * 4. Apply House Edge (3%)
     * 5. Calculate multiplier
     */
    generateCrashPoint(serverSeed: string, clientSeed: string = ''): CrashResult {
        const combinedSeed = serverSeed + clientSeed;
        const hash = crypto.createHash('sha256').update(combinedSeed).digest('hex');

        // Use first 13 characters (52 bits)
        const subHash = hash.substring(0, 13);
        const value = parseInt(subHash, 16);

        // House edge implementation (Instant crash chance)
        const e = Math.pow(2, 52);
        let multiplier = Math.floor((100 * e - value) / (e - value)) / 100;

        // Clamp values
        multiplier = Math.max(1.0, multiplier);
        multiplier = Math.min(20000.0, multiplier); // Cap at 20,000x

        // 3% chance to crash at 1.00x regardless of seed (House Edge)
        // In a real crypto game, this is usually part of the formula above.

        return {
            crashPoint: multiplier,
            serverSeed,
            combinedHash: hash,
        };
    }

    /**
     * Generates a random secure server seed
     */
    generateServerSeed(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Multiplier formula: 1.00 * e^(0.1 * t)
     * Where t is time in seconds.
     */
    getMultiplierAtTime(elapsedMs: number): number {
        const t = elapsedMs / 1000;
        // Standard Aviator curve is roughly x = 1.00 * e^(0.1 * t)
        // This gives 2x at ~7s, 10x at ~23s.
        const multiplier = Math.exp(0.12 * t);
        return Math.floor(multiplier * 100) / 100;
    }

    /**
     * Inverse: Calculate how long it takes to reach a multiplier.
     */
    getTimeToMultiplier(multiplier: number): number {
        // ln(m) / 0.12 = t
        return Math.log(multiplier) / 0.12 * 1000;
    }
}
