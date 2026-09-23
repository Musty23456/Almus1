import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../middleware/errorHandler';

async function assertGroupAdmin(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new ApiError(403, 'You are not a member of this group');
  if (membership.role !== 'ADMIN') throw new ApiError(403, 'Only group admins can do this');
  return membership;
}

export async function createGroup(req: Request, res: Response) {
  const { name, description, memberIds } = req.body;
  const ownerId = req.user!.userId;
  const uniqueMemberIds = Array.from(new Set([...memberIds, ownerId]));

  const setting = await prisma.systemSetting.findUnique({ where: { key: 'max_group_members' } });
  const maxMembers = setting ? parseInt(setting.value, 10) : 256;
  if (uniqueMemberIds.length > maxMembers) {
    throw new ApiError(400, `Groups are limited to ${maxMembers} members`);
  }

  const conversation = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      members: { create: uniqueMemberIds.map((userId: string) => ({ userId })) },
      group: {
        create: {
          name,
          description,
          ownerId,
          maxMembers,
          members: {
            create: uniqueMemberIds.map((userId: string) => ({
              userId,
              role: userId === ownerId ? 'ADMIN' : 'MEMBER',
            })),
          },
        },
      },
    },
    include: { group: { include: { members: true } } },
  });

  return res.status(201).json({ conversation });
}

export async function addMembers(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);

  const { memberIds } = req.body as { memberIds: string[] };
  await prisma.$transaction([
    ...memberIds.map((userId) =>
      prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        update: {},
        create: { groupId: group.id, userId },
      })
    ),
    ...memberIds.map((userId) =>
      prisma.conversationMember.upsert({
        where: { conversationId_userId: { conversationId: group.conversationId, userId } },
        update: {},
        create: { conversationId: group.conversationId, userId },
      })
    ),
  ]);
  return res.status(204).send();
}

export async function removeMember(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);

  await prisma.groupMember.deleteMany({ where: { groupId: group.id, userId: req.params.userId } });
  await prisma.conversationMember.deleteMany({
    where: { conversationId: group.conversationId, userId: req.params.userId },
  });
  return res.status(204).send();
}

export async function leaveGroup(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');

  await prisma.groupMember.deleteMany({ where: { groupId: group.id, userId: req.user!.userId } });
  await prisma.conversationMember.deleteMany({
    where: { conversationId: group.conversationId, userId: req.user!.userId },
  });
  return res.status(204).send();
}

export async function setMemberRole(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);

  const { role } = req.body as { role: 'ADMIN' | 'MEMBER' };
  await prisma.groupMember.update({
    where: { groupId_userId: { groupId: group.id, userId: req.params.userId } },
    data: { role },
  });
  return res.status(204).send();
}

export async function updateGroup(req: Request, res: Response) {
  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) throw new ApiError(404, 'Group not found');
  await assertGroupAdmin(group.id, req.user!.userId);

  const updated = await prisma.group.update({
    where: { id: group.id },
    data: {
      name: req.body.name ?? group.name,
      description: req.body.description ?? group.description,
      avatarUrl: req.body.avatarUrl ?? group.avatarUrl,
    },
  });
  return res.json({ group: updated });
}
