import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  calendarDaysSchema,
  companyUpdateSchema,
  holidayCreateSchema,
  holidayUpdateSchema,
  idParams,
  lifecycleSchema,
  listQuery,
  masterCreateSchema,
  masterUpdateSchema,
} from './organizationSchemas.js';

export function createOrganizationRouter({
  authenticate,
  authorizationService,
  organizationController,
}) {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/companies',
    requirePermission(authorizationService, 'company.view'),
    organizationController.listCompanies,
  );
  router.get(
    '/companies/:id',
    requirePermission(authorizationService, 'company.view'),
    validate(idParams, 'params'),
    organizationController.getCompany,
  );
  router.patch(
    '/companies/:id',
    requirePermission(authorizationService, 'company.update'),
    validate(idParams, 'params'),
    validate(companyUpdateSchema),
    organizationController.updateCompany,
  );

  const resources = [
    ['branches', 'branch', 'Branch', 'Branches'],
    ['departments', 'department', 'Department', 'Departments'],
    ['designations', 'designation', 'Designation', 'Designations'],
    ['grades', 'grade', 'Grade', 'Grades'],
    ['cost-centers', 'cost_center', 'CostCenter', 'CostCenters'],
    ['work-calendars', 'work_calendar', 'WorkCalendar', 'WorkCalendars'],
  ];
  for (const [path, permissionResource, controllerSuffix, controllerPlural] of resources) {
    router.get(
      `/${path}`,
      requirePermission(authorizationService, `${permissionResource}.view`),
      validate(listQuery, 'query'),
      organizationController[`list${controllerPlural}`],
    );
    router.post(
      `/${path}`,
      requirePermission(authorizationService, `${permissionResource}.create`),
      validate(masterCreateSchema),
      organizationController[`create${controllerSuffix}`],
    );
    router.get(
      `/${path}/:id`,
      requirePermission(authorizationService, `${permissionResource}.view`),
      validate(idParams, 'params'),
      organizationController[`get${controllerSuffix}`],
    );
    router.patch(
      `/${path}/:id`,
      requirePermission(authorizationService, `${permissionResource}.update`),
      validate(idParams, 'params'),
      validate(masterUpdateSchema),
      organizationController[`update${controllerSuffix}`],
    );
    router.post(
      `/${path}/:id/activate`,
      requirePermission(authorizationService, `${permissionResource}.update`),
      validate(idParams, 'params'),
      validate(lifecycleSchema),
      organizationController[`activate${controllerSuffix}`],
    );
    router.post(
      `/${path}/:id/deactivate`,
      requirePermission(authorizationService, `${permissionResource}.deactivate`),
      validate(idParams, 'params'),
      validate(lifecycleSchema),
      organizationController[`deactivate${controllerSuffix}`],
    );
  }

  router.put(
    '/work-calendars/:id/days',
    requirePermission(authorizationService, 'work_calendar.update'),
    validate(idParams, 'params'),
    validate(calendarDaysSchema),
    organizationController.replaceCalendarDays,
  );
  router.get(
    '/holidays',
    requirePermission(authorizationService, 'holiday.view'),
    validate(listQuery, 'query'),
    organizationController.listHolidays,
  );
  router.post(
    '/holidays',
    requirePermission(authorizationService, 'holiday.create'),
    validate(holidayCreateSchema),
    organizationController.createHoliday,
  );
  router.get(
    '/holidays/:id',
    requirePermission(authorizationService, 'holiday.view'),
    validate(idParams, 'params'),
    organizationController.getHoliday,
  );
  router.patch(
    '/holidays/:id',
    requirePermission(authorizationService, 'holiday.update'),
    validate(idParams, 'params'),
    validate(holidayUpdateSchema),
    organizationController.updateHoliday,
  );
  router.post(
    '/holidays/:id/cancel',
    requirePermission(authorizationService, 'holiday.cancel'),
    validate(idParams, 'params'),
    validate(lifecycleSchema),
    organizationController.cancelHoliday,
  );
  return router;
}
