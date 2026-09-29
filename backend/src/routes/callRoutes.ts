import { Router } from 'express';
import * as callController from '../controllers/callController';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(callController.getCallHistory));
router.get('/ice-servers', asyncHandler(callController.getIceServers));

export default router;
