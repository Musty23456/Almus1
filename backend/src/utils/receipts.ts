import { prisma } from '../config/prisma';

/**
 * Marks a conversation as read for `userId`.
 *
 * - `lastReadAt` (unread counts on the user's own devices) is always updated.
 * - Message status is only flipped to READ ("blue ticks" for the sender) when
 *   the user has read receipts enabled. Otherwise senders never learn that
 *   the message was read - this is what the privacy setting promises.
 *
 * Shared by the REST endpoint and the socket handler so both behave identically.
 * (Limitation: `Message.status` is a single value, so in groups the first
 * reader flips it for everyone. Per-recipient receipts need a separate table.)
 */
export async function applyReadState(
  conversationId: string,
  userId: string
): Promise<{ receiptsShared: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { readReceiptsEnabled: true },
  });

  await prisma.conversationMember.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });

  if (!user?.readReceiptsEnabled) return { receiptsShared: false };

  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, status: { not: 'READ' } },
    data: { status: 'READ' },
  });
  return { receiptsShared: true };
}
