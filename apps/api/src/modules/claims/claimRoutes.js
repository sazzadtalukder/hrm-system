import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryVersionSchema,
  claimCreateSchema,
  claimUpdateSchema,
  decisionSchema,
  deactivateSchema,
  exportQuery,
  idParams,
  listQuery,
  paymentSchema,
  transitionSchema,
} from './claimSchemas.js';
export function createClaimRouter({ authenticate, authorizationService, claimController }) {
  const r = Router();
  const p = (code) => requirePermission(authorizationService, code);
  r.use(authenticate);
  r.get('/limits', p('claim.view_own'), claimController.limits);
  r.get(
    '/categories',
    p('claim_category.view'),
    validate(listQuery, 'query'),
    claimController.categories,
  );
  r.post(
    '/categories',
    p('claim_category.create'),
    validate(categoryCreateSchema),
    claimController.createCategory,
  );
  r.get(
    '/categories/:id',
    p('claim_category.view'),
    validate(idParams, 'params'),
    claimController.getCategory,
  );
  r.patch(
    '/categories/:id',
    p('claim_category.update'),
    validate(idParams, 'params'),
    validate(categoryUpdateSchema),
    claimController.updateCategory,
  );
  r.post(
    '/categories/:id/versions',
    p('claim_category.version_create'),
    validate(idParams, 'params'),
    validate(categoryVersionSchema),
    claimController.versionCategory(false),
  );
  r.post(
    '/categories/:id/corrections',
    p('claim_category.correct_history'),
    validate(idParams, 'params'),
    validate(categoryVersionSchema),
    claimController.versionCategory(true),
  );
  r.post(
    '/categories/:id/deactivate',
    p('claim_category.deactivate'),
    validate(idParams, 'params'),
    validate(deactivateSchema),
    claimController.deactivateCategory,
  );
  r.get('/export', p('claim.export'), validate(exportQuery, 'query'), claimController.export);
  r.get(
    '/my',
    p('claim.view_own'),
    validate(listQuery, 'query'),
    claimController.list('claim.view_own'),
  );
  r.get(
    '/team',
    p('claim.view_team'),
    validate(listQuery, 'query'),
    claimController.list('claim.view_team'),
  );
  r.get(
    '/team/:id',
    p('claim.view_team'),
    validate(idParams, 'params'),
    claimController.get('claim.view_team'),
  );
  r.get('/', p('claim.view'), validate(listQuery, 'query'), claimController.list('claim.view'));
  r.post('/', p('claim.create'), validate(claimCreateSchema), claimController.create);
  r.get(
    '/my/:id',
    p('claim.view_own'),
    validate(idParams, 'params'),
    claimController.get('claim.view_own'),
  );
  r.get('/:id', p('claim.view'), validate(idParams, 'params'), claimController.get('claim.view'));
  r.patch(
    '/:id/draft',
    p('claim.update_draft'),
    validate(idParams, 'params'),
    validate(claimUpdateSchema),
    claimController.update,
  );
  r.post(
    '/:id/submit',
    p('claim.submit'),
    validate(idParams, 'params'),
    validate(transitionSchema),
    claimController.submit,
  );
  r.post(
    '/:id/withdraw',
    p('claim.withdraw'),
    validate(idParams, 'params'),
    validate(transitionSchema),
    claimController.transition('withdrawn', 'claim.withdraw'),
  );
  r.post(
    '/:id/request-cancellation',
    p('claim.request_cancellation'),
    validate(idParams, 'params'),
    validate(transitionSchema),
    claimController.transition('cancellation_requested', 'claim.request_cancellation'),
  );
  r.post(
    '/:id/manager-approve',
    p('claim.approve'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    claimController.decide('manager', 'approve'),
  );
  r.post(
    '/:id/manager-reject',
    p('claim.reject'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    claimController.decide('manager', 'reject'),
  );
  r.post(
    '/:id/finance-approve',
    p('claim.finance_approve'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    claimController.decide('finance', 'approve'),
  );
  r.post(
    '/:id/finance-reject',
    p('claim.finance_reject'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    claimController.decide('finance', 'reject'),
  );
  r.post(
    '/:id/approve-cancellation',
    p('claim.approve_cancellation'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    claimController.cancelDecision('approve'),
  );
  r.post(
    '/:id/reject-cancellation',
    p('claim.reject_cancellation'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    claimController.cancelDecision('reject'),
  );
  r.post(
    '/:id/payment',
    p('claim.record_payment'),
    validate(idParams, 'params'),
    validate(paymentSchema),
    claimController.payment,
  );
  r.get(
    '/:id/history',
    p('claim.view_history'),
    validate(idParams, 'params'),
    claimController.history,
  );
  return r;
}
