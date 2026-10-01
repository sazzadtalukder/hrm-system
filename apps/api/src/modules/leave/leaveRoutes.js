import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  balanceAdjustmentSchema,
  cancellationSchema,
  companyQuery,
  decisionSchema,
  idParams,
  listQuery,
  policyAssignmentSchema,
  policyCreateSchema,
  requestCreateSchema,
  requestUpdateSchema,
  reversalSchema,
  typeCreateSchema,
  workflowSchema,
} from './leaveSchemas.js';

const asOfQuery = z.object({ asOfDate: z.iso.date().optional() });
export function createLeaveRouter({ authenticate, authorizationService, leaveController }) {
  const router = Router();
  const permission = (code) => requirePermission(authorizationService, code);
  router.use(authenticate);
  router.get('/limits', permission('leave.view'), leaveController.limits);
  router.get(
    '/my-employment',
    permission('leave.view'),
    validate(companyQuery, 'query'),
    leaveController.ownEmployment,
  );
  router.get(
    '/types',
    permission('leave_type.view'),
    validate(companyQuery, 'query'),
    leaveController.listTypes,
  );
  router.post(
    '/types',
    permission('leave_type.create'),
    validate(typeCreateSchema),
    leaveController.createType,
  );
  router.get(
    '/policies',
    permission('leave_policy.view'),
    validate(companyQuery, 'query'),
    leaveController.listPolicies,
  );
  router.post(
    '/policies',
    permission('leave_policy.create'),
    validate(policyCreateSchema),
    leaveController.createPolicy,
  );
  router.get(
    '/employments/:id/policy-assignments',
    permission('leave_policy.view'),
    validate(idParams, 'params'),
    leaveController.assignments,
  );
  router.post(
    '/employments/:id/policy-assignments',
    permission('leave_policy.assign'),
    validate(idParams, 'params'),
    validate(policyAssignmentSchema),
    leaveController.assignPolicy,
  );
  router.get(
    '/requests',
    permission('leave.view'),
    validate(listQuery, 'query'),
    leaveController.listRequests,
  );
  router.post(
    '/requests',
    permission('leave.apply'),
    validate(requestCreateSchema),
    leaveController.createRequest,
  );
  router.post(
    '/requests/historical',
    permission('leave.administer_historical'),
    validate(requestCreateSchema),
    leaveController.createHistorical,
  );
  router.get(
    '/requests/:id',
    permission('leave.view'),
    validate(idParams, 'params'),
    leaveController.getRequest,
  );
  router.patch(
    '/requests/:id',
    permission('leave.update_draft'),
    validate(idParams, 'params'),
    validate(requestUpdateSchema),
    leaveController.updateDraft,
  );
  router.post(
    '/requests/:id/submit',
    permission('leave.submit'),
    validate(idParams, 'params'),
    validate(workflowSchema),
    leaveController.submit,
  );
  router.post(
    '/requests/:id/withdraw',
    permission('leave.cancel'),
    validate(idParams, 'params'),
    validate(workflowSchema),
    leaveController.withdraw,
  );
  router.post(
    '/requests/:id/historical-submit',
    permission('leave.administer_historical'),
    validate(idParams, 'params'),
    validate(workflowSchema),
    leaveController.submitHistorical,
  );
  router.post(
    '/requests/:id/approve',
    permission('leave.approve'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    leaveController.approve,
  );
  router.post(
    '/requests/:id/reject',
    permission('leave.reject'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    leaveController.reject,
  );
  router.post(
    '/requests/:id/cancellation-requests',
    permission('leave.request_cancellation'),
    validate(idParams, 'params'),
    validate(cancellationSchema),
    leaveController.requestCancellation,
  );
  router.post(
    '/requests/:id/cancellation-approve',
    permission('leave.approve_cancellation'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    leaveController.approveCancellation,
  );
  router.post(
    '/requests/:id/cancellation-reject',
    permission('leave.reject_cancellation'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    leaveController.rejectCancellation,
  );
  router.get(
    '/employments/:id/balances',
    permission('leave_balance.view'),
    validate(idParams, 'params'),
    validate(asOfQuery, 'query'),
    leaveController.balances,
  );
  router.get(
    '/employments/:id/balances/export',
    permission('leave_balance.export'),
    validate(idParams, 'params'),
    validate(asOfQuery, 'query'),
    leaveController.exportBalances,
  );
  router.get(
    '/balance-accounts/:id/ledger',
    permission('leave_balance.view'),
    validate(idParams, 'params'),
    validate(asOfQuery, 'query'),
    leaveController.ledger,
  );
  router.post(
    '/balance-accounts/:id/adjustments',
    permission('leave_balance.adjust'),
    validate(idParams, 'params'),
    validate(balanceAdjustmentSchema),
    leaveController.adjust,
  );
  router.post(
    '/ledger-entries/:id/reversals',
    permission('leave_balance.adjust'),
    validate(idParams, 'params'),
    validate(reversalSchema),
    leaveController.reverse,
  );
  return router;
}
