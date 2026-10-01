import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { notifyEmploymentUser } from '../notifications/workflowNotificationRepository.js';
import { BENEFIT_LIMITS, ELIGIBLE_EMPLOYMENT_STATUSES } from './benefitConstants.js';

const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested benefit record was not found.',
    statusCode: 404,
  });
const meta = (ctx) => ({ requestId: ctx?.requestId, correlationId: ctx?.correlationId });
const dateOnly = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const companyDate = (timezone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export function createBenefitService({ database, repository, authorizationService }) {
  async function audit(trx, actor, companyId, action, type, id, permission, ctx, metadata) {
    await insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: type,
      recordId: id,
      permissionCode: permission,
      metadata,
      ...meta(ctx),
    });
  }
  async function sensitiveContext(actor) {
    try {
      return await authorizationService.requirePermission(actor, 'benefit_sensitive.view');
    } catch {
      return null;
    }
  }
  async function projectRows(actor, rows) {
    const sensitive = await sensitiveContext(actor);
    return Promise.all(
      rows.map(async (row) => {
        const version = await database('benefit_plan_versions')
          .where({ id: row.benefit_plan_version_id })
          .first('sensitive_classification');
        if (version?.sensitive_classification !== 'sensitive') return row;
        const allowed =
          sensitive &&
          (await repository.getEnrollment(row.id, sensitive, 'benefit_sensitive.view'));
        if (allowed) {
          await insertAuditEvent(database, {
            actorUserId: actor.userId,
            companyId: row.company_id,
            actionCode: 'benefit_sensitive.view',
            outcome: 'success',
            recordType: 'benefit_enrollment',
            recordId: row.id,
            permissionCode: 'benefit_sensitive.view',
          });
          return row;
        }
        const safe = { ...row };
        delete safe.employer_contribution_amount_snapshot;
        delete safe.employee_contribution_amount_snapshot;
        delete safe.enrollment_reason;
        delete safe.plan_name;
        return { ...safe, plan_name: 'Sensitive benefit' };
      }),
    );
  }
  async function projectPlans(actor, rows) {
    const sensitive = await sensitiveContext(actor);
    return rows.map((row) => {
      if (row.sensitive_classification !== 'sensitive') return row;
      if (sensitive && repository.companyAllowed(sensitive, row.company_id)) return row;
      return { ...row, name: 'Sensitive benefit', description: undefined };
    });
  }
  async function validateEnrollment(employment, planVersion, input, trx) {
    if (!employment || employment.company_id !== input.companyId)
      throw new ValidationError('The employment is invalid for the company.');
    if (
      dateOnly(employment.joining_date) > input.effectiveStart ||
      (employment.employment_end_date &&
        dateOnly(employment.employment_end_date) < (input.effectiveEnd ?? input.effectiveStart))
    )
      throw new ValidationError('Enrollment dates must fall within the employment episode.');
    const status = await repository.statusAt(employment.id, input.effectiveStart, trx);
    if (!status || !ELIGIBLE_EMPLOYMENT_STATUSES.includes(status.status))
      throw new ValidationError('The employment status is not eligible for this benefit.');
    const types = Array.isArray(planVersion.eligible_employment_types)
      ? planVersion.eligible_employment_types
      : JSON.parse(planVersion.eligible_employment_types);
    const statuses = Array.isArray(planVersion.eligible_employment_statuses)
      ? planVersion.eligible_employment_statuses
      : JSON.parse(planVersion.eligible_employment_statuses);
    if (!types.includes(employment.employment_type) || !statuses.includes(status.status))
      throw new ValidationError('The employment does not meet the plan eligibility configuration.');
  }

  return {
    limits: BENEFIT_LIMITS,
    async listPlans(actor, context, input) {
      return projectPlans(actor, await repository.listPlans(context, input));
    },
    async getPlan(actor, context, id) {
      const plan = await repository.getPlanScoped(id, context);
      if (!plan) throw missing();
      const sensitive = await sensitiveContext(actor);
      const allowed = sensitive && repository.companyAllowed(sensitive, plan.company_id);
      const versions = (await repository.listPlanVersions(id)).map((version) => {
        if (version.sensitive_classification !== 'sensitive' || allowed) return version;
        const safe = { ...version };
        delete safe.employer_contribution_amount;
        delete safe.employee_contribution_amount;
        delete safe.reason;
        return safe;
      });
      const restricted =
        !allowed && versions.some((version) => version.sensitive_classification === 'sensitive');
      return {
        ...plan,
        ...(restricted ? { name: 'Sensitive benefit', description: undefined } : {}),
        versions,
      };
    },
    async createPlan(actor, context, input, ctx) {
      if (!repository.companyWide(context, input.companyId)) throw missing();
      return withTransaction(database, async (trx) => {
        const company = await repository.lockCompany(input.companyId, trx);
        if (!company || company.status !== 'active')
          throw new ValidationError('The company is not active.');
        if (company.currency_code !== input.currencyCode)
          throw new ValidationError('Benefit currency must match company currency.');
        let id;
        try {
          id = await repository.createPlan(
            {
              company_id: input.companyId,
              code: input.code,
              name: input.name,
              description: input.description ?? null,
              created_by: actor.userId,
              updated_by: actor.userId,
            },
            trx,
          );
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'BENEFIT_PLAN_CONFLICT',
              'The benefit plan code already exists.',
            );
          throw error;
        }
        await repository.createPlanVersion(
          {
            company_id: input.companyId,
            benefit_plan_id: id,
            version_number: 1,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            currency_code: input.currencyCode,
            employer_contribution_amount: input.employerContributionAmount,
            employee_contribution_amount: input.employeeContributionAmount,
            eligible_employment_types: JSON.stringify(input.eligibleEmploymentTypes),
            eligible_employment_statuses: JSON.stringify(input.eligibleEmploymentStatuses),
            employee_visible: input.employeeVisible,
            sensitive_classification: input.sensitiveClassification,
            reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          'benefit_plan.create',
          'benefit_plan',
          id,
          'benefit_plan.create',
          ctx,
        );
        return { id };
      });
    },
    async updatePlan(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const plan = await repository.lockPlan(id, trx);
        if (!plan || !repository.companyWide(context, plan.company_id)) throw missing();
        if (
          !(await repository.updatePlan(
            id,
            input.version,
            { name: input.name, description: input.description ?? null, updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The benefit plan changed.');
        await audit(
          trx,
          actor,
          plan.company_id,
          'benefit_plan.update',
          'benefit_plan',
          id,
          'benefit_plan.update',
          ctx,
        );
        return { id, version: input.version + 1 };
      });
    },
    async createPlanVersion(actor, context, id, input, ctx, correction = false) {
      return withTransaction(database, async (trx) => {
        const plan = await repository.lockPlan(id, trx);
        if (!plan || !repository.companyWide(context, plan.company_id)) throw missing();
        const company = await repository.getCompany(plan.company_id, trx);
        if (company.currency_code !== input.currencyCode)
          throw new ValidationError('Benefit currency must match company currency.');
        const overlap = await repository.planVersionOverlap(
          id,
          input.effectiveStart,
          input.effectiveEnd,
          trx,
        );
        if (overlap && !correction)
          throw new ConflictError(
            'BENEFIT_PERIOD_OVERLAP',
            'The plan version overlaps existing terms.',
          );
        if (correction && !overlap)
          throw new ValidationError('Historical correction requires an overlapping version.');
        if (overlap)
          await trx('benefit_plan_versions')
            .where({ id: overlap.id })
            .update({ history_status: 'superseded' });
        const versionNumber = await repository.nextPlanVersion(id, trx);
        const versionId = await repository.createPlanVersion(
          {
            company_id: plan.company_id,
            benefit_plan_id: id,
            version_number: versionNumber,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            currency_code: input.currencyCode,
            employer_contribution_amount: input.employerContributionAmount,
            employee_contribution_amount: input.employeeContributionAmount,
            eligible_employment_types: JSON.stringify(input.eligibleEmploymentTypes),
            eligible_employment_statuses: JSON.stringify(input.eligibleEmploymentStatuses),
            employee_visible: input.employeeVisible,
            sensitive_classification: input.sensitiveClassification,
            history_status: 'current',
            supersedes_version_id: overlap?.id ?? null,
            reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          plan.company_id,
          correction ? 'benefit_plan.correct_history' : 'benefit_plan.version_create',
          'benefit_plan_version',
          versionId,
          correction ? 'benefit_plan.correct_history' : 'benefit_plan.version_create',
          ctx,
        );
        return { id: versionId, versionNumber };
      });
    },
    async deactivatePlan(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const plan = await repository.lockPlan(id, trx);
        if (!plan || !repository.companyWide(context, plan.company_id)) throw missing();
        if (
          !(await repository.updatePlan(
            id,
            input.version,
            {
              record_status: 'inactive',
              deactivated_at: trx.fn.now(),
              deactivated_by: actor.userId,
              deactivation_reason: input.reason,
              updated_by: actor.userId,
            },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The benefit plan changed.');
        await audit(
          trx,
          actor,
          plan.company_id,
          'benefit_plan.deactivate',
          'benefit_plan',
          id,
          'benefit_plan.deactivate',
          ctx,
        );
        return { id };
      });
    },
    async listEnrollments(actor, context, input, permission = 'benefit_enrollment.view') {
      return projectRows(actor, await repository.listEnrollments(context, input, permission));
    },
    async listOwn(actor, context, input) {
      const own = await repository.getOwnCompany(actor.userId);
      if (!own) return [];
      return projectRows(
        actor,
        await repository.listEnrollments(
          context,
          { ...input, companyId: own.company_id },
          'benefit_enrollment.view_own',
        ),
      );
    },
    async getEnrollment(actor, context, id, permission = 'benefit_enrollment.view') {
      const row = await repository.getEnrollment(id, context, permission);
      if (!row) throw missing();
      return (await projectRows(actor, [row]))[0];
    },
    async createEnrollment(actor, context, input, ctx, historical = false) {
      if (!repository.companyAllowed(context, input.companyId)) throw missing();
      return withTransaction(database, async (trx) => {
        const company = await repository.getCompany(input.companyId, trx);
        if (!company) throw new ValidationError('The company does not exist.');
        if (!historical && input.effectiveStart < companyDate(company.timezone))
          throw new ValidationError(
            'Backdated benefit enrollment requires historical authorization.',
          );
        const employment = await repository.lockEmployment(input.employmentId, trx);
        if (
          !employment ||
          !(await repository.getEmploymentScoped(
            input.employmentId,
            input.effectiveStart,
            context,
            historical ? 'benefit_enrollment.create_historical' : 'benefit_enrollment.create',
            trx,
          ))
        )
          throw missing();
        const plan = await repository.lockPlan(input.benefitPlanId, trx);
        if (!plan || plan.company_id !== input.companyId || plan.record_status !== 'active')
          throw new ValidationError('The benefit plan is invalid or inactive.');
        const planVersion = await repository.effectivePlanVersion(
          plan.id,
          input.effectiveStart,
          trx,
        );
        if (!planVersion) throw new ValidationError('No effective benefit plan version exists.');
        await validateEnrollment(employment, planVersion, input, trx);
        if (
          await repository.enrollmentOverlap(
            input.employmentId,
            input.benefitPlanId,
            input.effectiveStart,
            input.effectiveEnd,
            trx,
          )
        )
          throw new ConflictError(
            'BENEFIT_ENROLLMENT_OVERLAP',
            'The benefit enrollment overlaps an existing enrollment.',
          );
        const enrollmentId = await repository.createEnrollment(
          {
            company_id: input.companyId,
            employment_id: input.employmentId,
            benefit_plan_id: input.benefitPlanId,
            created_by: actor.userId,
            updated_by: actor.userId,
          },
          trx,
        );
        await repository.createEnrollmentVersion(
          {
            company_id: input.companyId,
            benefit_enrollment_id: enrollmentId,
            benefit_plan_version_id: planVersion.id,
            version_number: 1,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            employer_contribution_amount_snapshot: planVersion.employer_contribution_amount,
            employee_contribution_amount_snapshot: planVersion.employee_contribution_amount,
            currency_code: planVersion.currency_code,
            enrollment_reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        await repository.createState(
          {
            company_id: input.companyId,
            benefit_enrollment_id: enrollmentId,
            from_state: null,
            to_state: 'draft',
            workflow_version: 1,
            reason: input.reason,
            acting_user_id: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          historical ? 'benefit_enrollment.create_historical' : 'benefit_enrollment.create',
          'benefit_enrollment',
          enrollmentId,
          historical ? 'benefit_enrollment.create_historical' : 'benefit_enrollment.create',
          ctx,
        );
        return { id: enrollmentId, status: 'draft', workflowVersion: 1 };
      });
    },
    async updateDraft(actor, context, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.getEnrollment(
          id,
          context,
          'benefit_enrollment.update_draft',
          trx,
        );
        const enrollment = await repository.lockEnrollment(id, trx);
        if (!enrollment || !visible) throw missing();
        if (enrollment.status !== 'draft' || enrollment.version !== input.version)
          throw new ConflictError(
            'STALE_VERSION',
            'The enrollment changed or is no longer editable.',
          );
        const current = await repository.currentEnrollmentVersion(id, trx);
        const planVersion = await repository.effectivePlanVersion(
          enrollment.benefit_plan_id,
          input.effectiveStart,
          trx,
        );
        const employment = await repository.getEmployment(enrollment.employment_id, trx);
        await validateEnrollment(
          employment,
          planVersion,
          { ...input, companyId: enrollment.company_id },
          trx,
        );
        await trx('benefit_enrollment_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded' });
        const n = await repository.nextEnrollmentVersion(id, trx);
        await repository.createEnrollmentVersion(
          {
            company_id: enrollment.company_id,
            benefit_enrollment_id: id,
            benefit_plan_version_id: planVersion.id,
            version_number: n,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            employer_contribution_amount_snapshot: planVersion.employer_contribution_amount,
            employee_contribution_amount_snapshot: planVersion.employee_contribution_amount,
            currency_code: planVersion.currency_code,
            enrollment_reason: input.reason,
            supersedes_version_id: current.id,
            created_by: actor.userId,
          },
          trx,
        );
        await trx('benefit_enrollments')
          .where({ id, version: input.version })
          .update({
            current_version_number: n,
            version: input.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          actor,
          enrollment.company_id,
          'benefit_enrollment.update_draft',
          'benefit_enrollment',
          id,
          'benefit_enrollment.update_draft',
          ctx,
        );
        return { id, version: input.version + 1, currentVersionNumber: n };
      });
    },
    async transition(actor, context, id, action, input, ctx) {
      const map = {
        activate: ['draft', 'active'],
        suspend: ['active', 'suspended'],
        resume: ['suspended', 'active'],
        end: [['active', 'suspended'], 'ended'],
        cancel: ['draft', 'cancelled'],
      };
      return withTransaction(database, async (trx) => {
        const visible = await repository.getEnrollment(
          id,
          context,
          `benefit_enrollment.${action}`,
          trx,
        );
        const enrollment = await repository.lockEnrollment(id, trx);
        if (!enrollment || !visible) throw missing();
        const [from, to] = map[action];
        if (
          !(Array.isArray(from) ? from.includes(enrollment.status) : enrollment.status === from) ||
          enrollment.workflow_version !== input.workflowVersion
        )
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The benefit enrollment cannot perform this transition.',
          );
        if (action === 'end') {
          if (!input.effectiveDate) throw new ValidationError('An effective end date is required.');
          const current = await repository.currentEnrollmentVersion(id, trx);
          if (input.effectiveDate < dateOnly(current.effective_start))
            throw new ValidationError('The end date cannot precede enrollment start.');
          await trx('benefit_enrollment_versions')
            .where({ id: current.id })
            .update({ history_status: 'superseded' });
          const n = await repository.nextEnrollmentVersion(id, trx);
          await repository.createEnrollmentVersion(
            {
              company_id: current.company_id,
              benefit_enrollment_id: current.benefit_enrollment_id,
              benefit_plan_version_id: current.benefit_plan_version_id,
              version_number: n,
              effective_start: dateOnly(current.effective_start),
              effective_end: input.effectiveDate,
              employer_contribution_amount_snapshot: current.employer_contribution_amount_snapshot,
              employee_contribution_amount_snapshot: current.employee_contribution_amount_snapshot,
              currency_code: current.currency_code,
              history_status: 'current',
              supersedes_version_id: current.id,
              enrollment_reason: input.reason,
              created_by: actor.userId,
            },
            trx,
          );
          await trx('benefit_enrollments').where({ id }).update({ current_version_number: n });
        }
        if (
          !(await repository.updateEnrollment(
            id,
            input.workflowVersion,
            { status: to, updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The benefit enrollment changed.');
        await repository.createState(
          {
            company_id: enrollment.company_id,
            benefit_enrollment_id: id,
            from_state: enrollment.status,
            to_state: to,
            workflow_version: input.workflowVersion + 1,
            reason: input.reason,
            acting_user_id: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          enrollment.company_id,
          `benefit_enrollment.${action}`,
          'benefit_enrollment',
          id,
          `benefit_enrollment.${action}`,
          ctx,
        );
        await notifyEmploymentUser(
          trx,
          {
            companyId: enrollment.company_id,
            type: 'benefit.enrollment_updated',
            title: 'Benefit enrollment updated',
            message: `Your benefit enrollment is now ${to}.`,
            referenceType: 'benefit_enrollment',
            referenceId: id,
            idempotencyKey: `benefit:${id}:${to}:${input.workflowVersion + 1}`,
            actorUserId: actor.userId,
          },
          enrollment.employment_id,
        );
        return { id, status: to, workflowVersion: input.workflowVersion + 1 };
      });
    },
    async history(context, id) {
      const row = await repository.getEnrollment(id, context, 'benefit_enrollment.view_history');
      if (!row) throw missing();
      return repository.history(id);
    },
    async exportEnrollments(actor, context, input, ctx) {
      const rows = await projectRows(
        actor,
        await repository.listEnrollments(
          context,
          { ...input, page: 1, pageSize: BENEFIT_LIMITS.maximumExportRows },
          'benefit_enrollment.export',
        ),
      );
      await insertAuditEvent(database, {
        actorUserId: actor.userId,
        companyId: input.companyId,
        actionCode: 'benefit_enrollment.export',
        outcome: 'success',
        recordType: 'benefit_enrollment_export',
        permissionCode: 'benefit_enrollment.export',
        metadata: { rowCount: rows.length },
        ...meta(ctx),
      });
      const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      return [
        'employee_code,employee_name,plan_code,plan_name,status,effective_start,effective_end,employer_contribution,employee_contribution,currency',
        ...rows.map((row) =>
          [
            row.employee_code,
            row.display_name,
            row.plan_code,
            row.plan_name,
            row.status,
            dateOnly(row.effective_start),
            row.effective_end ? dateOnly(row.effective_end) : '',
            row.employer_contribution_amount_snapshot,
            row.employee_contribution_amount_snapshot,
            row.currency_code,
          ]
            .map(quote)
            .join(','),
        ),
      ].join('\n');
    },
  };
}
