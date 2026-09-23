import { Router } from 'express';
import * as reportController from '../controllers/reportController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { reportSchema } from '../utils/schemas';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.post('/', validate(reportSchema), asyncHandler(reportController.createReport));
router.get('/mine', asyncHandler(reportController.myReports));

export default router;
