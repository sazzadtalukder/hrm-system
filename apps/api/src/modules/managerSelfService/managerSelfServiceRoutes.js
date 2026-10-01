import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';

export function createManagerSelfServiceRouter({
  authenticate,
  authorizationService,
  managerSelfServiceController,
}) {
  const router = Router();
  router.use(authenticate);
  router.get(
    '/dashboard',
    requirePermission(authorizationService, 'manager_self_service.view'),
    validate(z.object({ companyId: z.coerce.number().int().positive() }), 'query'),
    managerSelfServiceController.dashboard,
  );
  return router;
}
