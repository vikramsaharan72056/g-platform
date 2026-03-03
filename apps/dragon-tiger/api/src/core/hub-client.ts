import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class HubClient {
    private readonly logger = new Logger(HubClient.name);
    private readonly hubUrl = process.env.HUB_API_URL || 'http://localhost:3000';
    private readonly internalKey = process.env.INTERNAL_API_KEY || 'g-platform-secret-internal-key';

    private getAuthHeaders(body: any) {
        const timestamp = Date.now().toString();
        const slug = process.env.GAME_SLUG || 'dragon-tiger';
        const bodyStr = JSON.stringify(body);

        const signature = crypto
            .createHmac('sha256', this.internalKey)
            .update(timestamp + bodyStr)
            .digest('hex');

        return {
            'Content-Type': 'application/json',
            'x-internal-key': this.internalKey,
            'x-signature': signature,
            'x-timestamp': timestamp,
            'x-service-slug': slug,
        };
    }

    async verifyToken(token: string): Promise<any> {
        const body = { token };
        try {
            const res = await fetch(`${this.hubUrl}/internal/verify-token`, {
                method: 'POST',
                headers: this.getAuthHeaders(body),
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new UnauthorizedException('Token validation failed');
            return await res.json();
        } catch (e) {
            this.logger.error('Error verifying token with Hub', e);
            throw new UnauthorizedException('Hub unreachable');
        }
    }

    async debitWallet(userId: string, amount: number, gameRoundId: string, description: string): Promise<any> {
        const body = { userId, amount, gameRoundId, description };
        const res = await fetch(`${this.hubUrl}/internal/wallet/debit`, {
            method: 'POST',
            headers: this.getAuthHeaders(body),
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Wallet debit failed');
        }
        return await res.json();
    }

    async creditWallet(userId: string, amount: number, gameRoundId: string, description: string): Promise<any> {
        const body = { userId, amount, gameRoundId, description };
        const res = await fetch(`${this.hubUrl}/internal/wallet/credit`, {
            method: 'POST',
            headers: this.getAuthHeaders(body),
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Wallet credit failed');
        }
        return await res.json();
    }

    /**
     * Registers this service with the Hub
     */
    async registerSelf(): Promise<any> {
        const slug = process.env.GAME_SLUG || 'dragon-tiger';
        const serviceUrl = process.env.SERVICE_URL || 'http://localhost:3403';
        const wsUrl = process.env.WS_URL || 'ws://localhost:3403';
        const isGlobal = process.env.IS_GLOBAL === 'true';

        const body = { slug, serviceUrl, wsUrl, isGlobal };

        try {
            const res = await fetch(`${this.hubUrl}/internal/register-service`, {
                method: 'POST',
                headers: this.getAuthHeaders(body),
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json();
                this.logger.error(`Self-registration failed: ${err.message}`);
                return;
            }
            this.logger.log(`Successfully registered as [${slug}] with Hub`);
            return await res.json();
        } catch (e) {
            this.logger.error('Hub unreachable during self-registration', e);
        }
    }
}
