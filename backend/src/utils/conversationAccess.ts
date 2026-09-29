import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { isBlockedEitherWay } from './blocking';

export async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return !!membership;
}

export async function assertMember(conversationId: string, userId: string) {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) throw new ApiError(403, 'You are not a member of this conversation');
  return membership;
}

export async function assertCanSend(conversationId: string, userId: string) {
  const membership = await assertMember(conversationId, userId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true, group: true },
  });
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  if (conversation.type === 'GROUP' && conversation.group?.onlyAdminsSend) {
    const groupMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: conversation.group.id, userId } },
    });
    if (groupMember?.role !== 'ADMIN') {
      throw new ApiError(403, 'Only group admins can send messages in this group');
    }
  }

  if (conversation.type === 'DIRECT') {
    const peer = conversation.members.find((m) => m.userId !== userId);
    if (peer && (await isBlockedEitherWay(userId, peer.userId))) {
      throw new ApiError(403, 'You cannot message this user');
    }
  }

  return conversation;
}
