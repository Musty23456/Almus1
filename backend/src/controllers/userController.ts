import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { hashPassword, verifyPassword } from '../utils/auth';
import { ApiError } from '../middleware/errorHandler';
import { publicUser } from './authController';

export async function getMe(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw new ApiError(404, 'User not found');
  return res.json({ user: publicUser(user) });
}

export async function updateMe(req: Request, res: Response) {
  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: req.body,
  });
  return res.json({ user: publicUser(user) });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  // Force re-login everywhere for security after a password change.
  await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } });
  return res.status(204).send();
}

export async function getUserById(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, 'User not found');
  if (!user.profileVisible && user.id !== req.user!.userId) {
    throw new ApiError(403, 'This profile is private');
  }
  const result: any = publicUser(user);
  if (!user.lastSeenVisible) delete result.lastSeenAt;
  return res.json({ user: result });
}

export async function searchUsers(req: Request, res: Response) {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) throw new ApiError(400, 'Query must be at least 2 characters');

  const users = await prisma.user.findMany({
    where: {
      profileVisible: true,
      id: { not: req.user!.userId },
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q } },
        { fullName: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
  });
  return res.json({ users: users.map(publicUser) });
}

export async function blockUser(req: Request, res: Response) {
  const blockedId = req.params.id;
  if (blockedId === req.user!.userId) throw new ApiError(400, 'You cannot block yourself');

  await prisma.blockedUser.upsert({
    where: { blockerId_blockedId: { blockerId: req.user!.userId, blockedId } },
    update: {},
    create: { blockerId: req.user!.userId, blockedId },
  });
  return res.status(204).send();
}

export async function unblockUser(req: Request, res: Response) {
  await prisma.blockedUser
    .delete({
      where: { blockerId_blockedId: { blockerId: req.user!.userId, blockedId: req.params.id } },
    })
    .catch(() => null); // idempotent
  return res.status(204).send();
}

export async function listBlocked(req: Request, res: Response) {
  const blocks = await prisma.blockedUser.findMany({
    where: { blockerId: req.user!.userId },
    include: { blocked: true },
  });
  return res.json({ users: blocks.map((b) => publicUser(b.blocked)) });
}
