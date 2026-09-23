import { Router } from 'express';
import * as userController from '../controllers/userController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { updateProfileSchema, changePasswordSchema } from '../utils/schemas';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get('/me', asyncHandler(userController.getMe));
router.patch('/me', validate(updateProfileSchema), asyncHandler(userController.updateMe));
router.post('/me/change-password', validate(changePasswordSchema), asyncHandler(userController.changePassword));

router.get('/search', asyncHandler(userController.searchUsers));
router.get('/blocked', asyncHandler(userController.listBlocked));
router.get('/:id', asyncHandler(userController.getUserById));
router.post('/:id/block', asyncHandler(userController.blockUser));
router.delete('/:id/block', asyncHandler(userController.unblockUser));

export default router;
