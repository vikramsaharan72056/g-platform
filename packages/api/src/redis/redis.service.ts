import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private client: Redis;
    private readonly logger = new Logger(RedisService.name);
    private connected = false;

    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        const url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
        this.client = new Redis(url, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 5) {
                    this.logger.warn('Redis connection failed after 5 attempts — running without cache');
                    return null; // stop retrying
                }
                return Math.min(times * 200, 2000);
            },
            lazyConnect: true,
        });

        this.client.on('connect', () => {
            this.connected = true;
            this.logger.log('Redis connected');
        });

        this.client.on('error', (err) => {
            this.connected = false;
            this.logger.warn(`Redis error: ${err.message}`);
        });

        this.client.on('close', () => {
            this.connected = false;
        });

        // Attempt connection (non-blocking)
        this.client.connect().catch(() => {
            this.logger.warn('Redis not available — operating without cache');
        });
    }

    onModuleDestroy() {
        this.client?.disconnect();
    }

    get isConnected(): boolean {
        return this.connected;
    }

    // ======================== LOW-LEVEL ========================

    async get(key: string): Promise<string | null> {
        if (!this.connected) return null;
        try {
            return await this.client.get(key);
        } catch {
            return null;
        }
    }

    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (!this.connected) return;
        try {
            if (ttlSeconds) {
                await this.client.set(key, value, 'EX', ttlSeconds);
            } else {
                await this.client.set(key, value);
            }
        } catch {
            // silent — cache is optional
        }
    }

    async del(key: string): Promise<void> {
        if (!this.connected) return;
        try {
            await this.client.del(key);
        } catch { }
    }

    async incr(key: string): Promise<number> {
        if (!this.connected) return 0;
        try {
            return await this.client.incr(key);
        } catch {
            return 0;
        }
    }

    async decr(key: string): Promise<number> {
        if (!this.connected) return 0;
        try {
            const val = await this.client.decr(key);
            return Math.max(0, val); // never negative
        } catch {
            return 0;
        }
    }

    // ======================== GAME STATE ========================

    /**
     * Cache current round data for a game (TTL 120s auto-expire)
     */
    async setCurrentRound(gameId: string, roundData: any): Promise<void> {
        await this.set(
            `game:${gameId}:currentRound`,
            JSON.stringify(roundData),
            120,
        );
    }

    /**
     * Get cached current round (returns null if expired or not cached)
     */
    async getCurrentRound(gameId: string): Promise<any | null> {
        const data = await this.get(`game:${gameId}:currentRound`);
        if (!data) return null;
        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    /**
     * Invalidate cached round (e.g. when round ends)
     */
    async invalidateRound(gameId: string): Promise<void> {
        await this.del(`game:${gameId}:currentRound`);
    }

    // ======================== PLAYER COUNTS ========================

    async incrementPlayerCount(gameId: string): Promise<number> {
        return this.incr(`game:${gameId}:players`);
    }

    async decrementPlayerCount(gameId: string): Promise<number> {
        return this.decr(`game:${gameId}:players`);
    }

    async getPlayerCount(gameId: string): Promise<number> {
        const val = await this.get(`game:${gameId}:players`);
        return parseInt(val || '0', 10);
    }

    // ======================== LIVE STATS ========================

    /**
     * Get aggregated live stats for all games
     */
    async getLiveStats(gameIds: string[]): Promise<Record<string, { players: number; round: any }>> {
        const stats: Record<string, { players: number; round: any }> = {};
        for (const id of gameIds) {
            const [players, round] = await Promise.all([
                this.getPlayerCount(id),
                this.getCurrentRound(id),
            ]);
            stats[id] = { players, round };
        }
        return stats;
    }
}
