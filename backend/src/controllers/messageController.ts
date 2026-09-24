import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { assertMember, assertCanSend } from '../utils/conversationAccess';
import { emitToConversation } from '../sockets/io';
import { pushNewMessage } from '../services/push';

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
  // A deleted message must not keep exposing its media.
  const visible = messages.reverse().map((m) => (m.isDeleted ? { ...m, attachments: [] } : m));
  return res.json({ messages: visible });
}

export async function sendMessage(req: Request, res: Response) {
  const { conversationId, content, replyToId } = req.body;

  // Membership + server-side block enforcement (same gate as media upload and forward).
  await assertCanSend(conversationId, req.user!.userId);

  if (!content) throw new ApiError(400, 'Message content is required (or attach media)');

  if (replyToId) {
    const target = await prisma.message.findUnique({ where: { id: replyToId }, select: { conversationId: true } });
    if (!target || target.conversationId !== conversationId) {
      throw new ApiError(400, 'Cannot reply to a message from another conversation');
    }
  }

  const message = await prisma.message.create({
    data: { conversationId, senderId: req.user!.userId, content, replyToId },
    include: { attachments: true, reactions: true },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  emitToConversation(conversationId, 'message_received', message);
  pushNewMessage(message);

  return res.status(201).json({ message });
}

export async function editMessage(req: Request, res: Response) {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message || message.isDeleted) throw new ApiError(404, 'Message not found');
  if (message.senderId !== req.user!.userId) throw new ApiError(403, 'You can only edit your own messages');
  await assertMember(message.conversationId, req.user!.userId);

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { content: req.body.content, isEdited: true },
  });
  emitToConversation(message.conversationId, 'message_edited', updated);
  return res.json({ message: updated });
}

export async function deleteMessage(req: Request, res: Response) {
  const message = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!message) throw new ApiError(404, 'Message not found');
  if (message.senderId !== req.user!.userId) throw new ApiError(403, 'You can only delete your own messages');
  await assertMember(message.conversationId, req.user!.userId);

  // Delete-for-everyone also removes the attachment records so the media URL is no longer served in APIs.
  const [updated] = await prisma.$transaction([
    prisma.message.update({ where: { id: message.id }, data: { isDeleted: true, content: null } }),
    prisma.attachment.deleteMany({ where: { messageId: message.id } }),
  ]);
  emitToConversation(message.conversationId, 'message_deleted', { id: message.id });
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
  emitToConversation(message.conversationId, 'message_reaction', { messageId: message.id, reactions });
  return res.json({ reactions });
}

export async function forwardMessage(req: Request, res: Response) {
  const original = await prisma.message.findUnique({ where: { id: req.params.id }, include: { attachments: true } });
  if (!original || original.isDeleted) throw new ApiError(404, 'Message not found');

  // You may only forward what you can already see, and only where you may send.
  await assertMember(original.conversationId, req.user!.userId);
  const { conversationId } = req.body;
  await assertCanSend(conversationId, req.user!.userId);

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

  });

  emitToConversation(conversationId, 'message_received', forwarded);
  pushNewMessage(forwarded);
  return res.status(201).json({ message: forwarded });
}
