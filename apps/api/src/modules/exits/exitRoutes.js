import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import {
  createWorkflowNotification,
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
  key = z.string().trim().min(8).max(100);
const owned = (context, companyId) =>
  context.grants.some((g) => g.scope_type === 'all' || Number(g.company_id) === Number(companyId));
async function employmentAllowed(db, context, companyId, employmentId) {
  const grants = context.grants.filter(
    (grant) => grant.scope_type === 'all' || Number(grant.company_id) === Number(companyId),
  );
  if (grants.some((grant) => ['all', 'company'].includes(grant.scope_type))) return true;
  const row = await db('employments as employment')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .leftJoin('employee_assignments as assignment', function () {
      this.on('assignment.employment_id', 'employment.id').andOnVal(
        'assignment.history_status',
        'current',
      );
    })
    .leftJoin(
      'employments as manager_employment',
      'manager_employment.id',
      'assignment.manager_employment_id',
    )
    .leftJoin('employees as manager', 'manager.id', 'manager_employment.employee_id')
    .where({ 'employment.id': employmentId, 'employment.company_id': companyId })
    .first(
      'employee.user_id',
      'manager.user_id as manager_user_id',
      'assignment.branch_id',
      'assignment.department_id',
    );
  if (!row) return false;
  return grants.some(
    (grant) =>
      (grant.scope_type === 'own' && Number(row.user_id) === Number(context.actor.userId)) ||
      (grant.scope_type === 'direct_reports' &&
        Number(row.manager_user_id) === Number(context.actor.userId)) ||
      (grant.scope_type === 'branch' && Number(row.branch_id) === Number(grant.branch_id)) ||
      (grant.scope_type === 'department' &&
        Number(row.department_id) === Number(grant.department_id)),
  );
}
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested exit was not found.',
    statusCode: 404,
  });
