import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { logAdminAction } from '../utils/audit';

export async function getDashboardStats(req: Request, res: Response) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const [
    totalUsers,
    onlineUsers,
    newUsersToday,
    newUsersThisWeek,
    totalMessages,
    totalGroups,
    pendingReports,
    suspendedUsers,
    bannedUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isOnline: true } }),
    prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.message.count(),
    prisma.group.count(),
    prisma.report.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count({ where: { status: 'BANNED' } }),
  ]);

  return res.json({
    totalUsers,
    onlineUsers,
    newUsersToday,
    newUsersThisWeek,
    totalMessages,
    totalGroups,
    pendingReports,
    suspendedUsers,
    bannedUsers,
    databaseStatus: 'connected',
  });
}

export async function listUsers(req: Request, res: Response) {
  const q = String(req.query.q ?? '').trim();
  const status = req.query.status as string | undefined;

  const users = await prisma.user.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phoneNumber: { contains: q } },
            ],
          }
        : {}),
      ...(status ? { status: status as any } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return res.json({ users });
}

export async function getUserDetail(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, 'User not found');
  const reports = await prisma.report.findMany({ where: { reportedUserId: user.id } });
  return res.json({ user, reports });
}

export async function updateUserStatus(req: Request, res: Response) {
  const { status } = req.body;
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status } });
  await logAdminAction(req.admin!.adminId, `USER_${status}`, user.id);
  return res.json({ user });
}

export async function deleteUser(req: Request, res: Response) {
  await prisma.user.delete({ where: { id: req.params.id } });
  await logAdminAction(req.admin!.adminId, 'USER_DELETED', req.params.id);
  return res.status(204).send();
}

export async function listReports(req: Request, res: Response) {
  const status = req.query.status as string | undefined;
  const reports = await prisma.report.findMany({
    where: status ? { status: status as any } : {},
    include: { reportedBy: true, reportedUser: true, message: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ reports });
}

export async function updateReport(req: Request, res: Response) {
  const { status } = req.body;
  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: {
      status,
      resolvedAt: ['RESOLVED', 'REJECTED'].includes(status) ? new Date() : null,
      resolvedById: req.admin!.adminId,
    },
  });
  await logAdminAction(req.admin!.adminId, `REPORT_${status}`, report.id);
  return res.json({ report });
}

export async function listGroups(req: Request, res: Response) {
  const groups = await prisma.group.findMany({
    include: { members: true, owner: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return res.json({ groups });
}

export async function getAuditLogs(req: Request, res: Response) {
  const logs = await prisma.auditLog.findMany({
    include: { admin: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return res.json({ logs });
}

export async function getSettings(req: Request, res: Response) {
  const settings = await prisma.systemSetting.findMany();
  return res.json({ settings });
}

export async function updateSetting(req: Request, res: Response) {
  const { key, value } = req.body;
  const setting = await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  await logAdminAction(req.admin!.adminId, 'SETTING_UPDATED', key, { value });
  return res.json({ setting });
}

export async function listAdmins(req: Request, res: Response) {
  const admins = await prisma.adminUser.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, lastLoginAt: true },
  });
  return res.json({ admins });
}

export async function serverStatus(req: Request, res: Response) {
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  return res.json({
    api: 'ok',
    database: dbOk ? 'ok' : 'unreachable',
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
