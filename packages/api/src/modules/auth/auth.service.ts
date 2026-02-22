import {
    Injectable,
    UnauthorizedException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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

    async register(dto: RegisterDto) {
        // Check if email exists
        const existing = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });

        if (existing) {
            throw new ConflictException('Email already registered');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(dto.password, 12);

        // Generate unique referral code
        const referralCode = this.generateReferralCode();

        // Create user + wallet in a transaction
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

            // Auto-create wallet
            await tx.wallet.create({
                data: {
                    userId: newUser.id,
                    balance: 0,
                    bonusBalance: 0,
                },
            });

            return newUser;
        });

        // Generate JWT token
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

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // Check account status
        if (user.status === 'BANNED') {
            throw new UnauthorizedException('Account has been banned');
        }
        if (user.status === 'SUSPENDED') {
            throw new UnauthorizedException('Account is suspended');
        }

        // Validate password
        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // Update last login
        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        // Generate JWT token
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
        const { password, twoFactorSecret, ...result } = user;
        return result;
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
