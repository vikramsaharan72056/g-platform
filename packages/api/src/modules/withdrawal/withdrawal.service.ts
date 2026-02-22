import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType, Prisma } from '@prisma/client';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawalService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly walletService: WalletService,
    ) { }

    // =============== PLAYER ENDPOINTS ===============

    async createWithdrawalRequest(userId: string, dto: CreateWithdrawalDto) {
        // Check balance sufficiency
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) throw new NotFoundException('Wallet not found');
        if (Number(wallet.balance) < dto.amount) {
            throw new BadRequestException('Insufficient balance');
        }

        // Turnover check: total bets must be >= total deposits × turnover factor (1x)
        const turnoverFactor = 1;
        if (Number(wallet.totalBetAmount) < Number(wallet.totalDeposited) * turnoverFactor) {
            throw new BadRequestException(
                `Turnover requirement not met. You need to bet at least ₹${Number(wallet.totalDeposited) * turnoverFactor} before withdrawing.`,
            );
        }

        // Debit wallet immediately (prevents double-withdrawal)
        await this.walletService.debitBalance(
            userId,
            dto.amount,
            TransactionType.WITHDRAWAL,
            `Withdrawal request: ₹${dto.amount}`,
        );

        // Create withdrawal request
        const withdrawal = await this.prisma.withdrawalRequest.create({
            data: {
                userId,
                amount: dto.amount,
                payoutMethod: dto.payoutMethod,
                payoutDetails: dto.payoutDetails as any,
            },
        });

        return {
            message: 'Withdrawal request submitted. Amount deducted from wallet.',
            withdrawal: {
                id: withdrawal.id,
                amount: withdrawal.amount,
                status: withdrawal.status,
                createdAt: withdrawal.createdAt,
            },
        };
    }

    async getUserWithdrawalHistory(
        userId: string,
        page: number = 1,
        limit: number = 20,
    ) {
        const [withdrawals, total] = await Promise.all([
            this.prisma.withdrawalRequest.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.withdrawalRequest.count({ where: { userId } }),
        ]);

        return {
            data: withdrawals,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    // =============== ADMIN ENDPOINTS ===============

    async getWithdrawalQueue(
        page: number = 1,
        limit: number = 20,
        status?: string,
    ) {
        const where: Prisma.WithdrawalRequestWhereInput = {};
        if (status) {
            where.status = status as any;
        } else {
            where.status = 'PENDING';
        }

        const [withdrawals, total] = await Promise.all([
            this.prisma.withdrawalRequest.findMany({
                where,
                orderBy: { createdAt: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            displayName: true,
                            createdAt: true,
                            wallet: {
                                select: {
                                    balance: true,
                                    totalDeposited: true,
                                    totalWithdrawn: true,
                                    totalBetAmount: true,
                                    totalWon: true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.withdrawalRequest.count({ where }),
        ]);

        return {
            data: withdrawals,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async approveWithdrawal(
        withdrawalId: string,
        adminId: string,
        paymentRef?: string,
        remarks?: string,
    ) {
        const withdrawal = await this.prisma.withdrawalRequest.findUnique({
            where: { id: withdrawalId },
        });

        if (!withdrawal) throw new NotFoundException('Withdrawal not found');
        if (withdrawal.status !== 'PENDING')
            throw new BadRequestException('Withdrawal is not in pending status');

        await this.prisma.withdrawalRequest.update({
            where: { id: withdrawalId },
            data: {
                status: 'COMPLETED',
                reviewedBy: adminId,
                reviewRemarks: remarks,
                reviewedAt: new Date(),
                paymentRef,
            },
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'admin.withdrawal.approve',
                resource: 'withdrawal_request',
                resourceId: withdrawalId,
                details: {
                    amount: Number(withdrawal.amount),
                    userId: withdrawal.userId,
                    paymentRef,
                },
            },
        });

        return { message: 'Withdrawal approved', withdrawalId };
    }

    async rejectWithdrawal(
        withdrawalId: string,
        adminId: string,
        remarks: string,
    ) {
        const withdrawal = await this.prisma.withdrawalRequest.findUnique({
            where: { id: withdrawalId },
        });

        if (!withdrawal) throw new NotFoundException('Withdrawal not found');
        if (withdrawal.status !== 'PENDING')
            throw new BadRequestException('Withdrawal is not in pending status');

        // Refund wallet
        await this.walletService.creditBalance(
            withdrawal.userId,
            Number(withdrawal.amount),
            TransactionType.BET_REFUND,
            `Withdrawal rejected - refund: ₹${withdrawal.amount}`,
            { processedBy: adminId },
        );

        await this.prisma.withdrawalRequest.update({
            where: { id: withdrawalId },
            data: {
                status: 'REJECTED',
                reviewedBy: adminId,
                reviewRemarks: remarks,
                reviewedAt: new Date(),
            },
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'admin.withdrawal.reject',
                resource: 'withdrawal_request',
                resourceId: withdrawalId,
                details: {
                    amount: Number(withdrawal.amount),
                    userId: withdrawal.userId,
                    reason: remarks,
                },
            },
        });

        return { message: 'Withdrawal rejected and amount refunded', withdrawalId };
    }
}