export function createExitRouter({ authenticate, authorizationService, database: db }) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x),
    run = (fn) => async (req, res, next) => {
      try {
        res.status(200).json({ success: true, data: await fn(req) });
      } catch (e) {
        next(e);
      }
    };
  const query = z.object({
    companyId: id,
    page: id.default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    status: z
      .enum([
        'draft',
        'submitted',
        'manager_approved',
        'clearance',
        'completed',
        'withdrawn',
        'rejected',
        'cancelled',
      ])
      .optional(),
    search: z.string().trim().max(100).optional(),
  });
  r.use(authenticate);
  r.get(
    '/',
    p('exit.view'),
    validate(query, 'query'),
    run(async (req) => {
      if (!owned(req.accessContext, req.validated.query.companyId)) throw missing();
      const candidatesQuery = db('employee_exits as exit')
        .join('employee_exit_versions as version', function () {
          this.on('version.employee_exit_id', 'exit.id').andOnVal(
            'version.history_status',
            'current',
          );
        })
        .where({ 'exit.company_id': req.validated.query.companyId })
        .select('exit.*', 'version.employee_code_snapshot', 'version.employee_name_snapshot')
        .limit(req.validated.query.pageSize)
        .offset((req.validated.query.page - 1) * req.validated.query.pageSize)
        .orderBy('exit.id', 'desc');
      if (req.validated.query.status)
        candidatesQuery.where('exit.status', req.validated.query.status);
      if (req.validated.query.search)
        candidatesQuery.where((builder) =>
          builder
            .where('version.employee_code_snapshot', 'like', `%${req.validated.query.search}%`)
            .orWhere('version.employee_name_snapshot', 'like', `%${req.validated.query.search}%`),
        );
      const candidates = await candidatesQuery;
      const items = [];
      for (const row of candidates)
        if (await employmentAllowed(db, req.accessContext, row.company_id, row.employment_id))
          items.push(row);
      return { items };
    }),
  );
  r.get(
    '/:id',
    p('exit.view'),
    validate(z.object({ id }), 'params'),
    run(async (req) => {
      const row = await db('employee_exits').where({ id: req.validated.params.id }).first();
      if (
        !row ||
        !(await employmentAllowed(db, req.accessContext, row.company_id, row.employment_id))
      )
        throw missing();
      const [versions, events, clearances] = await Promise.all([
        db('employee_exit_versions').where({ employee_exit_id: row.id }).orderBy('id', 'desc'),
        db('employee_exit_state_events').where({ employee_exit_id: row.id }).orderBy('id', 'desc'),
        db('employee_exit_clearances').where({ employee_exit_id: row.id }).orderBy('area'),
      ]);
      return { ...row, versions, events, clearances };
    }),
  );
  r.post(
    '/',
    p('exit.create'),
    validate(
      z.object({
        companyId: id,
        employmentId: id,
        exitType: z.enum(['resignation', 'termination', 'retirement', 'contract_end']),
        requestedLastWorkingDay: z.iso.date(),
        employeeComment: z.string().max(5000).nullable().optional(),
        reason,
        idempotencyKey: key,
      }),
    ),
    run(async (req) =>
      db.transaction(async (trx) => {
        const i = req.validated.body;
        if (!(await employmentAllowed(trx, req.accessContext, i.companyId, i.employmentId)))
          throw missing();
        const replay = await trx('employee_exits')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const snap = await trx('employments as employment')
          .join('employees as employee', 'employee.id', 'employment.employee_id')
          .leftJoin('employee_assignments as assignment', function () {
            this.on('assignment.employment_id', 'employment.id').andOnVal(
              'assignment.history_status',
              'current',
            );
          })
          .leftJoin(
            'employments as manager_employment',
            'manager_employment.id',
            'assignment.manager_employment_id',
          )
          .leftJoin('employees as manager', 'manager.id', 'manager_employment.employee_id')
          .where({
            'employment.id': i.employmentId,
            'employment.company_id': i.companyId,
            'employment.record_status': 'active',
          })
          .first(
            'employment.employee_code',
            'employee.display_name',
            'manager.user_id as manager_user_id',
            'assignment.branch_id',
            'assignment.department_id',
          );
        if (!snap) throw new ValidationError('The employment is not eligible.');
        const [exitId] = await trx('employee_exits').insert({
          company_id: i.companyId,
          employment_id: i.employmentId,
          exit_type: i.exitType,
          requested_last_working_day: i.requestedLastWorkingDay,
          idempotency_key: i.idempotencyKey,
          created_by: req.actor.userId,
          updated_by: req.actor.userId,
        });
        await trx('employee_exit_versions').insert({
          company_id: i.companyId,
          employee_exit_id: exitId,
          version_number: 1,
          employee_code_snapshot: snap.employee_code,
          employee_name_snapshot: snap.display_name,
          manager_user_id_snapshot: snap.manager_user_id,
          branch_id_snapshot: snap.branch_id,
          department_id_snapshot: snap.department_id,
          reason: i.reason,
          employee_comment: i.employeeComment ?? null,
          created_by: req.actor.userId,
          updated_by: req.actor.userId,
        });
        await insertAuditEvent(trx, {
          actorUserId: req.actor.userId,
          companyId: i.companyId,
          actionCode: 'exit.create',
          outcome: 'success',
          recordType: 'employee_exit',
          recordId: exitId,
          permissionCode: 'exit.create',
          requestId: req.context.requestId,
          correlationId: req.context.correlationId,
        });
        return { id: exitId, workflowVersion: 1, replayed: false };
      }),
    ),
  );
  const transition = z.object({
    workflowVersion: id,
    approvedLastWorkingDay: z.iso.date().optional(),
    reason,
    idempotencyKey: key,
  });
  for (const [path, permission, from, to] of [
    ['submit', 'exit.submit', ['draft'], 'submitted'],
    ['manager-approve', 'exit.manager_approve', ['submitted'], 'manager_approved'],
    ['approve', 'exit.approve', ['manager_approved'], 'clearance'],
    ['withdraw', 'exit.withdraw', ['draft', 'submitted'], 'withdrawn'],
    ['reject', 'exit.reject', ['submitted', 'manager_approved'], 'rejected'],
    ['cancel', 'exit.cancel', ['draft', 'submitted', 'manager_approved'], 'cancelled'],
    ['complete', 'exit.complete', ['clearance'], 'completed'],
  ])
    r.post(
      `/:id/${path}`,
      p(permission),
      validate(z.object({ id }), 'params'),
      validate(transition),
      run(async (req) =>
        db.transaction(async (trx) => {
          const row = await trx('employee_exits')
            .where({ id: req.validated.params.id })
            .forUpdate()
            .first();
          if (
            !row ||
            !(await employmentAllowed(trx, req.accessContext, row.company_id, row.employment_id))
          )
            throw missing();
          const i = req.validated.body,
            replay = await trx('employee_exit_state_events')
              .where({ company_id: row.company_id, idempotency_key: i.idempotencyKey })
              .first();
          if (replay && replay.to_state !== to)
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key was used for a different transition.',
            );
          if (replay)
            return {
              status: replay.to_state,
              workflowVersion: replay.workflow_version,
              replayed: true,
            };
          if (row.workflow_version !== i.workflowVersion)
            throw new ConflictError('STALE_WORKFLOW_VERSION', 'The exit changed.');
          if (!from.includes(row.status))
            throw new ConflictError(
              'INVALID_WORKFLOW_STATE',
              'The exit cannot perform this transition.',
            );
          if (path === 'approve') {
            const managerDecision = await trx('employee_exit_state_events')
              .where({ employee_exit_id: row.id, to_state: 'manager_approved' })
              .orderBy('id', 'desc')
              .first('created_by');
            if (managerDecision && Number(managerDecision.created_by) === req.actor.userId)
              throw new ConflictError(
                'MAKER_CHECKER_REQUIRED',
                'The manager approver cannot perform final approval.',
              );
          }
          if (to === 'completed') {
            const pending = await trx('employee_exit_clearances')
              .where({ employee_exit_id: row.id })
              .whereNotIn('status', ['cleared', 'waived'])
              .first();
            if (pending)
              throw new ConflictError('CLEARANCE_INCOMPLETE', 'All clearances must be resolved.');
          }
          const next = row.workflow_version + 1;
          await trx('employee_exits')
            .where({ id: row.id })
            .update({
              status: to,
              workflow_version: next,
              version: row.version + 1,
              approved_last_working_day: i.approvedLastWorkingDay ?? row.approved_last_working_day,
              active_slot: ['completed', 'withdrawn', 'rejected', 'cancelled'].includes(to)
                ? null
                : 1,
              updated_by: req.actor.userId,
              updated_at: trx.fn.now(),
            });
          await trx('employee_exit_state_events').insert({
            company_id: row.company_id,
            employee_exit_id: row.id,
            from_state: row.status,
            to_state: to,
            workflow_version: next,
            reason: i.reason,
            idempotency_key: i.idempotencyKey,
            created_by: req.actor.userId,
            updated_by: req.actor.userId,
          });
          if (to === 'clearance')
            for (const area of ['manager', 'hr', 'asset', 'finance', 'it'])
              await trx('employee_exit_clearances').insert({
                company_id: row.company_id,
                employee_exit_id: row.id,
                area,
                reason: 'Generated at approval',
                idempotency_key: `${i.idempotencyKey}:${area}`,
                created_by: req.actor.userId,
                updated_by: req.actor.userId,
              });
          await insertAuditEvent(trx, {
            actorUserId: req.actor.userId,
            companyId: row.company_id,
            actionCode: `exit.${path.replace('-', '_')}`,
            outcome: 'success',
            recordType: 'employee_exit',
            recordId: row.id,
            permissionCode: permission,
            requestId: req.context.requestId,
            correlationId: req.context.correlationId,
          });
          const version = await trx('employee_exit_versions')
            .where({ employee_exit_id: row.id, history_status: 'current' })
            .first('manager_user_id_snapshot', 'branch_id_snapshot', 'department_id_snapshot');
          if (to === 'submitted') {
            const notification = {
              companyId: row.company_id,
              type: 'exit.manager_approval_required',
              title: 'Exit request awaiting manager review',
              message: 'An employee exit request requires your decision.',
              referenceType: 'employee_exit',
              referenceId: row.id,
              idempotencyKey: `exit:${row.id}:submitted:${next}`,
              actorUserId: req.actor.userId,
            };
            if (version?.manager_user_id_snapshot)
              await createWorkflowNotification(trx, {
                ...notification,
                userId: version.manager_user_id_snapshot,
              });
            else
              await notifyPermissionHolders(trx, notification, 'exit.manager_approve', {
                branchId: version?.branch_id_snapshot,
                departmentId: version?.department_id_snapshot,
              });
          } else if (to === 'manager_approved')
            await notifyPermissionHolders(
              trx,
              {
                companyId: row.company_id,
                type: 'exit.hr_approval_required',
                title: 'Exit request awaiting HR review',
                message: 'A manager-approved exit request requires HR review.',
                referenceType: 'employee_exit',
                referenceId: row.id,
                idempotencyKey: `exit:${row.id}:hr_required:${next}`,
                actorUserId: req.actor.userId,
              },
              'exit.approve',
              {
                branchId: version?.branch_id_snapshot,
                departmentId: version?.department_id_snapshot,
              },
            );
          else if (['clearance', 'completed', 'rejected', 'cancelled'].includes(to))
            await notifyEmploymentUser(
              trx,
              {
                companyId: row.company_id,
                type: 'exit.status_updated',
                title: 'Exit request updated',
                message: `Your exit request is now ${to}.`,
                referenceType: 'employee_exit',
                referenceId: row.id,
                idempotencyKey: `exit:${row.id}:${to}:${next}`,
                actorUserId: req.actor.userId,
              },
              row.employment_id,
            );
          return { status: to, workflowVersion: next, replayed: false };
        }),
      ),
    );
  r.post(
    '/:id/clearances/:area',
    p('exit.clearance'),
    validate(z.object({ id, area: z.enum(['manager', 'hr', 'asset', 'finance', 'it']) }), 'params'),
    validate(
      z.object({
        status: z.enum(['cleared', 'blocked', 'waived']),
        version: id,
        comment: z.string().max(500).nullable().optional(),
        reason,
        idempotencyKey: key,
      }),
    ),
    run(async (req) =>
      db.transaction(async (trx) => {
        const exit = await trx('employee_exits').where({ id: req.validated.params.id }).first();
        if (
          !exit ||
          !(await employmentAllowed(trx, req.accessContext, exit.company_id, exit.employment_id))
        )
          throw missing();
        const i = req.validated.body,
          row = await trx('employee_exit_clearances')
            .where({ employee_exit_id: exit.id, area: req.validated.params.area })
            .forUpdate()
            .first();
        if (!row) throw missing();
        if (row.version !== i.version)
          throw new ConflictError('STALE_VERSION', 'The clearance changed.');
        await trx('employee_exit_clearances')
          .where({ id: row.id })
          .update({
            status: i.status,
            comment: i.comment ?? null,
            reason: i.reason,
            idempotency_key: i.idempotencyKey,
            version: row.version + 1,
            updated_by: req.actor.userId,
            updated_at: trx.fn.now(),
          });
        await insertAuditEvent(trx, {
          actorUserId: req.actor.userId,
          companyId: exit.company_id,
          actionCode: 'exit.clearance',
          outcome: 'success',
          recordType: 'employee_exit',
          recordId: exit.id,
          permissionCode: 'exit.clearance',
          requestId: req.context.requestId,
          correlationId: req.context.correlationId,
        });
        return { id: row.id, version: row.version + 1 };
      }),
    ),
  );
  return r;
}
