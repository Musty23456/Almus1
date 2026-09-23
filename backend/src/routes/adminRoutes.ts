import { Router } from 'express';
import * as adminAuthController from '../controllers/adminAuthController';
import * as adminController from '../controllers/adminController';
import { authenticateAdmin, requireAdminRole } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  adminLoginSchema,
  updateUserStatusSchema,
  updateReportSchema,
  updateSystemSettingSchema,
} from '../utils/schemas';
import { authLimiter } from '../middleware/rateLimiters';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Public admin login (rate-limited against brute force). All other admin
// endpoints below require a valid admin JWT AND are role-checked.
router.post('/auth/login', authLimiter, validate(adminLoginSchema), asyncHandler(adminAuthController.adminLogin));

router.use(authenticateAdmin);

router.get('/dashboard', asyncHandler(adminController.getDashboardStats));
router.get('/server-status', asyncHandler(adminController.serverStatus));

router.get('/users', requireAdminRole('SUPER_ADMIN', 'ADMIN', 'MODERATOR'), asyncHandler(adminController.listUsers));
router.get('/users/:id', requireAdminRole('SUPER_ADMIN', 'ADMIN', 'MODERATOR'), asyncHandler(adminController.getUserDetail));
router.patch(
  '/users/:id/status',
  requireAdminRole('SUPER_ADMIN', 'ADMIN'),
  validate(updateUserStatusSchema),
  asyncHandler(adminController.updateUserStatus)
);
router.delete('/users/:id', requireAdminRole('SUPER_ADMIN'), asyncHandler(adminController.deleteUser));

router.get('/reports', requireAdminRole('SUPER_ADMIN', 'ADMIN', 'MODERATOR'), asyncHandler(adminController.listReports));
router.patch(
  '/reports/:id',
  requireAdminRole('SUPER_ADMIN', 'ADMIN', 'MODERATOR'),
  validate(updateReportSchema),
  asyncHandler(adminController.updateReport)
);

router.get('/groups', requireAdminRole('SUPER_ADMIN', 'ADMIN', 'MODERATOR'), asyncHandler(adminController.listGroups));

router.get('/audit-logs', requireAdminRole('SUPER_ADMIN', 'ADMIN'), asyncHandler(adminController.getAuditLogs));

router.get('/settings', requireAdminRole('SUPER_ADMIN', 'ADMIN'), asyncHandler(adminController.getSettings));
router.patch(
  '/settings',
  requireAdminRole('SUPER_ADMIN'),
  validate(updateSystemSettingSchema),
  asyncHandler(adminController.updateSetting)
);

router.get('/admins', requireAdminRole('SUPER_ADMIN'), asyncHandler(adminController.listAdmins));

export default router;
