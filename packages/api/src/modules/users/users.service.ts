import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) { }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                wallet: {
                    select: {
                        balance: true,
                        bonusBalance: true,
                        totalDeposited: true,
                        totalWithdrawn: true,
                        totalWon: true,
                        totalLost: true,
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, twoFactorSecret, ...result } = user;
        return result;
    }

    async updateProfile(userId: string, dto: UpdateProfileDto) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: {
                displayName: dto.displayName,
                phone: dto.phone,
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, twoFactorSecret, ...result } = user;
        return result;
    }

    // =============== ADMIN ENDPOINTS ===============

    async listUsers(
        page: number = 1,
        limit: number = 20,
        search?: string,
        status?: string,
        role?: string,
        requestingUser?: { id: string; role: string },
    ) {
        const where: Prisma.UserWhereInput = {};

        // 1. Role-based filtering
        if (requestingUser?.role === 'ADMIN') {
            // Admin can only see users managed by them
            where.parentAdminId = requestingUser.id;
            where.role = 'PLAYER'; // Usually Admins only manage Players
        } else if (requestingUser?.role === 'SUPER_ADMIN') {
            // Super-Admin can see everyone, but if they filter by role/status, apply it
            if (role) where.role = role as any;
        }

        // 2. Search & other filters
        if (search) {
            where.OR = [
                { email: { contains: search, mode: 'insensitive' } },
                { displayName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
            ];
        }

        if (status) {
            where.status = status as any;
        }

        // If Super-Admin didn't specify a role, or we are not in Admin mode, apply provided role
        if (role && requestingUser?.role !== 'ADMIN') {
            where.role = role as any;
        }

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                    phone: true,
                    status: true,
                    role: true,
                    kycStatus: true,
                    lastLoginAt: true,
                    createdAt: true,
                    parentAdminId: true,
                    wallet: {
                        select: {
                            balance: true,
                            bonusBalance: true,
                            totalDeposited: true,
                            totalWithdrawn: true,
                        },
                    },
                    _count: {
                        select: { serviceAllocations: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.user.count({ where }),
        ]);

        return {
            data: users,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async assignParentAdmin(userId: string, parentAdminId: string, curatorId: string) {
        // Verify parent exists and is an ADMIN/SUPER_ADMIN
        const parent = await this.prisma.user.findUnique({ where: { id: parentAdminId } });
        if (!parent) throw new NotFoundException('Parent admin not found');
        if (parent.role === 'PLAYER') throw new Error('Cannot assign a Player as a parent admin');

        const user = await this.prisma.user.update({
            where: { id: userId },
            data: { parentAdminId },
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: curatorId,
                action: 'admin.user.assign_parent',
                resource: 'user',
                resourceId: userId,
                details: { parentAdminId },
            },
        });

        return user;
    }

    async getUserDetail(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                wallet: true,
                bets: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    include: {
                        gameRound: {
                            include: {
                                game: { select: { name: true, slug: true } },
                            },
                        },
                    },
                },
                loginHistory: {
                    orderBy: { loginAt: 'desc' },
                    take: 10,
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, twoFactorSecret, ...result } = user;
        return result;
    }

    async updateUserStatus(userId: string, status: string, adminId: string) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: { status: status as any },
        });

        // Create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: `admin.user.status_change`,
                resource: 'user',
                resourceId: userId,
                details: { newStatus: status },
            },
        });

        return { message: `User status updated to ${status}`, userId: user.id };
    }
}
