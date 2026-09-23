import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { isBlockedEitherWay } from './blocking';

/** Boolean membership check (used by socket handlers that must fail silently). */
export async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return !!membership;
}

/** Throws 403 unless the user is a member of the conversation. */
export async function assertMember(conversationId: string, userId: string) {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) throw new ApiError(403, 'You are not a member of this conversation');
  return membership;
}

/**
 * Single gate for EVERY way of putting a new message into a conversation
 * (text, media upload, forward): membership + server-side block enforcement.
 * Never trust the client's local block state.
 */
export async function assertCanSend(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  if (conversation.type === 'DIRECT') {
    const peer = conversation.members.find((m) => m.userId !== userId);
    if (peer && (await isBlockedEitherWay(userId, peer.userId))) {
      throw new ApiError(403, 'You cannot message this user');
    }
  }
  return conversation;
}
