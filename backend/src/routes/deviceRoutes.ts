
import { Router } from 'express';
import * as deviceController from '../controllers/deviceController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { registerDeviceSchema } from '../utils/schemas';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.post('/', validate(registerDeviceSchema), asyncHandler(deviceController.registerDevice));
router.delete('/:token', asyncHandler(deviceController.unregisterDevice));

export default router;
