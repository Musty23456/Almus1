import { Router } from 'express';
import * as groupController from '../controllers/groupController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createGroupSchema } from '../utils/schemas';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.post('/', validate(createGroupSchema), asyncHandler(groupController.createGroup));
router.patch('/:groupId', asyncHandler(groupController.updateGroup));
router.post('/:groupId/members', asyncHandler(groupController.addMembers));
router.delete('/:groupId/members/:userId', asyncHandler(groupController.removeMember));
router.patch('/:groupId/members/:userId/role', asyncHandler(groupController.setMemberRole));
router.post('/:groupId/leave', asyncHandler(groupController.leaveGroup));

export default router;
