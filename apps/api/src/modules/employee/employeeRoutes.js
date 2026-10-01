import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  assignmentSchema,
  employeeCreateSchema,
  employmentCreateSchema,
  employeeListQuery,
  employeeUpdateSchema,
  idParams,
  contactParams,
  detailQuery,
  lifecycleSchema,
  personalSchema,
  contactSchema,
  statusTransitionSchema,
  userLinkSchema,
  userUnlinkSchema,
  emergencyContactCreateSchema,
  emergencyContactUpdateSchema,
} from './employeeSchemas.js';

export function createEmployeeRouter({ authenticate, authorizationService, employeeController }) {
  const router = Router();
  router.use(authenticate);
  const permission = (code) => requirePermission(authorizationService, code);
  router.get(
    '/',
    permission('employee.view'),
    validate(employeeListQuery, 'query'),
    employeeController.list,
  );
  router.post(
    '/',
    permission('employee.create'),
    validate(employeeCreateSchema),
    employeeController.create,
  );
  router.get(
    '/:id',
    permission('employee.view'),
    validate(idParams, 'params'),
    validate(detailQuery, 'query'),
    employeeController.get,
  );
  router.patch(
    '/:id',
    permission('employee.update'),
    validate(idParams, 'params'),
    validate(employeeUpdateSchema),
    employeeController.update,
  );
  router.post(
    '/:id/activate',
    permission('employee.activate'),
    validate(idParams, 'params'),
    validate(lifecycleSchema),
    employeeController.activate,
  );
  router.post(
    '/:id/deactivate',
    permission('employee.deactivate'),
    validate(idParams, 'params'),
    validate(lifecycleSchema),
    employeeController.deactivate,
  );
  router.get(
    '/:id/history',
    permission('employee.view_history'),
    validate(idParams, 'params'),
    validate(detailQuery, 'query'),
    employeeController.history,
  );
  router.get(
    '/:id/employments',
    permission('employee.view_history'),
    validate(idParams, 'params'),
    validate(detailQuery, 'query'),
    employeeController.employments,
  );
  router.get(
    '/:id/assignments',
    permission('employee.view_history'),
    validate(idParams, 'params'),
    validate(detailQuery, 'query'),
    employeeController.assignments,
  );
  router.get(
    '/:id/status-history',
    permission('employee.view_history'),
    validate(idParams, 'params'),
    validate(detailQuery, 'query'),
    employeeController.statuses,
  );
  router.post(
    '/:id/assignments',
    permission('employee.manage_assignment'),
    validate(idParams, 'params'),
    validate(assignmentSchema),
    employeeController.addAssignment,
  );
  router.post(
    '/:id/status-transitions',
    permission('employee.manage_status'),
    validate(idParams, 'params'),
    validate(statusTransitionSchema),
    employeeController.transitionStatus,
  );
  router.post(
    '/:id/employments',
    permission('employee.create'),
    validate(idParams, 'params'),
    validate(employmentCreateSchema),
    employeeController.createEmployment,
  );
  router.get(
    '/:id/personal',
    permission('employee.view'),
    validate(idParams, 'params'),
    employeeController.getPersonal,
  );
  router.patch(
    '/:id/personal',
    permission('employee.view'),
    validate(idParams, 'params'),
    validate(personalSchema),
    employeeController.updatePersonal,
  );
  router.get(
    '/:id/contact',
    permission('employee.view'),
    validate(idParams, 'params'),
    employeeController.getContact,
  );
  router.patch(
    '/:id/contact',
    permission('employee.view'),
    validate(idParams, 'params'),
    validate(contactSchema),
    employeeController.updateContact,
  );
  router.post(
    '/:id/emergency-contacts',
    permission('employee.view'),
    validate(idParams, 'params'),
    validate(emergencyContactCreateSchema),
    employeeController.createEmergencyContact,
  );
  router.patch(
    '/:id/emergency-contacts/:contactId',
    permission('employee.view'),
    validate(contactParams, 'params'),
    validate(emergencyContactUpdateSchema),
    employeeController.updateEmergencyContact,
  );
  router.post(
    '/:id/emergency-contacts/:contactId/deactivate',
    permission('employee.view'),
    validate(contactParams, 'params'),
    validate(lifecycleSchema),
    employeeController.deactivateEmergencyContact,
  );
  router.post(
    '/:id/user-link',
    permission('employee.link_user'),
    validate(idParams, 'params'),
    validate(userLinkSchema),
    employeeController.linkUser,
  );
  router.post(
    '/:id/user-unlink',
    permission('employee.link_user'),
    validate(idParams, 'params'),
    validate(userUnlinkSchema),
    employeeController.unlinkUser,
  );
  return router;
}
