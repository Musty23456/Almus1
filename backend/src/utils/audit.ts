import { prisma } from '../config/prisma';

export async function logAdminAction(
  adminId: string,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: { adminId, action, target, metadata: metadata as any },
  });
}
