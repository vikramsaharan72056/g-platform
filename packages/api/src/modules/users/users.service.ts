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
    ) {
        const where: Prisma.UserWhereInput = {};

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

        if (role) {
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
                    wallet: {
                        select: {
                            balance: true,
                            bonusBalance: true,
                            totalDeposited: true,
                            totalWithdrawn: true,
                        },
                    },
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
