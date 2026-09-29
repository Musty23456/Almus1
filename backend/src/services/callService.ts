import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { isBlockedEitherWay } from '../utils/blocking';

export type CallKind = 'VOICE' | 'VIDEO';

const userSelect = { id: true, fullName: true, username: true, avatarUrl: true };

/** Create a call record in RINGING state. Rejects self-calls, unknown users and blocks. */
export async function startCall(callerId: string, calleeId: string, type: CallKind) {
  if (callerId === calleeId) throw new ApiError(400, 'You cannot call yourself');

  const callee = await prisma.user.findFirst({
    where: { id: calleeId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!callee) throw new ApiError(404, 'User not available');

  if (await isBlockedEitherWay(callerId, calleeId)) {
    throw new ApiError(403, 'You cannot call this user');
  }

  return prisma.call.create({
    data: { callerId, calleeId, type },
    include: { caller: { select: userSelect }, callee: { select: userSelect } },
  });
}

/** Load a call and make sure the user is one of its two participants. */
export async function getCallForUser(callId: string, userId: string) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) throw new ApiError(404, 'Call not found');
  if (call.callerId !== userId && call.calleeId !== userId) {
    throw new ApiError(403, 'Not your call');
  }
  return call;
}

/** Callee accepts a ringing call. */
export async function acceptCall(callId: string, userId: string) {
  const call = await getCallForUser(callId, userId);
  if (call.calleeId !== userId) throw new ApiError(403, 'Only the callee can accept');
  if (call.status !== 'RINGING') throw new ApiError(409, 'Call is no longer ringing');
  return prisma.call.update({
    where: { id: callId },
    data: { status: 'ACCEPTED', answeredAt: new Date() },
  });
}

/** Callee rejects a ringing call. */
export async function rejectCall(callId: string, userId: string) {
  const call = await getCallForUser(callId, userId);
  if (call.calleeId !== userId) throw new ApiError(403, 'Only the callee can reject');
  if (call.status !== 'RINGING') throw new ApiError(409, 'Call is no longer ringing');
  return prisma.call.update({
    where: { id: callId },
    data: { status: 'REJECTED', endedAt: new Date() },
  });
}

/**
 * End a call. Either side can end it.
 * - still ringing + caller ends    -> CANCELED
 * - still ringing + system timeout -> MISSED (pass reason 'timeout')
 * - accepted                       -> ENDED with duration
 */
export async function endCall(callId: string, userId: string, reason?: 'timeout') {
  const call = await getCallForUser(callId, userId);
  if (['REJECTED', 'MISSED', 'CANCELED', 'ENDED'].includes(call.status)) return call;

  const now = new Date();
  if (call.status === 'RINGING') {
    return prisma.call.update({
      where: { id: callId },
      data: { status: reason === 'timeout' ? 'MISSED' : 'CANCELED', endedAt: now },
    });
  }
  const durationSec = call.answeredAt
    ? Math.max(0, Math.round((now.getTime() - call.answeredAt.getTime()) / 1000))
    : 0;
  return prisma.call.update({
    where: { id: callId },
    data: { status: 'ENDED', endedAt: now, durationSec },
  });
}

/** Call history for one user, newest first. */
export async function listCalls(userId: string, limit = 50, before?: Date) {
  return prisma.call.findMany({
    where: {
      OR: [{ callerId: userId }, { calleeId: userId }],
      ...(before ? { startedAt: { lt: before } } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    include: { caller: { select: userSelect }, callee: { select: userSelect } },
  });
}

const STALE_AFTER_MS = 2 * 60 * 60 * 1000; // ignore "active" calls older than 2h (crashed clients)

/** Calls of this user that are still ringing or in progress. */
export async function activeCallsOf(userId: string) {
  return prisma.call.findMany({
    where: {
      OR: [{ callerId: userId }, { calleeId: userId }],
      status: { in: ['RINGING', 'ACCEPTED'] },
      startedAt: { gt: new Date(Date.now() - STALE_AFTER_MS) },
    },
  });
}
