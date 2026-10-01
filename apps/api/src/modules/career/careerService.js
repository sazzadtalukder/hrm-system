import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { assertAccessContext } from '../authorization/accessContext.js';
import {
  createWorkflowNotification,
  notifyEmploymentUser,
  notifyPermissionHolders,
} from '../notifications/workflowNotificationRepository.js';
import { CAREER_ELIGIBLE_STATUSES as ELIGIBLE, CAREER_LIMITS as L } from './careerConstants.js';
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested career record was not found.',
    statusCode: 404,
  });
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const previousDay = (value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
const today = (tz) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function createCareerService({
  database: db,
  repository: r,
  snapshotReader,
  authorizationService,
  auditWriter = insertAuditEvent,
}) {
  const audit = (trx, a, c, action, id, p, ctx, metadata) =>
    auditWriter(trx, {
      actorUserId: a.userId,
      companyId: c,
      actionCode: action,
      outcome: 'success',
      recordType: 'career',
      recordId: id,
      permissionCode: p,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      metadata,
    });
  const owned = (c, id) => {
    if (!r.companyAllowed(c, id)) throw missing();
  };
  async function sensitive(a, p = 'career_sensitive.view') {
    try {
      return await authorizationService.requirePermission(a, p);
    } catch {
      return null;
    }
  }
  async function transition(trx, plan, a, to, input, p, ctx) {
    const replay = await trx('career_plan_state_events')
      .where({ company_id: plan.company_id, idempotency_key: input.idempotencyKey })
      .first();
    if (replay) {
      if (
        Number(replay.career_plan_id) === Number(plan.id) &&
        replay.to_state === to &&
        replay.reason === input.reason
      )
        return { ...plan, status: to, workflow_version: replay.workflow_version, replayed: true };
      throw new ConflictError(
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was used for another transition.',
      );
    }
    const next = plan.workflow_version + 1,
      terminal = ['completed', 'withdrawn', 'cancelled'].includes(to);
    await trx('career_plan_state_events').insert({
      company_id: plan.company_id,
      career_plan_id: plan.id,
      from_state: plan.status,
      to_state: to,
      workflow_version: next,
      reason: input.reason,
      acting_user_id: a.userId,
      idempotency_key: input.idempotencyKey,
      request_id: ctx?.requestId,
      correlation_id: ctx?.correlationId,
    });
    await trx('career_plans')
      .where({ id: plan.id })
      .update({
        status: to,
        workflow_version: next,
        version: plan.version + 1,
        active_slot: terminal ? null : true,
        updated_by: a.userId,
        updated_at: trx.fn.now(),
      });
    await audit(trx, a, plan.company_id, `career_plan.${to}`, plan.id, p, ctx);
    const version = await trx('career_plan_versions')
      .where({ career_plan_id: plan.id, version_number: plan.current_version_number })
      .first('manager_user_id_snapshot', 'branch_id_snapshot', 'department_id_snapshot');
    if (to === 'submitted') {
      const notification = {
        companyId: plan.company_id,
        type: 'career.approval_required',
        title: 'Career plan awaiting review',
        message: 'An employee submitted a career plan for review.',
        referenceType: 'career_plan',
        referenceId: plan.id,
        idempotencyKey: `career:${plan.id}:submitted:${next}`,
        actorUserId: a.userId,
      };
      if (version?.manager_user_id_snapshot)
        await createWorkflowNotification(trx, {
          ...notification,
          userId: version.manager_user_id_snapshot,
        });
      else
        await notifyPermissionHolders(trx, notification, 'career_plan.approve', {
          branchId: version?.branch_id_snapshot,
          departmentId: version?.department_id_snapshot,
        });
    } else if (['active', 'returned', 'completed', 'cancelled'].includes(to))
      await notifyEmploymentUser(
        trx,
        {
          companyId: plan.company_id,
          type: 'career.status_updated',
          title: 'Career plan updated',
          message: `Your career plan is now ${to}.`,
          referenceType: 'career_plan',
          referenceId: plan.id,
          idempotencyKey: `career:${plan.id}:${to}:${next}`,
          actorUserId: a.userId,
        },
        plan.employment_id,
      );
    return {
      ...plan,
      status: to,
      workflow_version: next,
      version: plan.version + 1,
      replayed: false,
    };
  }
  async function project(a, row, ctx, trx = db) {
    const own = Number(row.user_id) === Number(a.userId),
      s = await sensitive(a),
      allowed = s && (await r.scoped(row.id, s, 'career_sensitive.view', trx));
    if (own || allowed) {
      await audit(
        trx,
        a,
        row.company_id,
        'career_sensitive.view',
        row.id,
        allowed ? 'career_sensitive.view' : 'career_plan.view_own',
        ctx,
      );
      return row;
    }
    const x = { ...row };
    delete x.employee_narrative;
    delete x.career_direction;
    return x;
  }
  return {
    limits: L,
    async createPath(a, c, i, ctx) {
      assertAccessContext(c, 'career_path.create');
      owned(c, i.companyId);
      return withTransaction(db, async (trx) => {
        await r.lockCompany(i.companyId, trx);
        const replay = await trx('career_paths')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        let pid;
        try {
          [pid] = await trx('career_paths').insert({
            company_id: i.companyId,
            code: i.code,
            name: i.name,
            idempotency_key: i.idempotencyKey,
            created_by: a.userId,
            updated_by: a.userId,
          });
          const [vid] = await trx('career_path_versions').insert({
            company_id: i.companyId,
            career_path_id: pid,
            version_number: 1,
            effective_start: i.effectiveStart,
            description: i.description,
            reason: i.reason,
            created_by: a.userId,
            updated_by: a.userId,
          });
          for (let n = 0; n < i.steps.length; n++) {
            const s = i.steps[n],
              [sid] = await trx('career_path_steps').insert({
                company_id: i.companyId,
                career_path_version_id: vid,
                step_number: n + 1,
                designation_id: s.designationId,
                minimum_time_months: s.minimumTimeMonths ?? null,
                created_by: a.userId,
                updated_by: a.userId,
              });
            if (s.competencies.length) {
              const ids = s.competencies.map((x) => x.performanceCompetencyVersionId),
                rows = await snapshotReader.competencyVersions(trx, i.companyId, ids);
              if (rows.length !== new Set(ids).size)
                throw new ValidationError('A competency version is invalid.');
              await trx('career_path_step_competencies').insert(
                s.competencies.map((x) => ({
                  company_id: i.companyId,
                  career_path_step_id: sid,
                  performance_competency_version_id: x.performanceCompetencyVersionId,
                  required_proficiency: x.requiredProficiency ?? null,
                  created_by: a.userId,
                  updated_by: a.userId,
                })),
              );
            }
          }
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('CAREER_CONFLICT', 'The career path already exists.');
          throw e;
        }
        await audit(trx, a, i.companyId, 'career_path.create', pid, 'career_path.create', ctx);
        return { id: pid, replayed: false };
      });
    },
    async listPaths(c, i) {
      assertAccessContext(c, 'career_path.view');
      owned(c, i.companyId);
      const rows = await db('career_paths as p')
        .join('career_path_versions as v', function () {
          this.on('v.career_path_id', 'p.id').andOn('v.version_number', 'p.current_version_number');
        })
        .where('p.company_id', i.companyId)
        .select('p.*', 'v.id as current_version_id', 'v.description', 'v.effective_start')
        .limit(i.pageSize)
        .offset((i.page - 1) * i.pageSize);
      const scopedRows = await Promise.all(
        rows.map(async (row) => ((await r.pathScoped(row.id, c, 'career_path.view')) ? row : null)),
      );
      return scopedRows.filter(Boolean);
    },
    async getPath(c, id) {
      const path = await db('career_paths as p')
        .join('career_path_versions as v', function () {
          this.on('v.career_path_id', 'p.id').andOn('v.version_number', 'p.current_version_number');
        })
        .where('p.id', id)
        .first(
          'p.*',
          'v.id as current_version_id',
          'v.effective_start',
          'v.effective_end',
          'v.description',
        );
      if (!path || !(await r.pathScoped(id, c, 'career_path.view'))) throw missing();
      path.steps = await db('career_path_steps as s')
        .leftJoin('career_path_step_competencies as m', 'm.career_path_step_id', 's.id')
        .where('s.career_path_version_id', path.current_version_id)
        .select('s.*', 'm.performance_competency_version_id', 'm.required_proficiency');
      return path;
    },
    async pathHistory(c, id) {
      const path = await db('career_paths').where({ id }).first();
      if (!path || !(await r.pathScoped(id, c, 'career_path.view'))) throw missing();
      return db('career_path_versions').where({ career_path_id: id }).orderBy('version_number');
    },
    async versionPath(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const path = await trx('career_paths').where({ id }).forUpdate().first();
        if (!path || !(await r.pathScoped(id, c, 'career_path.version_create', trx)))
          throw missing();
        const replay = await trx('career_path_versions')
          .where({ company_id: path.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) {
          if (Number(replay.career_path_id) === Number(id))
            return { id: replay.id, version: replay.version_number, replayed: true };
          throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used.');
        }
        if (path.version !== i.version)
          throw new ConflictError('STALE_VERSION', 'The career path changed.');
        const current = await trx('career_path_versions')
          .where({ career_path_id: id, version_number: path.current_version_number })
          .first();
        if (i.effectiveStart <= day(current.effective_start))
          throw new ValidationError(
            'A new career-path version must start after the current version.',
          );
        await trx('career_path_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded', effective_end: previousDay(i.effectiveStart) });
        const [vid] = await trx('career_path_versions').insert({
          company_id: path.company_id,
          career_path_id: id,
          version_number: path.current_version_number + 1,
          effective_start: i.effectiveStart,
          description: i.description,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          supersedes_version_id: current.id,
          created_by: a.userId,
          updated_by: a.userId,
        });
        for (let n = 0; n < i.steps.length; n++) {
          const step = i.steps[n];
          const [sid] = await trx('career_path_steps').insert({
            company_id: path.company_id,
            career_path_version_id: vid,
            step_number: n + 1,
            designation_id: step.designationId,
            minimum_time_months: step.minimumTimeMonths ?? null,
            created_by: a.userId,
            updated_by: a.userId,
          });
          if (step.competencies.length) {
            const ids = step.competencies.map((x) => x.performanceCompetencyVersionId);
            if (
              (await snapshotReader.competencyVersions(trx, path.company_id, ids)).length !==
              new Set(ids).size
            )
              throw new ValidationError('A competency version is invalid.');
            await trx('career_path_step_competencies').insert(
              step.competencies.map((x) => ({
                company_id: path.company_id,
                career_path_step_id: sid,
                performance_competency_version_id: x.performanceCompetencyVersionId,
                required_proficiency: x.requiredProficiency ?? null,
                created_by: a.userId,
                updated_by: a.userId,
              })),
            );
          }
        }
        await trx('career_paths')
          .where({ id })
          .update({
            name: i.name,
            current_version_number: path.current_version_number + 1,
            version: path.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          a,
          path.company_id,
          'career_path.version_create',
          id,
          'career_path.version_create',
          ctx,
        );
        return { id: vid, version: path.current_version_number + 1, replayed: false };
      });
    },
    async pathStatus(a, c, id, status, i, permission, ctx) {
      return withTransaction(db, async (trx) => {
        const path = await trx('career_paths').where({ id }).forUpdate().first();
        if (!path || !(await r.pathScoped(id, c, permission, trx))) throw missing();
        if (path.record_status === status) return { id, version: path.version, replayed: true };
        if (path.version !== i.version)
          throw new ConflictError('STALE_VERSION', 'The career path changed.');
        await trx('career_paths')
          .where({ id })
          .update({
            record_status: status,
            version: path.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          a,
          path.company_id,
          `career_path.${status === 'active' ? 'activate' : 'deactivate'}`,
          id,
          permission,
          ctx,
        );
        return { id, version: path.version + 1, replayed: false };
      });
    },
    async createPlan(a, c, i, ctx) {
      assertAccessContext(c, 'career_plan.create');
      owned(c, i.companyId);
      if (i.planEnd < i.planStart)
        throw new ValidationError('Plan end must not precede plan start.');
      return withTransaction(db, async (trx) => {
        await trx('employments')
          .where({ id: i.employmentId, company_id: i.companyId })
          .forUpdate()
          .first();
        const replay = await trx('career_plans')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay)
          return {
            id: replay.id,
            version: replay.version,
            workflowVersion: replay.workflow_version,
            replayed: true,
          };
        const company = await trx('companies').where({ id: i.companyId }).first(),
          anchor = today(company.timezone),
          snap = await snapshotReader.employment(trx, i.employmentId, anchor, i.companyId);
        if (!snap || !ELIGIBLE.includes(snap.employment_status))
          throw new ValidationError('The employment is not eligible for a career plan.');
        if (snap.employment_end_date && i.planEnd > day(snap.employment_end_date))
          throw new ValidationError('The plan exceeds the employment end date.');
        let id;
        try {
          [id] = await trx('career_plans').insert({
            company_id: i.companyId,
            employment_id: i.employmentId,
            idempotency_key: i.idempotencyKey,
            created_by: a.userId,
            updated_by: a.userId,
          });
          await trx('career_plan_versions').insert({
            company_id: i.companyId,
            career_plan_id: id,
            version_number: 1,
            employee_id_snapshot: snap.employee_id,
            employee_code_snapshot: snap.employee_code,
            employee_name_snapshot: snap.display_name,
            employment_id_snapshot: snap.employment_id,
            employment_status_snapshot: snap.employment_status,
            branch_id_snapshot: snap.branch_id,
            department_id_snapshot: snap.department_id,
            designation_id_snapshot: snap.designation_id,
            grade_id_snapshot: snap.grade_id,
            manager_employment_id_snapshot: snap.manager_employment_id,
            manager_user_id_snapshot: snap.manager_user_id,
            career_path_version_id: i.careerPathVersionId ?? null,
            target_designation_id: i.targetDesignationId ?? null,
            career_direction: i.careerDirection ?? null,
            employee_narrative: i.employeeNarrative ?? null,
            plan_start: i.planStart,
            plan_end: i.planEnd,
            reason: i.reason,
            created_by: a.userId,
            updated_by: a.userId,
          });
          for (const g of i.goals) {
            const [gid] = await trx('career_plan_goals').insert({
                company_id: i.companyId,
                career_plan_id: id,
                created_by: a.userId,
                updated_by: a.userId,
              }),
              [gvid] = await trx('career_plan_goal_versions').insert({
                company_id: i.companyId,
                career_plan_goal_id: gid,
                version_number: 1,
                title: g.title,
                description: g.description,
                target_date: g.targetDate,
                reason: i.reason,
                created_by: a.userId,
                updated_by: a.userId,
              });
            if (g.competencyVersionIds.length) {
              const rows = await snapshotReader.competencyVersions(
                trx,
                i.companyId,
                g.competencyVersionIds,
              );
              if (rows.length !== new Set(g.competencyVersionIds).size)
                throw new ValidationError('A competency version is invalid.');
              await trx('career_plan_goal_competencies').insert(
                g.competencyVersionIds.map((cid) => ({
                  company_id: i.companyId,
                  career_plan_goal_version_id: gvid,
                  performance_competency_version_id: cid,
                  created_by: a.userId,
                  updated_by: a.userId,
                })),
              );
            }
          }
          for (const x of i.actions) {
            if (
              x.trainingCourseVersionId &&
              !(await snapshotReader.courseVersion(trx, i.companyId, x.trainingCourseVersionId))
            )
              throw new ValidationError('The Training course version is invalid.');
            const [aid] = await trx('career_development_actions').insert({
              company_id: i.companyId,
              career_plan_id: id,
              created_by: a.userId,
              updated_by: a.userId,
            });
            await trx('career_development_action_versions').insert({
              company_id: i.companyId,
              career_development_action_id: aid,
              version_number: 1,
              action_type: x.actionType,
              description: x.description,
              target_date: x.targetDate,
              responsible_party: x.responsibleParty,
              training_course_version_id: x.trainingCourseVersionId ?? null,
              reason: i.reason,
              created_by: a.userId,
              updated_by: a.userId,
            });
          }
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'ACTIVE_CAREER_PLAN',
              'The employment already has an active career plan.',
            );
          throw e;
        }
        await audit(trx, a, i.companyId, 'career_plan.create', id, 'career_plan.create', ctx);
        return { id, version: 1, workflowVersion: 1, replayed: false };
      });
    },
    async list(a, c, i, p, ctx) {
      const rows = await r.list(c, p, i);
      return Promise.all(rows.map((x) => project(a, x, ctx)));
    },
    async updatePlan(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const plan = await r.lockPlan(id, trx);
        if (!plan || !r.companyAllowed(c, plan.company_id)) throw missing();
        const row = await r.scoped(id, c, 'career_plan.update_draft', trx);
        if (!row) throw missing();
        const replay = await trx('career_plan_versions')
          .where({ company_id: plan.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id, version: replay.version_number, replayed: true };
        if (!['draft', 'returned'].includes(plan.status))
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'Only a draft or returned plan can be edited.',
          );
        if (plan.version !== i.version)
          throw new ConflictError('STALE_VERSION', 'The career plan changed.');
        const current = await trx('career_plan_versions')
          .where({ career_plan_id: id, version_number: plan.current_version_number })
          .first();
        await trx('career_plan_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded' });
        const data = { ...current };
        for (const f of ['id', 'created_at', 'updated_at']) delete data[f];
        await trx('career_plan_versions').insert({
          ...data,
          version_number: plan.current_version_number + 1,
          career_path_version_id: i.careerPathVersionId ?? null,
          target_designation_id: i.targetDesignationId ?? null,
          career_direction: i.careerDirection ?? null,
          employee_narrative: i.employeeNarrative ?? null,
          plan_start: i.planStart,
          plan_end: i.planEnd,
          history_status: 'current',
          supersedes_version_id: current.id,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await trx('career_plan_goal_versions')
          .whereIn(
            'career_plan_goal_id',
            trx('career_plan_goals').where({ career_plan_id: id }).select('id'),
          )
          .andWhere({ history_status: 'current' })
          .update({ history_status: 'superseded' });
        await trx('career_development_action_versions')
          .whereIn(
            'career_development_action_id',
            trx('career_development_actions').where({ career_plan_id: id }).select('id'),
          )
          .andWhere({ history_status: 'current' })
          .update({ history_status: 'superseded' });
        for (const g of i.goals) {
          if (
            g.competencyVersionIds.length &&
            (await snapshotReader.competencyVersions(trx, plan.company_id, g.competencyVersionIds))
              .length !== new Set(g.competencyVersionIds).size
          )
            throw new ValidationError('A competency version is invalid.');
          const [gid] = await trx('career_plan_goals').insert({
            company_id: plan.company_id,
            career_plan_id: id,
            created_by: a.userId,
            updated_by: a.userId,
          });
          const [gvid] = await trx('career_plan_goal_versions').insert({
            company_id: plan.company_id,
            career_plan_goal_id: gid,
            version_number: 1,
            title: g.title,
            description: g.description,
            target_date: g.targetDate,
            reason: i.reason,
            created_by: a.userId,
            updated_by: a.userId,
          });
          if (g.competencyVersionIds.length)
            await trx('career_plan_goal_competencies').insert(
              g.competencyVersionIds.map((cid) => ({
                company_id: plan.company_id,
                career_plan_goal_version_id: gvid,
                performance_competency_version_id: cid,
                created_by: a.userId,
                updated_by: a.userId,
              })),
            );
        }
        for (const x of i.actions) {
          if (
            x.trainingCourseVersionId &&
            !(await snapshotReader.courseVersion(trx, plan.company_id, x.trainingCourseVersionId))
          )
            throw new ValidationError('The Training course version is invalid.');
          const [aid] = await trx('career_development_actions').insert({
            company_id: plan.company_id,
            career_plan_id: id,
            created_by: a.userId,
            updated_by: a.userId,
          });
          await trx('career_development_action_versions').insert({
            company_id: plan.company_id,
            career_development_action_id: aid,
            version_number: 1,
            action_type: x.actionType,
            description: x.description,
            target_date: x.targetDate,
            responsible_party: x.responsibleParty,
            training_course_version_id: x.trainingCourseVersionId ?? null,
            reason: i.reason,
            created_by: a.userId,
            updated_by: a.userId,
          });
        }
        await trx('career_plans')
          .where({ id })
          .update({
            current_version_number: plan.current_version_number + 1,
            version: plan.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          a,
          plan.company_id,
          'career_plan.update_draft',
          id,
          'career_plan.update_draft',
          ctx,
        );
        return { id, version: plan.version + 1, replayed: false };
      });
    },
    async get(a, c, id, p, ctx) {
      const row = await r.scoped(id, c, p);
      if (!row) throw missing();
      return project(a, row, ctx);
    },
    async act(a, c, id, action, i, p, ctx) {
      return withTransaction(db, async (trx) => {
        const plan = await r.lockPlan(id, trx);
        if (!plan || !r.companyAllowed(c, plan.company_id)) throw missing();
        const rules = {
            submit: [['draft', 'returned'], 'submitted'],
            withdraw: [['draft', 'returned', 'submitted'], 'withdrawn'],
            approve: [['submitted'], 'active'],
            return: [['submitted'], 'returned'],
            complete: [['active'], 'completed'],
            cancel: [['submitted', 'active'], 'cancelled'],
          },
          rule = rules[action];
        const prior = await trx('career_plan_state_events')
          .where({ company_id: plan.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (prior) {
          if (
            Number(prior.career_plan_id) === Number(id) &&
            prior.to_state === rule?.[1] &&
            prior.reason === i.reason
          )
            return {
              ...plan,
              status: prior.to_state,
              workflow_version: prior.workflow_version,
              replayed: true,
            };
          throw new ConflictError(
            'IDEMPOTENCY_CONFLICT',
            'The idempotency key was used for another transition.',
          );
        }
        if (plan.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The career plan changed.');
        if (!rule || !rule[0].includes(plan.status))
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The career plan cannot perform this transition.',
          );
        const row = await r.scoped(id, c, p, trx);
        if (!row) throw missing();
        if (['approve', 'return'].includes(action)) {
          if (Number(row.user_id) === Number(a.userId))
            throw new ApplicationError({
              code: 'FORBIDDEN',
              message: 'You cannot decide your own career plan.',
              statusCode: 403,
            });
          if (row.manager_user_id_snapshot) {
            if (Number(row.manager_user_id_snapshot) !== Number(a.userId)) throw missing();
          } else if (
            !c.grants.some((g) => ['company', 'branch', 'department', 'all'].includes(g.scope_type))
          ) {
            throw missing();
          }
          await trx('career_plan_decisions').insert({
            company_id: plan.company_id,
            career_plan_id: id,
            decision: action === 'approve' ? 'approved' : 'returned',
            actor_user_id: a.userId,
            reason: i.reason,
            idempotency_key: i.idempotencyKey,
            created_by: a.userId,
            updated_by: a.userId,
          });
        }
        return transition(trx, plan, a, rule[1], i, p, ctx);
      });
    },
    async progress(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const plan = await r.lockPlan(id, trx);
        if (
          !plan ||
          !r.companyAllowed(c, plan.company_id) ||
          !['active', 'draft', 'returned'].includes(plan.status)
        )
          throw missing();
        if (!(await r.scoped(id, c, 'career_plan.update_progress', trx))) throw missing();
        const parentTable = i.kind === 'goal' ? 'career_plan_goals' : 'career_development_actions';
        const versionTable =
          i.kind === 'goal' ? 'career_plan_goal_versions' : 'career_development_action_versions';
        const foreignKey =
          i.kind === 'goal' ? 'career_plan_goal_id' : 'career_development_action_id';
        const parent = await trx(parentTable)
          .where({ id: i.itemId, career_plan_id: id })
          .forUpdate()
          .first();
        if (!parent) throw missing();
        const replay = await trx(versionTable)
          .where({ company_id: plan.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) {
          const sameMeaning =
            Number(replay[foreignKey]) === Number(parent.id) &&
            replay.status === i.status &&
            (i.kind === 'goal'
              ? (replay.progress_comment ?? null) === (i.comment ?? null)
              : (replay.completion_comment ?? null) === (i.comment ?? null) &&
                day(replay.completion_date) === day(i.completionDate));
          if (sameMeaning) return { id: parent.id, version: replay.version_number, replayed: true };
          throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used.');
        }
        const current = await trx(versionTable)
          .where({ [foreignKey]: parent.id, version_number: parent.current_version_number })
          .first();
        if (parent.version !== i.version)
          throw new ConflictError('STALE_VERSION', 'The progress item changed.');
        await trx(versionTable).where({ id: current.id }).update({ history_status: 'superseded' });
        const data = { ...current };
        for (const f of ['id', 'created_at', 'updated_at']) delete data[f];
        await trx(versionTable).insert({
          ...data,
          version_number: parent.current_version_number + 1,
          status: i.status,
          ...(i.kind === 'goal'
            ? { progress_comment: i.comment ?? null }
            : { completion_comment: i.comment ?? null, completion_date: i.completionDate ?? null }),
          history_status: 'current',
          supersedes_version_id: current.id,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await trx(parentTable)
          .where({ id: parent.id })
          .update({
            current_version_number: parent.current_version_number + 1,
            version: parent.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          a,
          plan.company_id,
          'career_plan.update_progress',
          id,
          'career_plan.update_progress',
          ctx,
          { kind: i.kind, itemId: i.itemId, status: i.status },
        );
        return { id: parent.id, version: parent.version + 1, replayed: false };
      });
    },
    async reassign(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const plan = await r.lockPlan(id, trx);
        if (!plan || !r.companyAllowed(c, plan.company_id)) throw missing();
        if (!(await r.scoped(id, c, 'career_plan.reassign_manager', trx))) throw missing();
        const replay = await trx('career_plan_manager_reassignments')
          .where({ company_id: plan.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) {
          if (
            Number(replay.career_plan_id) === Number(id) &&
            Number(replay.to_manager_employment_id) === Number(i.managerEmploymentId) &&
            replay.reason === i.reason
          )
            return { id: replay.id, replayed: true };
          throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used.');
        }
        if (plan.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The career plan changed.');
        const manager = await snapshotReader.employment(
          trx,
          i.managerEmploymentId,
          new Date().toISOString().slice(0, 10),
          plan.company_id,
        );
        if (!manager?.user_id) throw new ValidationError('The replacement manager is invalid.');
        if (Number(manager.employment_id) === Number(plan.employment_id))
          throw new ValidationError('An employment cannot manage its own career plan.');
        const current = await trx('career_plan_versions')
          .where({ career_plan_id: id, version_number: plan.current_version_number })
          .first();
        const [rid] = await trx('career_plan_manager_reassignments').insert({
          company_id: plan.company_id,
          career_plan_id: id,
          from_manager_employment_id: current.manager_employment_id_snapshot,
          to_manager_employment_id: i.managerEmploymentId,
          acting_user_id: a.userId,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await trx('career_plan_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded' });
        const data = { ...current };
        for (const f of ['id', 'created_at', 'updated_at']) delete data[f];
        await trx('career_plan_versions').insert({
          ...data,
          version_number: plan.current_version_number + 1,
          manager_employment_id_snapshot: manager.employment_id,
          manager_user_id_snapshot: manager.user_id,
          history_status: 'current',
          supersedes_version_id: current.id,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await trx('career_plans')
          .where({ id })
          .update({
            current_version_number: plan.current_version_number + 1,
            workflow_version: plan.workflow_version + 1,
            version: plan.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          a,
          plan.company_id,
          'career_plan.reassign_manager',
          id,
          'career_plan.reassign_manager',
          ctx,
        );
        await createWorkflowNotification(trx, {
          companyId: plan.company_id,
          userId: manager.user_id,
          type: 'career.manager_reassigned',
          title: 'Career plan assigned to you',
          message: 'You have been assigned as manager for a career plan.',
          referenceType: 'career_plan',
          referenceId: id,
          idempotencyKey: `career:${id}:manager:${plan.current_version_number + 1}`,
          actorUserId: a.userId,
        });
        return { id: rid, replayed: false };
      });
    },
    async addEvidence(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const plan = await r.lockPlan(id, trx);
        if (
          !plan ||
          !r.companyAllowed(c, plan.company_id) ||
          !(await r.scoped(id, c, 'career_plan.update_progress', trx))
        )
          throw missing();
        const replay = await trx('career_development_action_evidence_references')
          .where({ company_id: plan.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const action = await trx('career_development_action_versions as v')
          .join('career_development_actions as a', 'a.id', 'v.career_development_action_id')
          .where({
            'v.id': i.actionVersionId,
            'a.career_plan_id': id,
            'v.history_status': 'current',
          })
          .first('v.id');
        if (!action) throw missing();
        if (
          i.trainingCompletionVersionId &&
          !(await snapshotReader.completionVersion(
            trx,
            plan.company_id,
            i.trainingCompletionVersionId,
          ))
        )
          throw new ValidationError('The Training completion version is invalid.');
        const [eid] = await trx('career_development_action_evidence_references').insert({
          company_id: plan.company_id,
          career_development_action_version_id: i.actionVersionId,
          reference_type: i.referenceType,
          training_completion_version_id: i.trainingCompletionVersionId ?? null,
          external_reference: i.externalReference ?? null,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          plan.company_id,
          'career_plan.evidence_reference',
          id,
          'career_plan.update_progress',
          ctx,
          { evidenceId: eid, referenceType: i.referenceType },
        );
        return { id: eid, replayed: false };
      });
    },
    async history(a, c, id, p, ctx) {
      const row = await r.scoped(id, c, p);
      if (!row) throw missing();
      const h = await r.history(id),
        own = Number(row.user_id) === Number(a.userId),
        s = await sensitive(a),
        allowed = s && (await r.scoped(id, s, 'career_sensitive.view'));
      if (own || allowed) {
        await audit(
          db,
          a,
          row.company_id,
          'career_sensitive.view',
          id,
          allowed ? 'career_sensitive.view' : 'career_plan.view_own',
          ctx,
        );
        return h;
      }
      const omit = (x, fs) => {
        const y = { ...x };
        for (const f of fs) delete y[f];
        return y;
      };
      return {
        ...h,
        versions: h.versions.map((x) =>
          omit(x, ['career_direction', 'employee_narrative', 'reason']),
        ),
        states: h.states.map((x) => omit(x, ['reason'])),
        decisions: h.decisions.map((x) => omit(x, ['reason'])),
        reassignments: h.reassignments.map((x) => omit(x, ['reason'])),
        goals: h.goals.map((x) => omit(x, ['description', 'progress_comment', 'reason'])),
        actions: h.actions.map((x) => omit(x, ['description', 'completion_comment', 'reason'])),
        evidenceReferences: [],
      };
    },
    async export(a, c, i, ctx) {
      const rows = await r.list(c, 'career_plan.export', {
        ...i,
        page: 1,
        pageSize: L.maximumExportRows,
      });
      await audit(
        db,
        a,
        i.companyId,
        'career_plan.export',
        i.companyId,
        'career_plan.export',
        ctx,
        { rowCount: rows.length },
      );
      const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
      return [
        'employee_code,employee_name,status,plan_start,plan_end,branch_id,department_id',
        ...rows.map((x) =>
          [
            x.employee_code_snapshot,
            x.employee_name_snapshot,
            x.status,
            day(x.plan_start),
            day(x.plan_end),
            x.branch_id_snapshot,
            x.department_id_snapshot,
          ]
            .map(esc)
            .join(','),
        ),
      ].join('\n');
    },
  };
}
