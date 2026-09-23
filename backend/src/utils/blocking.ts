import { prisma } from '../config/prisma';

/**
 * Returns true if either user has blocked the other. This is the single
 * source of truth for enforcing blocks and MUST be checked server-side
 * before creating conversations, sending messages, or placing calls -
 * never trust the mobile client's local block state.
 */
export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
  });
  return !!block;
}
