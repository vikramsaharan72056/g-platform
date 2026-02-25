import jwt from 'jsonwebtoken';

export interface AuthUser {
  userId: string;
  name: string;
}

const JWT_SECRET = process.env.RUMMY_JWT_SECRET || 'rummy-live-dev-secret';
const JWT_EXPIRES_IN = process.env.RUMMY_JWT_EXPIRES_IN || '7d';

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAuthToken(token: string): AuthUser {
  return jwt.verify(token, JWT_SECRET) as AuthUser;
}
