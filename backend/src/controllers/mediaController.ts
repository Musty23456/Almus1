import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { getIo } from '../sockets/io';
import path from 'path';

const ALLOWED_MIME_PREFIXES: Record<string, string> = {
  'image/': 'IMAGE',
  'video/': 'VIDEO',
  'audio/': 'AUDIO',
  'application/pdf': 'DOCUMENT',
  'application/msword': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument': 'DOCUMENT',
  'text/plain': 'DOCUMENT',
};

function classifyMime(mime: string): string | null {
  for (const [prefix, type] of Object.entries(ALLOWED_MIME_PREFIXES)) {
    if (mime.startsWith(prefix)) return type;
  }
  return null;
}

/**
 * Handles an uploaded file (validated for type/size by multer config in routes)
 * and attaches it to a new or existing message. In production, replace the
 * local disk write (done by multer's storage engine) with an object-storage
 * adapter — see docs/ARCHITECTURE.md for the adapter interface.
 */
export async function uploadAttachment(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new ApiError(400, 'No file uploaded');

  const type = classifyMime(file.mimetype);
  if (!type) throw new ApiError(415, 'Unsupported file type');

  const { conversationId, content, replyToId, isVoiceNote } = req.body;
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: req.user!.userId } },
  });
  if (!membership) throw new ApiError(403, 'You are not a member of this conversation');

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user!.userId,
      content: content || null,
      replyToId: replyToId || null,
      attachments: {
        create: [
          {
            type: (isVoiceNote === 'true' ? 'VOICE' : type) as any,
            url: `/uploads/${path.basename(file.path)}`,
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
          },
        ],
      },
    },
    include: { attachments: true, reactions: true },
  });

  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  getIo().to(`conversation:${conversationId}`).emit('message_received', message);

  return res.status(201).json({ message });
}
