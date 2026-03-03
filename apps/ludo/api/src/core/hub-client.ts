import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class HubClient {
    private readonly logger = new Logger(HubClient.name);
    private readonly hubUrl: string;
    private readonly internalKey: string;
    private readonly gameSlug: string;

    constructor(private readonly config: ConfigService) {
        this.hubUrl = this.config.get<string>('HUB_API_URL') || 'http://localhost:3000';
        this.internalKey = this.config.get<string>('INTERNAL_API_KEY') || 'g-platform-secret-internal-key';
        this.gameSlug = this.config.get<string>('GAME_SLUG') || 'ludo';
    }

    private getAuthHeaders(body: any) {
        const timestamp = Date.now().toString();
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
            'x-service-slug': this.gameSlug,
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

    async registerSelf(): Promise<any> {
        const serviceUrl = this.config.get<string>('SERVICE_URL') || 'http://localhost:3407';
        const wsUrl = this.config.get<string>('WS_URL') || 'ws://localhost:3407';
        const isGlobal = this.config.get<boolean>('IS_GLOBAL') || true;

        const body = { slug: this.gameSlug, serviceUrl, wsUrl, isGlobal };

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
            this.logger.log(`Successfully registered as [${this.gameSlug}] with Hub`);
            return await res.json();
        } catch (e) {
            this.logger.error('Hub unreachable during self-registration', e);
        }
    }
}
