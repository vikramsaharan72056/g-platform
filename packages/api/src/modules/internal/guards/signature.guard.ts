import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SignatureGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const signature = request.headers['x-signature'];
        const timestamp = request.headers['x-timestamp'];
        const serviceKey = request.headers['x-internal-key'];
        const slug = request.headers['x-service-slug'] || 'master';

        if (!signature || !timestamp || !serviceKey) {
            throw new UnauthorizedException('Missing security headers');
        }

        // 1. Check timestamp freshness (5 min window)
        const now = Date.now();
        const requestTime = parseInt(timestamp as string, 10);
        if (isNaN(requestTime) || Math.abs(now - requestTime) > 300000) {
            throw new UnauthorizedException('Request expired or clock desync');
        }

        // 2. Resolve the secret key
        let secret = process.env.INTERNAL_API_KEY || 'g-platform-secret-internal-key';

        // If it's a specific service, we could look up its registered key
        if (slug !== 'master') {
            const service = await this.prisma.gameService.findFirst({
                where: { game: { slug } }
            });
            if (service && service.internalKey) {
                secret = service.internalKey;
            }
        }

        // 3. Verify signature
        // Payload depends on body. We stringify it consistently.
        const bodyContent = JSON.stringify(request.body);
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(timestamp + bodyContent)
            .digest('hex');

        if (signature !== expectedSignature) {
            // Backwards compatibility for now or strict? Let's be strict.
            throw new UnauthorizedException('Invalid cryptographic signature');
        }

        return true;
    }
}
