import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export interface AccessTokenPayload {
  userId: string;
  username: string;
}

export interface AdminTokenPayload {
  adminId: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR';
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpiresIn });
}

export function signAdminAccessToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpiresIn });
}

export function verifyAccessToken<T extends object = AccessTokenPayload>(token: string): T {
  return jwt.verify(token, env.jwtSecret) as T;
}

/** Opaque, high-entropy refresh token (stored hashed-by-lookup via unique DB row, not JWT). */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function refreshTokenExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + env.jwtRefreshExpiresInDays);
  return d;
}
