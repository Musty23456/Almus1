import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { emitToConversation } from '../sockets/io';
import { assertCanSend } from '../utils/conversationAccess';
import { pushNewMessage } from '../services/push';

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
 * and attaches it to a new message. In production, replace the local disk write
 * (done by multer's storage engine) with an object-storage adapter - see
 * docs/ARCHITECTURE.md for the adapter interface.
 *
 * multer has already written the file to disk before this runs, so EVERY
 * rejection path below must delete it - otherwise a non-member or blocked user
 * could fill the disk with orphaned files.
 */
export async function uploadAttachment(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new ApiError(400, 'No file uploaded');

  try {
    const type = classifyMime(file.mimetype);
    if (!type) throw new ApiError(415, 'Unsupported file type');

    const { conversationId, content, replyToId, isVoiceNote } = req.body;
    if (typeof conversationId !== 'string' || !conversationId) {
      throw new ApiError(400, 'conversationId is required');
    }

    // Membership + server-side block enforcement (same gate as text messages).
    await assertCanSend(conversationId, req.user!.userId);

    if (replyToId) {
      const target = await prisma.message.findUnique({ where: { id: replyToId }, select: { conversationId: true } });
      if (!target || target.conversationId !== conversationId) {
        throw new ApiError(400, 'Cannot reply to a message from another conversation');
      }
    }

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
    emitToConversation(conversationId, 'message_received', message);
    pushNewMessage(message);

    return res.status(201).json({ message });
  } catch (err) {
    await fs.promises.unlink(file.path).catch(() => undefined);
    throw err;
  }
}
