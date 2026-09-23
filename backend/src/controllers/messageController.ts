import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { isBlockedEitherWay } from '../utils/blocking';
import { getIo } from '../sockets/io';

async function assertMember(conversationId: string, userId: string) {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) throw new ApiError(403, 'You are not a member of this conversation');
  return membership;
}

export async function listMessages(req: Request, res: Response) {
  await assertMember(req.params.conversationId, req.user!.userId);

  const cursor = req.query.cursor as string | undefined;
  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.conversationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { attachments: true, reactions: true },
  });
  return res.json({ messages: messages.reverse() });
}

export async function sendMessage(req: Request, res: Response) {
  const { conversationId, content, replyToId } = req.body;
  await assertMember(conversationId, req.user!.userId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  // Server-side block enforcement: never trust the client's local block state.
  if (conversation.type === 'DIRECT') {
    const peer = conversation.members.find((m) => m.userId !== req.user!.userId);
    if (peer && (await isBlockedEitherWay(req.user!.userId, peer.userId))) {
      throw new ApiError(403, 'You cannot message this user');
    }
  }

  if (!content) throw new ApiError(400, 'Message content is required (or attach media)');

  const message = await prisma.message.create({
    data: { conversationId, senderId: req.user!.userId, content, replyToId },
    include: { attachments: true, reactions: true },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  getIo()
    .to(`conversation:${conversationId}`)
    .emit('message_received', message);

  return res.status(201).json({ message });
}

export async function editMessage(req: Request, res: Response) {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message || message.isDeleted) throw new ApiError(404, 'Message not found');
  if (message.senderId !== req.user!.userId) throw new ApiError(403, 'You can only edit your own messages');

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { content: req.body.content, isEdited: true },
  });
  getIo().to(`conversation:${message.conversationId}`).emit('message_edited', updated);
  return res.json({ message: updated });
}

export async function deleteMessage(req: Request, res: Response) {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message) throw new ApiError(404, 'Message not found');
  if (message.senderId !== req.user!.userId) throw new ApiError(403, 'You can only delete your own messages');

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { isDeleted: true, content: null },
  });
  getIo().to(`conversation:${message.conversationId}`).emit('message_deleted', { id: message.id });
  return res.json({ message: updated });
}

export async function toggleStar(req: Request, res: Response) {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message) throw new ApiError(404, 'Message not found');
  await assertMember(message.conversationId, req.user!.userId);

  const starred = message.isStarredBy.includes(req.user!.userId);
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      isStarredBy: starred
        ? message.isStarredBy.filter((id) => id !== req.user!.userId)
        : [...message.isStarredBy, req.user!.userId],
    },
  });
  return res.json({ message: updated });
}

export async function reactToMessage(req: Request, res: Response) {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message) throw new ApiError(404, 'Message not found');
  await assertMember(message.conversationId, req.user!.userId);

  const { emoji } = req.body;
  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: message.id, userId: req.user!.userId, emoji } },
  });

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.messageReaction.create({
      data: { messageId: message.id, userId: req.user!.userId, emoji },
    });
  }

  const reactions = await prisma.messageReaction.findMany({ where: { messageId: message.id } });
  getIo().to(`conversation:${message.conversationId}`).emit('message_reaction', {
    messageId: message.id,
    reactions,
  });
  return res.json({ reactions });
}

export async function forwardMessage(req: Request, res: Response) {
  const original = await prisma.message.findUnique({ where: { id: req.params.id }, include: { attachments: true } });
  if (!original || original.isDeleted) throw new ApiError(404, 'Message not found');

  const { conversationId } = req.body;
  await assertMember(conversationId, req.user!.userId);

  const forwarded = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user!.userId,
      content: original.content,
      attachments: {
        create: original.attachments.map((a) => ({
          type: a.type,
          url: a.url,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      },
    },
    include: { attachments: true, reactions: true },
  });

  getIo().to(`conversation:${conversationId}`).emit('message_received', forwarded);
  return res.status(201).json({ message: forwarded });
}
