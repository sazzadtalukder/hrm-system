import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import {
  notifyEmploymentUser,
  notifyPermissionHolders,
} from '../notifications/workflowNotificationRepository.js';
import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
const id = z.coerce.number().int().positive(),
  reason = z.string().trim().min(1).max(500),
  key = z.string().trim().min(8).max(100),
  missing = () =>
    new ApplicationError({
      code: 'NOT_FOUND',
      message: 'The requested settlement was not found.',
      statusCode: 404,
    });
const moneyToMinorUnits = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(`${whole}${fraction.padEnd(2, '0')}`);
};
const minorUnitsToMoney = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export function createSettlementRouter({ authenticate, authorizationService, database: db }) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x),
    owned = (c, n) =>
      c.grants.some(
        (g) =>
          g.scope_type === 'all' ||
          (g.scope_type === 'company' && Number(g.company_id) === Number(n)),
      ),
    run = (fn) => async (req, res, next) => {
      try {
        res.json({ success: true, data: await fn(req) });
      } catch (e) {
        next(e);
      }
    };
  r.use(authenticate);
  r.get(
    '/',
    p('final_settlement.view'),
    validate(
      z.object({ companyId: id, pageSize: z.coerce.number().int().min(1).max(100).default(25) }),
      'query',
    ),
    run(async (req) => {
      if (!owned(req.accessContext, req.validated.query.companyId)) throw missing();
      return {
        items: await db('final_settlements as settlement')
          .join('final_settlement_versions as version', function () {
            this.on('version.final_settlement_id', 'settlement.id').andOnVal(
              'version.history_status',
              'current',
            );
          })
          .where({ 'settlement.company_id': req.validated.query.companyId })
          .select(
            'settlement.*',
            'version.employee_code_snapshot',
            'version.employee_name_snapshot',
            'version.settlement_date',
          )
          .limit(req.validated.query.pageSize)
          .orderBy('settlement.id', 'desc'),
      };
    }),
  );
  r.get(
    '/:id',
    p('final_settlement.view'),
    validate(z.object({ id }), 'params'),
    run(async (req) => {
      const row = await db('final_settlements').where({ id: req.validated.params.id }).first();
      if (!row || !owned(req.accessContext, row.company_id)) throw missing();
      const versions = await db('final_settlement_versions')
        .where({ final_settlement_id: row.id })
        .orderBy('version_number', 'desc');
      const versionIds = versions.map(({ id: versionId }) => versionId);
      const [items, events, payments] = await Promise.all([
        versionIds.length
          ? db('final_settlement_items')
              .whereIn('final_settlement_version_id', versionIds)
              .orderBy('id')
          : [],
        db('final_settlement_state_events')
          .where({ final_settlement_id: row.id })
          .orderBy('id', 'desc'),
        db('final_settlement_payments')
          .where({ final_settlement_id: row.id })
          .orderBy('id', 'desc'),
      ]);
      return { ...row, versions, items, events, payments };
    }),
  );
  r.post(
    '/',
    p('final_settlement.create'),
    validate(
      z.object({
        companyId: id,
        employeeExitId: id,
        settlementDate: z.iso.date(),
        currencyCode: z.string().length(3),
        items: z
          .array(
            z.object({
              itemType: z.enum(['earning', 'deduction']),
              code: z.string().max(50),
              description: z.string().max(200),
              amount: z.string().regex(/^\d{1,17}(\.\d{1,2})?$/),
            }),
          )
          .min(1)
          .max(100),
        reason,
        idempotencyKey: key,
      }),
    ),
    run(async (req) =>
      db.transaction(async (trx) => {
        const i = req.validated.body;
        if (!owned(req.accessContext, i.companyId)) throw missing();
        const replay = await trx('final_settlements')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const exit = await trx('employee_exits as exit')
          .join('employee_exit_versions as version', function () {
            this.on('version.employee_exit_id', 'exit.id').andOnVal(
              'version.history_status',
              'current',
            );
          })
          .where({
            'exit.id': i.employeeExitId,
            'exit.company_id': i.companyId,
            'exit.status': 'completed',
          })
          .first('exit.*', 'version.employee_code_snapshot', 'version.employee_name_snapshot');
        if (!exit) throw new ValidationError('A completed exit is required.');
        const company = await trx('companies').where({ id: i.companyId }).first('currency_code');
        if (!company || company.currency_code !== i.currencyCode.toUpperCase())
          throw new ValidationError('Settlement currency must match the company currency.');
        const earnings = i.items
            .filter((x) => x.itemType === 'earning')
            .reduce((sum, item) => sum + moneyToMinorUnits(item.amount), 0n),
          deductions = i.items
            .filter((x) => x.itemType === 'deduction')
            .reduce((sum, item) => sum + moneyToMinorUnits(item.amount), 0n);
        if (deductions > earnings)
          throw new ValidationError('Negative net settlement is prohibited.');
        const [settlementId] = await trx('final_settlements').insert({
          company_id: i.companyId,
          employee_exit_id: exit.id,
          employment_id: exit.employment_id,
          currency_code: i.currencyCode.toUpperCase(),
          total_earnings: minorUnitsToMoney(earnings),
          total_deductions: minorUnitsToMoney(deductions),
          net_amount: minorUnitsToMoney(earnings - deductions),
          idempotency_key: i.idempotencyKey,
          created_by: req.actor.userId,
          updated_by: req.actor.userId,
        });
        const [versionId] = await trx('final_settlement_versions').insert({
          company_id: i.companyId,
          final_settlement_id: settlementId,
          version_number: 1,
          settlement_date: i.settlementDate,
          employee_code_snapshot: exit.employee_code_snapshot,
          employee_name_snapshot: exit.employee_name_snapshot,
          last_working_day_snapshot:
            exit.approved_last_working_day ?? exit.requested_last_working_day,
          reason: i.reason,
          created_by: req.actor.userId,
          updated_by: req.actor.userId,
        });
        await trx('final_settlement_items').insert(
          i.items.map((x) => ({
            company_id: i.companyId,
            final_settlement_version_id: versionId,
            item_type: x.itemType,
            code: x.code,
            description: x.description,
            amount: x.amount,
            created_by: req.actor.userId,
            updated_by: req.actor.userId,
          })),
        );
        await insertAuditEvent(trx, {
          actorUserId: req.actor.userId,
          companyId: i.companyId,
          actionCode: 'final_settlement.create',
          outcome: 'success',
          recordType: 'final_settlement',
          recordId: settlementId,
          permissionCode: 'final_settlement.create',
          requestId: req.context.requestId,
          correlationId: req.context.correlationId,
        });
        return { id: settlementId, workflowVersion: 1, replayed: false };
      }),
    ),
  );
  for (const [path, permission, from, to] of [
    ['calculate', 'final_settlement.calculate', ['draft'], 'calculated'],
    ['submit', 'final_settlement.submit', ['calculated'], 'submitted'],
    ['approve', 'final_settlement.approve', ['submitted'], 'approved'],
    ['reject', 'final_settlement.reject', ['submitted'], 'rejected'],
    ['cancel', 'final_settlement.cancel', ['draft', 'calculated'], 'cancelled'],
  ])
    r.post(
      `/:id/${path}`,
      p(permission),
      validate(z.object({ id }), 'params'),
      validate(z.object({ workflowVersion: id, reason, idempotencyKey: key })),
      run(async (req) =>
        db.transaction(async (trx) => {
          const row = await trx('final_settlements')
            .where({ id: req.validated.params.id })
            .forUpdate()
            .first();
          if (!row || !owned(req.accessContext, row.company_id)) throw missing();
          const i = req.validated.body,
            prior = await trx('final_settlement_state_events')
              .where({ company_id: row.company_id, idempotency_key: i.idempotencyKey })
              .first();
          if (prior && prior.to_state !== to)
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key was used for a different transition.',
            );
          if (prior)
            return {
              status: prior.to_state,
              workflowVersion: prior.workflow_version,
              replayed: true,
            };
          if (row.workflow_version !== i.workflowVersion)
            throw new ConflictError('STALE_WORKFLOW_VERSION', 'The settlement changed.');
          if (!from.includes(row.status))
            throw new ConflictError(
              'INVALID_WORKFLOW_STATE',
              'The settlement cannot perform this transition.',
            );
          if (['approve', 'reject'].includes(path) && Number(row.created_by) === req.actor.userId)
            throw new ConflictError(
              'MAKER_CHECKER_REQUIRED',
              'The creator cannot make this decision.',
            );
          const next = row.workflow_version + 1;
          await trx('final_settlements')
            .where({ id: row.id })
            .update({
              status: to,
              workflow_version: next,
              version: row.version + 1,
              updated_by: req.actor.userId,
              updated_at: trx.fn.now(),
            });
          await trx('final_settlement_state_events').insert({
            company_id: row.company_id,
            final_settlement_id: row.id,
            from_state: row.status,
            to_state: to,
            workflow_version: next,
            reason: i.reason,
            idempotency_key: i.idempotencyKey,
            created_by: req.actor.userId,
            updated_by: req.actor.userId,
          });
          await insertAuditEvent(trx, {
            actorUserId: req.actor.userId,
            companyId: row.company_id,
            actionCode: `final_settlement.${path}`,
            outcome: 'success',
            recordType: 'final_settlement',
            recordId: row.id,
            permissionCode: permission,
            requestId: req.context.requestId,
            correlationId: req.context.correlationId,
          });
          if (to === 'submitted')
            await notifyPermissionHolders(
              trx,
              {
                companyId: row.company_id,
                type: 'final_settlement.approval_required',
                title: 'Final settlement awaiting approval',
                message: 'A final settlement requires a finance decision.',
                referenceType: 'final_settlement',
                referenceId: row.id,
                idempotencyKey: `settlement:${row.id}:submitted:${next}`,
                actorUserId: req.actor.userId,
              },
              'final_settlement.approve',
            );
          else if (['approved', 'rejected'].includes(to))
            await notifyEmploymentUser(
              trx,
              {
                companyId: row.company_id,
                type: 'final_settlement.status_updated',
                title: 'Final settlement updated',
                message: `Your final settlement is now ${to}.`,
                referenceType: 'final_settlement',
                referenceId: row.id,
                idempotencyKey: `settlement:${row.id}:${to}:${next}`,
                actorUserId: req.actor.userId,
              },
              row.employment_id,
            );
          if (to === 'approved')
            await notifyPermissionHolders(
              trx,
              {
                companyId: row.company_id,
                type: 'final_settlement.payment_required',
                title: 'Final settlement ready for payment',
                message: 'An approved final settlement is ready for payment recording.',
                referenceType: 'final_settlement',
                referenceId: row.id,
                idempotencyKey: `settlement:${row.id}:payment_required:${next}`,
                actorUserId: req.actor.userId,
              },
              'final_settlement.record_payment',
            );
          return { status: to, workflowVersion: next, replayed: false };
        }),
      ),
    );
  r.post(
    '/:id/payment',
    p('final_settlement.record_payment'),
    validate(z.object({ id }), 'params'),
    validate(
      z.object({
        workflowVersion: id,
        amount: z.string().regex(/^\d{1,17}(\.\d{1,2})?$/),
        paidOn: z.iso.date(),
        paymentReference: z.string().trim().min(1).max(200),
        reason,
        idempotencyKey: key,
      }),
    ),
    run(async (req) =>
      db.transaction(async (trx) => {
        const row = await trx('final_settlements')
          .where({ id: req.validated.params.id })
          .forUpdate()
          .first();
        if (!row || !owned(req.accessContext, row.company_id)) throw missing();
        const i = req.validated.body;
        const replay = await trx('final_settlement_payments')
          .where({ company_id: row.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay)
          return {
            id: replay.id,
            status: 'paid',
            workflowVersion: row.workflow_version,
            replayed: true,
          };
        if (row.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The settlement changed.');
        if (row.status !== 'approved')
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'Only an approved settlement can be paid.',
          );
        const approval = await trx('final_settlement_state_events')
          .where({ final_settlement_id: row.id, to_state: 'approved' })
          .orderBy('id', 'desc')
          .first();
        if (approval && Number(approval.created_by) === req.actor.userId)
          throw new ConflictError('MAKER_CHECKER_REQUIRED', 'The approver cannot record payment.');
        if (Number(row.created_by) === req.actor.userId)
          throw new ConflictError('MAKER_CHECKER_REQUIRED', 'The creator cannot record payment.');
        if (moneyToMinorUnits(row.net_amount) !== moneyToMinorUnits(i.amount))
          throw new ValidationError('Payment must equal the approved net settlement amount.');
        const [paymentId] = await trx('final_settlement_payments').insert({
          company_id: row.company_id,
          final_settlement_id: row.id,
          amount: i.amount,
          paid_on: i.paidOn,
          payment_reference: i.paymentReference,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: req.actor.userId,
          updated_by: req.actor.userId,
        });
        const next = row.workflow_version + 1;
        await trx('final_settlements')
          .where({ id: row.id })
          .update({
            status: 'paid',
            workflow_version: next,
            version: row.version + 1,
            updated_by: req.actor.userId,
            updated_at: trx.fn.now(),
          });
        await trx('final_settlement_state_events').insert({
          company_id: row.company_id,
          final_settlement_id: row.id,
          from_state: 'approved',
          to_state: 'paid',
          workflow_version: next,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: req.actor.userId,
          updated_by: req.actor.userId,
        });
        await insertAuditEvent(trx, {
          actorUserId: req.actor.userId,
          companyId: row.company_id,
          actionCode: 'final_settlement.record_payment',
          outcome: 'success',
          recordType: 'final_settlement',
          recordId: row.id,
          permissionCode: 'final_settlement.record_payment',
          requestId: req.context.requestId,
          correlationId: req.context.correlationId,
        });
        await notifyEmploymentUser(
          trx,
          {
            companyId: row.company_id,
            type: 'final_settlement.paid',
            title: 'Final settlement paid',
            message: 'Payment has been recorded for your final settlement.',
            referenceType: 'final_settlement',
            referenceId: row.id,
            idempotencyKey: `settlement:${row.id}:paid:${next}`,
            actorUserId: req.actor.userId,
          },
          row.employment_id,
        );
        return { id: paymentId, status: 'paid', workflowVersion: next, replayed: false };
      }),
    ),
  );
  return r;
}
