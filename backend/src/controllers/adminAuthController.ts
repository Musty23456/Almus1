import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { verifyPassword, signAdminAccessToken } from '../utils/auth';
import { ApiError } from '../middleware/errorHandler';
import { logAdminAction } from '../utils/audit';

export async function adminLogin(req: Request, res: Response) {
  const { email, password } = req.body;
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.isActive || !(await verifyPassword(admin.passwordHash, password))) {
    throw new ApiError(401, 'Invalid admin credentials');
  }

  const accessToken = signAdminAccessToken({ adminId: admin.id, role: admin.role });
  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await logAdminAction(admin.id, 'ADMIN_LOGIN');

  return res.json({
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    accessToken,
  });
}
