import {
    Injectable,
    UnauthorizedException,
    ConflictException,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    // ======================== REGISTRATION ========================

    async register(dto: RegisterDto) {
        const existing = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });

        if (existing) {
            throw new ConflictException('Email already registered');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 12);
        const referralCode = this.generateReferralCode();

        const user = await this.prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    email: dto.email.toLowerCase(),
                    password: hashedPassword,
                    displayName: dto.displayName || dto.email.split('@')[0],
                    referralCode,
                    referredBy: dto.referralCode || null,
                },
            });

            await tx.wallet.create({
                data: {
                    userId: newUser.id,
                    balance: 0,
                    bonusBalance: 0,
                },
            });

            return newUser;
        });

        const token = this.generateToken(user.id, user.email, user.role);

        return {
            message: 'Registration successful',
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                role: user.role,
                referralCode: user.referralCode,
            },
            access_token: token,
        };
    }

    // ======================== LOGIN ========================

    async login(dto: LoginDto, ip?: string, userAgent?: string) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        if (user.status === 'BANNED') {
            throw new UnauthorizedException('Account has been banned');
        }
        if (user.status === 'SUSPENDED') {
            throw new UnauthorizedException('Account is suspended');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // If 2FA is enabled, require verification
        if (user.twoFactorEnabled) {
            if (!dto.twoFactorCode) {
                return {
                    message: '2FA verification required',
                    requires2FA: true,
                    userId: user.id,
                };
            }

            const isValid = speakeasy.totp.verify({
                secret: user.twoFactorSecret!,
                encoding: 'base32',
                token: dto.twoFactorCode,
                window: 2,
            });

            if (!isValid) {
                throw new UnauthorizedException('Invalid 2FA code');
            }
        }

        // Update last login
        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        // Track login history
        if (ip || userAgent) {
            await this.trackLogin(user.id, ip || 'unknown', userAgent || 'unknown');
        }

        const token = this.generateToken(user.id, user.email, user.role);

        return {
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                role: user.role,
                status: user.status,
            },
            access_token: token,
        };
    }

    // ======================== TOKEN REFRESH ========================

    async refreshToken(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user || user.status !== 'ACTIVE') {
            throw new UnauthorizedException('Invalid session');
        }

        const token = this.generateToken(user.id, user.email, user.role);
        return { access_token: token };
    }

    // ======================== 2FA ========================

    async setup2FA(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (user.twoFactorEnabled) {
            throw new BadRequestException('2FA is already enabled');
        }

        const secret = speakeasy.generateSecret({
            name: `ABCRummy (${user.email})`,
            issuer: 'ABCRummy',
            length: 20,
        });

        // Store the secret temporarily (not enabled until verified)
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: secret.base32 },
        });

        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

        return {
            secret: secret.base32,
            qrCode: qrCodeUrl,
            message: 'Scan the QR code with your authenticator app, then verify with a code',
        };
    }

    async verify2FA(userId: string, token: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user || !user.twoFactorSecret) {
            throw new BadRequestException('2FA setup not initiated');
        }

        const isValid = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token,
            window: 2,
        });

        if (!isValid) {
            throw new BadRequestException('Invalid verification code');
        }

        // Generate backup codes
        const backupCodes = Array.from({ length: 8 }, () =>
            crypto.randomBytes(4).toString('hex').toUpperCase(),
        );
        const hashedBackups = await Promise.all(
            backupCodes.map((code) => bcrypt.hash(code, 10)),
        );

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorEnabled: true,
                kycDocuments: { backupCodes: hashedBackups }, // reuse JSON field for backup codes
            },
        });

        return {
            message: '2FA enabled successfully',
            backupCodes,
            warning: 'Save these backup codes securely. They cannot be shown again.',
        };
    }

    async disable2FA(userId: string, password: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (!user.twoFactorEnabled) {
            throw new BadRequestException('2FA is not enabled');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid password');
        }

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorEnabled: false,
                twoFactorSecret: null,
            },
        });

        return { message: '2FA disabled successfully' };
    }

    // ======================== PASSWORD RESET ========================

    async forgotPassword(email: string) {
        const user = await this.prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        // Always return success to prevent email enumeration
        if (!user) {
            return { message: 'If the email exists, a reset link has been sent' };
        }

        // Generate reset token (valid for 1 hour)
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // Store hashed token in kycDocuments JSON field
        const existingData =
            (user.kycDocuments as Record<string, any>) || {};
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                kycDocuments: {
                    ...existingData,
                    resetToken: hashedToken,
                    resetTokenExpiry: new Date(
                        Date.now() + 60 * 60 * 1000,
                    ).toISOString(),
                },
            },
        });

        // In production, send email with resetToken
        // For now, return it in response (development only)
        return {
            message: 'If the email exists, a reset link has been sent',
            // DEV ONLY — remove in production
            resetToken,
        };
    }

    async resetPassword(token: string, newPassword: string) {
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Find user with this reset token
        const users = await this.prisma.user.findMany({
            where: {
                kycDocuments: {
                    path: ['resetToken'],
                    equals: hashedToken,
                },
            },
        });

        if (users.length === 0) {
            throw new BadRequestException('Invalid or expired reset token');
        }

        const user = users[0];
        const data = user.kycDocuments as Record<string, any>;

        if (
            !data?.resetTokenExpiry ||
            new Date(data.resetTokenExpiry) < new Date()
        ) {
            throw new BadRequestException('Reset token has expired');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Clear the reset token and update password
        const { resetToken: _rt, resetTokenExpiry: _rte, ...rest } = data;
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                kycDocuments: Object.keys(rest).length > 0 ? rest : undefined,
            },
        });

        return { message: 'Password reset successfully' };
    }

    // ======================== LOGIN HISTORY ========================

    async trackLogin(userId: string, ipAddress: string, userAgent: string) {
        await this.prisma.loginHistory.create({
            data: {
                userId,
                ipAddress,
                userAgent,
                deviceInfo: { raw: userAgent },
            },
        });
    }

    async getLoginHistory(userId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [records, total] = await Promise.all([
            this.prisma.loginHistory.findMany({
                where: { userId },
                orderBy: { loginAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.loginHistory.count({ where: { userId } }),
        ]);

        return {
            data: records,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ======================== PROFILE ========================

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                wallet: {
                    select: {
                        id: true,
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
            throw new BadRequestException('User not found');
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, twoFactorSecret, kycDocuments, ...result } = user;
        return {
            ...result,
            twoFactorEnabled: user.twoFactorEnabled,
            kycStatus: user.kycStatus,
        };
    }

    async validateUser(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user || user.status !== 'ACTIVE') {
            return null;
        }

        return user;
    }

    // ======================== HELPERS ========================

    private generateToken(
        userId: string,
        email: string,
        role: UserRole,
    ): string {
        const payload = {
            sub: userId,
            email,
            role,
        };
        return this.jwtService.sign(payload);
    }

    private generateReferralCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'ABC';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
}
