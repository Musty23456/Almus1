import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function createReport(req: Request, res: Response) {
  const { targetType, reason, details, reportedUserId, messageId, groupId } = req.body;
  const report = await prisma.report.create({
    data: {
      targetType,
      reason,
      details,
      reportedById: req.user!.userId,
      reportedUserId,
      messageId,
      groupId,
    },
  });
  return res.status(201).json({ report });
}

export async function myReports(req: Request, res: Response) {
  const reports = await prisma.report.findMany({
    where: { reportedById: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ reports });
}
