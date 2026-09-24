import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().min(2).max(80),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_.]+$/, 'Username can only contain letters, numbers, dots, and underscores'),
  phoneNumber: z.string().min(7).max(20),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(3),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(128),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(80).optional(),
  bio: z.string().max(200).optional(),
  avatarUrl: z.string().url().optional(),
  lastSeenVisible: z.boolean().optional(),
  profileVisible: z.boolean().optional(),
  readReceiptsEnabled: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const createMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(4000).optional(),
  replyToId: z.string().uuid().optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const forwardMessageSchema = z.object({
  conversationId: z.string().uuid(),
});

export const reactMessageSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const createDirectConversationSchema = z.object({
  userId: z.string().uuid(),
});

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
  memberIds: z.array(z.string().uuid()).min(1).max(256),
});

export const addGroupMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(256),
});

export const setMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

export const reportSchema = z.object({
  targetType: z.enum(['USER', 'MESSAGE', 'GROUP']),
  reason: z.enum(['SPAM', 'HARASSMENT', 'ABUSE', 'IMPERSONATION', 'INAPPROPRIATE_CONTENT', 'OTHER']),
  details: z.string().max(1000).optional(),
  reportedUserId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
});

export const updateReportSchema = z.object({
  status: z.enum(['PENDING', 'INVESTIGATING', 'RESOLVED', 'REJECTED']),
});

export const updateSystemSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export const registerDeviceSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
});
