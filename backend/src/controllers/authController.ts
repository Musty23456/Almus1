import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  refreshTokenExpiryDate,
} from '../utils/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendPasswordResetEmail } from '../utils/mailer';

export async function register(req: Request, res: Response) {
  const { fullName, username, phoneNumber, email, password } = req.body;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }, { phoneNumber }] },
  });
  if (existing) {
    const field =
      existing.username === username ? 'username' : existing.email === email ? 'email' : 'phone number';
    throw new ApiError(409, `An account with that ${field} already exists`);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { fullName, username, phoneNumber, email, passwordHash },
  });

  const accessToken = signAccessToken({ userId: user.id, username: user.username });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: refreshTokenExpiryDate(),
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    },
  });

  return res.status(201).json({
    user: publicUser(user),
    accessToken,
    refreshToken,
  });
}

export async function login(req: Request, res: Response) {
  const { identifier, password } = req.body; // identifier: username, email, or phone

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }, { phoneNumber: identifier }] },
  });
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new ApiError(401, 'Invalid credentials');
  }
  if (user.status !== 'ACTIVE') {
    throw new ApiError(403, `Account is ${user.status.toLowerCase()}`);
  }

  const accessToken = signAccessToken({ userId: user.id, username: user.username });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: refreshTokenExpiryDate(),
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    },
  });

  return res.json({ user: publicUser(user), accessToken, refreshToken });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(400, 'refreshToken is required');

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw new ApiError(401, 'Session expired. Please log in again.');
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw new ApiError(403, 'Account is not active');
  }

  // Rotate refresh token to limit replay window.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  const newRefreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: user.id,
      expiresAt: refreshTokenExpiryDate(),
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    },
  });

  const accessToken = signAccessToken({ userId: user.id, username: user.username });
  return res.json({ accessToken, refreshToken: newRefreshToken });
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  }
  return res.status(204).send();
}

export async function forgotPassword(req: Request, res: Response) {
  const { identifier } = req.body; // username, email, or phone

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }, { phoneNumber: identifier }] },
  });

  // Always respond the same way whether or not the account exists, so this
  // endpoint can't be used to enumerate registered users.
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });
    await sendPasswordResetEmail(user.email, token);
  }

  return res.json({ message: 'If an account exists, a reset link has been sent.' });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new ApiError(400, 'This reset link is invalid or has expired');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: resetToken.userId }, data: { revoked: true } }),
  ]);

  return res.status(204).send();
}

export async function logoutAllDevices(req: Request, res: Response) {
  await prisma.refreshToken.updateMany({
    where: { userId: req.user!.userId, revoked: false },
    data: { revoked: true },
  });
  return res.status(204).send();
}

// Strips sensitive fields before sending a user object to clients.
export function publicUser(user: {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phoneNumber: string;
  avatarUrl: string | null;
  bio: string | null;
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
}) {
  const { id, fullName, username, email, phoneNumber, avatarUrl, bio, isOnline, lastSeenAt, createdAt } =
    user;
  return { id, fullName, username, email, phoneNumber, avatarUrl, bio, isOnline, lastSeenAt, createdAt };
}
