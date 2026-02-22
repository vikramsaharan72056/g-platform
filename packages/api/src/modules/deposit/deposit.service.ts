import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionType, Prisma } from '@prisma/client';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreatePaymentQrDto } from './dto/create-payment-qr.dto';

@Injectable()
export class DepositService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly walletService: WalletService,
    ) { }

    // =============== PLAYER ENDPOINTS ===============

    async getActiveQrCodes() {
        return this.prisma.paymentQR.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                type: true,
                qrCodeUrl: true,
                upiId: true,
            },
        });
    }

    async createDepositRequest(userId: string, dto: CreateDepositDto) {
        // Verify QR code exists and is active
        const qr = await this.prisma.paymentQR.findUnique({
            where: { id: dto.paymentQrId },
        });

        if (!qr || !qr.isActive) {
            throw new BadRequestException('Invalid or inactive payment QR code');
        }

        // Check daily limit
        if (qr.dailyLimit && Number(qr.dailyCollected) + dto.amount > Number(qr.dailyLimit)) {
            throw new BadRequestException('Payment QR daily limit exceeded');
        }

        const deposit = await this.prisma.depositRequest.create({
            data: {
                userId,
                amount: dto.amount,
                paymentQrId: dto.paymentQrId,
                utrNumber: dto.utrNumber,
                paymentMethod: dto.paymentMethod || 'UPI',
                screenshotUrl: dto.screenshotUrl,
            },
        });

        return {
            message: 'Deposit request submitted successfully',
            deposit: {
                id: deposit.id,
                amount: deposit.amount,
                status: deposit.status,
                createdAt: deposit.createdAt,
            },
        };
    }

    async getUserDepositHistory(userId: string, page: number = 1, limit: number = 20) {
        const [deposits, total] = await Promise.all([
            this.prisma.depositRequest.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    paymentQr: {
                        select: { name: true, type: true },
                    },
                },
            }),
            this.prisma.depositRequest.count({ where: { userId } }),
        ]);

        return {
            data: deposits,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    // =============== ADMIN ENDPOINTS ===============

    async getDepositQueue(
        page: number = 1,
        limit: number = 20,
        status?: string,
    ) {
        const where: Prisma.DepositRequestWhereInput = {};
        if (status) {
            where.status = status as any;
        } else {
            where.status = 'PENDING';
        }

        const [deposits, total] = await Promise.all([
            this.prisma.depositRequest.findMany({
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
                        },
                    },
                    paymentQr: {
                        select: { name: true, type: true, upiId: true },
                    },
                },
            }),
            this.prisma.depositRequest.count({ where }),
        ]);

        return {
            data: deposits,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async approveDeposit(depositId: string, adminId: string, remarks?: string) {
        const deposit = await this.prisma.depositRequest.findUnique({
            where: { id: depositId },
        });

        if (!deposit) {
            throw new NotFoundException('Deposit request not found');
        }

        if (deposit.status !== 'PENDING') {
            throw new BadRequestException('Deposit is not in pending status');
        }

        // Credit wallet
        const { transaction } = await this.walletService.creditBalance(
            deposit.userId,
            Number(deposit.amount),
            TransactionType.DEPOSIT,
            `Deposit approved - UTR: ${deposit.utrNumber}`,
            { processedBy: adminId },
        );

        // Update deposit request
        await this.prisma.depositRequest.update({
            where: { id: depositId },
            data: {
                status: 'APPROVED',
                reviewedBy: adminId,
                reviewRemarks: remarks,
                reviewedAt: new Date(),
                transactionId: transaction.id,
            },
        });

        // Update QR daily collected
        await this.prisma.paymentQR.update({
            where: { id: deposit.paymentQrId },
            data: {
                dailyCollected: { increment: Number(deposit.amount) },
            },
        });

        // Create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'admin.deposit.approve',
                resource: 'deposit_request',
                resourceId: depositId,
                details: {
                    amount: Number(deposit.amount),
                    userId: deposit.userId,
                    utr: deposit.utrNumber,
                },
            },
        });

        return { message: 'Deposit approved and wallet credited', depositId };
    }

    async rejectDeposit(depositId: string, adminId: string, remarks: string) {
        const deposit = await this.prisma.depositRequest.findUnique({
            where: { id: depositId },
        });

        if (!deposit) throw new NotFoundException('Deposit request not found');
        if (deposit.status !== 'PENDING')
            throw new BadRequestException('Deposit is not in pending status');

        await this.prisma.depositRequest.update({
            where: { id: depositId },
            data: {
                status: 'REJECTED',
                reviewedBy: adminId,
                reviewRemarks: remarks,
                reviewedAt: new Date(),
            },
        });

        // Create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'admin.deposit.reject',
                resource: 'deposit_request',
                resourceId: depositId,
                details: {
                    amount: Number(deposit.amount),
                    userId: deposit.userId,
                    reason: remarks,
                },
            },
        });

        return { message: 'Deposit rejected', depositId };
    }

    // =============== PAYMENT QR MANAGEMENT ===============

    async createPaymentQr(dto: CreatePaymentQrDto, adminId: string) {
        const qr = await this.prisma.paymentQR.create({
            data: {
                name: dto.name,
                type: dto.type,
                qrCodeUrl: dto.qrCodeUrl,
                upiId: dto.upiId,
                bankDetails: dto.bankDetails as any,
                dailyLimit: dto.dailyLimit,
                createdBy: adminId,
            },
        });

        return { message: 'Payment QR created', qr };
    }

    async getPaymentQrs() {
        return this.prisma.paymentQR.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    async togglePaymentQr(qrId: string, isActive: boolean) {
        return this.prisma.paymentQR.update({
            where: { id: qrId },
            data: { isActive },
        });
    }
}
