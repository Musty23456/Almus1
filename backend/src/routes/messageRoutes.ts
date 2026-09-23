import { Router } from 'express';
import * as messageController from '../controllers/messageController';
import * as mediaController from '../controllers/mediaController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createMessageSchema } from '../utils/schemas';
import { upload } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get('/:conversationId', asyncHandler(messageController.listMessages));
router.post('/', validate(createMessageSchema), asyncHandler(messageController.sendMessage));
router.post('/upload', upload.single('file'), asyncHandler(mediaController.uploadAttachment));
router.patch('/:id', asyncHandler(messageController.editMessage));
router.delete('/:id', asyncHandler(messageController.deleteMessage));
router.post('/:id/star', asyncHandler(messageController.toggleStar));
router.post('/:id/react', asyncHandler(messageController.reactToMessage));
router.post('/:id/forward', asyncHandler(messageController.forwardMessage));

export default router;
