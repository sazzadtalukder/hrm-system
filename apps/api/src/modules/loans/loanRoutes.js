import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  applicationCreateSchema,
  applicationUpdateSchema,
  deactivateSchema,
  decisionSchema,
  disbursementSchema,
  entryParams,
  exportQuery,
  idParams,
  ledgerSchema,
  listQuery,
  reversalSchema,
  transitionSchema,
  typeCreateSchema,
  typeUpdateSchema,
  typeVersionSchema,
} from './loanSchemas.js';
export function createLoanRouter({ authenticate, authorizationService, loanController }) {
  const r = Router(),
    p = (code) => requirePermission(authorizationService, code);
  r.use(authenticate);
  r.get('/limits', p('loan.view_own'), loanController.limits);
  r.get('/types', p('loan_type.view'), validate(listQuery, 'query'), loanController.types);
  r.post('/types', p('loan_type.create'), validate(typeCreateSchema), loanController.createType);
  r.get('/types/:id', p('loan_type.view'), validate(idParams, 'params'), loanController.getType);
  r.patch(
    '/types/:id',
    p('loan_type.update'),
    validate(idParams, 'params'),
    validate(typeUpdateSchema),
    loanController.updateType,
  );
  r.post(
    '/types/:id/versions',
    p('loan_type.version_create'),
    validate(idParams, 'params'),
    validate(typeVersionSchema),
    loanController.versionType(false),
  );
  r.post(
    '/types/:id/corrections',
    p('loan_type.correct_history'),
    validate(idParams, 'params'),
    validate(typeVersionSchema),
    loanController.versionType(true),
  );
  r.post(
    '/types/:id/deactivate',
    p('loan_type.deactivate'),
    validate(idParams, 'params'),
    validate(deactivateSchema),
    loanController.deactivateType,
  );
  r.get('/export', p('loan.export'), validate(exportQuery, 'query'), loanController.export);
  r.get(
    '/my',
    p('loan.view_own'),
    validate(listQuery, 'query'),
    loanController.list('loan.view_own'),
  );
  r.get(
    '/team',
    p('loan.view_team'),
    validate(listQuery, 'query'),
    loanController.list('loan.view_team'),
  );
  r.get('/', p('loan.view'), validate(listQuery, 'query'), loanController.list('loan.view'));
  r.post('/', p('loan.apply'), validate(applicationCreateSchema), loanController.create);
  r.get(
    '/my/:id',
    p('loan.view_own'),
    validate(idParams, 'params'),
    loanController.get('loan.view_own'),
  );
  r.get(
    '/team/:id',
    p('loan.view_team'),
    validate(idParams, 'params'),
    loanController.get('loan.view_team'),
  );
  r.get('/:id', p('loan.view'), validate(idParams, 'params'), loanController.get('loan.view'));
  r.patch(
    '/:id/draft',
    p('loan.update_draft'),
    validate(idParams, 'params'),
    validate(applicationUpdateSchema),
    loanController.update,
  );
  r.post(
    '/:id/submit',
    p('loan.submit'),
    validate(idParams, 'params'),
    validate(transitionSchema),
    loanController.submit,
  );
  r.post(
    '/:id/withdraw',
    p('loan.withdraw'),
    validate(idParams, 'params'),
    validate(transitionSchema),
    loanController.transition('withdrawn', 'loan.withdraw'),
  );
  r.post(
    '/:id/request-cancellation',
    p('loan.request_cancellation'),
    validate(idParams, 'params'),
    validate(transitionSchema),
    loanController.transition('cancellation_requested', 'loan.request_cancellation'),
  );
  for (const [kind, prefix] of [
    ['manager', ''],
    ['finance', 'finance-'],
  ])
    for (const decision of ['approve', 'reject'])
      r.post(
        `/:id/${prefix}${decision}`,
        p(kind === 'manager' ? `loan.${decision}` : `loan.finance_${decision}`),
        validate(idParams, 'params'),
        validate(decisionSchema),
        loanController.decide(kind, decision),
      );
  r.post(
    '/:id/approve-cancellation',
    p('loan.approve_cancellation'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    loanController.cancelDecision('approve'),
  );
  r.post(
    '/:id/reject-cancellation',
    p('loan.reject_cancellation'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    loanController.cancelDecision('reject'),
  );
  r.post(
    '/:id/disburse',
    p('loan.disburse'),
    validate(idParams, 'params'),
    validate(disbursementSchema),
    loanController.disburse,
  );
  r.get(
    '/:id/history',
    p('loan.view_history'),
    validate(idParams, 'params'),
    loanController.history,
  );
  r.get(
    '/accounts/:id',
    p('loan_repayment.view'),
    validate(idParams, 'params'),
    loanController.account('loan_repayment.view'),
  );
  r.post(
    '/accounts/:id/repayments',
    p('loan_repayment.record'),
    validate(idParams, 'params'),
    validate(ledgerSchema),
    loanController.ledger('repayment', 'loan_repayment.record'),
  );
  r.post(
    '/accounts/:id/adjustments',
    p('loan_repayment.adjust'),
    validate(idParams, 'params'),
    validate(ledgerSchema),
    loanController.ledger('adjustment', 'loan_repayment.adjust'),
  );
  r.post(
    '/accounts/:id/ledger/:entryId/reversal',
    p('loan_repayment.reverse'),
    validate(entryParams, 'params'),
    validate(reversalSchema),
    loanController.reverse,
  );
  return r;
}
