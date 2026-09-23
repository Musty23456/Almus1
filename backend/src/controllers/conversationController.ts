import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { isBlockedEitherWay } from '../utils/blocking';

export async function listConversations(req: Request, res: Response) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: req.user!.userId },
    include: {
      conversation: {
        include: {
          group: true,
          members: { include: { user: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
  });

  const result = memberships.map((m) => {
    const conv = m.conversation;
    const otherMember =
      conv.type === 'DIRECT' ? conv.members.find((mem) => mem.userId !== req.user!.userId) : null;
    return {
      id: conv.id,
      type: conv.type,
      group: conv.group ? { id: conv.group.id, name: conv.group.name, avatarUrl: conv.group.avatarUrl } : null,
      peer:
        otherMember && conv.type === 'DIRECT'
          ? {
              id: otherMember.user.id,
              username: otherMember.user.username,
              fullName: otherMember.user.fullName,
              avatarUrl: otherMember.user.avatarUrl,
              isOnline: otherMember.user.isOnline,
            }
          : null,
      lastMessage: conv.messages[0] ?? null,
      lastReadAt: m.lastReadAt,
      updatedAt: conv.updatedAt,
    };
  });

  return res.json({ conversations: result });
}

export async function createDirectConversation(req: Request, res: Response) {
  const { userId: peerId } = req.body;
  if (peerId === req.user!.userId) throw new ApiError(400, 'Cannot start a conversation with yourself');

  const peer = await prisma.user.findUnique({ where: { id: peerId } });
  if (!peer) throw new ApiError(404, 'User not found');

  if (await isBlockedEitherWay(req.user!.userId, peerId)) {
    throw new ApiError(403, 'Unable to start this conversation');
  }

  // Reuse an existing direct conversation between these two users, if any.
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId: req.user!.userId } } },
        { members: { some: { userId: peerId } } },
      ],
    },
  });
  if (existing) return res.json({ conversation: existing });

  const conversation = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      members: { create: [{ userId: req.user!.userId }, { userId: peerId }] },
    },
  });
  return res.status(201).json({ conversation });
}

export async function markConversationRead(req: Request, res: Response) {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user!.userId } },
  });
  if (!membership) throw new ApiError(404, 'Conversation not found');

  await prisma.conversationMember.update({
    where: { id: membership.id },
    data: { lastReadAt: new Date() },
  });
  await prisma.message.updateMany({
    where: { conversationId: req.params.id, senderId: { not: req.user!.userId }, status: { not: 'READ' } },
    data: { status: 'READ' },
  });
  return res.status(204).send();
}
