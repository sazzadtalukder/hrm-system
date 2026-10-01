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
import {
  PERFORMANCE_ELIGIBLE_STATUSES as ELIGIBLE,
  PERFORMANCE_LIMITS as LIMITS,
} from './performanceConstants.js';
const missing = () =>
    new ApplicationError({
      code: 'NOT_FOUND',
      message: 'The requested performance record was not found.',
      statusCode: 404,
    }),
  date = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)),
  today = (tz) => {
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
const omitFields = (row, fields) => {
  const safe = { ...row };
  for (const field of fields) delete safe[field];
  return safe;
};
export function createPerformanceService({ database, repository, authorizationService }) {
  const audit = (trx, actor, companyId, action, id, permission, ctx, metadata) =>
    insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: 'performance_review',
      recordId: id,
      permissionCode: permission,
      metadata,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  async function sensitive(actor) {
    try {
      return await authorizationService.requirePermission(actor, 'performance_sensitive.view');
    } catch {
      return null;
    }
  }
  async function project(actor, row, ctx, trx = database) {
    const own = Number(row.user_id) === Number(actor.userId),
      manager = Number(row.manager_user_id_snapshot) === Number(actor.userId),
      s = await sensitive(actor),
      allowed = s && (await repository.reviewScoped(row.id, s, 'performance_sensitive.view', trx));
    if (own || manager || allowed) {
      await audit(
        trx,
        actor,
        row.company_id,
        'performance_sensitive.view',
        row.id,
        allowed
          ? 'performance_sensitive.view'
          : own
            ? 'performance_review.view_own'
            : 'performance_review.view_team',
        ctx,
      );
      return row;
    }
    const safe = { ...row };
    delete safe.rating_scale_id_snapshot;
    return safe;
  }
  async function state(trx, r, actor, to, reason, key, ctx) {
    const next = r.workflow_version + 1;
    try {
      await trx('performance_review_state_events').insert({
        company_id: r.company_id,
        performance_review_id: r.id,
        from_state: r.status,
        to_state: to,
        workflow_version: next,
        record_version: r.version + 1,
        reason,
        acting_user_id: actor.userId,
        idempotency_key: key ?? null,
        request_id: ctx?.requestId,
        correlation_id: ctx?.correlationId,
      });
      await trx('performance_reviews')
        .where({ id: r.id })
        .update({
          status: to,
          workflow_version: next,
          version: r.version + 1,
          updated_by: actor.userId,
          updated_at: trx.fn.now(),
        });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY')
        throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The transition was already recorded.');
      throw e;
    }
    return next;
  }
  function owned(c, id) {
    if (!repository.companyAllowed(c, id)) throw missing();
  }
  async function employmentSnapshot(trx, id, anchor) {
    return trx('employments as e')
      .join('employees as employee', 'employee.id', 'e.employee_id')
      .join('employment_status_history as status', function () {
        this.on('status.employment_id', 'e.id')
          .andOnVal('status.history_status', 'current')
          .andOn('status.effective_start', '<=', trx.raw('?', [anchor]))
          .andOn(function () {
            this.onNull('status.effective_end').orOn(
              'status.effective_end',
              '>=',
              trx.raw('?', [anchor]),
            );
          });
      })
      .join('employee_assignments as a', function () {
        this.on('a.employment_id', 'e.id')
          .andOnVal('a.history_status', 'current')
          .andOn('a.effective_start', '<=', trx.raw('?', [anchor]))
          .andOn(function () {
            this.onNull('a.effective_end').orOn('a.effective_end', '>=', trx.raw('?', [anchor]));
          });
      })
      .leftJoin(
        'employments as manager_employment',
        'manager_employment.id',
        'a.manager_employment_id',
      )
      .leftJoin('employees as manager', 'manager.id', 'manager_employment.employee_id')
      .where('e.id', id)
      .first(
        'e.id as employment_id',
        'e.company_id',
        'e.employee_id',
        'e.employee_code',
        'e.employment_end_date',
        'employee.display_name',
        'employee.user_id',
        'status.status as employment_status',
        'a.branch_id',
        'a.department_id',
        'a.designation_id',
        'a.grade_id',
        'a.manager_employment_id',
        'manager.user_id as manager_user_id',
      );
  }
  return {
    limits: LIMITS,
    async createScale(actor, c, input, ctx) {
      owned(c, input.companyId);
      if (
        input.levels.length < LIMITS.minimumRatingLevels ||
        input.levels.length > LIMITS.maximumRatingLevels
      )
        throw new ValidationError('Rating scales require between three and seven levels.');
      if (new Set(input.levels.map((x) => x.value)).size !== input.levels.length)
        throw new ValidationError('Rating values must be unique.');
      return withTransaction(database, async (trx) => {
        await repository.lockCompany(input.companyId, trx);
        let scaleId;
        try {
          [scaleId] = await trx('performance_rating_scales').insert({
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          await trx('performance_rating_scale_levels').insert(
            input.levels.map((x, i) => ({
              company_id: input.companyId,
              performance_rating_scale_id: scaleId,
              level_value: x.value,
              code: x.code,
              label: x.label,
              description: x.description ?? null,
              display_order: i + 1,
              created_by: actor.userId,
              updated_by: actor.userId,
            })),
          );
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('PERFORMANCE_CONFLICT', 'The rating scale already exists.');
          throw e;
        }
        await audit(
          trx,
          actor,
          input.companyId,
          'performance_rating_scale.create',
          scaleId,
          'performance_rating_scale.create',
          ctx,
        );
        return { id: scaleId };
      });
    },
    async listScales(c, input) {
      owned(c, input.companyId);
      return database('performance_rating_scales')
        .where({ company_id: input.companyId })
        .orderBy('id', 'desc');
    },
    async createCompetency(actor, c, input, ctx) {
      owned(c, input.companyId);
      return withTransaction(database, async (trx) => {
        await repository.lockCompany(input.companyId, trx);
        let id;
        try {
          [id] = await trx('performance_competencies').insert({
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          await trx('performance_competency_versions').insert({
            company_id: input.companyId,
            performance_competency_id: id,
            version_number: 1,
            effective_start: input.effectiveStart,
            description: input.description,
            reason: input.reason,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('PERFORMANCE_CONFLICT', 'The competency already exists.');
          throw e;
        }
        await audit(
          trx,
          actor,
          input.companyId,
          'performance_competency.create',
          id,
          'performance_competency.create',
          ctx,
        );
        return { id };
      });
    },
    async listCompetencies(c, input) {
      owned(c, input.companyId);
      return database('performance_competencies as competency')
        .join('performance_competency_versions as version', function () {
          this.on('version.performance_competency_id', 'competency.id').andOnVal(
            'version.history_status',
            'current',
          );
        })
        .where('competency.company_id', input.companyId)
        .select('competency.*', 'version.id as version_id', 'version.description');
    },
    async createTemplate(actor, c, input, ctx) {
      owned(c, input.companyId);
      if (input.minimumGoalCount > input.maximumGoalCount)
        throw new ValidationError('Goal limits are invalid.');
      return withTransaction(database, async (trx) => {
        await repository.lockCompany(input.companyId, trx);
        const scale = await trx('performance_rating_scales')
          .where({ id: input.ratingScaleId, company_id: input.companyId, record_status: 'active' })
          .first();
        if (!scale) throw new ValidationError('Rating scale is unavailable.');
        const comps = input.competencyVersionIds.length
          ? await trx('performance_competency_versions')
              .whereIn('id', input.competencyVersionIds)
              .andWhere({ company_id: input.companyId })
          : [];
        if (comps.length !== input.competencyVersionIds.length)
          throw new ValidationError('A competency version is unavailable.');
        let id;
        try {
          [id] = await trx('performance_review_templates').insert({
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          const [versionId] = await trx('performance_review_template_versions').insert({
            company_id: input.companyId,
            performance_review_template_id: id,
            version_number: 1,
            effective_start: input.effectiveStart,
            performance_rating_scale_id: input.ratingScaleId,
            goals_enabled: input.goalsEnabled,
            goal_weights_enabled: input.goalWeightsEnabled,
            competencies_enabled: input.competenciesEnabled,
            minimum_goal_count: input.minimumGoalCount,
            maximum_goal_count: input.maximumGoalCount,
            reason: input.reason,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          if (comps.length)
            await trx('performance_template_competencies').insert(
              comps.map((x, i) => ({
                company_id: input.companyId,
                performance_review_template_version_id: versionId,
                performance_competency_version_id: x.id,
                display_order: i + 1,
                created_by: actor.userId,
                updated_by: actor.userId,
              })),
            );
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('PERFORMANCE_CONFLICT', 'The template already exists.');
          throw e;
        }
        await audit(
          trx,
          actor,
          input.companyId,
          'performance_template.create',
          id,
          'performance_template.create',
          ctx,
        );
        return { id };
      });
    },
    async listTemplates(c, input) {
      owned(c, input.companyId);
      return database('performance_review_templates as template')
        .join('performance_review_template_versions as version', function () {
          this.on('version.performance_review_template_id', 'template.id').andOnVal(
            'version.history_status',
            'current',
          );
        })
        .where('template.company_id', input.companyId)
        .select(
          'template.*',
          'version.id as version_id',
          'version.minimum_goal_count',
          'version.maximum_goal_count',
          'version.goal_weights_enabled',
        );
    },
    async createCycle(actor, c, input, ctx) {
      owned(c, input.companyId);
      if (!(
        input.reviewPeriodStart <= input.reviewPeriodEnd &&
        input.goalSubmissionDueDate <= input.selfReviewDueDate &&
        input.selfReviewDueDate <= input.managerReviewDueDate &&
        input.managerReviewDueDate <= input.acknowledgmentDueDate
      ))
        throw new ValidationError('Cycle dates are invalid.');
      return withTransaction(database, async (trx) => {
        await repository.lockCompany(input.companyId, trx);
        let id;
        try {
          [id] = await trx('performance_cycles').insert({
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            review_period_start: input.reviewPeriodStart,
            review_period_end: input.reviewPeriodEnd,
            goal_submission_due_date: input.goalSubmissionDueDate,
            self_review_due_date: input.selfReviewDueDate,
            manager_review_due_date: input.managerReviewDueDate,
            acknowledgment_due_date: input.acknowledgmentDueDate,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          await trx('performance_cycle_state_events').insert({
            company_id: input.companyId,
            performance_cycle_id: id,
            to_state: 'draft',
            workflow_version: 1,
            reason: input.reason,
            acting_user_id: actor.userId,
            request_id: ctx?.requestId,
            correlation_id: ctx?.correlationId,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('PERFORMANCE_CONFLICT', 'The cycle code already exists.');
          throw e;
        }
        await audit(
          trx,
          actor,
          input.companyId,
          'performance_cycle.create',
          id,
          'performance_cycle.create',
          ctx,
        );
        return { id, status: 'draft', workflowVersion: 1 };
      });
    },
    async listCycles(c, input) {
      owned(c, input.companyId);
      return database('performance_cycles')
        .where({ company_id: input.companyId })
        .modify((q) => {
          if (input.status) q.where({ status: input.status });
        })
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .orderBy('id', 'desc');
    },
    async cycleTransition(actor, c, id, target, input, permission, ctx) {
      return withTransaction(database, async (trx) => {
        const cycle = await repository.lockCycle(id, trx);
        if (!cycle || !repository.companyAllowed(c, cycle.company_id)) throw missing();
        const allowed = {
          active: ['draft'],
          review_open: ['active'],
          closed: ['review_open'],
          cancelled: ['draft', 'active', 'review_open'],
        }[target];
        if (!allowed?.includes(cycle.status) || cycle.workflow_version !== input.workflowVersion)
          throw new ConflictError(
            'STALE_WORKFLOW_VERSION',
            'The cycle cannot perform this transition.',
          );
        const next = cycle.workflow_version + 1;
        await trx('performance_cycle_state_events').insert({
          company_id: cycle.company_id,
          performance_cycle_id: id,
          from_state: cycle.status,
          to_state: target,
          workflow_version: next,
          reason: input.reason,
          acting_user_id: actor.userId,
          request_id: ctx?.requestId,
          correlation_id: ctx?.correlationId,
        });
        await trx('performance_cycles')
          .where({ id })
          .update({
            status: target,
            workflow_version: next,
            version: cycle.version + 1,
            updated_by: actor.userId,
          });
        await audit(trx, actor, cycle.company_id, permission, id, permission, ctx);
        return { id, status: target, workflowVersion: next };
      });
    },
    async populate(actor, c, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const cycle = await repository.lockCycle(id, trx);
        if (
          !cycle ||
          !repository.companyAllowed(c, cycle.company_id) ||
          !['draft', 'active'].includes(cycle.status)
        )
          throw missing();
        const tv = await trx('performance_review_template_versions')
          .where({
            id: input.templateVersionId,
            company_id: cycle.company_id,
            history_status: 'current',
          })
          .first();
        if (!tv) throw new ValidationError('Template version is unavailable.');
        let employmentIds = input.employmentIds;
        if (!employmentIds) {
          const assignments = await trx('employee_assignments')
            .where({ company_id: cycle.company_id, history_status: 'current' })
            .where('effective_start', '<=', cycle.review_period_end)
            .where((query) =>
              query
                .whereNull('effective_end')
                .orWhere('effective_end', '>=', cycle.review_period_end),
            )
            .modify((query) => {
              if (input.branchId) query.where('branch_id', input.branchId);
              if (input.departmentId) query.where('department_id', input.departmentId);
            })
            .limit(LIMITS.maximumPopulation + 1)
            .select('employment_id');
          if (assignments.length > LIMITS.maximumPopulation)
            throw new ValidationError('The selected population exceeds the bounded limit.');
          employmentIds = assignments.map((row) => row.employment_id);
        }
        if (!employmentIds.length) throw new ValidationError('The selected population is empty.');
        const result = [];
        for (const employmentId of employmentIds) {
          await trx('employments').where({ id: employmentId }).forUpdate().first();
          const s = await employmentSnapshot(trx, employmentId, date(cycle.review_period_end));
          if (
            !s ||
            !ELIGIBLE.includes(s.employment_status) ||
            (s.employment_end_date && date(s.employment_end_date) < date(cycle.review_period_end))
          )
            throw new ValidationError(
              'An employment is not eligible at the population anchor date.',
            );
          const overlap = await trx('performance_reviews as review')
            .join('performance_cycles as other', 'other.id', 'review.performance_cycle_id')
            .where({ 'review.employment_id': employmentId, 'review.company_id': cycle.company_id })
            .whereNotIn('review.status', [
              'cancelled',
              'finalized',
              'finalized_without_acknowledgment',
            ])
            .where('other.review_period_start', '<=', cycle.review_period_end)
            .where('other.review_period_end', '>=', cycle.review_period_start)
            .first('review.id');
          if (overlap && !input.allowOverlapOverride)
            throw new ConflictError(
              'PERFORMANCE_REVIEW_OVERLAP',
              'The employment already has an overlapping active review.',
            );
          const [reviewId] = await trx('performance_reviews').insert({
            company_id: cycle.company_id,
            performance_cycle_id: id,
            employment_id: employmentId,
            performance_review_template_version_id: tv.id,
            overlap_override: Boolean(overlap),
            overlap_override_reason: overlap ? input.reason : null,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          await trx('performance_review_versions').insert({
            company_id: cycle.company_id,
            performance_review_id: reviewId,
            version_number: 1,
            employee_id_snapshot: s.employee_id,
            employee_code_snapshot: s.employee_code,
            employee_name_snapshot: s.display_name,
            employment_id_snapshot: s.employment_id,
            employment_status_snapshot: s.employment_status,
            branch_id_snapshot: s.branch_id,
            department_id_snapshot: s.department_id,
            designation_id_snapshot: s.designation_id,
            grade_id_snapshot: s.grade_id,
            manager_employment_id_snapshot: s.manager_employment_id,
            manager_user_id_snapshot: s.manager_user_id,
            template_version_id_snapshot: tv.id,
            rating_scale_id_snapshot: tv.performance_rating_scale_id,
            anchor_date: cycle.review_period_end,
            reason: input.reason,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          await trx('performance_review_state_events').insert({
            company_id: cycle.company_id,
            performance_review_id: reviewId,
            to_state: 'goals_draft',
            workflow_version: 1,
            record_version: 1,
            reason: input.reason,
            acting_user_id: actor.userId,
            request_id: ctx?.requestId,
            correlation_id: ctx?.correlationId,
          });
          await createWorkflowNotification(trx, {
            companyId: cycle.company_id,
            userId: s.user_id,
            type: 'performance.review_created',
            title: 'Performance review created',
            message: 'A performance review has been created for you. You can begin drafting goals.',
            referenceType: 'performance_review',
            referenceId: reviewId,
            idempotencyKey: `performance:${reviewId}:created`,
            actorUserId: actor.userId,
          });
          result.push(reviewId);
        }
        await audit(
          trx,
          actor,
          cycle.company_id,
          'performance_cycle.populate',
          id,
          'performance_cycle.populate',
          ctx,
          { count: result.length, overlapOverride: input.allowOverlapOverride },
        );
        return { reviewIds: result };
      });
    },
    async list(actor, c, input, p, ctx) {
      return Promise.all((await repository.list(c, input, p)).map((x) => project(actor, x, ctx)));
    },
    async get(actor, c, id, p, ctx) {
      const row = await repository.reviewScoped(id, c, p);
      if (!row) throw missing();
      const projected = await project(actor, row, ctx);
      const canSeeSensitive = Object.hasOwn(projected, 'rating_scale_id_snapshot');
      const template = await database('performance_review_template_versions')
        .where({ id: row.performance_review_template_version_id })
        .first(
          'id',
          'goals_enabled',
          'goal_weights_enabled',
          'competencies_enabled',
          'minimum_goal_count',
          'maximum_goal_count',
        );
      const competencies = await database('performance_template_competencies as mapping')
        .join(
          'performance_competency_versions as version',
          'version.id',
          'mapping.performance_competency_version_id',
        )
        .join(
          'performance_competencies as competency',
          'competency.id',
          'version.performance_competency_id',
        )
        .where('mapping.performance_review_template_version_id', template.id)
        .orderBy('mapping.display_order')
        .select(
          'version.id as competency_version_id',
          'competency.code',
          'competency.name',
          'version.description',
        );
      const goals = canSeeSensitive
        ? await database('performance_goals as goal')
            .join('performance_goal_versions as version', function () {
              this.on('version.performance_goal_id', 'goal.id').andOn(
                'version.version_number',
                'goal.current_version_number',
              );
            })
            .where('goal.performance_review_id', id)
            .select(
              'goal.*',
              'version.id as goal_version_id',
              'version.title',
              'version.description',
              'version.measurement_criteria',
              'version.target_value',
              'version.weight',
              'version.due_date',
            )
        : [];
      const assessments = [];
      if (canSeeSensitive) {
        const rows = await database('performance_assessments as assessment')
          .join('performance_assessment_versions as version', function () {
            this.on('version.performance_assessment_id', 'assessment.id').andOn(
              'version.version_number',
              'assessment.current_version_number',
            );
          })
          .where({ 'assessment.performance_review_id': id, 'assessment.status': 'submitted' })
          .select(
            'assessment.id',
            'assessment.assessment_type',
            'assessment.assessor_user_id',
            'version.id as assessment_version_id',
            'version.overall_comment',
            'version.strengths_comment',
            'version.development_comment',
            'version.overall_rating_level_id',
            'version.submitted_at',
          );
        for (const assessment of rows) {
          assessment.goalRatings = await database('performance_goal_assessment_ratings')
            .where({ performance_assessment_version_id: assessment.assessment_version_id })
            .select(
              'performance_goal_version_id as targetId',
              'rating_scale_level_id as ratingLevelId',
              'comment',
            );
          assessment.competencyRatings = await database('performance_competency_assessment_ratings')
            .where({ performance_assessment_version_id: assessment.assessment_version_id })
            .select(
              'performance_competency_version_id as targetId',
              'rating_scale_level_id as ratingLevelId',
              'comment',
            );
          assessments.push(assessment);
        }
      }
      const ratingLevels = await database('performance_rating_scale_levels')
        .where({ performance_rating_scale_id: row.rating_scale_id_snapshot })
        .orderBy('display_order');
      return { ...projected, template, competencies, goals, assessments, ratingLevels };
    },
    async addGoal(actor, c, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.reviewScoped(id, c, 'performance_goal.create', trx),
          r = visible && (await repository.lockReview(id, trx));
        if (!r) throw missing();
        if (
          Number(visible.user_id) !== Number(actor.userId) ||
          !['goals_draft', 'goals_returned'].includes(r.status)
        )
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'Goals are not editable.');
        const tv = await trx('performance_review_template_versions')
            .where({ id: r.performance_review_template_version_id })
            .first(),
          count = Number(
            (
              await trx('performance_goals')
                .where({ performance_review_id: id })
                .count({ n: '*' })
                .first()
            ).n,
          );
        if (count >= tv.maximum_goal_count || date(input.dueDate) > date(visible.review_period_end))
          throw new ValidationError('The goal exceeds template or cycle limits.');
        const [goalId] = await trx('performance_goals').insert({
          company_id: r.company_id,
          performance_review_id: id,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('performance_goal_versions').insert({
          company_id: r.company_id,
          performance_goal_id: goalId,
          version_number: 1,
          title: input.title,
          description: input.description,
          measurement_criteria: input.measurementCriteria,
          target_value: input.targetValue,
          weight: input.weight ?? null,
          due_date: input.dueDate,
          reason: input.reason,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          r.company_id,
          'performance_goal.create',
          id,
          'performance_goal.create',
          ctx,
        );
        return { id: goalId, version: 1 };
      });
    },
    async updateGoal(actor, c, id, goalId, input, ctx, correction = false) {
      return withTransaction(database, async (trx) => {
        const permission = correction
            ? 'performance_review.correct_history'
            : 'performance_goal.update_draft',
          visible = await repository.reviewScoped(id, c, permission, trx),
          review = visible && (await repository.lockReview(id, trx)),
          goal =
            review &&
            (await trx('performance_goals')
              .where({ id: goalId, performance_review_id: id })
              .forUpdate()
              .first());
        if (!goal) throw missing();
        if (
          !correction &&
          (Number(visible.user_id) !== Number(actor.userId) ||
            !['goals_draft', 'goals_returned'].includes(review.status))
        )
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'The goal is not editable.');
        if (goal.version !== input.version)
          throw new ConflictError('STALE_VERSION', 'The goal changed.');
        if (date(input.dueDate) > date(visible.review_period_end))
          throw new ValidationError('The goal due date exceeds the review period.');
        const current = await trx('performance_goal_versions')
            .where({ performance_goal_id: goalId, version_number: goal.current_version_number })
            .first(),
          next = goal.current_version_number + 1;
        await trx('performance_goal_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded' });
        await trx('performance_goal_versions').insert({
          company_id: review.company_id,
          performance_goal_id: goalId,
          version_number: next,
          title: input.title,
          description: input.description,
          measurement_criteria: input.measurementCriteria,
          target_value: input.targetValue,
          weight: input.weight ?? null,
          due_date: input.dueDate,
          supersedes_version_id: current.id,
          reason: input.reason,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('performance_goals')
          .where({ id: goalId })
          .update({
            current_version_number: next,
            version: goal.version + 1,
            updated_by: actor.userId,
          });
        await audit(
          trx,
          actor,
          review.company_id,
          correction ? 'performance_goal.correct_history' : 'performance_goal.update_draft',
          id,
          permission,
          ctx,
        );
        return { id: goalId, version: goal.version + 1, currentVersionNumber: next };
      });
    },
    async goalTransition(actor, c, id, target, input, permission, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.reviewScoped(id, c, permission, trx),
          r = visible && (await repository.lockReview(id, trx));
        if (!r) throw missing();
        const expected =
          target === 'goals_submitted' ? ['goals_draft', 'goals_returned'] : ['goals_submitted'];
        if (!expected.includes(r.status) || r.workflow_version !== input.workflowVersion)
          throw new ConflictError(
            'STALE_WORKFLOW_VERSION',
            'The goals cannot perform this transition.',
          );
        if (target === 'goals_submitted' && Number(visible.user_id) !== Number(actor.userId))
          throw missing();
        if (
          ['goals_approved', 'goals_returned'].includes(target) &&
          visible.manager_user_id_snapshot &&
          Number(visible.manager_user_id_snapshot) !== Number(actor.userId)
        )
          throw missing();
        const goals = await trx('performance_goals as goal')
            .join('performance_goal_versions as v', function () {
              this.on('v.performance_goal_id', 'goal.id').andOn(
                'v.version_number',
                'goal.current_version_number',
              );
            })
            .where('goal.performance_review_id', id)
            .select('goal.id', 'v.weight'),
          tv = await trx('performance_review_template_versions')
            .where({ id: r.performance_review_template_version_id })
            .first();
        if (
          target === 'goals_submitted' &&
          (goals.length < tv.minimum_goal_count || goals.length > tv.maximum_goal_count)
        )
          throw new ValidationError('Goal count does not satisfy the template.');
        if (
          target === 'goals_approved' &&
          tv.goal_weights_enabled &&
          goals.reduce((n, x) => n + Number(x.weight ?? 0), 0) !== 100
        )
          throw new ValidationError('Approved goal weights must total 100.');
        await trx('performance_goals')
          .where({ performance_review_id: id })
          .update({
            status:
              target === 'goals_returned'
                ? 'returned'
                : target === 'goals_approved'
                  ? 'approved'
                  : 'submitted',
          });
        const next = await state(trx, r, actor, target, input.reason, input.idempotencyKey, ctx);
        await audit(trx, actor, r.company_id, permission, id, permission, ctx);
        if (target === 'goals_submitted') {
          const notification = {
            companyId: r.company_id,
            type: 'performance.goals_approval_required',
            title: 'Performance goals awaiting review',
            message: 'An employee submitted performance goals for your review.',
            referenceType: 'performance_review',
            referenceId: id,
            idempotencyKey: `performance:${id}:${target}:${next}`,
            actorUserId: actor.userId,
          };
          if (visible.manager_user_id_snapshot)
            await createWorkflowNotification(trx, {
              ...notification,
              userId: visible.manager_user_id_snapshot,
            });
          else
            await notifyPermissionHolders(trx, notification, 'performance_goal.approve', {
              branchId: visible.branch_id_snapshot,
              departmentId: visible.department_id_snapshot,
            });
        } else
          await createWorkflowNotification(trx, {
            companyId: r.company_id,
            userId: visible.user_id,
            type: 'performance.goals_decided',
            title: 'Performance goals updated',
            message: `Your performance goals were ${target === 'goals_approved' ? 'approved' : 'returned'}.`,
            referenceType: 'performance_review',
            referenceId: id,
            idempotencyKey: `performance:${id}:${target}:${next}`,
            actorUserId: actor.userId,
          });
        return { id, status: target, workflowVersion: next };
      });
    },
    async submitAssessment(actor, c, id, type, input, permission, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.reviewScoped(id, c, permission, trx),
          r = visible && (await repository.lockReview(id, trx));
        if (!r) throw missing();
        const expected = type === 'self' ? 'goals_approved' : 'self_review_submitted';
        if (r.status !== expected || r.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The assessment cannot be submitted.');
        if (type === 'self' && Number(visible.user_id) !== Number(actor.userId)) throw missing();
        if (
          type === 'manager' &&
          visible.manager_user_id_snapshot &&
          Number(visible.manager_user_id_snapshot) !== Number(actor.userId)
        )
          throw missing();
        if (type === 'manager' && !input.overallRatingLevelId)
          throw new ValidationError('Manager overall rating is required.');
        const levels = await trx('performance_rating_scale_levels')
            .where({ performance_rating_scale_id: visible.rating_scale_id_snapshot })
            .select('id'),
          allowed = new Set(levels.map((x) => Number(x.id)));
        for (const x of [...input.goalRatings, ...input.competencyRatings])
          if (!allowed.has(Number(x.ratingLevelId)))
            throw new ValidationError('A rating does not belong to the review scale.');
        let assessment = await trx('performance_assessments')
          .where({ performance_review_id: id, assessment_type: type })
          .first();
        if (!assessment) {
          const [aid] = await trx('performance_assessments').insert({
            company_id: r.company_id,
            performance_review_id: id,
            assessment_type: type,
            assessor_user_id: actor.userId,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          assessment = { id: aid, current_version_number: 0 };
        }
        const vn = assessment.current_version_number + 1,
          [vid] = await trx('performance_assessment_versions').insert({
            company_id: r.company_id,
            performance_assessment_id: assessment.id,
            version_number: vn,
            overall_comment: input.overallComment,
            strengths_comment: input.strengthsComment ?? null,
            development_comment: input.developmentComment ?? null,
            overall_rating_level_id: type === 'manager' ? input.overallRatingLevelId : null,
            reason: input.reason,
            submitted_at: trx.fn.now(),
            created_by: actor.userId,
            updated_by: actor.userId,
          });
        if (input.goalRatings.length)
          await trx('performance_goal_assessment_ratings').insert(
            input.goalRatings.map((x) => ({
              company_id: r.company_id,
              performance_assessment_version_id: vid,
              performance_goal_version_id: x.targetId,
              rating_scale_level_id: x.ratingLevelId,
              comment: x.comment ?? null,
              created_by: actor.userId,
              updated_by: actor.userId,
            })),
          );
        if (input.competencyRatings.length)
          await trx('performance_competency_assessment_ratings').insert(
            input.competencyRatings.map((x) => ({
              company_id: r.company_id,
              performance_assessment_version_id: vid,
              performance_competency_version_id: x.targetId,
              rating_scale_level_id: x.ratingLevelId,
              comment: x.comment ?? null,
              created_by: actor.userId,
              updated_by: actor.userId,
            })),
          );
        await trx('performance_assessments')
          .where({ id: assessment.id })
          .update({
            status: 'submitted',
            current_version_number: vn,
            submitted_at: trx.fn.now(),
            version: assessment.version ? assessment.version + 1 : 1,
          });
        const to = type === 'self' ? 'self_review_submitted' : 'manager_review_submitted',
          next = await state(trx, r, actor, to, input.reason, input.idempotencyKey, ctx);
        await audit(trx, actor, r.company_id, permission, id, permission, ctx);
        if (type === 'self') {
          const notification = {
            companyId: r.company_id,
            type: 'performance.manager_assessment_required',
            title: 'Performance assessment awaiting manager review',
            message: 'An employee submitted a self-assessment for your review.',
            referenceType: 'performance_review',
            referenceId: id,
            idempotencyKey: `performance:${id}:self_assessment:${next}`,
            actorUserId: actor.userId,
          };
          if (visible.manager_user_id_snapshot)
            await createWorkflowNotification(trx, {
              ...notification,
              userId: visible.manager_user_id_snapshot,
            });
          else
            await notifyPermissionHolders(
              trx,
              notification,
              'performance_manager_assessment.submit',
              {
                branchId: visible.branch_id_snapshot,
                departmentId: visible.department_id_snapshot,
              },
            );
        } else
          await createWorkflowNotification(trx, {
            companyId: r.company_id,
            userId: visible.user_id,
            type: 'performance.acknowledgment_required',
            title: 'Performance review ready for acknowledgment',
            message: 'Your manager assessment is ready for acknowledgment.',
            referenceType: 'performance_review',
            referenceId: id,
            idempotencyKey: `performance:${id}:manager_assessment:${next}`,
            actorUserId: actor.userId,
          });
        return { id, status: to, workflowVersion: next };
      });
    },
    async acknowledge(actor, c, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.reviewScoped(id, c, 'performance_review.acknowledge', trx),
          r = visible && (await repository.lockReview(id, trx));
        if (!r) throw missing();
        if (
          Number(visible.user_id) !== Number(actor.userId) ||
          r.status !== 'manager_review_submitted' ||
          r.workflow_version !== input.workflowVersion
        )
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The review cannot be acknowledged.');
        await trx('performance_review_acknowledgments').insert({
          company_id: r.company_id,
          performance_review_id: id,
          employee_user_id: actor.userId,
          acknowledgment: input.acknowledgment,
          comment: input.comment ?? null,
          review_version_acknowledged: r.current_review_version,
          workflow_version: r.workflow_version + 1,
          idempotency_key: input.idempotencyKey,
        });
        const next = await state(
          trx,
          r,
          actor,
          'employee_acknowledged',
          input.reason,
          input.idempotencyKey + ':state',
          ctx,
        );
        await audit(
          trx,
          actor,
          r.company_id,
          'performance_review.acknowledge',
          id,
          'performance_review.acknowledge',
          ctx,
        );
        await notifyPermissionHolders(
          trx,
          {
            companyId: r.company_id,
            type: 'performance.finalization_required',
            title: 'Performance review awaiting finalization',
            message:
              'An employee acknowledged a performance review that is ready for HR finalization.',
            referenceType: 'performance_review',
            referenceId: id,
            idempotencyKey: `performance:${id}:finalization:${next}`,
            actorUserId: actor.userId,
          },
          'performance_review.finalize',
          {
            branchId: visible.branch_id_snapshot,
            departmentId: visible.department_id_snapshot,
          },
        );
        return { id, status: 'employee_acknowledged', workflowVersion: next };
      });
    },
    async finalTransition(actor, c, id, target, input, permission, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.reviewScoped(id, c, permission, trx),
          r = visible && (await repository.lockReview(id, trx));
        if (!r) throw missing();
        const ok =
          target === 'finalized'
            ? r.status === 'employee_acknowledged'
            : target === 'finalized_without_acknowledgment'
              ? r.status === 'manager_review_submitted' &&
                date(visible.acknowledgment_due_date) <
                  today((await trx('companies').where({ id: r.company_id }).first()).timezone)
              : ![
                  'manager_review_submitted',
                  'employee_acknowledged',
                  'finalized',
                  'finalized_without_acknowledgment',
                ].includes(r.status);
        if (!ok || r.workflow_version !== input.workflowVersion)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The review cannot perform this transition.',
          );
        const next = await state(trx, r, actor, target, input.reason, input.idempotencyKey, ctx);
        await audit(trx, actor, r.company_id, permission, id, permission, ctx);
        await createWorkflowNotification(trx, {
          companyId: r.company_id,
          userId: visible.user_id,
          type: target === 'cancelled' ? 'performance.cancelled' : 'performance.finalized',
          title:
            target === 'cancelled'
              ? 'Performance review cancelled'
              : 'Performance review finalized',
          message:
            target === 'cancelled'
              ? 'Your performance review has been cancelled.'
              : 'Your performance review has been finalized.',
          referenceType: 'performance_review',
          referenceId: id,
          idempotencyKey: `performance:${id}:${target}:${next}`,
          actorUserId: actor.userId,
        });
        return { id, status: target, workflowVersion: next };
      });
    },
    async reassign(actor, c, id, input, ctx) {
      return withTransaction(database, async (trx) => {
        const visible = await repository.reviewScoped(
            id,
            c,
            'performance_review.reassign_manager',
            trx,
          ),
          r = visible && (await repository.lockReview(id, trx));
        if (
          !r ||
          r.workflow_version !== input.workflowVersion ||
          [
            'manager_review_submitted',
            'employee_acknowledged',
            'finalized',
            'finalized_without_acknowledgment',
            'cancelled',
          ].includes(r.status)
        )
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'Manager reassignment is unavailable.');
        const manager = await employmentSnapshot(
          trx,
          input.managerEmploymentId,
          date(visible.anchor_date),
        );
        if (
          !manager ||
          Number(manager.company_id) !== Number(r.company_id) ||
          Number(manager.employment_id) === Number(r.employment_id)
        )
          throw new ValidationError('Replacement manager is invalid.');
        const current = await trx('performance_review_versions')
            .where({ performance_review_id: id, version_number: r.current_review_version })
            .first(),
          nextVersion = r.current_review_version + 1;
        const snapshot = { ...current };
        delete snapshot.id;
        delete snapshot.created_at;
        delete snapshot.updated_at;
        await trx('performance_review_versions').insert({
          ...snapshot,
          version_number: nextVersion,
          manager_employment_id_snapshot: manager.employment_id,
          manager_user_id_snapshot: manager.user_id,
          reason: input.reason,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('performance_reviews')
          .where({ id })
          .update({
            current_review_version: nextVersion,
            version: r.version + 1,
            updated_by: actor.userId,
          });
        await audit(
          trx,
          actor,
          r.company_id,
          'performance_review.reassign_manager',
          id,
          'performance_review.reassign_manager',
          ctx,
        );
        await createWorkflowNotification(trx, {
          companyId: r.company_id,
          userId: manager.user_id,
          type: 'performance.manager_reassigned',
          title: 'Performance review assigned to you',
          message: 'You have been assigned as manager for a performance review.',
          referenceType: 'performance_review',
          referenceId: id,
          idempotencyKey: `performance:${id}:manager:${nextVersion}`,
          actorUserId: actor.userId,
        });
        return { id, currentReviewVersion: nextVersion };
      });
    },
    async history(actor, c, id, permission, ctx) {
      if (Array.isArray(actor?.grants)) {
        ctx = undefined;
        permission = id;
        id = c;
        c = actor;
        actor = c.actor;
      }
      const row = await repository.reviewScoped(id, c, permission);
      if (!row) throw missing();
      const projected = await project(actor, row, ctx);
      const history = await repository.history(id);
      const userIds = [
          ...history.states.map((event) => event.acting_user_id),
          ...history.assessments.map((assessment) => assessment.assessor_user_id),
          ...history.acknowledgments.map((acknowledgment) => acknowledgment.employee_user_id),
        ].filter(Boolean),
        employmentIds = history.versions
          .map((version) => version.manager_employment_id_snapshot)
          .filter(Boolean),
        users = userIds.length
          ? await database('users as user')
              .leftJoin('employees as employee', 'employee.user_id', 'user.id')
              .whereIn('user.id', [...new Set(userIds)])
              .select('user.id', 'user.email', 'employee.display_name')
          : [],
        managers = employmentIds.length
          ? await database('employments as employment')
              .join('employees as employee', 'employee.id', 'employment.employee_id')
              .whereIn('employment.id', [...new Set(employmentIds)])
              .select('employment.id', 'employee.display_name', 'employment.employee_code')
          : [],
        userById = new Map(users.map((user) => [Number(user.id), user])),
        managerByEmploymentId = new Map(managers.map((manager) => [Number(manager.id), manager])),
        decorated = {
          ...history,
          versions: history.versions.map((version) => ({
            ...version,
            manager_display_name:
              managerByEmploymentId.get(Number(version.manager_employment_id_snapshot))
                ?.display_name ?? null,
            manager_employee_code:
              managerByEmploymentId.get(Number(version.manager_employment_id_snapshot))
                ?.employee_code ?? null,
          })),
          states: history.states.map((event) => ({
            ...event,
            actor_display_name: userById.get(Number(event.acting_user_id))?.display_name ?? null,
            actor_email: userById.get(Number(event.acting_user_id))?.email ?? null,
          })),
          assessments: history.assessments.map((assessment) => ({
            ...assessment,
            assessor_display_name:
              userById.get(Number(assessment.assessor_user_id))?.display_name ?? null,
            assessor_email: userById.get(Number(assessment.assessor_user_id))?.email ?? null,
          })),
          acknowledgments: history.acknowledgments.map((acknowledgment) => ({
            ...acknowledgment,
            employee_display_name:
              userById.get(Number(acknowledgment.employee_user_id))?.display_name ?? null,
            employee_email: userById.get(Number(acknowledgment.employee_user_id))?.email ?? null,
          })),
        };
      if (Object.hasOwn(projected, 'rating_scale_id_snapshot')) return decorated;
      return {
        ...decorated,
        versions: decorated.versions.map((version) => omitFields(version, ['reason'])),
        states: decorated.states.map((stateEvent) => omitFields(stateEvent, ['reason'])),
        acknowledgments: decorated.acknowledgments.map((acknowledgment) =>
          omitFields(acknowledgment, ['comment']),
        ),
      };
    },
    async export(actor, c, input, ctx) {
      const rows = await repository.list(
          c,
          { ...input, page: 1, pageSize: LIMITS.maximumExportRows },
          'performance_review.export',
        ),
        s = await sensitive(actor);
      const sensitiveAllowed = Boolean(s);
      await audit(
        database,
        actor,
        input.companyId,
        'performance_review.export',
        null,
        'performance_review.export',
        ctx,
        { count: rows.length },
      );
      const header = [
          'employee_code',
          'employee_name',
          'cycle',
          'status',
          'branch_id',
          'department_id',
          ...(sensitiveAllowed ? ['overall_rating'] : []),
        ],
        lines = [header.join(',')];
      for (const x of rows) {
        let rating = '';
        if (sensitiveAllowed) {
          const a = await database('performance_assessments as assessment')
            .join('performance_assessment_versions as version', function () {
              this.on('version.performance_assessment_id', 'assessment.id').andOn(
                'version.version_number',
                'assessment.current_version_number',
              );
            })
            .leftJoin(
              'performance_rating_scale_levels as level',
              'level.id',
              'version.overall_rating_level_id',
            )
            .where({ performance_review_id: x.id, assessment_type: 'manager' })
            .first('level.code');
          rating = a?.code ?? '';
        }
        lines.push(
          [
            x.employee_code_snapshot,
            x.employee_name_snapshot,
            x.cycle_name,
            x.status,
            x.branch_id_snapshot ?? '',
            x.department_id_snapshot ?? '',
            ...(sensitiveAllowed ? [rating] : []),
          ]
            .map((v) => `"${String(v).replaceAll('"', '""')}"`)
            .join(','),
        );
      }
      return lines.join('\r\n');
    },
  };
}
