import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

// A user rarely has more than a couple of devices; cap it so stale tokens can't pile up.
const MAX_DEVICES_PER_USER = 10;

/**
 * Registers (or refreshes) this device's FCM token for the logged-in user.
 * A token belongs to exactly one account at a time: if the same phone logs into
 * another account, the token moves to that account (so the previous account
 * stops receiving notifications on that phone).
 */
export async function registerDevice(req: Request, res: Response) {
  const userId = req.user!.userId;
  const { token, platform } = req.body as { token: string; platform: string };

  await prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });

  const stale = await prisma.deviceToken.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    skip: MAX_DEVICES_PER_USER,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
  }

  return res.status(204).send();
}

/** Called on logout so this phone stops receiving the account's notifications. */
export async function unregisterDevice(req: Request, res: Response) {
  await prisma.deviceToken.deleteMany({
    where: { token: req.params.token, userId: req.user!.userId },
  });
  return res.status(204).send();
}
