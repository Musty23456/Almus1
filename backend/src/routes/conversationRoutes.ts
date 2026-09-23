import { Router } from 'express';
import * as conversationController from '../controllers/conversationController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createDirectConversationSchema } from '../utils/schemas';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(conversationController.listConversations));
router.post('/', validate(createDirectConversationSchema), asyncHandler(conversationController.createDirectConversation));
router.post('/:id/read', asyncHandler(conversationController.markConversationRead));

export default router;
