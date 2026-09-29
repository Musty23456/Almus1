import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';
import { joinConversationRoom, leaveConversationRoom } from '../sockets/io';

async function assertGroupAdmin(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new ApiError(403, 'You are not a member of this group');
  if (membership.role !== 'ADMIN') throw new ApiError(403, 'Only group admins can do this');
  return membership;
}

async function assertMember(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new ApiError(403, 'You are not a member of this group');
  return membership;
}

async function assertAddable(actorId: string, userIds: string[]) {
  const others = userIds.filter((id) => id !== actorId);
  if (others.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: others }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (users.length !== others.length) {
    throw new ApiError(400, 'One or more users do not exist or are unavailable');
  }

  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: actorId, blockedId: { in: others } },
        { blockedId: actorId, blockerId: { in: others } },
      ],
    },
  });
  if (block) throw new ApiError(403, 'One or more users cannot be added to this group');
}

async function makeInviteCode() {
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(9).toString('base64url');
    const existing = await prisma.group.findUnique({ where: { inviteCode: code } });
    if (!existing) return code;
  }
  throw new ApiError(500, 'Could not create invite link');
}

export async function createGroup(req: Request, res: Response) {
  const { name, description, memberIds } = req.body;
  const ownerId = req.user!.userId;
  const uniqueMemberIds: string[] = Array.from(new Set<string>([...memberIds, ownerId]));

  const setting = await prisma.systemSetting.findUnique({ where: { key: 'max_group_members' } });
  const parsedMax = setting ? parseInt(setting.value, 10) : NaN;
  const maxMembers = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 256;

  if (uniqueMemberIds.length > maxMembers) {
    throw new ApiError(400, `Groups are limited to ${maxMembers} members`);
  }

  await assertAddable(ownerId, uniqueMemberIds);
  const inviteCode = await makeInviteCode();

  const conversation = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      members: { create: uniqueMemberIds.map((userId) => ({ userId })) },
      group: {
        create: {
          name,
          description,
          ownerId,
          maxMembers,
          inviteCode,
          members: {
            create: uniqueMemberIds.map((userId) => ({
              userId,
              role: userId === ownerId ? 'ADMIN' : 'MEMBER',
            })),
          },
        },
      },
    },
    include: {
      group: {
        include: {
          members: { include: { user: { select: { id: true, fullName: true, username: true, avatarUrl: true } } } },
        },
      },
    },
  });

  uniqueMemberIds.forEach((userId) => joinConversationRoom(userId, conversation.id));
  return res.status(201).json({ conversation });
}

export async function getGroup(req: Request, res: Response) {
  const group = await prisma.group.findUnique({
    where: { id: req.params.groupId },
    include: {
      members: {
        orderBy: { joinedAt: 'asc' },
        include: { user: { select: { id: true, fullName: true, username: true, avatarUrl: true } } },
      },
    },
  });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertMember(group.id, req.user!.userId);
  return res.json({ group });
}

export async function getGroupByConversation(req: Request, res: Response) {
  const group = await prisma.group.findUnique({
    where: { conversationId: req.params.conversationId },
    include: {
      members: {
        orderBy: { joinedAt: 'asc' },
        include: { user: { select: { id: true, fullName: true, username: true, avatarUrl: true } } },
      },
    },
  });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertMember(group.id, req.user!.userId);
  return res.json({ group });
}

export async function addMembers(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);

  const requested: string[] = Array.from(new Set<string>(req.body.memberIds));
  const current = await prisma.groupMember.findMany({ where: { groupId: group.id }, select: { userId: true } });
  const currentIds = new Set(current.map((m) => m.userId));
  const toAdd = requested.filter((id) => !currentIds.has(id));

  if (currentIds.size + toAdd.length > group.maxMembers) {
    throw new ApiError(400, `Groups are limited to ${group.maxMembers} members`);
  }
  await assertAddable(req.user!.userId, toAdd);

  if (toAdd.length > 0) {
    await prisma.$transaction([
      prisma.groupMember.createMany({
        data: toAdd.map((userId) => ({ groupId: group.id, userId })),
        skipDuplicates: true,
      }),
      prisma.conversationMember.createMany({
        data: toAdd.map((userId) => ({ conversationId: group.conversationId, userId })),
        skipDuplicates: true,
      }),
    ]);
    toAdd.forEach((userId) => joinConversationRoom(userId, group.conversationId));
  }
  return res.status(204).send();
}

