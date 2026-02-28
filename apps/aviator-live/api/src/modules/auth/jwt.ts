import jwt from 'jsonwebtoken';
import { config } from '../../core/config.js';

export type AuthRole = 'PLAYER' | 'ADMIN';

export interface AuthUser {
  userId: string;
  name: string;
  role: AuthRole;
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAuthToken(token: string): AuthUser {
  return jwt.verify(token, config.jwtSecret) as AuthUser;
}
