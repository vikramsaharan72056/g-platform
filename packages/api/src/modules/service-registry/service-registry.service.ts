import {
    Injectable,
    Logger,
    NotFoundException,
    ConflictException,
    ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterServiceDto, UpdateServiceDto } from './dto/register-service.dto';
import { CreateAllocationDto } from './dto/allocation.dto';
import { ServiceHealth, AllocationStatus, UserRole } from '@prisma/client';

@Injectable()
export class ServiceRegistryService {
    private readonly logger = new Logger(ServiceRegistryService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ============================
    // SERVICE CRUD (SUPER_ADMIN)
    // ============================

    async registerBySlug(slug: string, dto: Omit<RegisterServiceDto, 'gameId'>) {
        const game = await this.prisma.game.findUnique({ where: { slug } });
        if (!game) throw new NotFoundException(`Game with slug ${slug} not found`);

        return this.prisma.gameService.upsert({
            where: { gameId: game.id },
            update: {
                serviceUrl: dto.serviceUrl,
                wsUrl: dto.wsUrl,
                healthStatus: ServiceHealth.HEALTHY,
                lastHealthAt: new Date(),
            },
            create: {
                gameId: game.id,
                serviceUrl: dto.serviceUrl,
                wsUrl: dto.wsUrl,
                internalKey: dto.internalKey || 'default-internal-key',
                isGlobal: dto.isGlobal ?? false,
                healthStatus: ServiceHealth.HEALTHY,
                lastHealthAt: new Date(),
            },
            include: { game: true },
        });
    }

    async registerService(dto: RegisterServiceDto) {
        // Verify the game exists
        const game = await this.prisma.game.findUnique({ where: { id: dto.gameId } });
        if (!game) throw new NotFoundException(`Game ${dto.gameId} not found`);

        return this.prisma.gameService.create({
            data: {
                gameId: dto.gameId,
                serviceUrl: dto.serviceUrl,
                wsUrl: dto.wsUrl,
                internalKey: dto.internalKey,
                isGlobal: dto.isGlobal ?? false,
                healthStatus: ServiceHealth.HEALTHY,
                lastHealthAt: new Date(),
            },
            include: { game: true },
        });
    }

    async updateService(serviceId: string, dto: UpdateServiceDto) {
        return this.prisma.gameService.update({
            where: { id: serviceId },
            data: {
                ...(dto.serviceUrl && { serviceUrl: dto.serviceUrl }),
                ...(dto.wsUrl !== undefined && { wsUrl: dto.wsUrl }),
                ...(dto.internalKey !== undefined && { internalKey: dto.internalKey }),
                ...(dto.isGlobal !== undefined && { isGlobal: dto.isGlobal }),
            },
            include: { game: true },
        });
    }

    async removeService(serviceId: string) {
        return this.prisma.gameService.delete({ where: { id: serviceId } });
    }

    async listAllServices() {
        return this.prisma.gameService.findMany({
            include: {
                game: { select: { id: true, name: true, slug: true, type: true, isActive: true, thumbnail: true } },
                _count: { select: { allocations: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async getServiceById(serviceId: string) {
        const svc = await this.prisma.gameService.findUnique({
            where: { id: serviceId },
            include: {
                game: true,
                allocations: {
                    include: {
                        // No user relation in ServiceAllocation — we'll resolve it separately
                    },
                    orderBy: { requestedAt: 'desc' },
                },
            },
        });
        if (!svc) throw new NotFoundException('Service not found');
        return svc;
    }

    // ============================
    // ALLOCATION MANAGEMENT
    // ============================

    /**
     * SUPER_ADMIN directly creates an allocation (approved immediately)
     */
    async createAllocation(dto: CreateAllocationDto, approvedByUserId: string) {
        const svc = await this.prisma.gameService.findUnique({ where: { id: dto.gameServiceId } });
        if (!svc) throw new NotFoundException('Service not found');

        return this.prisma.serviceAllocation.upsert({
            where: {
                gameServiceId_userId: {
                    gameServiceId: dto.gameServiceId,
                    userId: dto.userId,
                },
            },
            create: {
                gameServiceId: dto.gameServiceId,
                userId: dto.userId,
                allocatedRole: dto.allocatedRole,
                status: AllocationStatus.APPROVED,
                approvedBy: approvedByUserId,
                approvedAt: new Date(),
            },
            update: {
                allocatedRole: dto.allocatedRole,
                status: AllocationStatus.APPROVED,
                approvedBy: approvedByUserId,
                approvedAt: new Date(),
                revokedAt: null,
                revokeReason: null,
            },
        });
    }

    /**
     * ADMIN requests access to a service (status = PENDING)
     */
    async requestAllocation(gameServiceId: string, userId: string) {
        const svc = await this.prisma.gameService.findUnique({ where: { id: gameServiceId } });
        if (!svc) throw new NotFoundException('Service not found');

        const existing = await this.prisma.serviceAllocation.findUnique({
            where: { gameServiceId_userId: { gameServiceId, userId } },
        });

        if (existing?.status === AllocationStatus.APPROVED) {
            throw new ConflictException('You already have access to this service');
        }

        return this.prisma.serviceAllocation.upsert({
            where: { gameServiceId_userId: { gameServiceId, userId } },
            create: {
                gameServiceId,
                userId,
                allocatedRole: UserRole.ADMIN,
                status: AllocationStatus.PENDING,
            },
            update: {
                status: AllocationStatus.PENDING,
                revokedAt: null,
                revokeReason: null,
            },
        });
    }

    /**
     * SUPER_ADMIN approves a pending allocation
     */
    async approveAllocation(allocationId: string, approvedByUserId: string) {
        return this.prisma.serviceAllocation.update({
            where: { id: allocationId },
            data: {
                status: AllocationStatus.APPROVED,
                approvedBy: approvedByUserId,
                approvedAt: new Date(),
            },
        });
    }

    /**
     * SUPER_ADMIN revokes an allocation
     */
    async revokeAllocation(allocationId: string, reason?: string) {
        return this.prisma.serviceAllocation.update({
            where: { id: allocationId },
            data: {
                status: AllocationStatus.REVOKED,
                revokedAt: new Date(),
                revokeReason: reason,
            },
        });
    }

    /**
     * List all allocations (filterable)
     */
    async listAllocations(filters?: { userId?: string; status?: AllocationStatus; gameServiceId?: string }) {
        return this.prisma.serviceAllocation.findMany({
            where: {
                ...(filters?.userId && { userId: filters.userId }),
                ...(filters?.status && { status: filters.status }),
                ...(filters?.gameServiceId && { gameServiceId: filters.gameServiceId }),
            },
            include: {
                gameService: {
                    include: { game: { select: { name: true, slug: true, type: true } } },
                },
            },
            orderBy: { requestedAt: 'desc' },
        });
    }

    // ============================
    // PLAYER / ADMIN — My Services
    // ============================

    /**
     * Get services available to a specific user.
     * Returns globally available services + specifically allocated ones.
     */
    async getAvailableServices(userId: string, userRole: UserRole) {
        // 0. Super Admins see everything
        if (userRole === UserRole.SUPER_ADMIN) {
            return this.prisma.gameService.findMany({
                include: {
                    game: { select: { id: true, name: true, slug: true, type: true, thumbnail: true, banner: true } },
                },
            });
        }

        // 1. Get global services
        const globalServices = await this.prisma.gameService.findMany({
            where: {
                isGlobal: true,
                game: { isActive: true },
            },
            include: {
                game: { select: { id: true, name: true, slug: true, type: true, thumbnail: true, banner: true } },
            },
        });

        // 2. Determine whose allocations to check
        let targetUserIds = [userId];

        if (userRole === UserRole.PLAYER) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { parentAdminId: true },
            });
            if (user?.parentAdminId) {
                targetUserIds.push(user.parentAdminId);
            }
        }

        // 3. Get specifically allocated services for the user (and their parent admin if applicable)
        const allocatedServices = await this.prisma.serviceAllocation.findMany({
            where: {
                userId: { in: targetUserIds },
                status: AllocationStatus.APPROVED,
            },
            include: {
                gameService: {
                    include: {
                        game: { select: { id: true, name: true, slug: true, type: true, thumbnail: true, banner: true } },
                    },
                },
            },
        });

        // 4. Merge and deduplicate by gameService ID
        const serviceMap = new Map<string, any>();
        for (const svc of globalServices) {
            serviceMap.set(svc.id, {
                ...svc,
                accessType: 'GLOBAL',
            });
        }
        for (const alloc of allocatedServices) {
            if (!serviceMap.has(alloc.gameService.id)) {
                serviceMap.set(alloc.gameService.id, {
                    ...alloc.gameService,
                    accessType: 'ALLOCATED',
                    allocatedRole: alloc.allocatedRole,
                });
            }
        }

        return Array.from(serviceMap.values());
    }

    // ============================
    // HEALTH CHECK
    // ============================

    @Cron(CronExpression.EVERY_30_SECONDS)
    async healthCheckAll() {
        const services = await this.prisma.gameService.findMany();

        for (const svc of services) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);

                const res = await fetch(`${svc.serviceUrl}/health`, {
                    signal: controller.signal,
                });
                clearTimeout(timeout);

                const status: ServiceHealth = res.ok ? ServiceHealth.HEALTHY : ServiceHealth.DEGRADED;

                await this.prisma.gameService.update({
                    where: { id: svc.id },
                    data: { healthStatus: status, lastHealthAt: new Date() },
                });
            } catch {
                await this.prisma.gameService.update({
                    where: { id: svc.id },
                    data: { healthStatus: ServiceHealth.DOWN, lastHealthAt: new Date() },
                });
                this.logger.warn(`Service ${svc.serviceUrl} is DOWN`);
            }
        }
    }
}
