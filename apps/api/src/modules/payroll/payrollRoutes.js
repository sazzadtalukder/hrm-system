import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import * as schema from './payrollSchemas.js';

export function createPayrollRouter({ authenticate, authorizationService, payrollController }) {
  const router = Router();
  const permission = (code) => requirePermission(authorizationService, code);
  router.use(authenticate);
  router.get('/limits', permission('payroll.view'), payrollController.limits);
  router.get(
    '/periods',
    permission('payroll_period.view'),
    validate(schema.listQuery, 'query'),
    payrollController.periods,
  );
  router.post(
    '/periods',
    permission('payroll_period.create'),
    validate(schema.periodCreateSchema),
    payrollController.createPeriod,
  );
  router.patch(
    '/periods/:id',
    permission('payroll_period.update'),
    validate(schema.idParams, 'params'),
    validate(schema.periodUpdateSchema),
    payrollController.updatePeriod,
  );
  router.get(
    '/components',
    permission('payroll_component.view'),
    validate(schema.listQuery, 'query'),
    payrollController.components,
  );
  router.post(
    '/components',
    permission('payroll_component.create'),
    validate(schema.componentCreateSchema),
    payrollController.createComponent,
  );
  router.patch(
    '/components/:id',
    permission('payroll_component.update'),
    validate(schema.idParams, 'params'),
    validate(schema.componentUpdateSchema),
    payrollController.updateComponent,
  );
  router.post(
    '/components/:id/deactivate',
    permission('payroll_component.deactivate'),
    validate(schema.idParams, 'params'),
    validate(schema.lifecycleSchema),
    payrollController.deactivateComponent,
  );
  router.get(
    '/employments/:id/compensation',
    permission('employee_compensation.view'),
    validate(schema.idParams, 'params'),
    payrollController.compensation,
  );
  router.post(
    '/employments/:id/compensation-periods',
    permission('employee_compensation.update'),
    validate(schema.idParams, 'params'),
    validate(schema.compensationSchema),
    payrollController.addCompensation,
  );
  router.post(
    '/employments/:id/recurring-components',
    permission('payroll_input.create'),
    validate(schema.idParams, 'params'),
    validate(schema.recurringSchema),
    payrollController.addRecurring,
  );
  router.post(
    '/one-time-inputs',
    permission('payroll_input.create'),
    validate(schema.inputSchema),
    payrollController.createInput,
  );
  router.get(
    '/runs',
    permission('payroll.view'),
    validate(schema.listQuery, 'query'),
    payrollController.runs,
  );
  router.post(
    '/runs',
    permission('payroll.create'),
    validate(schema.runCreateSchema),
    payrollController.createRun,
  );
  router.get(
    '/runs/:id',
    permission('payroll.view'),
    validate(schema.idParams, 'params'),
    payrollController.run,
  );
  router.post(
    '/runs/:id/process',
    permission('payroll.process'),
    validate(schema.idParams, 'params'),
    validate(schema.processSchema),
    payrollController.process,
  );
  router.post(
    '/runs/:id/submit',
    permission('payroll.submit'),
    validate(schema.idParams, 'params'),
    validate(schema.transitionSchema),
    payrollController.submit,
  );
  router.post(
    '/runs/:id/approve',
    permission('payroll.approve'),
    validate(schema.idParams, 'params'),
    validate(schema.decisionSchema),
    payrollController.approve,
  );
  router.post(
    '/runs/:id/reject',
    permission('payroll.reject'),
    validate(schema.idParams, 'params'),
    validate(schema.decisionSchema),
    payrollController.reject,
  );
  router.post(
    '/runs/:id/lock',
    permission('payroll.lock'),
    validate(schema.idParams, 'params'),
    validate(schema.transitionSchema),
    payrollController.lock,
  );
  router.post(
    '/runs/:id/publish-payslips',
    permission('payslip.publish'),
    validate(schema.idParams, 'params'),
    validate(schema.publishSchema),
    payrollController.publish,
  );
  router.get(
    '/runs/:id/export',
    permission('payroll.export'),
    validate(schema.idParams, 'params'),
    payrollController.exportRun,
  );
  router.get(
    '/results/:id',
    permission('payroll.view'),
    validate(schema.idParams, 'params'),
    payrollController.result,
  );
  router.post(
    '/results/:id/adjustments',
    permission('payroll.adjust'),
    validate(schema.idParams, 'params'),
    validate(schema.adjustmentSchema),
    payrollController.createAdjustment,
  );
  router.post(
    '/adjustments/:id/submit',
    permission('payroll.adjust'),
    validate(schema.idParams, 'params'),
    validate(schema.adjustmentTransitionSchema),
    payrollController.adjustmentAction('submit'),
  );
  router.post(
    '/adjustments/:id/approve',
    permission('payroll_adjustment.approve'),
    validate(schema.idParams, 'params'),
    validate(schema.adjustmentTransitionSchema),
    payrollController.adjustmentAction('approve'),
  );
  router.post(
    '/adjustments/:id/reject',
    permission('payroll_adjustment.approve'),
    validate(schema.idParams, 'params'),
    validate(schema.adjustmentTransitionSchema),
    payrollController.adjustmentAction('reject'),
  );
  router.post(
    '/adjustments/:id/apply',
    permission('payroll_adjustment.approve'),
    validate(schema.idParams, 'params'),
    validate(schema.adjustmentTransitionSchema),
    payrollController.adjustmentAction('apply'),
  );
  router.post(
    '/results/:id/reverse',
    permission('payroll.reverse'),
    validate(schema.idParams, 'params'),
    validate(schema.reversalSchema),
    payrollController.reverseResult,
  );
  router.post(
    '/results/:id/revoke-publication',
    permission('payslip.revoke_publication'),
    validate(schema.idParams, 'params'),
    validate(schema.publishSchema),
    payrollController.revokePublication,
  );
  router.get('/payslips/my', permission('payslip.view_own'), payrollController.ownPayslips);
  return router;
}
