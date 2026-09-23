import { Router } from 'express';
import * as groupController from '../controllers/groupController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createGroupSchema, addGroupMembersSchema, setMemberRoleSchema } from '../utils/schemas';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.post('/', validate(createGroupSchema), asyncHandler(groupController.createGroup));
router.patch('/:groupId', asyncHandler(groupController.updateGroup));
router.post('/:groupId/members', validate(addGroupMembersSchema), asyncHandler(groupController.addMembers));
router.delete('/:groupId/members/:userId', asyncHandler(groupController.removeMember));
router.patch('/:groupId/members/:userId/role', validate(setMemberRoleSchema), asyncHandler(groupController.setMemberRole));
router.post('/:groupId/leave', asyncHandler(groupController.leaveGroup));

export default router;
