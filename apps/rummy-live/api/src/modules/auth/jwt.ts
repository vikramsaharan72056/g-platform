import jwt from 'jsonwebtoken';
import { config } from '../../core/config.js';

export type AuthRole = 'PLAYER' | 'ADMIN';

export interface AuthUser {
    userId: string;
    name: string;
    role: AuthRole;
    email?: string;
}

const JWT_EXPIRES_IN = process.env.RUMMY_JWT_EXPIRES_IN || '7d';

export function signAuthToken(user: AuthUser): string {
    return jwt.sign(user, config.jwtSecret, {
        expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
}

export function verifyAuthToken(token: string): AuthUser {
    return jwt.verify(token, config.jwtSecret) as AuthUser;
}
