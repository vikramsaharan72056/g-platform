import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionType, TransactionStatus, Prisma } from '@prisma/client';

@Injectable()
export class WalletService {
    constructor(private readonly prisma: PrismaService) { }

    async getBalance(userId: string) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            throw new NotFoundException('Wallet not found');
        }

        return {
            balance: wallet.balance,
            bonusBalance: wallet.bonusBalance,
            totalBalance: Number(wallet.balance) + Number(wallet.bonusBalance),
            totalDeposited: wallet.totalDeposited,
            totalWithdrawn: wallet.totalWithdrawn,
            totalBetAmount: wallet.totalBetAmount,
            totalWon: wallet.totalWon,
            totalLost: wallet.totalLost,
        };
    }

    async getTransactions(
        userId: string,
        page: number = 1,
        limit: number = 20,
        type?: TransactionType,
    ) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            throw new NotFoundException('Wallet not found');
        }

        const where: Prisma.TransactionWhereInput = {
            walletId: wallet.id,
        };

        if (type) {
            where.type = type;
        }

        const [transactions, total] = await Promise.all([
            this.prisma.transaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.transaction.count({ where }),
        ]);

        return {
            data: transactions,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Credit wallet balance with optimistic locking
     */
    async creditBalance(
        userId: string,
        amount: number,
        type: TransactionType,
        description: string,
        metadata?: {
            betId?: string;
            gameRoundId?: string;
            processedBy?: string;
        },
    ) {
        if (amount <= 0) {
            throw new BadRequestException('Amount must be positive');
        }

        return this.prisma.$transaction(async (tx) => {
            // Get wallet with lock
            const wallet = await tx.wallet.findUnique({
                where: { userId },
            });

            if (!wallet) {
                throw new NotFoundException('Wallet not found');
            }

            const balanceBefore = Number(wallet.balance);
            const balanceAfter = balanceBefore + amount;

            // Update wallet with optimistic locking
            const updatedWallet = await tx.wallet.updateMany({
                where: {
                    userId,
                    version: wallet.version,
                },
                data: {
                    balance: balanceAfter,
                    version: { increment: 1 },
                    ...(type === TransactionType.DEPOSIT && {
                        totalDeposited: { increment: amount },
                    }),
                    ...(type === TransactionType.BET_WON && {
                        totalWon: { increment: amount },
                    }),
                },
            });

            if (updatedWallet.count === 0) {
                throw new BadRequestException(
                    'Concurrent transaction detected. Please retry.',
                );
            }

            // Create transaction record
            const transaction = await tx.transaction.create({
                data: {
                    userId,
                    walletId: wallet.id,
                    type,
                    amount,
                    balanceBefore,
                    balanceAfter,
                    status: TransactionStatus.COMPLETED,
                    description,
                    betId: metadata?.betId,
                    gameRoundId: metadata?.gameRoundId,
                    processedBy: metadata?.processedBy,
                    processedAt: new Date(),
                },
            });

            return { wallet: { ...wallet, balance: balanceAfter }, transaction };
        });
    }

    /**
     * Debit wallet balance with optimistic locking
     */
    async debitBalance(
        userId: string,
        amount: number,
        type: TransactionType,
        description: string,
        metadata?: {
            betId?: string;
            gameRoundId?: string;
            processedBy?: string;
        },
    ) {
        if (amount <= 0) {
            throw new BadRequestException('Amount must be positive');
        }

        return this.prisma.$transaction(async (tx) => {
            // Get wallet with lock
            const wallet = await tx.wallet.findUnique({
                where: { userId },
            });

            if (!wallet) {
                throw new NotFoundException('Wallet not found');
            }

            const balanceBefore = Number(wallet.balance);

            // Check sufficient balance (check bonus first, then main)
            const bonusBalance = Number(wallet.bonusBalance);
            let debitFromBonus = 0;
            let debitFromMain = 0;

            if (type === TransactionType.BET_PLACED) {
                // For bets: debit from bonus first, then main
                if (bonusBalance >= amount) {
                    debitFromBonus = amount;
                } else {
                    debitFromBonus = bonusBalance;
                    debitFromMain = amount - bonusBalance;
                }
            } else {
                // For withdrawals and other debits: main balance only
                debitFromMain = amount;
            }

            if (debitFromMain > balanceBefore) {
                throw new BadRequestException('Insufficient balance');
            }

            const balanceAfter = balanceBefore - debitFromMain;
            const bonusAfter = bonusBalance - debitFromBonus;

            // Update wallet with optimistic locking
            const updatedWallet = await tx.wallet.updateMany({
                where: {
                    userId,
                    version: wallet.version,
                },
                data: {
                    balance: balanceAfter,
                    bonusBalance: bonusAfter,
                    version: { increment: 1 },
                    ...(type === TransactionType.WITHDRAWAL && {
                        totalWithdrawn: { increment: amount },
                    }),
                    ...(type === TransactionType.BET_PLACED && {
                        totalBetAmount: { increment: amount },
                        totalLost: { increment: amount },
                    }),
                },
            });

            if (updatedWallet.count === 0) {
                throw new BadRequestException(
                    'Concurrent transaction detected. Please retry.',
                );
            }

            // Create transaction record
            const transaction = await tx.transaction.create({
                data: {
                    userId,
                    walletId: wallet.id,
                    type,
                    amount,
                    balanceBefore,
                    balanceAfter,
                    status: TransactionStatus.COMPLETED,
                    description,
                    betId: metadata?.betId,
                    gameRoundId: metadata?.gameRoundId,
                    processedBy: metadata?.processedBy,
                    processedAt: new Date(),
                },
            });

            return {
                wallet: { ...wallet, balance: balanceAfter, bonusBalance: bonusAfter },
                transaction,
            };
        });
    }

    /**
     * Credit bonus balance
     */
    async creditBonusBalance(
        userId: string,
        amount: number,
        description: string,
        processedBy?: string,
    ) {
        return this.prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.findUnique({ where: { userId } });
            if (!wallet) throw new NotFoundException('Wallet not found');

            const balanceBefore = Number(wallet.bonusBalance);
            const balanceAfter = balanceBefore + amount;

            await tx.wallet.updateMany({
                where: { userId, version: wallet.version },
                data: {
                    bonusBalance: balanceAfter,
                    version: { increment: 1 },
                },
            });

            const transaction = await tx.transaction.create({
                data: {
                    userId,
                    walletId: wallet.id,
                    type: TransactionType.BONUS_CREDIT,
                    amount,
                    balanceBefore: Number(wallet.balance),
                    balanceAfter: Number(wallet.balance),
                    status: TransactionStatus.COMPLETED,
                    description,
                    processedBy,
                    processedAt: new Date(),
                },
            });

            return { transaction };
        });
    }
}