export async function removeMember(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);

  const targetId = req.params.userId;
  if (targetId === group.ownerId) throw new ApiError(403, 'The group owner cannot be removed');
  if (targetId === req.user!.userId) throw new ApiError(400, 'Use the leave endpoint to leave a group');

  await prisma.$transaction([
    prisma.groupMember.deleteMany({ where: { groupId: group.id, userId: targetId } }),
    prisma.conversationMember.deleteMany({ where: { conversationId: group.conversationId, userId: targetId } }),
  ]);
  leaveConversationRoom(targetId, group.conversationId);
  return res.status(204).send();
}

export async function leaveGroup(req: Request, res: Response) {
  const userId = req.user!.userId;
  const group = await prisma.group.findUnique({
    where: { id: req.params.groupId },
    include: { members: { orderBy: { joinedAt: 'asc' } } },
  });
  if (!group) throw new ApiError(404, 'Group not found');
  if (!group.members.some((m) => m.userId === userId)) {
    throw new ApiError(404, 'You are not a member of this group');
  }

  const others = group.members.filter((m) => m.userId !== userId);
  const ops: any[] = [
    prisma.groupMember.deleteMany({ where: { groupId: group.id, userId } }),
    prisma.conversationMember.deleteMany({ where: { conversationId: group.conversationId, userId } }),
  ];

  if (group.ownerId === userId && others.length > 0) {
    const newOwner = others.find((m) => m.role === 'ADMIN') ?? others[0];
    ops.push(
      prisma.group.update({ where: { id: group.id }, data: { ownerId: newOwner.userId } }),
      prisma.groupMember.update({ where: { id: newOwner.id }, data: { role: 'ADMIN' } }),
    );
  }

  await prisma.$transaction(ops);
  leaveConversationRoom(userId, group.conversationId);
  return res.status(204).send();
}

export async function setMemberRole(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);

  if (req.params.userId === group.ownerId) {
    throw new ApiError(403, "The group owner's role cannot be changed");
  }

  const { role } = req.body as { role: 'ADMIN' | 'MEMBER' };
  const { count } = await prisma.groupMember.updateMany({
    where: { groupId: group.id, userId: req.params.userId },
    data: { role },
  });
  if (count === 0) throw new ApiError(404, 'That user is not a member of this group');
  return res.status(204).send();
}

export async function updateGroup(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);

  if (group.onlyAdminsEditInfo && req.user!.userId !== group.ownerId) {
    throw new ApiError(403, 'Only the group owner can change group settings');
  }

  const updated = await prisma.group.update({
    where: { id: group.id },
    data: {
      name: req.body.name ?? group.name,
      description: req.body.description ?? group.description,
      avatarUrl: req.body.avatarUrl ?? group.avatarUrl,
      onlyAdminsSend: req.body.onlyAdminsSend ?? group.onlyAdminsSend,
      onlyAdminsEditInfo: req.body.onlyAdminsEditInfo ?? group.onlyAdminsEditInfo,
    },
  });
  return res.json({ group: updated });
}

export async function regenerateInvite(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);
  const inviteCode = await makeInviteCode();
  const updated = await prisma.group.update({ where: { id: group.id }, data: { inviteCode } });
  return res.json({ inviteCode: updated.inviteCode });
}

export async function joinByInvite(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { inviteCode: req.params.inviteCode } });
  if (!group) throw new ApiError(404, 'Invalid or expired invite link');

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: req.user!.userId } },
  });
  if (existing) return res.json({ conversationId: group.conversationId, alreadyMember: true });

  const count = await prisma.groupMember.count({ where: { groupId: group.id } });
  if (count >= group.maxMembers) throw new ApiError(400, 'This group is full');

  await prisma.$transaction([
    prisma.groupMember.create({ data: { groupId: group.id, userId: req.user!.userId } }),
    prisma.conversationMember.create({ data: { conversationId: group.conversationId, userId: req.user!.userId } }),
  ]);
  joinConversationRoom(req.user!.userId, group.conversationId);
  return res.status(201).json({ conversationId: group.conversationId });
}
