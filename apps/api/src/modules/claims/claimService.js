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
import { CLAIM_ELIGIBLE_STATUSES, CLAIM_LIMITS } from './claimConstants.js';
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested claim record was not found.',
    statusCode: 404,
  });
const cents = (value) => {
  const [a, b = ''] = String(value).split('.');
  return BigInt(a) * 100n + BigInt((b + '00').slice(0, 2));
};
const money = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
const dateOnly = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const addDays = (value, days) => {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const companyDate = (timezone) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
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

export function createClaimService({ database, repository, authorizationService }) {
  const audit = (trx, actor, companyId, action, id, permission, ctx, metadata) =>
    insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: 'expense_claim',
      recordId: id,
      permissionCode: permission,
      metadata,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  async function sensitiveContext(actor) {
    try {
      return await authorizationService.requirePermission(actor, 'claim_sensitive.view');
    } catch {
      return null;
    }
  }
  async function project(actor, row, trx = database) {
    const version = await repository.currentVersion(row.id, trx);
    const items = await repository.items(version.id, trx);
    const refs = await repository.evidence(
      items.map((x) => x.id),
      trx,
    );
    const sensitive = await sensitiveContext(actor);
    const sensitiveAllowed =
      sensitive && (await repository.claimScoped(row.id, sensitive, 'claim_sensitive.view', trx));
    const own = Number(row.created_by) === Number(actor.userId);
    const projectedItems = items.map((item) => {
      const evidence = refs.filter((x) => Number(x.expense_claim_item_id) === Number(item.id));
      if (item.sensitive_classification_snapshot !== 'sensitive' || sensitiveAllowed || own)
        return { ...item, evidence };
      const safe = { ...item, evidencePresent: evidence.length > 0 };
      delete safe.description;
      delete safe.merchant_reference;
      return safe;
    });
    if (sensitiveAllowed && items.some((x) => x.sensitive_classification_snapshot === 'sensitive'))
      await audit(
        database,
        actor,
        row.company_id,
        'claim_sensitive.view',
        row.id,
        'claim_sensitive.view',
        null,
      );
    return { ...row, items: projectedItems };
  }
  async function buildVersion(trx, claimId, input, actor, number, submission = {}) {
    let total = 0n;
    const resolved = [];
    for (const item of input.items) {
      const category = await repository.category(item.claimCategoryId, trx);
      const cv = category && (await repository.categoryVersion(category.id, item.expenseDate, trx));
      if (
        !category ||
        category.record_status !== 'active' ||
        !cv ||
        Number(category.company_id) !== Number(input.companyId ?? submission.companyId)
      )
        throw new ValidationError('A claim category is unavailable for the expense date.');
      if (cv.currency_code !== input.currencyCode)
        throw new ValidationError(
          'Claim currency must match every category and the company currency.',
        );
      const amount = cents(item.amount);
      if (amount <= 0n) throw new ValidationError('Claim item amounts must be positive.');
      if (cv.maximum_item_amount && amount > cents(cv.maximum_item_amount))
        throw new ValidationError('A claim item exceeds its category maximum.');
      if (cv.receipt_required && !item.evidence.length)
        throw new ValidationError('Required evidence metadata is missing.');
      total += amount;
      resolved.push({ item, category, cv });
    }
    const [versionId] = await trx('expense_claim_versions').insert({
      company_id: input.companyId ?? submission.companyId,
      expense_claim_id: claimId,
      version_number: number,
      title: input.title,
      business_purpose: input.businessPurpose,
      currency_code: input.currencyCode,
      total_amount: money(total),
      submission_anchor_date: submission.anchor ?? null,
      manager_employment_id_snapshot: submission.managerEmploymentId ?? null,
      manager_user_id_snapshot: submission.managerUserId ?? null,
      branch_id_snapshot: submission.branchId ?? null,
      department_id_snapshot: submission.departmentId ?? null,
      employment_status_snapshot: submission.employmentStatus ?? null,
      change_reason: input.reason,
      created_by: actor.userId,
    });
    for (const { item, category, cv } of resolved) {
      const [itemId] = await trx('expense_claim_items').insert({
        company_id: category.company_id,
        expense_claim_id: claimId,
        expense_claim_version_id: versionId,
        claim_category_id: category.id,
        claim_category_version_id: cv.id,
        expense_date: item.expenseDate,
        description: item.description,
        amount: item.amount,
        merchant_reference: item.merchantReference ?? null,
        receipt_required_snapshot: cv.receipt_required,
        sensitive_classification_snapshot: cv.sensitive_classification,
      });
      if (item.evidence.length)
        await trx('expense_claim_evidence').insert(
          item.evidence.map((e) => ({
            company_id: category.company_id,
            expense_claim_item_id: itemId,
            reference_type: e.referenceType,
            reference_value: e.referenceValue,
            display_name: e.displayName,
            created_by: actor.userId,
          })),
        );
    }
    return { versionId, total: money(total) };
  }
  async function allocateNumber(trx, companyId, year) {
    await trx('claim_number_sequences')
      .insert({ company_id: companyId, sequence_year: year, next_value: 1 })
      .onConflict(['company_id', 'sequence_year'])
      .ignore();
    const sequence = await trx('claim_number_sequences')
      .where({ company_id: companyId, sequence_year: year })
      .forUpdate()
      .first();
    const value = Number(sequence.next_value);
    await trx('claim_number_sequences')
      .where({ company_id: companyId, sequence_year: year })
      .update({ next_value: value + 1 });
    return `CLM-${year}-${String(value).padStart(6, '0')}`;
  }
  async function state(trx, claim, actor, to, reason) {
    const next = claim.workflow_version + 1;
    await trx('expense_claims')
      .where({ id: claim.id, workflow_version: claim.workflow_version })
      .update({
        status: to,
        workflow_version: next,
        version: claim.version + 1,
        updated_by: actor.userId,
        updated_at: trx.fn.now(),
      });
    await trx('expense_claim_state_events').insert({
      company_id: claim.company_id,
      expense_claim_id: claim.id,
      from_state: claim.status,
      to_state: to,
      workflow_version: next,
      reason,
      acting_user_id: actor.userId,
    });
    return next;
  }
  return {
    limits: CLAIM_LIMITS,
    async listCategories(_actor, context, input) {
      return repository.listCategories(context, input);
    },
    async getCategory(context, id) {
      const category = await repository.category(id);
      if (!category || !repository.companyAllowed(context, category.company_id)) throw missing();
      return { ...category, versions: await repository.categoryVersions(id) };
    },
    async createCategory(actor, context, input, ctx) {
      if (!repository.companyAllowed(context, input.companyId)) throw missing();
      return withTransaction(database, async (trx) => {
        const company = await repository.lockCompany(input.companyId, trx);
        if (!company) throw new ValidationError('The company does not exist.');
        if (company.currency_code !== input.currencyCode)
          throw new ValidationError('Category currency must match company currency.');
        let id;
        try {
          [id] = await trx('claim_categories').insert({
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'CLAIM_CATEGORY_CONFLICT',
              'The category code is already in use.',
            );
          throw error;
        }
        await trx('claim_category_versions').insert({
          company_id: input.companyId,
          claim_category_id: id,
          version_number: 1,
          effective_start: input.effectiveStart,
          effective_end: input.effectiveEnd ?? null,
          receipt_required: input.receiptRequired,
          maximum_item_amount: input.maximumItemAmount ?? null,
          currency_code: input.currencyCode,
          sensitive_classification: input.sensitiveClassification,
          reason: input.reason,
          created_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          input.companyId,
          'claim_category.create',
          id,
          'claim_category.create',
          ctx,
        );
        return { id };
      });
    },
    async updateCategory(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const category = await repository.lockCategory(id, trx);
        if (!category || !repository.companyAllowed(context, category.company_id)) throw missing();
        const changed = await trx('claim_categories')
          .where({ id, version: input.version })
          .update({
            name: input.name,
            description: input.description ?? null,
            version: input.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        if (!changed) throw new ConflictError('STALE_VERSION', 'The category changed.');
        await audit(
          trx,
          actor,
          category.company_id,
          'claim_category.update',
          id,
          'claim_category.update',
          ctx,
        );
        return { id, version: input.version + 1 };
      });
    },
    async versionCategory(actor, context, id, input, ctx, correction = false) {
      return withTransaction(database, async (trx) => {
        const category = await repository.lockCategory(id, trx);
        if (!category || !repository.companyAllowed(context, category.company_id)) throw missing();
        const company = await repository.company(category.company_id, trx);
        if (company.currency_code !== input.currencyCode)
          throw new ValidationError('Category currency must match company currency.');
        const overlap = await repository.categoryOverlap(
          id,
          input.effectiveStart,
          input.effectiveEnd,
          trx,
        );
        if (overlap && !correction)
          throw new ConflictError(
            'EFFECTIVE_PERIOD_OVERLAP',
            'The category version overlaps existing history.',
          );
        if (overlap)
          await trx('claim_category_versions')
            .where({ id: overlap.id })
            .update({ history_status: 'superseded' });
        const versionNumber = await repository.nextCategoryVersion(id, trx);
        const [versionId] = await trx('claim_category_versions').insert({
          company_id: category.company_id,
          claim_category_id: id,
          version_number: versionNumber,
          effective_start: input.effectiveStart,
          effective_end: input.effectiveEnd ?? null,
          receipt_required: input.receiptRequired,
          maximum_item_amount: input.maximumItemAmount ?? null,
          currency_code: input.currencyCode,
          sensitive_classification: input.sensitiveClassification,
          supersedes_version_id: overlap?.id ?? null,
          reason: input.reason,
          created_by: actor.userId,
        });
        const permission = correction
          ? 'claim_category.correct_history'
          : 'claim_category.version_create';
        await audit(trx, actor, category.company_id, permission, id, permission, ctx, {
          versionNumber,
        });
        return { id, versionId, versionNumber };
      });
    },
    async deactivateCategory(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const category = await repository.lockCategory(id, trx);
        if (!category || !repository.companyAllowed(context, category.company_id)) throw missing();
        const changed = await trx('claim_categories')
          .where({ id, version: input.version, record_status: 'active' })
          .update({
            record_status: 'inactive',
            version: input.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        if (!changed) throw new ConflictError('STALE_VERSION', 'The category changed.');
        await audit(
          trx,
          actor,
          category.company_id,
          'claim_category.deactivate',
          id,
          'claim_category.deactivate',
          ctx,
          { reason: input.reason },
        );
        return { id, version: input.version + 1 };
      });
    },
    async list(actor, context, input, permission = 'claim.view') {
      return Promise.all(
        (await repository.listClaims(context, input, permission)).map((row) => project(actor, row)),
      );
    },
    async get(actor, context, id, permission = 'claim.view') {
      const row = await repository.claimScoped(id, context, permission);
      if (!row) throw missing();
      return project(actor, row);
    },
    async create(actor, context, input, ctx) {
      if (!repository.companyAllowed(context, input.companyId)) throw missing();
      return withTransaction(database, async (trx) => {
        const company = await repository.lockCompany(input.companyId, trx);
        if (!company || company.currency_code !== input.currencyCode)
          throw new ValidationError('Claim currency must match company currency.');
        const employment = await repository.lockEmployment(input.employmentId, trx);
        if (!employment || Number(employment.company_id) !== Number(input.companyId))
          throw missing();
        const own = await repository.employmentContext(
          input.employmentId,
          companyDate(company.timezone),
          trx,
        );
        if (!own || Number(own.user_id) !== Number(actor.userId)) throw missing();
        const [id] = await trx('expense_claims').insert({
          company_id: input.companyId,
          employment_id: input.employmentId,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await buildVersion(trx, id, input, actor, 1);
        await trx('expense_claim_state_events').insert({
          company_id: input.companyId,
          expense_claim_id: id,
          from_state: null,
          to_state: 'draft',
          workflow_version: 1,
          reason: input.reason,
          acting_user_id: actor.userId,
        });
        await audit(trx, actor, input.companyId, 'claim.create', id, 'claim.create', ctx);
        return { id, status: 'draft', version: 1, workflowVersion: 1 };
      });
    },
    async updateDraft(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.claimScoped(id, context, 'claim.update_draft', trx);
        const claim = visible && (await repository.lockClaim(id, trx));
        if (!claim) throw missing();
        if (claim.status !== 'draft' || claim.version !== input.version)
          throw new ConflictError('STALE_VERSION', 'The claim changed or is no longer editable.');
        const previous = await repository.currentVersion(id, trx);
        const company = await repository.company(claim.company_id, trx);
        const payload = {
          ...input,
          companyId: claim.company_id,
          employmentId: claim.employment_id,
          currencyCode: company.currency_code,
        };
        const next = claim.current_version_number + 1;
        await buildVersion(trx, id, payload, actor, next);
        await trx('expense_claims')
          .where({ id })
          .update({
            current_version_number: next,
            version: claim.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          actor,
          claim.company_id,
          'claim.update_draft',
          id,
          'claim.update_draft',
          ctx,
          { previousVersion: previous.version_number, newVersion: next },
        );
        return { id, version: claim.version + 1, currentVersionNumber: next };
      });
    },
    async submit(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.claimScoped(id, context, 'claim.submit', trx);
        const claim = visible && (await repository.lockClaim(id, trx));
        if (!claim) throw missing();
        if (claim.status !== 'draft' || claim.workflow_version !== input.workflowVersion)
          throw new ConflictError(
            'STALE_WORKFLOW_VERSION',
            'The claim cannot be submitted from its current state.',
          );
        const company = await repository.company(claim.company_id, trx);
        const anchor = companyDate(company.timezone);
        const employment = await repository.employmentContext(claim.employment_id, anchor, trx);
        if (
          !employment ||
          Number(employment.user_id) !== Number(actor.userId) ||
          !CLAIM_ELIGIBLE_STATUSES.includes(employment.employment_status) ||
          employment.employment_end_date
        )
          throw new ValidationError('The employment is not eligible to submit claims.');
        const current = await repository.currentVersion(id, trx);
        const items = await repository.items(current.id, trx);
        for (const item of items) {
          const expense = dateOnly(item.expense_date);
          if (expense > anchor) throw new ValidationError('Future expense dates are not allowed.');
          if (expense < addDays(anchor, -CLAIM_LIMITS.maximumExpenseAgeDays))
            throw new ValidationError('An expense exceeds the 90-day submission limit.');
        }
        const claimNumber = await allocateNumber(trx, claim.company_id, Number(anchor.slice(0, 4)));
        await trx('expense_claim_versions').where({ id: current.id }).update({
          submission_anchor_date: anchor,
          manager_employment_id_snapshot: employment.manager_employment_id,
          manager_user_id_snapshot: employment.manager_user_id,
          branch_id_snapshot: employment.branch_id,
          department_id_snapshot: employment.department_id,
          employment_status_snapshot: employment.employment_status,
        });
        const next = await state(trx, claim, actor, 'submitted', input.reason);
        await trx('expense_claims').where({ id }).update({ claim_number: claimNumber });
        await trx('expense_claim_approval_attempts').insert({
          company_id: claim.company_id,
          expense_claim_id: id,
          step_type: employment.manager_user_id ? 'manager' : 'hr_fallback',
          attempt_number: 1,
          assigned_approver_user_id: employment.manager_user_id ?? null,
          record_version_at_creation: claim.version + 1,
          workflow_version_at_creation: next,
        });
        await audit(trx, actor, claim.company_id, 'claim.submit', id, 'claim.submit', ctx);
        const notification = {
          companyId: claim.company_id,
          type: 'claim.approval_required',
          title: 'Expense claim awaiting review',
          message: 'An expense claim requires a decision.',
          referenceType: 'expense_claim',
          referenceId: id,
          idempotencyKey: `claim:${id}:submitted:${next}`,
          actorUserId: actor.userId,
        };
        if (employment.manager_user_id)
          await createWorkflowNotification(trx, {
            ...notification,
            userId: employment.manager_user_id,
          });
        else
          await notifyPermissionHolders(trx, notification, 'claim.approve', {
            branchId: employment.branch_id,
            departmentId: employment.department_id,
          });
        return { id, status: 'submitted', claimNumber, workflowVersion: next };
      });
    },
    async simpleTransition(actor, context, id, target, input, permission, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.claimScoped(id, context, permission, trx);
        const claim = visible && (await repository.lockClaim(id, trx));
        if (!claim) throw missing();
        if (claim.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The claim workflow changed.');
        const allowed =
          target === 'withdrawn'
            ? claim.status === 'draft'
            : target === 'cancellation_requested' &&
              ['submitted', 'manager_approved', 'finance_approved'].includes(claim.status);
        if (!allowed)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The claim cannot perform this transition.',
          );
        const next = await state(trx, claim, actor, target, input.reason);
        if (target === 'cancellation_requested')
          await trx('expense_claim_approval_attempts').insert({
            company_id: claim.company_id,
            expense_claim_id: id,
            step_type: 'cancellation',
            attempt_number: 1,
            assigned_approver_user_id:
              claim.status === 'submitted'
                ? (await repository.currentVersion(id, trx)).manager_user_id_snapshot
                : null,
            record_version_at_creation: claim.version + 1,
            workflow_version_at_creation: next,
          });
        await audit(trx, actor, claim.company_id, `claim.${target}`, id, permission, ctx);
        if (target === 'cancellation_requested') {
          const version = await repository.currentVersion(id, trx);
          const notification = {
            companyId: claim.company_id,
            type: 'claim.cancellation_approval_required',
            title: 'Claim cancellation awaiting review',
            message: 'A claim cancellation request requires a decision.',
            referenceType: 'expense_claim',
            referenceId: id,
            idempotencyKey: `claim:${id}:cancellation_required:${next}`,
            actorUserId: actor.userId,
          };
          if (claim.status === 'submitted' && version.manager_user_id_snapshot)
            await createWorkflowNotification(trx, {
              ...notification,
              userId: version.manager_user_id_snapshot,
            });
          else await notifyPermissionHolders(trx, notification, 'claim.approve_cancellation');
        }
        return { id, status: target, workflowVersion: next };
      });
    },
    async decide(actor, context, id, kind, decision, input, ctx) {
      const permission = kind === 'finance' ? `claim.finance_${decision}` : `claim.${decision}`;
      return withTransaction(database, async (trx) => {
        const visible = await repository.claimScoped(id, context, permission, trx);
        const claim = visible && (await repository.lockClaim(id, trx));
        if (!claim) throw missing();
        if (Number(claim.created_by) === Number(actor.userId))
          throw new ConflictError(
            'MAKER_CHECKER_VIOLATION',
            'The claimant cannot decide their own claim.',
          );
        if (claim.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The claim workflow changed.');
        const expected = kind === 'manager' ? 'submitted' : 'manager_approved';
        if (claim.status !== expected)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The claim is not awaiting this decision.',
          );
        const type = kind === 'manager' ? ['manager', 'hr_fallback'] : 'finance';
        let attempt;
        for (const t of Array.isArray(type) ? type : [type])
          attempt = attempt ?? (await repository.pendingAttempt(id, t, trx));
        if (!attempt) throw missing();
        if (
          attempt.assigned_approver_user_id &&
          Number(attempt.assigned_approver_user_id) !== Number(actor.userId)
        )
          throw missing();
        const to =
          kind === 'manager'
            ? decision === 'approve'
              ? 'manager_approved'
              : 'manager_rejected'
            : decision === 'approve'
              ? 'finance_approved'
              : 'finance_rejected';
        const next = await state(trx, claim, actor, to, input.reason);
        try {
          await trx('expense_claim_approval_decisions').insert({
            company_id: claim.company_id,
            approval_attempt_id: attempt.id,
            expense_claim_id: id,
            decision: decision === 'approve' ? 'approved' : 'rejected',
            reason: input.reason,
            acting_user_id: actor.userId,
            idempotency_key: input.idempotencyKey,
            record_version: claim.version + 1,
            workflow_version: next,
          });
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The decision has already been recorded.',
            );
          throw error;
        }
        await trx('expense_claim_approval_attempts')
          .where({ id: attempt.id })
          .update({ status: decision === 'approve' ? 'approved' : 'rejected' });
        if (kind === 'manager' && decision === 'approve')
          await trx('expense_claim_approval_attempts').insert({
            company_id: claim.company_id,
            expense_claim_id: id,
            step_type: 'finance',
            attempt_number: 1,
            assigned_approver_user_id: null,
            record_version_at_creation: claim.version + 1,
            workflow_version_at_creation: next,
          });
        await audit(trx, actor, claim.company_id, `${permission}`, id, permission, ctx);
        await createWorkflowNotification(trx, {
          companyId: claim.company_id,
          userId: claim.created_by,
          type: 'claim.decision',
          title: 'Expense claim updated',
          message: `Your expense claim is now ${to.replaceAll('_', ' ')}.`,
          referenceType: 'expense_claim',
          referenceId: id,
          idempotencyKey: `claim:${id}:${to}:${next}`,
          actorUserId: actor.userId,
        });
        if (to === 'manager_approved')
          await notifyPermissionHolders(
            trx,
            {
              companyId: claim.company_id,
              type: 'claim.finance_approval_required',
              title: 'Expense claim awaiting finance review',
              message: 'A manager-approved expense claim requires a finance decision.',
              referenceType: 'expense_claim',
              referenceId: id,
              idempotencyKey: `claim:${id}:finance_required:${next}`,
              actorUserId: actor.userId,
            },
            'claim.finance_approve',
          );
        if (to === 'finance_approved')
          await notifyPermissionHolders(
            trx,
            {
              companyId: claim.company_id,
              type: 'claim.payment_required',
              title: 'Expense claim ready for payment',
              message: 'A finance-approved expense claim is ready for payment recording.',
              referenceType: 'expense_claim',
              referenceId: id,
              idempotencyKey: `claim:${id}:payment_required:${next}`,
              actorUserId: actor.userId,
            },
            'claim.record_payment',
          );
        return { id, status: to, workflowVersion: next };
      });
    },
    async decideCancellation(actor, context, id, decision, input, ctx) {
      const permission = `claim.${decision}_cancellation`;
      return withTransaction(database, async (trx) => {
        const visible = await repository.claimScoped(id, context, permission, trx);
        const claim = visible && (await repository.lockClaim(id, trx));
        if (!claim) throw missing();
        if (Number(claim.created_by) === Number(actor.userId))
          throw new ConflictError(
            'MAKER_CHECKER_VIOLATION',
            'The claimant cannot decide their own cancellation.',
          );
        if (
          claim.status !== 'cancellation_requested' ||
          claim.workflow_version !== input.workflowVersion
        )
          throw new ConflictError(
            'STALE_WORKFLOW_VERSION',
            'The cancellation is no longer awaiting a decision.',
          );
        const attempt = await repository.pendingAttempt(id, 'cancellation', trx);
        if (!attempt) throw missing();
        if (
          attempt.assigned_approver_user_id &&
          Number(attempt.assigned_approver_user_id) !== Number(actor.userId)
        )
          throw missing();
        const prior = (
          await trx('expense_claim_state_events')
            .where({ expense_claim_id: id, to_state: 'cancellation_requested' })
            .orderBy('workflow_version', 'desc')
            .first()
        ).from_state;
        const to = decision === 'approve' ? 'cancelled' : prior;
        const next = await state(trx, claim, actor, to, input.reason);
        await trx('expense_claim_approval_decisions').insert({
          company_id: claim.company_id,
          approval_attempt_id: attempt.id,
          expense_claim_id: id,
          decision: decision === 'approve' ? 'approved' : 'rejected',
          reason: input.reason,
          acting_user_id: actor.userId,
          idempotency_key: input.idempotencyKey,
          record_version: claim.version + 1,
          workflow_version: next,
        });
        await trx('expense_claim_approval_attempts')
          .where({ id: attempt.id })
          .update({ status: decision === 'approve' ? 'approved' : 'rejected' });
        await audit(trx, actor, claim.company_id, permission, id, permission, ctx);
        await createWorkflowNotification(trx, {
          companyId: claim.company_id,
          userId: claim.created_by,
          type: 'claim.cancellation_decision',
          title: 'Claim cancellation updated',
          message: `Your claim cancellation was ${decision === 'approve' ? 'approved' : 'rejected'}.`,
          referenceType: 'expense_claim',
          referenceId: id,
          idempotencyKey: `claim:${id}:cancellation:${decision}:${next}`,
          actorUserId: actor.userId,
        });
        return { id, status: to, workflowVersion: next };
      });
    },
    async recordPayment(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.claimScoped(id, context, 'claim.record_payment', trx);
        const claim = visible && (await repository.lockClaim(id, trx));
        if (!claim) throw missing();
        if (Number(claim.created_by) === Number(actor.userId))
          throw new ConflictError('MAKER_CHECKER_VIOLATION', 'The claimant cannot record payment.');
        const finance = await trx('expense_claim_approval_decisions')
          .where({ expense_claim_id: id, decision: 'approved' })
          .orderBy('id', 'desc')
          .first();
        if (finance && Number(finance.acting_user_id) === Number(actor.userId))
          throw new ConflictError(
            'MAKER_CHECKER_VIOLATION',
            'The finance approver cannot record payment.',
          );
        if (claim.status !== 'finance_approved' || claim.workflow_version !== input.workflowVersion)
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'The claim is not ready for payment.');
        const version = await repository.currentVersion(id, trx);
        try {
          await trx('expense_claim_payments').insert({
            company_id: claim.company_id,
            expense_claim_id: id,
            payment_reference: input.paymentReference,
            payment_date: input.paymentDate,
            paid_amount: version.total_amount,
            currency_code: version.currency_code,
            recorded_by: actor.userId,
            reason: input.reason,
            idempotency_key: input.idempotencyKey,
          });
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError('IDEMPOTENCY_CONFLICT', 'Payment has already been recorded.');
          throw error;
        }
        const next = await state(trx, claim, actor, 'paid', input.reason);
        await audit(
          trx,
          actor,
          claim.company_id,
          'claim.record_payment',
          id,
          'claim.record_payment',
          ctx,
          { amount: version.total_amount, currency: version.currency_code },
        );
        await createWorkflowNotification(trx, {
          companyId: claim.company_id,
          userId: claim.created_by,
          type: 'claim.paid',
          title: 'Expense claim paid',
          message: 'Payment has been recorded for your expense claim.',
          referenceType: 'expense_claim',
          referenceId: id,
          idempotencyKey: `claim:${id}:paid:${next}`,
          actorUserId: actor.userId,
        });
        return { id, status: 'paid', workflowVersion: next };
      });
    },
    async history(context, id) {
      const row = await repository.claimScoped(id, context, 'claim.view_history');
      if (!row) throw missing();
      return repository.history(id);
    },
    async export(actor, context, input, ctx) {
      const rows = await repository.listClaims(
        context,
        { ...input, page: 1, pageSize: CLAIM_LIMITS.maximumExportRows },
        'claim.export',
      );
      await audit(database, actor, input.companyId, 'claim.export', null, 'claim.export', ctx, {
        count: rows.length,
      });
      const header =
        'claim_number,employee_code,employee_name,status,currency,total_amount,submission_date\n';
      return (
        header +
        rows
          .map((r) =>
            [
              r.claim_number,
              r.employee_code,
              JSON.stringify(r.display_name),
              r.status,
              r.currency_code,
              r.total_amount,
              dateOnly(r.submission_anchor_date ?? ''),
            ].join(','),
          )
          .join('\n')
      );
    },
  };
}
