import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import {
  createWorkflowNotification,
  notifyPermissionHolders,
} from '../notifications/workflowNotificationRepository.js';
import { LOAN_ELIGIBLE_STATUSES, LOAN_LIMITS } from './loanConstants.js';
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested loan record was not found.',
    statusCode: 404,
  });
const cents = (v) => {
  const [a, b = ''] = String(v).split('.');
  return BigInt(a) * 100n + BigInt((b + '00').slice(0, 2));
};
const money = (v) => `${v / 100n}.${String(v % 100n).padStart(2, '0')}`;
const dateOnly = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const companyDate = (tz) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
};
const daysBetween = (a, b) =>
  Math.floor((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const dueDate = (disbursement, index, day) => {
  const d = new Date(`${disbursement}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + index + 1, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
};
export function createLoanService({ database, repository, authorizationService }) {
  const audit = (trx, actor, companyId, action, id, permission, ctx, metadata) =>
    insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: 'loan_application',
      recordId: id,
      permissionCode: permission,
      metadata,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  async function sensitive(actor) {
    try {
      return await authorizationService.requirePermission(actor, 'loan_sensitive.view');
    } catch {
      return null;
    }
  }
  async function project(actor, row, ctx, trx = database) {
    const own = Number(row.created_by) === Number(actor.userId),
      s = await sensitive(actor),
      allowed = s && (await repository.applicationScoped(row.id, s, 'loan_sensitive.view', trx));
    const classification = await trx('loan_facility_type_versions')
      .where({ id: row.loan_facility_type_version_id })
      .first('sensitive_classification');
    if (own || allowed) {
      if (classification?.sensitive_classification === 'sensitive')
        await audit(
          trx,
          actor,
          row.company_id,
          'loan_sensitive.view',
          row.id,
          allowed ? 'loan_sensitive.view' : 'loan.view_own',
          ctx,
        );
      return row;
    }
    const safe = { ...row };
    delete safe.purpose;
    return safe;
  }
  async function allocate(trx, companyId, year) {
    await trx('loan_number_sequences')
      .insert({ company_id: companyId, sequence_year: year, next_value: 1 })
      .onConflict(['company_id', 'sequence_year'])
      .ignore();
    const row = await trx('loan_number_sequences')
      .where({ company_id: companyId, sequence_year: year })
      .forUpdate()
      .first();
    await trx('loan_number_sequences')
      .where({ company_id: companyId, sequence_year: year })
      .update({ next_value: Number(row.next_value) + 1 });
    return `LON-${year}-${String(row.next_value).padStart(6, '0')}`;
  }
  async function state(trx, a, actor, to, reason) {
    const next = a.workflow_version + 1;
    const changed = await trx('loan_applications')
      .where({ id: a.id, workflow_version: a.workflow_version })
      .update({
        status: to,
        workflow_version: next,
        version: a.version + 1,
        updated_by: actor.userId,
        updated_at: trx.fn.now(),
      });
    if (!changed)
      throw new ConflictError('STALE_WORKFLOW_VERSION', 'The application workflow changed.');
    await trx('loan_state_events').insert({
      company_id: a.company_id,
      loan_application_id: a.id,
      from_state: a.status,
      to_state: to,
      workflow_version: next,
      reason,
      acting_user_id: actor.userId,
    });
    return next;
  }
  async function validateTerms(typeVersion, principal, term, currency) {
    if (typeVersion.currency_code !== currency)
      throw new ValidationError('Facility currency must match company currency.');
    const p = cents(principal);
    if (p < cents(typeVersion.minimum_principal) || p > cents(typeVersion.maximum_principal))
      throw new ValidationError('Requested principal is outside the facility limits.');
    if (term < typeVersion.minimum_term_months || term > typeVersion.maximum_term_months)
      throw new ValidationError('Requested term is outside the facility limits.');
  }
  async function updateSchedule(trx, account) {
    const schedule = await trx('loan_repayment_schedules')
      .where({ loan_account_id: account.id })
      .first();
    const entries = await trx('loan_repayment_ledger').where({ loan_account_id: account.id });
    let paid = entries.reduce((n, e) => n + cents(e.amount), 0n);
    const installments = await trx('loan_repayment_installments')
      .where({ loan_repayment_schedule_id: schedule.id })
      .orderBy('installment_number');
    for (const installment of installments) {
      const amount = cents(installment.total_amount);
      const status = paid >= amount ? 'paid' : paid > 0n ? 'partially_paid' : 'scheduled';
      paid = paid > amount ? paid - amount : 0n;
      await trx('loan_repayment_installments').where({ id: installment.id }).update({ status });
    }
  }
  return {
    limits: LOAN_LIMITS,
    async listTypes(_actor, context, input) {
      return repository.listTypes(context, input);
    },
    async createType(actor, context, input, ctx) {
      if (!repository.companyAllowed(context, input.companyId)) throw missing();
      return withTransaction(database, async (trx) => {
        const company = await repository.lockCompany(input.companyId, trx);
        if (!company || company.currency_code !== input.currencyCode)
          throw new ValidationError('Facility currency must match company currency.');
        if (
          cents(input.maximumPrincipal) < cents(input.minimumPrincipal) ||
          input.maximumTermMonths < input.minimumTermMonths
        )
          throw new ValidationError('Facility limits are invalid.');
        let id;
        try {
          [id] = await trx('loan_facility_types').insert({
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            facility_kind: input.facilityKind,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('LOAN_TYPE_CONFLICT', 'The facility code is already in use.');
          throw e;
        }
        await trx('loan_facility_type_versions').insert({
          company_id: input.companyId,
          loan_facility_type_id: id,
          version_number: 1,
          effective_start: input.effectiveStart,
          effective_end: input.effectiveEnd ?? null,
          currency_code: input.currencyCode,
          minimum_principal: input.minimumPrincipal,
          maximum_principal: input.maximumPrincipal,
          minimum_term_months: input.minimumTermMonths,
          maximum_term_months: input.maximumTermMonths,
          installment_due_day: input.installmentDueDay,
          minimum_service_days: input.minimumServiceDays ?? null,
          maximum_active_facilities: input.maximumActiveFacilities,
          sensitive_classification: input.sensitiveClassification,
          reason: input.reason,
          created_by: actor.userId,
        });
        await audit(trx, actor, input.companyId, 'loan_type.create', id, 'loan_type.create', ctx);
        return { id };
      });
    },
    async getType(context, id) {
      const type = await repository.type(id);
      if (!type || !repository.companyAllowed(context, type.company_id)) throw missing();
      return { ...type, versions: await repository.typeVersions(id) };
    },
    async updateType(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const type = await repository.lockType(id, trx);
        if (!type || !repository.companyAllowed(context, type.company_id)) throw missing();
        const changed = await trx('loan_facility_types')
          .where({ id, version: input.version })
          .update({
            name: input.name,
            description: input.description ?? null,
            version: input.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        if (!changed) throw new ConflictError('STALE_VERSION', 'The facility type changed.');
        await audit(trx, actor, type.company_id, 'loan_type.update', id, 'loan_type.update', ctx);
        return { id, version: input.version + 1 };
      });
    },
    async versionType(actor, context, id, input, ctx, correction = false) {
      return withTransaction(database, async (trx) => {
        const type = await repository.lockType(id, trx);
        if (!type || !repository.companyAllowed(context, type.company_id)) throw missing();
        const company = await repository.company(type.company_id, trx);
        if (company.currency_code !== input.currencyCode)
          throw new ValidationError('Facility currency must match company currency.');
        if (
          cents(input.maximumPrincipal) < cents(input.minimumPrincipal) ||
          input.maximumTermMonths < input.minimumTermMonths
        )
          throw new ValidationError('Facility limits are invalid.');
        const overlap = await repository.typeOverlap(
          id,
          input.effectiveStart,
          input.effectiveEnd,
          trx,
        );
        if (overlap && !correction)
          throw new ConflictError(
            'EFFECTIVE_PERIOD_OVERLAP',
            'The facility version overlaps existing history.',
          );
        if (overlap)
          await trx('loan_facility_type_versions')
            .where({ id: overlap.id })
            .update({ history_status: 'superseded' });
        const versionNumber = await repository.nextTypeVersion(id, trx);
        const [versionId] = await trx('loan_facility_type_versions').insert({
          company_id: type.company_id,
          loan_facility_type_id: id,
          version_number: versionNumber,
          effective_start: input.effectiveStart,
          effective_end: input.effectiveEnd ?? null,
          currency_code: input.currencyCode,
          minimum_principal: input.minimumPrincipal,
          maximum_principal: input.maximumPrincipal,
          minimum_term_months: input.minimumTermMonths,
          maximum_term_months: input.maximumTermMonths,
          installment_due_day: input.installmentDueDay,
          minimum_service_days: input.minimumServiceDays ?? null,
          maximum_active_facilities: input.maximumActiveFacilities,
          sensitive_classification: input.sensitiveClassification,
          supersedes_version_id: overlap?.id ?? null,
          reason: input.reason,
          created_by: actor.userId,
        });
        const permission = correction ? 'loan_type.correct_history' : 'loan_type.version_create';
        await audit(trx, actor, type.company_id, permission, id, permission, ctx, {
          versionNumber,
        });
        return { id, versionId, versionNumber };
      });
    },
    async deactivateType(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const type = await repository.lockType(id, trx);
        if (!type || !repository.companyAllowed(context, type.company_id)) throw missing();
        const changed = await trx('loan_facility_types')
          .where({ id, version: input.version, record_status: 'active' })
          .update({
            record_status: 'inactive',
            version: input.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        if (!changed) throw new ConflictError('STALE_VERSION', 'The facility type changed.');
        await audit(
          trx,
          actor,
          type.company_id,
          'loan_type.deactivate',
          id,
          'loan_type.deactivate',
          ctx,
          { reason: input.reason },
        );
        return { id, version: input.version + 1 };
      });
    },
    async list(actor, context, input, permission = 'loan.view', ctx) {
      return Promise.all(
        (await repository.list(context, input, permission)).map((r) => project(actor, r, ctx)),
      );
    },
    async get(actor, context, id, permission = 'loan.view', ctx) {
      const row = await repository.applicationScoped(id, context, permission);
      if (!row) throw missing();
      const account = await database('loan_accounts').where({ loan_application_id: id }).first();
      return { ...(await project(actor, row, ctx)), account };
    },
    async create(actor, context, input, ctx) {
      if (!repository.companyAllowed(context, input.companyId)) throw missing();
      return withTransaction(database, async (trx) => {
        const company = await repository.lockCompany(input.companyId, trx);
        if (!company || company.currency_code !== input.currencyCode)
          throw new ValidationError('Application currency must match company currency.');
        const employment = await repository.lockEmployment(input.employmentId, trx),
          ec =
            employment &&
            (await repository.employmentContext(
              input.employmentId,
              companyDate(company.timezone),
              trx,
            ));
        if (
          !ec ||
          Number(ec.user_id) !== Number(actor.userId) ||
          Number(employment.company_id) !== Number(input.companyId)
        )
          throw missing();
        const type = await repository.type(input.loanFacilityTypeId, trx),
          tv =
            type && (await repository.effectiveType(type.id, companyDate(company.timezone), trx));
        if (
          !type ||
          type.record_status !== 'active' ||
          !tv ||
          Number(type.company_id) !== Number(input.companyId)
        )
          throw new ValidationError('The facility type is unavailable.');
        await validateTerms(
          tv,
          input.requestedPrincipal,
          input.requestedTermMonths,
          input.currencyCode,
        );
        const [id] = await trx('loan_applications').insert({
          company_id: input.companyId,
          employment_id: input.employmentId,
          loan_facility_type_id: type.id,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('loan_application_versions').insert({
          company_id: input.companyId,
          loan_application_id: id,
          loan_facility_type_version_id: tv.id,
          version_number: 1,
          requested_principal: input.requestedPrincipal,
          requested_term_months: input.requestedTermMonths,
          currency_code: input.currencyCode,
          purpose: input.purpose,
          change_reason: input.reason,
          created_by: actor.userId,
        });
        await trx('loan_state_events').insert({
          company_id: input.companyId,
          loan_application_id: id,
          from_state: null,
          to_state: 'draft',
          workflow_version: 1,
          reason: input.reason,
          acting_user_id: actor.userId,
        });
        await audit(trx, actor, input.companyId, 'loan.apply', id, 'loan.apply', ctx);
        return { id, status: 'draft', version: 1, workflowVersion: 1 };
      });
    },
    async updateDraft(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.applicationScoped(id, context, 'loan.update_draft', trx),
          a = visible && (await repository.lockApplication(id, trx));
        if (!a) throw missing();
        if (a.status !== 'draft' || a.version !== input.version)
          throw new ConflictError('STALE_VERSION', 'The draft changed.');
        const company = await repository.company(a.company_id, trx),
          tv = await repository.effectiveType(
            input.loanFacilityTypeId,
            companyDate(company.timezone),
            trx,
          );
        if (!tv) throw new ValidationError('The facility type is unavailable.');
        await validateTerms(
          tv,
          input.requestedPrincipal,
          input.requestedTermMonths,
          company.currency_code,
        );
        const next = a.current_version_number + 1;
        await trx('loan_application_versions').insert({
          company_id: a.company_id,
          loan_application_id: id,
          loan_facility_type_version_id: tv.id,
          version_number: next,
          requested_principal: input.requestedPrincipal,
          requested_term_months: input.requestedTermMonths,
          currency_code: company.currency_code,
          purpose: input.purpose,
          change_reason: input.reason,
          created_by: actor.userId,
        });
        await trx('loan_applications')
          .where({ id })
          .update({
            loan_facility_type_id: input.loanFacilityTypeId,
            current_version_number: next,
            version: a.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await audit(trx, actor, a.company_id, 'loan.update_draft', id, 'loan.update_draft', ctx, {
          version: next,
        });
        return { id, version: a.version + 1, currentVersionNumber: next };
      });
    },
    async submit(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.applicationScoped(id, context, 'loan.submit', trx),
          a = visible && (await repository.lockApplication(id, trx));
        if (!a) throw missing();
        if (a.status !== 'draft' || a.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The application cannot be submitted.');
        const company = await repository.company(a.company_id, trx),
          anchor = companyDate(company.timezone),
          ec = await repository.employmentContext(a.employment_id, anchor, trx);
        if (
          !ec ||
          Number(ec.user_id) !== Number(actor.userId) ||
          !LOAN_ELIGIBLE_STATUSES.includes(ec.employment_status) ||
          ec.employment_end_date
        )
          throw new ValidationError('The employment is not eligible to submit.');
        const v = await repository.currentVersion(id, trx),
          tv = await repository.effectiveType(a.loan_facility_type_id, anchor, trx);
        await validateTerms(tv, v.requested_principal, v.requested_term_months, v.currency_code);
        const serviceDays = daysBetween(dateOnly(ec.joining_date), anchor);
        if (tv.minimum_service_days != null && serviceDays < tv.minimum_service_days)
          throw new ValidationError('Minimum service requirement is not met.');
        const active = await trx('loan_accounts')
          .where({ employment_id: a.employment_id, status: 'active' })
          .count({ n: '*' })
          .first();
        if (Number(active.n) >= tv.maximum_active_facilities)
          throw new ValidationError('Maximum active facilities have been reached.');
        const number = await allocate(trx, a.company_id, Number(anchor.slice(0, 4)));
        await trx('loan_application_versions').where({ id: v.id }).update({
          submission_anchor_date: anchor,
          manager_employment_id_snapshot: ec.manager_employment_id,
          manager_user_id_snapshot: ec.manager_user_id,
          branch_id_snapshot: ec.branch_id,
          department_id_snapshot: ec.department_id,
          employment_status_snapshot: ec.employment_status,
          service_days_snapshot: serviceDays,
          compensation_amount_snapshot: null,
        });
        const next = await state(trx, a, actor, 'submitted', input.reason);
        await trx('loan_applications').where({ id }).update({ application_number: number });
        await trx('loan_approval_attempts').insert({
          company_id: a.company_id,
          loan_application_id: id,
          step_type: ec.manager_user_id ? 'manager' : 'hr_fallback',
          attempt_number: 1,
          assigned_approver_user_id: ec.manager_user_id ?? null,
          record_version_at_creation: a.version + 1,
          workflow_version_at_creation: next,
        });
        await audit(trx, actor, a.company_id, 'loan.submit', id, 'loan.submit', ctx);
        const notification = {
          companyId: a.company_id,
          type: 'loan.approval_required',
          title: 'Loan or advance awaiting review',
          message: 'A loan or salary advance application requires a decision.',
          referenceType: 'loan_application',
          referenceId: id,
          idempotencyKey: `loan:${id}:submitted:${next}`,
          actorUserId: actor.userId,
        };
        if (ec.manager_user_id)
          await createWorkflowNotification(trx, { ...notification, userId: ec.manager_user_id });
        else
          await notifyPermissionHolders(trx, notification, 'loan.approve', {
            branchId: ec.branch_id,
            departmentId: ec.department_id,
          });
        return { id, status: 'submitted', applicationNumber: number, workflowVersion: next };
      });
    },
    async transition(actor, context, id, target, input, permission, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.applicationScoped(id, context, permission, trx),
          a = visible && (await repository.lockApplication(id, trx));
        if (!a) throw missing();
        if (a.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The workflow changed.');
        const allowed =
          target === 'withdrawn'
            ? a.status === 'draft'
            : target === 'cancellation_requested' &&
              ['submitted', 'manager_approved', 'finance_approved'].includes(a.status);
        if (!allowed)
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'The transition is not allowed.');
        const next = await state(trx, a, actor, target, input.reason);
        if (target === 'cancellation_requested') {
          const v = await repository.currentVersion(id, trx);
          await trx('loan_approval_attempts').insert({
            company_id: a.company_id,
            loan_application_id: id,
            step_type: 'cancellation',
            attempt_number: 1,
            assigned_approver_user_id: a.status === 'submitted' ? v.manager_user_id_snapshot : null,
            record_version_at_creation: a.version + 1,
            workflow_version_at_creation: next,
          });
        }
        await audit(trx, actor, a.company_id, permission, id, permission, ctx);
        if (target === 'cancellation_requested') {
          const version = await repository.currentVersion(id, trx);
          const notification = {
            companyId: a.company_id,
            type: 'loan.cancellation_approval_required',
            title: 'Loan cancellation awaiting review',
            message: 'A loan or advance cancellation request requires a decision.',
            referenceType: 'loan_application',
            referenceId: id,
            idempotencyKey: `loan:${id}:cancellation_required:${next}`,
            actorUserId: actor.userId,
          };
          if (a.status === 'submitted' && version.manager_user_id_snapshot)
            await createWorkflowNotification(trx, {
              ...notification,
              userId: version.manager_user_id_snapshot,
            });
          else await notifyPermissionHolders(trx, notification, 'loan.approve_cancellation');
        }
        return { id, status: target, workflowVersion: next };
      });
    },
    async decide(actor, context, id, kind, decision, input, ctx) {
      const permission = kind === 'finance' ? `loan.finance_${decision}` : `loan.${decision}`;
      return withTransaction(database, async (trx) => {
        const visible = await repository.applicationScoped(id, context, permission, trx),
          a = visible && (await repository.lockApplication(id, trx));
        if (!a) throw missing();
        if (Number(a.created_by) === Number(actor.userId))
          throw new ConflictError(
            'MAKER_CHECKER_VIOLATION',
            'The claimant cannot decide their own application.',
          );
        if (
          a.workflow_version !== input.workflowVersion ||
          a.status !== (kind === 'manager' ? 'submitted' : 'manager_approved')
        )
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The decision is no longer pending.');
        let attempt;
        if (kind === 'manager') {
          attempt =
            (await repository.pendingAttempt(id, 'manager', trx)) ??
            (await repository.pendingAttempt(id, 'hr_fallback', trx));
        } else attempt = await repository.pendingAttempt(id, 'finance', trx);
        if (
          !attempt ||
          (attempt.assigned_approver_user_id &&
            Number(attempt.assigned_approver_user_id) !== Number(actor.userId))
        )
          throw missing();
        const to =
            kind === 'manager'
              ? decision === 'approve'
                ? 'manager_approved'
                : 'manager_rejected'
              : decision === 'approve'
                ? 'finance_approved'
                : 'finance_rejected',
          next = await state(trx, a, actor, to, input.reason);
        try {
          await trx('loan_approval_decisions').insert({
            company_id: a.company_id,
            loan_approval_attempt_id: attempt.id,
            loan_application_id: id,
            decision: decision === 'approve' ? 'approved' : 'rejected',
            reason: input.reason,
            acting_user_id: actor.userId,
            idempotency_key: input.idempotencyKey,
            workflow_version: next,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The decision was already recorded.');
          throw e;
        }
        await trx('loan_approval_attempts')
          .where({ id: attempt.id })
          .update({ status: decision === 'approve' ? 'approved' : 'rejected' });
        if (kind === 'manager' && decision === 'approve')
          await trx('loan_approval_attempts').insert({
            company_id: a.company_id,
            loan_application_id: id,
            step_type: 'finance',
            attempt_number: 1,
            assigned_approver_user_id: null,
            record_version_at_creation: a.version + 1,
            workflow_version_at_creation: next,
          });
        await audit(trx, actor, a.company_id, permission, id, permission, ctx);
        await createWorkflowNotification(trx, {
          companyId: a.company_id,
          userId: a.created_by,
          type: 'loan.decision',
          title: 'Loan or advance updated',
          message: `Your application is now ${to.replaceAll('_', ' ')}.`,
          referenceType: 'loan_application',
          referenceId: id,
          idempotencyKey: `loan:${id}:${to}:${next}`,
          actorUserId: actor.userId,
        });
        if (to === 'manager_approved')
          await notifyPermissionHolders(
            trx,
            {
              companyId: a.company_id,
              type: 'loan.finance_approval_required',
              title: 'Loan or advance awaiting finance review',
              message: 'A manager-approved application requires a finance decision.',
              referenceType: 'loan_application',
              referenceId: id,
              idempotencyKey: `loan:${id}:finance_required:${next}`,
              actorUserId: actor.userId,
            },
            'loan.finance_approve',
          );
        if (to === 'finance_approved')
          await notifyPermissionHolders(
            trx,
            {
              companyId: a.company_id,
              type: 'loan.disbursement_required',
              title: 'Approved loan awaiting disbursement',
              message: 'A finance-approved loan or advance is ready for disbursement.',
              referenceType: 'loan_application',
              referenceId: id,
              idempotencyKey: `loan:${id}:disbursement_required:${next}`,
              actorUserId: actor.userId,
            },
            'loan.disburse',
          );
        return { id, status: to, workflowVersion: next };
      });
    },
    async decideCancellation(actor, context, id, decision, input, ctx) {
      const permission = `loan.${decision}_cancellation`;
      return withTransaction(database, async (trx) => {
        const visible = await repository.applicationScoped(id, context, permission, trx),
          a = visible && (await repository.lockApplication(id, trx));
        if (!a) throw missing();
        if (Number(a.created_by) === Number(actor.userId))
          throw new ConflictError(
            'MAKER_CHECKER_VIOLATION',
            'The claimant cannot decide cancellation.',
          );
        if (a.status !== 'cancellation_requested' || a.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'Cancellation is no longer pending.');
        const attempt = await repository.pendingAttempt(id, 'cancellation', trx);
        if (
          !attempt ||
          (attempt.assigned_approver_user_id &&
            Number(attempt.assigned_approver_user_id) !== Number(actor.userId))
        )
          throw missing();
        const prior = (
            await trx('loan_state_events')
              .where({ loan_application_id: id, to_state: 'cancellation_requested' })
              .orderBy('workflow_version', 'desc')
              .first()
          ).from_state,
          to = decision === 'approve' ? 'cancelled' : prior,
          next = await state(trx, a, actor, to, input.reason);
        await trx('loan_approval_decisions').insert({
          company_id: a.company_id,
          loan_approval_attempt_id: attempt.id,
          loan_application_id: id,
          decision: decision === 'approve' ? 'approved' : 'rejected',
          reason: input.reason,
          acting_user_id: actor.userId,
          idempotency_key: input.idempotencyKey,
          workflow_version: next,
        });
        await trx('loan_approval_attempts')
          .where({ id: attempt.id })
          .update({ status: decision === 'approve' ? 'approved' : 'rejected' });
        await audit(trx, actor, a.company_id, permission, id, permission, ctx);
        await createWorkflowNotification(trx, {
          companyId: a.company_id,
          userId: a.created_by,
          type: 'loan.cancellation_decision',
          title: 'Loan cancellation updated',
          message: `Your cancellation request was ${decision === 'approve' ? 'approved' : 'rejected'}.`,
          referenceType: 'loan_application',
          referenceId: id,
          idempotencyKey: `loan:${id}:cancellation:${decision}:${next}`,
          actorUserId: actor.userId,
        });
        return { id, status: to, workflowVersion: next };
      });
    },
    async disburse(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.applicationScoped(id, context, 'loan.disburse', trx),
          a = visible && (await repository.lockApplication(id, trx));
        if (!a) throw missing();
        if (Number(a.created_by) === Number(actor.userId))
          throw new ConflictError('MAKER_CHECKER_VIOLATION', 'The claimant cannot disburse.');
        const finance = await trx('loan_approval_decisions')
          .where({ loan_application_id: id, decision: 'approved' })
          .orderBy('id', 'desc')
          .first();
        if (finance && Number(finance.acting_user_id) === Number(actor.userId))
          throw new ConflictError(
            'MAKER_CHECKER_VIOLATION',
            'The Finance approver cannot disburse.',
          );
        if (a.status !== 'finance_approved' || a.workflow_version !== input.workflowVersion)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The application is not ready for disbursement.',
          );
        const v = await repository.currentVersion(id, trx),
          tv = await trx('loan_facility_type_versions')
            .where({ id: v.loan_facility_type_version_id })
            .first(),
          principal = cents(v.requested_principal);
        const amounts = Array.from(
          { length: v.requested_term_months },
          (_, i) =>
            principal / BigInt(v.requested_term_months) +
            (BigInt(i) < principal % BigInt(v.requested_term_months) ? 1n : 0n),
        );
        const maturity = dueDate(
          input.disbursementDate,
          amounts.length - 1,
          tv.installment_due_day,
        );
        let accountId;
        try {
          [accountId] = await trx('loan_accounts').insert({
            company_id: a.company_id,
            loan_application_id: id,
            employment_id: a.employment_id,
            account_number: a.application_number,
            status: 'active',
            original_principal: v.requested_principal,
            total_repayable: v.requested_principal,
            outstanding_amount: v.requested_principal,
            currency_code: v.currency_code,
            disbursement_date: input.disbursementDate,
            maturity_date: maturity,
            created_by: actor.userId,
          });
          await trx('loan_disbursements').insert({
            company_id: a.company_id,
            loan_account_id: accountId,
            amount: v.requested_principal,
            currency_code: v.currency_code,
            disbursement_date: input.disbursementDate,
            reference: input.reference,
            reason: input.reason,
            idempotency_key: input.idempotencyKey,
            recorded_by: actor.userId,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('IDEMPOTENCY_CONFLICT', 'Disbursement already exists.');
          throw e;
        }
        const [scheduleId] = await trx('loan_repayment_schedules').insert({
          company_id: a.company_id,
          loan_account_id: accountId,
          scheduled_total: v.requested_principal,
          installment_count: amounts.length,
        });
        await trx('loan_repayment_installments').insert(
          amounts.map((amount, i) => ({
            company_id: a.company_id,
            loan_repayment_schedule_id: scheduleId,
            installment_number: i + 1,
            due_date: dueDate(input.disbursementDate, i, tv.installment_due_day),
            principal_amount: money(amount),
            total_amount: money(amount),
          })),
        );
        const next = await state(trx, a, actor, 'disbursed', input.reason);
        await audit(trx, actor, a.company_id, 'loan.disburse', id, 'loan.disburse', ctx, {
          amount: v.requested_principal,
          currency: v.currency_code,
        });
        await createWorkflowNotification(trx, {
          companyId: a.company_id,
          userId: a.created_by,
          type: 'loan.disbursed',
          title: 'Loan or advance disbursed',
          message: 'Disbursement has been recorded for your approved application.',
          referenceType: 'loan_application',
          referenceId: id,
          idempotencyKey: `loan:${id}:disbursed:${next}`,
          actorUserId: actor.userId,
        });
        await notifyPermissionHolders(
          trx,
          {
            companyId: a.company_id,
            type: 'loan.repayment_tracking_required',
            title: 'New loan account requires repayment tracking',
            message: 'A disbursed loan or advance account is ready for repayment servicing.',
            referenceType: 'loan_application',
            referenceId: id,
            idempotencyKey: `loan:${id}:repayment_tracking:${next}`,
            actorUserId: actor.userId,
          },
          'loan_repayment.record',
        );
        return { id, accountId, status: 'disbursed', workflowVersion: next };
      });
    },
    async account(actor, context, id, permission = 'loan_repayment.view') {
      const row = await repository.accountScoped(id, context, permission);
      if (!row) throw missing();
      const schedule = await database('loan_repayment_schedules')
          .where({ loan_account_id: id })
          .first(),
        installments = schedule
          ? await database('loan_repayment_installments')
              .where({ loan_repayment_schedule_id: schedule.id })
              .orderBy('installment_number')
          : [],
        ledger = await database('loan_repayment_ledger')
          .where({ loan_account_id: id })
          .orderBy('id');
      return { ...row, schedule, installments, ledger };
    },
    async recordLedger(actor, context, id, input, type, permission, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.accountScoped(id, context, permission, trx),
          account = visible && (await repository.lockAccount(id, trx));
        if (!account) throw missing();
        if (Number(visible.claimant_user_id) === Number(actor.userId))
          throw new ConflictError(
            'MAKER_CHECKER_VIOLATION',
            'The claimant cannot service their own facility.',
          );
        if (type === 'repayment') {
          const disbursement = await trx('loan_disbursements')
              .where({ loan_account_id: id })
              .first('recorded_by'),
            financeDecision = await trx('loan_approval_decisions as decision')
              .join(
                'loan_approval_attempts as attempt',
                'attempt.id',
                'decision.loan_approval_attempt_id',
              )
              .where({
                'decision.loan_application_id': account.loan_application_id,
                'attempt.step_type': 'finance',
                'decision.decision': 'approved',
              })
              .orderBy('decision.id', 'desc')
              .first('decision.acting_user_id');
          if (
            Number(disbursement?.recorded_by) === Number(actor.userId) ||
            Number(financeDecision?.acting_user_id) === Number(actor.userId)
          )
            throw new ConflictError(
              'MAKER_CHECKER_VIOLATION',
              'Repayment must be recorded by a separate financial actor.',
            );
        }
        if (account.status !== 'active')
          throw new ConflictError('INVALID_ACCOUNT_STATE', 'The account is not active.');
        const amount = cents(input.amount);
        if (amount <= 0n || amount > cents(account.outstanding_amount))
          throw new ValidationError('Repayment cannot exceed the outstanding amount.');
        let entryId;
        try {
          [entryId] = await trx('loan_repayment_ledger').insert({
            company_id: account.company_id,
            loan_account_id: id,
            entry_type: type,
            amount: input.amount,
            effective_date: input.effectiveDate,
            reference: input.reference ?? null,
            reason: input.reason,
            idempotency_key: input.idempotencyKey,
            acting_user_id: actor.userId,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The ledger action already exists.');
          throw e;
        }
        const outstanding = cents(account.outstanding_amount) - amount,
          status = outstanding === 0n ? 'settled' : 'active';
        await trx('loan_accounts')
          .where({ id })
          .update({ outstanding_amount: money(outstanding), status, version: account.version + 1 });
        await updateSchedule(trx, { ...account, outstanding_amount: money(outstanding) });
        await audit(
          trx,
          actor,
          account.company_id,
          permission,
          account.loan_application_id,
          permission,
          ctx,
          { amount: input.amount, currency: account.currency_code },
        );
        await createWorkflowNotification(trx, {
          companyId: account.company_id,
          userId: visible.claimant_user_id,
          type: `loan.${type}_recorded`,
          title: type === 'repayment' ? 'Loan repayment recorded' : 'Loan account adjusted',
          message:
            type === 'repayment'
              ? 'A repayment was recorded against your loan or advance.'
              : 'An authorized adjustment was recorded against your loan or advance.',
          referenceType: 'loan_application',
          referenceId: account.loan_application_id,
          idempotencyKey: `loan:${account.loan_application_id}:${type}:${entryId}`,
          actorUserId: actor.userId,
        });
        return { entryId, outstandingAmount: money(outstanding), status };
      });
    },
    async reverse(actor, context, id, entryId, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.accountScoped(id, context, 'loan_repayment.reverse', trx),
          account = visible && (await repository.lockAccount(id, trx));
        if (!account) throw missing();
        if (Number(visible.claimant_user_id) === Number(actor.userId))
          throw new ConflictError(
            'MAKER_CHECKER_VIOLATION',
            'The claimant cannot reverse repayment.',
          );
        const entry = await trx('loan_repayment_ledger')
          .where({ id: entryId, loan_account_id: id })
          .forUpdate()
          .first();
        if (!entry || entry.entry_type === 'reversal') throw missing();
        const existing = await trx('loan_repayment_ledger')
          .where({ reversal_of_entry_id: entryId })
          .first();
        if (existing)
          throw new ConflictError('REVERSAL_CONFLICT', 'The entry was already reversed.');
        const amount = -cents(entry.amount);
        try {
          await trx('loan_repayment_ledger').insert({
            company_id: account.company_id,
            loan_account_id: id,
            entry_type: 'reversal',
            amount: money(amount),
            effective_date: input.effectiveDate,
            reason: input.reason,
            idempotency_key: input.idempotencyKey,
            reversal_of_entry_id: entryId,
            acting_user_id: actor.userId,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('REVERSAL_CONFLICT', 'The reversal already exists.');
          throw e;
        }
        const outstanding = cents(account.outstanding_amount) + cents(entry.amount);
        await trx('loan_accounts')
          .where({ id })
          .update({
            outstanding_amount: money(outstanding),
            status: 'active',
            version: account.version + 1,
          });
        await updateSchedule(trx, { ...account, outstanding_amount: money(outstanding) });
        await audit(
          trx,
          actor,
          account.company_id,
          'loan_repayment.reverse',
          account.loan_application_id,
          'loan_repayment.reverse',
          ctx,
          { amount: entry.amount, currency: account.currency_code },
        );
        await createWorkflowNotification(trx, {
          companyId: account.company_id,
          userId: visible.claimant_user_id,
          type: 'loan.repayment_reversed',
          title: 'Loan repayment entry reversed',
          message: 'An authorized repayment or adjustment reversal was recorded on your account.',
          referenceType: 'loan_application',
          referenceId: account.loan_application_id,
          idempotencyKey: `loan:${account.loan_application_id}:reversal:${entryId}`,
          actorUserId: actor.userId,
        });
        return { id, entryId, outstandingAmount: money(outstanding) };
      });
    },
    async history(context, id) {
      const row = await repository.applicationScoped(id, context, 'loan.view_history');
      if (!row) throw missing();
      return repository.history(id);
    },
    async export(actor, context, input, ctx) {
      const rows = await repository.list(
        context,
        { ...input, page: 1, pageSize: LOAN_LIMITS.maximumExportRows },
        'loan.export',
      );
      await audit(database, actor, input.companyId, 'loan.export', null, 'loan.export', ctx, {
        count: rows.length,
      });
      return (
        'application_number,employee_code,employee_name,facility,status,principal,term_months,currency\n' +
        rows
          .map((r) =>
            [
              r.application_number,
              r.employee_code,
              JSON.stringify(r.display_name),
              JSON.stringify(r.facility_name),
              r.status,
              r.requested_principal,
              r.requested_term_months,
              r.currency_code,
            ].join(','),
          )
          .join('\n')
      );
    },
  };
}
