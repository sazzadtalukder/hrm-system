import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  deactivateSchema,
  enrollmentCreateSchema,
  enrollmentUpdateSchema,
  idParams,
  lifecycleSchema,
  listQuery,
  myQuery,
  planCreateSchema,
  planUpdateSchema,
  planVersionSchema,
} from './benefitSchemas.js';
export function createBenefitRouter({ authenticate, authorizationService, benefitController }) {
  const router = Router();
  const permission = (code) => requirePermission(authorizationService, code);
  router.use(authenticate);
  router.get('/limits', permission('benefit_plan.view'), benefitController.limits);
  router.get(
    '/plans',
    permission('benefit_plan.view'),
    validate(listQuery, 'query'),
    benefitController.listPlans,
  );
  router.post(
    '/plans',
    permission('benefit_plan.create'),
    validate(planCreateSchema),
    benefitController.createPlan,
  );
  router.get(
    '/plans/:id',
    permission('benefit_plan.view'),
    validate(idParams, 'params'),
    benefitController.getPlan,
  );
  router.patch(
    '/plans/:id',
    permission('benefit_plan.update'),
    validate(idParams, 'params'),
    validate(planUpdateSchema),
    benefitController.updatePlan,
  );
  router.post(
    '/plans/:id/versions',
    permission('benefit_plan.version_create'),
    validate(idParams, 'params'),
    validate(planVersionSchema),
    benefitController.versionPlan,
  );
  router.post(
    '/plans/:id/corrections',
    permission('benefit_plan.correct_history'),
    validate(idParams, 'params'),
    validate(planVersionSchema),
    benefitController.correctPlan,
  );
  router.post(
    '/plans/:id/deactivate',
    permission('benefit_plan.deactivate'),
    validate(idParams, 'params'),
    validate(deactivateSchema),
    benefitController.deactivatePlan,
  );
  router.get(
    '/my-enrollments',
    permission('benefit_enrollment.view_own'),
    validate(myQuery, 'query'),
    benefitController.listOwn,
  );
  router.get(
    '/my-enrollments/:id',
    permission('benefit_enrollment.view_own'),
    validate(idParams, 'params'),
    benefitController.getOwnEnrollment,
  );
  router.get(
    '/enrollments/export',
    permission('benefit_enrollment.export'),
    validate(listQuery, 'query'),
    benefitController.export,
  );
  router.get(
    '/enrollments',
    permission('benefit_enrollment.view'),
    validate(listQuery, 'query'),
    benefitController.listEnrollments,
  );
  router.post(
    '/enrollments',
    permission('benefit_enrollment.create'),
    validate(enrollmentCreateSchema),
    benefitController.createEnrollment,
  );
  router.post(
    '/enrollments/historical',
    permission('benefit_enrollment.create_historical'),
    validate(enrollmentCreateSchema),
    benefitController.createHistorical,
  );
  router.get(
    '/enrollments/:id',
    permission('benefit_enrollment.view'),
    validate(idParams, 'params'),
    benefitController.getEnrollment,
  );
  router.patch(
    '/enrollments/:id/draft',
    permission('benefit_enrollment.update_draft'),
    validate(idParams, 'params'),
    validate(enrollmentUpdateSchema),
    benefitController.updateDraft,
  );
  router.get(
    '/enrollments/:id/history',
    permission('benefit_enrollment.view_history'),
    validate(idParams, 'params'),
    benefitController.history,
  );
  for (const action of ['activate', 'suspend', 'resume', 'end', 'cancel'])
    router.post(
      `/enrollments/:id/${action}`,
      permission(`benefit_enrollment.${action}`),
      validate(idParams, 'params'),
      validate(lifecycleSchema),
      benefitController.transition(action),
    );
  return router;
}
