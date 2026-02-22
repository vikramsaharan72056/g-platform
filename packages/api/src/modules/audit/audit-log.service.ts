import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogService {
    constructor(private readonly prisma: PrismaService) { }

    async log(
        userId: string,
        action: string,
        resource: string,
        resourceId: string,
        details?: Record<string, any>,
        ipAddress?: string,
    ) {
        return this.prisma.auditLog.create({
            data: {
                userId,
                action,
                resource,
                resourceId,
                details: details || {},
                ipAddress,
            },
        });
    }

    async query(
        filters: {
            userId?: string;
            action?: string;
            resource?: string;
            startDate?: Date;
            endDate?: Date;
            search?: string;
        },
        page = 1,
        limit = 20,
    ) {
        const skip = (page - 1) * limit;
        const where: any = {};

        if (filters.userId) where.userId = filters.userId;
        if (filters.action) where.action = filters.action;
        if (filters.resource) where.resource = filters.resource;
        if (filters.startDate || filters.endDate) {
            where.createdAt = {};
            if (filters.startDate) where.createdAt.gte = filters.startDate;
            if (filters.endDate) where.createdAt.lte = filters.endDate;
        }

        const [logs, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.auditLog.count({ where }),
        ]);

        return {
            data: logs,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
}
