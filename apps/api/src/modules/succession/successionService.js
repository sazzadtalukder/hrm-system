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
  notifyPermissionHolders,
} from '../notifications/workflowNotificationRepository.js';
import {
  SUCCESSION_ELIGIBLE_STATUSES as ELIGIBLE,
  SUCCESSION_LIMITS as L,
} from './successionConstants.js';
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested succession record was not found.',
    statusCode: 404,
  });
const day = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const previousDay = (value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
export function createSuccessionService({
  database: db,
  repository: r,
  snapshotReader,
  authorizationService,
  auditWriter = insertAuditEvent,
}) {
  const audit = (trx, a, c, x, id, p, ctx, m) =>
    auditWriter(trx, {
      actorUserId: a.userId,
      companyId: c,
      actionCode: x,
      outcome: 'success',
      recordType: 'succession',
      recordId: id,
      permissionCode: p,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      metadata: m,
    });
  const owned = (c, id) => {
    if (!r.companyAllowed(c, id)) throw missing();
  };
  async function sensitive(a, p = 'succession_sensitive.view') {
    try {
      return await authorizationService.requirePermission(a, p);
    } catch {
      return null;
    }
  }
  async function event(trx, parent, table, fk, a, to, input, p, ctx) {
    const prior = await trx(table)
      .where({ company_id: parent.company_id, idempotency_key: input.idempotencyKey })
      .first();
    if (prior) {
      if (
        Number(prior[fk]) === Number(parent.id) &&
        prior.to_state === to &&
        prior.reason === input.reason
      )
        return { ...parent, status: to, workflow_version: prior.workflow_version, replayed: true };
      throw new ConflictError(
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was used for another transition.',
      );
    }
    const next = parent.workflow_version + 1;
    await trx(table).insert({
      company_id: parent.company_id,
      [fk]: parent.id,
      from_state: parent.status,
      to_state: to,
      workflow_version: next,
      reason: input.reason,
      acting_user_id: a.userId,
      idempotency_key: input.idempotencyKey,
      request_id: ctx?.requestId,
      correlation_id: ctx?.correlationId,
    });
    const parentTable = fk === 'succession_plan_id' ? 'succession_plans' : 'successor_nominations',
      terminal =
        fk !== 'succession_plan_id' &&
        ['manager_rejected', 'hr_rejected', 'withdrawn', 'removed'].includes(to);
    await trx(parentTable)
      .where({ id: parent.id })
      .update({
        status: to,
        workflow_version: next,
        version: parent.version + 1,
        ...(fk === 'successor_nomination_id' ? { active_slot: terminal ? null : true } : {}),
        updated_by: a.userId,
        updated_at: trx.fn.now(),
      });
    await audit(
      trx,
      a,
      parent.company_id,
      `${fk === 'succession_plan_id' ? 'succession_plan' : 'succession_nomination'}.${to}`,
      parent.id,
      p,
      ctx,
    );
    return {
      ...parent,
      status: to,
      workflow_version: next,
      version: parent.version + 1,
      replayed: false,
    };
  }
  async function project(a, row, ctx) {
    const s = await sensitive(a),
      allowed = s && (await r.scoped(row.id, s, 'succession_sensitive.view'));
    if (allowed) {
      await audit(
        db,
        a,
        row.company_id,
        'succession_sensitive.view',
        row.id,
        'succession_sensitive.view',
        ctx,
      );
      return row;
    }
    const x = { ...row };
    for (const f of [
      'manager_readiness_recommendation',
      'confirmed_readiness',
      'strengths',
      'development_needs',
      'nomination_rationale',
      'competency_gap_narrative',
    ])
      delete x[f];
    return x;
  }
  return {
    limits: L,
    async createPosition(a, c, i, ctx) {
      assertAccessContext(c, 'critical_position.create');
      owned(c, i.companyId);
      return withTransaction(db, async (trx) => {
        await r.lockCompany(i.companyId, trx);
        const replay = await trx('critical_positions')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        let id;
        try {
          [id] = await trx('critical_positions').insert({
            company_id: i.companyId,
            code: i.code,
            name: i.name,
            idempotency_key: i.idempotencyKey,
            created_by: a.userId,
            updated_by: a.userId,
          });
          const [vid] = await trx('critical_position_versions').insert({
            company_id: i.companyId,
            critical_position_id: id,
            version_number: 1,
            designation_id: i.designationId,
            branch_id: i.branchId ?? null,
            department_id: i.departmentId ?? null,
            criticality: i.criticality,
            description: i.description,
            effective_start: i.effectiveStart,
            reason: i.reason,
            created_by: a.userId,
            updated_by: a.userId,
          });
          if (i.competencies.length) {
            const ids = i.competencies.map((x) => x.performanceCompetencyVersionId),
              rows = await snapshotReader.competencyVersions(trx, i.companyId, ids);
            if (rows.length !== new Set(ids).size)
              throw new ValidationError('A competency version is invalid.');
            await trx('critical_position_competencies').insert(
              i.competencies.map((x) => ({
                company_id: i.companyId,
                critical_position_version_id: vid,
                performance_competency_version_id: x.performanceCompetencyVersionId,
                required_proficiency: x.requiredProficiency ?? null,
                created_by: a.userId,
                updated_by: a.userId,
              })),
            );
          }
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('SUCCESSION_CONFLICT', 'The critical position already exists.');
          throw e;
        }
        await audit(
          trx,
          a,
          i.companyId,
          'critical_position.create',
          id,
          'critical_position.create',
          ctx,
        );
        return { id, replayed: false };
      });
    },
    async listPositions(c, i) {
      assertAccessContext(c, 'critical_position.view');
      owned(c, i.companyId);
      const rows = await db('critical_positions as p')
        .join('critical_position_versions as v', function () {
          this.on('v.critical_position_id', 'p.id').andOn(
            'v.version_number',
            'p.current_version_number',
          );
        })
        .where('p.company_id', i.companyId)
        .select(
          'p.*',
          'v.id as current_version_id',
          'v.designation_id',
          'v.branch_id',
          'v.department_id',
          'v.criticality',
        )
        .limit(i.pageSize)
        .offset((i.page - 1) * i.pageSize);
      const scopedRows = await Promise.all(
        rows.map(async (x) =>
          (await r.positionScoped(x.id, c, 'critical_position.view')) ? x : null,
        ),
      );
      return scopedRows.filter(Boolean);
    },
    async getPosition(c, id, p) {
      const position = await r.positionScoped(id, c, p);
      if (!position) throw missing();
      position.competencies = await db('critical_position_competencies').where({
        critical_position_version_id: position.current_version_id,
      });
      return position;
    },
    async positionHistory(c, id, p) {
      if (!(await r.positionScoped(id, c, p))) throw missing();
      return db('critical_position_versions')
        .where({ critical_position_id: id })
        .orderBy('version_number');
    },
    async versionPosition(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const position = await trx('critical_positions').where({ id }).forUpdate().first();
        if (!position || !(await r.positionScoped(id, c, 'critical_position.version_create', trx)))
          throw missing();
        const replay = await trx('critical_position_versions')
          .where({ company_id: position.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, version: replay.version_number, replayed: true };
        if (position.version !== i.version)
          throw new ConflictError('STALE_VERSION', 'The critical position changed.');
        const current = await trx('critical_position_versions')
          .where({ critical_position_id: id, version_number: position.current_version_number })
          .first();
        if (i.effectiveStart <= day(current.effective_start))
          throw new ValidationError(
            'A new critical-position version must start after the current version.',
          );
        const ids = i.competencies.map((x) => x.performanceCompetencyVersionId);
        if (
          ids.length &&
          (await snapshotReader.competencyVersions(trx, position.company_id, ids)).length !==
            new Set(ids).size
        )
          throw new ValidationError('A competency version is invalid.');
        await trx('critical_position_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded', effective_end: previousDay(i.effectiveStart) });
        const [vid] = await trx('critical_position_versions').insert({
          company_id: position.company_id,
          critical_position_id: id,
          version_number: position.current_version_number + 1,
          designation_id: i.designationId,
          branch_id: i.branchId ?? null,
          department_id: i.departmentId ?? null,
          criticality: i.criticality,
          description: i.description,
          effective_start: i.effectiveStart,
          history_status: 'current',
          supersedes_version_id: current.id,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        if (i.competencies.length)
          await trx('critical_position_competencies').insert(
            i.competencies.map((x) => ({
              company_id: position.company_id,
              critical_position_version_id: vid,
              performance_competency_version_id: x.performanceCompetencyVersionId,
              required_proficiency: x.requiredProficiency ?? null,
              created_by: a.userId,
              updated_by: a.userId,
            })),
          );
        await trx('critical_positions')
          .where({ id })
          .update({
            name: i.name,
            current_version_number: position.current_version_number + 1,
            version: position.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          a,
          position.company_id,
          'critical_position.version_create',
          id,
          'critical_position.version_create',
          ctx,
        );
        return { id: vid, version: position.current_version_number + 1, replayed: false };
      });
    },
    async positionStatus(a, c, id, status, i, permission, ctx) {
      return withTransaction(db, async (trx) => {
        const position = await trx('critical_positions').where({ id }).forUpdate().first();
        if (!position || !(await r.positionScoped(id, c, permission, trx))) throw missing();
        if (position.record_status === status)
          return { id, version: position.version, replayed: true };
        if (position.version !== i.version)
          throw new ConflictError('STALE_VERSION', 'The critical position changed.');
        await trx('critical_positions')
          .where({ id })
          .update({
            record_status: status,
            version: position.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          a,
          position.company_id,
          `critical_position.${status === 'active' ? 'activate' : 'deactivate'}`,
          id,
          permission,
          ctx,
        );
        return { id, version: position.version + 1, replayed: false };
      });
    },
    async createPlan(a, c, i, ctx) {
      assertAccessContext(c, 'succession_plan.create');
      owned(c, i.companyId);
      return withTransaction(db, async (trx) => {
        await r.lockCompany(i.companyId, trx);
        const replay = await trx('succession_plans')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay)
          return { id: replay.id, workflowVersion: replay.workflow_version, replayed: true };
        const pos = await trx('critical_position_versions as v')
          .join('critical_positions as p', 'p.id', 'v.critical_position_id')
          .where({ 'v.id': i.criticalPositionVersionId, 'v.company_id': i.companyId })
          .first('v.*', 'p.code', 'p.name');
        if (!pos) throw new ValidationError('The critical-position version is invalid.');
        let incumbent = null;
        if (i.incumbentEmploymentId) {
          incumbent = await snapshotReader.employment(
            trx,
            i.incumbentEmploymentId,
            i.anchorDate,
            i.companyId,
          );
          if (
            !incumbent ||
            Number(incumbent.designation_id) !== Number(pos.designation_id) ||
            (pos.branch_id && Number(incumbent.branch_id) !== Number(pos.branch_id)) ||
            (pos.department_id && Number(incumbent.department_id) !== Number(pos.department_id))
          )
            throw new ValidationError('The incumbent does not match the critical position.');
        }
        const [id] = await trx('succession_plans').insert({
          company_id: i.companyId,
          critical_position_version_id: i.criticalPositionVersionId,
          anchor_date: i.anchorDate,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await trx('succession_plan_versions').insert({
          company_id: i.companyId,
          succession_plan_id: id,
          version_number: 1,
          critical_position_code_snapshot: pos.code,
          critical_position_name_snapshot: pos.name,
          designation_id_snapshot: pos.designation_id,
          branch_id_snapshot: pos.branch_id,
          department_id_snapshot: pos.department_id,
          incumbent_employment_id_snapshot: incumbent?.employment_id ?? null,
          incumbent_employee_code_snapshot: incumbent?.employee_code ?? null,
          incumbent_employee_name_snapshot: incumbent?.display_name ?? null,
          planning_horizon_date: i.planningHorizonDate,
          risk_rationale: i.riskRationale ?? null,
          reason: i.reason,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          i.companyId,
          'succession_plan.create',
          id,
          'succession_plan.create',
          ctx,
        );
        return { id, workflowVersion: 1, replayed: false };
      });
    },
    async listPlans(c, i) {
      assertAccessContext(c, 'succession_plan.view');
      owned(c, i.companyId);
      const rows = await db('succession_plans as p')
        .join('succession_plan_versions as v', function () {
          this.on('v.succession_plan_id', 'p.id').andOn(
            'v.version_number',
            'p.current_version_number',
          );
        })
        .where('p.company_id', i.companyId)
        .select(
          'p.*',
          'v.critical_position_code_snapshot',
          'v.critical_position_name_snapshot',
          'v.planning_horizon_date',
        )
        .limit(i.pageSize)
        .offset((i.page - 1) * i.pageSize);
      const scopedRows = await Promise.all(
        rows.map(async (x) => ((await r.planScoped(x.id, c, 'succession_plan.view')) ? x : null)),
      );
      return scopedRows.filter(Boolean);
    },
    async getPlan(c, id, p, a, ctx) {
      const plan = await r.planScoped(id, c, p);
      if (!plan) throw missing();
      const sensitiveContext = a ? await sensitive(a) : null;
      if (
        sensitiveContext &&
        (await r.planScoped(id, sensitiveContext, 'succession_sensitive.view'))
      ) {
        await audit(
          db,
          a,
          plan.company_id,
          'succession_sensitive.view',
          id,
          'succession_sensitive.view',
          ctx,
        );
        return plan;
      }
      const projected = { ...plan };
      delete projected.risk_rationale;
      return projected;
    },
    async planHistory(c, id, p, a, ctx) {
      const plan = await r.planScoped(id, c, p);
      if (!plan) throw missing();
      const sensitiveContext = a ? await sensitive(a) : null;
      const canSeeSensitive = Boolean(
        sensitiveContext && (await r.planScoped(id, sensitiveContext, 'succession_sensitive.view')),
      );
      if (canSeeSensitive)
        await audit(
          db,
          a,
          plan.company_id,
          'succession_sensitive.view',
          id,
          'succession_sensitive.view',
          ctx,
        );
      const versions = await db('succession_plan_versions')
        .where({ succession_plan_id: id })
        .orderBy('version_number');
      return {
        versions: canSeeSensitive
          ? versions
          : versions.map((version) => {
              const projected = { ...version };
              delete projected.risk_rationale;
              return projected;
            }),
        states: await db('succession_plan_state_events')
          .where({ succession_plan_id: id })
          .orderBy('workflow_version'),
      };
    },
    async planAction(a, c, id, action, i, p, ctx) {
      return withTransaction(db, async (trx) => {
        const plan = await r.lockPlan(id, trx);
        if (!plan || !(await r.planScoped(id, c, p, trx))) throw missing();
        const rules = {
            activate: [['draft'], 'active'],
            close: [['active'], 'closed'],
            cancel: [['draft', 'active'], 'cancelled'],
          },
          rule = rules[action];
        const prior = await trx('succession_plan_state_events')
          .where({ company_id: plan.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (prior) {
          if (
            Number(prior.succession_plan_id) === Number(id) &&
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
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The succession plan changed.');
        if (!rule || !rule[0].includes(plan.status))
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The succession plan cannot perform this transition.',
          );
        const result = await event(
          trx,
          plan,
          'succession_plan_state_events',
          'succession_plan_id',
          a,
          rule[1],
          i,
          p,
          ctx,
        );
        return result;
      });
    },
    async createNomination(a, c, i, ctx) {
      assertAccessContext(c, 'succession_nomination.create');
      owned(c, i.companyId);
      return withTransaction(db, async (trx) => {
        const plan = await r.lockPlan(i.successionPlanId, trx);
        if (!plan || plan.company_id !== i.companyId || plan.status !== 'active')
          throw new ValidationError('The succession plan is not active.');
        const replay = await trx('successor_nominations')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay)
          return { id: replay.id, workflowVersion: replay.workflow_version, replayed: true };
        await trx('employments')
          .where({ id: i.employmentId, company_id: i.companyId })
          .forUpdate()
          .first();
        const snap = await snapshotReader.employment(
          trx,
          i.employmentId,
          day(plan.anchor_date),
          i.companyId,
        );
        if (!snap || !ELIGIBLE.includes(snap.employment_status) || snap.employment_end_date)
          throw new ValidationError('The employment is not eligible for succession nomination.');
        const direct = Number(snap.manager_user_id) === Number(a.userId),
          broader = c.grants.some((g) =>
            ['company', 'branch', 'department', 'all'].includes(g.scope_type),
          );
        if (!direct && !broader) throw missing();
        if (Number(snap.user_id) === Number(a.userId))
          throw new ApplicationError({
            code: 'FORBIDDEN',
            message: 'You cannot nominate yourself.',
            statusCode: 403,
          });
        let id;
        try {
          [id] = await trx('successor_nominations').insert({
            company_id: i.companyId,
            succession_plan_id: i.successionPlanId,
            employment_id: i.employmentId,
            source: direct ? 'manager' : 'hr_talent',
            idempotency_key: i.idempotencyKey,
            created_by: a.userId,
            updated_by: a.userId,
          });
          await trx('successor_nomination_versions').insert({
            company_id: i.companyId,
            successor_nomination_id: id,
            version_number: 1,
            employee_id_snapshot: snap.employee_id,
            employee_code_snapshot: snap.employee_code,
            employee_name_snapshot: snap.display_name,
            employment_status_snapshot: snap.employment_status,
            branch_id_snapshot: snap.branch_id,
            department_id_snapshot: snap.department_id,
            designation_id_snapshot: snap.designation_id,
            manager_employment_id_snapshot: snap.manager_employment_id,
            manager_user_id_snapshot: snap.manager_user_id,
            manager_readiness_recommendation: i.managerReadinessRecommendation,
            readiness_target_date: i.readinessTargetDate ?? null,
            strengths: i.strengths,
            development_needs: i.developmentNeeds,
            nomination_rationale: i.nominationRationale,
            competency_gap_narrative: i.competencyGapNarrative ?? null,
            anchor_date: day(plan.anchor_date),
            reason: i.reason,
            created_by: a.userId,
            updated_by: a.userId,
          });
          await trx('successor_nomination_readiness_events').insert({
            company_id: i.companyId,
            successor_nomination_id: id,
            authority: 'manager',
            readiness: i.managerReadinessRecommendation,
            reason: i.reason,
            acting_user_id: a.userId,
            idempotency_key: `nomination:${id}:initial`,
            created_by: a.userId,
            updated_by: a.userId,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'ACTIVE_SUCCESSION_NOMINATION',
              'The candidate already has an active nomination for this plan.',
            );
          throw e;
        }
        await audit(
          trx,
          a,
          i.companyId,
          'succession_nomination.create',
          id,
          'succession_nomination.create',
          ctx,
        );
        return { id, workflowVersion: 1, replayed: false };
      });
    },
    async list(a, c, i, p, ctx) {
      return Promise.all((await r.list(c, p, i)).map((x) => project(a, x, ctx)));
    },
    async get(a, c, id, p, ctx) {
      const x = await r.scoped(id, c, p);
      if (!x) throw missing();
      return project(a, x, ctx);
    },
    async nominationAction(a, c, id, action, i, p, ctx) {
      return withTransaction(db, async (trx) => {
        const n = await r.lockNomination(id, trx);
        if (!n || !r.companyAllowed(c, n.company_id)) throw missing();
        const rules = {
            submit: [['draft'], 'submitted'],
            recommend: [['submitted'], 'manager_recommended'],
            reject: [
              ['submitted', 'manager_recommended'],
              n.status === 'submitted' ? 'manager_rejected' : 'hr_rejected',
            ],
            confirm: [['manager_recommended'], 'hr_confirmed'],
            remove: [['submitted', 'manager_recommended', 'hr_confirmed'], 'removed'],
            withdraw: [['draft', 'submitted'], 'withdrawn'],
          },
          rule = rules[action],
          prior = await trx('successor_nomination_state_events')
            .where({ company_id: n.company_id, idempotency_key: i.idempotencyKey })
            .first();
        if (prior) {
          const sameAction =
            prior.to_state === rule?.[1] ||
            (action === 'reject' && ['manager_rejected', 'hr_rejected'].includes(prior.to_state));
          if (
            Number(prior.successor_nomination_id) === Number(id) &&
            sameAction &&
            prior.reason === i.reason
          )
            return {
              ...n,
              status: prior.to_state,
              workflow_version: prior.workflow_version,
              replayed: true,
            };
          throw new ConflictError(
            'IDEMPOTENCY_CONFLICT',
            'The idempotency key was used for another transition.',
          );
        }
        if (n.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The nomination changed.');
        const row = await r.scoped(id, c, p, trx);
        if (!row) throw missing();
        const actorEmployment = await trx('employments as employment')
          .join('employees as employee', 'employee.id', 'employment.employee_id')
          .where({ 'employee.user_id': a.userId, 'employment.company_id': n.company_id })
          .first('employment.id');
        if (Number(row.employment_id) === Number(actorEmployment?.id))
          throw new ApplicationError({
            code: 'FORBIDDEN',
            message: 'You cannot decide your own nomination.',
            statusCode: 403,
          });
        const isSnapshotManager = Number(row.manager_user_id_snapshot) === Number(a.userId);
        if (
          (action === 'recommend' || (action === 'reject' && n.status === 'submitted')) &&
          !isSnapshotManager
        )
          throw missing();
        if (
          (action === 'confirm' ||
            action === 'remove' ||
            (action === 'reject' && n.status === 'manager_recommended')) &&
          isSnapshotManager
        )
          throw new ApplicationError({
            code: 'FORBIDDEN',
            message: 'A separate authorized HR/Talent actor must perform this decision.',
            statusCode: 403,
          });
        if (!rule || !rule[0].includes(n.status))
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The nomination cannot perform this transition.',
          );
        if (['recommend', 'reject', 'confirm', 'remove'].includes(action))
          await trx('successor_nomination_decisions').insert({
            company_id: n.company_id,
            successor_nomination_id: id,
            decision:
              action === 'recommend'
                ? 'recommended'
                : action === 'reject'
                  ? rule[1]
                  : action === 'confirm'
                    ? 'confirmed'
                    : 'removed',
            actor_user_id: a.userId,
            reason: i.reason,
            idempotency_key: i.idempotencyKey,
            created_by: a.userId,
            updated_by: a.userId,
          });
        const result = await event(
          trx,
          n,
          'successor_nomination_state_events',
          'successor_nomination_id',
          a,
          rule[1],
          i,
          p,
          ctx,
        );
        if (rule[1] === 'submitted') {
          const notification = {
            companyId: n.company_id,
            type: 'succession.manager_review_required',
            title: 'Succession nomination awaiting review',
            message: 'A succession nomination requires manager review.',
            referenceType: 'successor_nomination',
            referenceId: id,
            idempotencyKey: `succession:${id}:submitted:${result.workflow_version}`,
            actorUserId: a.userId,
          };
          if (row.manager_user_id_snapshot)
            await createWorkflowNotification(trx, {
              ...notification,
              userId: row.manager_user_id_snapshot,
            });
          else
            await notifyPermissionHolders(trx, notification, 'succession_nomination.recommend', {
              branchId: row.branch_id_snapshot,
              departmentId: row.department_id_snapshot,
            });
        } else if (rule[1] === 'manager_recommended')
          await notifyPermissionHolders(
            trx,
            {
              companyId: n.company_id,
              type: 'succession.hr_confirmation_required',
              title: 'Succession nomination awaiting confirmation',
              message: 'A manager-recommended succession nomination requires HR/Talent review.',
              referenceType: 'successor_nomination',
              referenceId: id,
              idempotencyKey: `succession:${id}:confirmation_required:${result.workflow_version}`,
              actorUserId: a.userId,
            },
            'succession_nomination.confirm',
            { branchId: row.branch_id_snapshot, departmentId: row.department_id_snapshot },
          );
        return result;
      });
    },
    async reassign(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const nomination = await r.lockNomination(id, trx);
        if (!nomination || !(await r.scoped(id, c, 'succession_nomination.reassign_manager', trx)))
          throw missing();
        const replay = await trx('successor_nomination_manager_reassignments')
          .where({ company_id: nomination.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) {
          if (
            Number(replay.successor_nomination_id) === Number(id) &&
            Number(replay.to_manager_employment_id) === Number(i.managerEmploymentId) &&
            replay.reason === i.reason
          )
            return { id: replay.id, replayed: true };
          throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used.');
        }
        if (nomination.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The nomination changed.');
        const manager = await snapshotReader.employment(
          trx,
          i.managerEmploymentId,
          new Date().toISOString().slice(0, 10),
          nomination.company_id,
        );
        if (!manager?.user_id) throw new ValidationError('The replacement manager is invalid.');
        if (Number(manager.employment_id) === Number(nomination.employment_id))
          throw new ValidationError('A successor cannot manage their own nomination.');
        const current = await trx('successor_nomination_versions')
          .where({ successor_nomination_id: id, version_number: nomination.current_version_number })
          .first();
        const [rid] = await trx('successor_nomination_manager_reassignments').insert({
          company_id: nomination.company_id,
          successor_nomination_id: id,
          from_manager_employment_id: current.manager_employment_id_snapshot,
          to_manager_employment_id: manager.employment_id,
          acting_user_id: a.userId,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await trx('successor_nomination_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded' });
        const data = { ...current };
        for (const f of ['id', 'created_at', 'updated_at']) delete data[f];
        await trx('successor_nomination_versions').insert({
          ...data,
          version_number: nomination.current_version_number + 1,
          manager_employment_id_snapshot: manager.employment_id,
          manager_user_id_snapshot: manager.user_id,
          history_status: 'current',
          supersedes_version_id: current.id,
          reason: i.reason,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await trx('successor_nominations')
          .where({ id })
          .update({
            current_version_number: nomination.current_version_number + 1,
            workflow_version: nomination.workflow_version + 1,
            version: nomination.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          a,
          nomination.company_id,
          'succession_nomination.reassign_manager',
          id,
          'succession_nomination.reassign_manager',
          ctx,
        );
        await createWorkflowNotification(trx, {
          companyId: nomination.company_id,
          userId: manager.user_id,
          type: 'succession.manager_reassigned',
          title: 'Succession nomination assigned to you',
          message: 'You have been assigned as manager for a succession nomination.',
          referenceType: 'successor_nomination',
          referenceId: id,
          idempotencyKey: `succession:${id}:manager:${nomination.current_version_number + 1}`,
          actorUserId: a.userId,
        });
        return { id: rid, replayed: false };
      });
    },
    async readiness(a, c, id, i, p, ctx) {
      return withTransaction(db, async (trx) => {
        const n = await r.lockNomination(id, trx);
        if (!n || !r.companyAllowed(c, n.company_id)) throw missing();
        const prior = await trx('successor_nomination_readiness_events')
          .where({ company_id: n.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (prior) {
          if (
            Number(prior.successor_nomination_id) === Number(id) &&
            prior.readiness === i.readiness &&
            prior.reason === i.reason
          )
            return { id: prior.id, replayed: true };
          throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used.');
        }
        if (n.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The nomination changed.');
        if (n.version !== i.version)
          throw new ConflictError('STALE_VERSION', 'The nomination readiness changed.');
        const row = await r.scoped(id, c, p, trx);
        if (!row) throw missing();
        const authority =
          Number(row.manager_user_id_snapshot) === Number(a.userId) ? 'manager' : 'hr_talent';
        if (authority === 'hr_talent' && !i.reason)
          throw new ValidationError('A reason is required.');
        const [id2] = await trx('successor_nomination_readiness_events').insert({
          company_id: n.company_id,
          successor_nomination_id: id,
          authority,
          readiness: i.readiness,
          reason: i.reason,
          acting_user_id: a.userId,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        const current = await trx('successor_nomination_versions')
          .where({ successor_nomination_id: id, version_number: n.current_version_number })
          .first();
        await trx('successor_nomination_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded' });
        const data = { ...current };
        for (const f of ['id', 'created_at', 'updated_at']) delete data[f];
        await trx('successor_nomination_versions').insert({
          ...data,
          version_number: n.current_version_number + 1,
          confirmed_readiness:
            authority === 'hr_talent' ? i.readiness : current.confirmed_readiness,
          manager_readiness_recommendation:
            authority === 'manager' ? i.readiness : current.manager_readiness_recommendation,
          history_status: 'current',
          supersedes_version_id: current.id,
          reason: i.reason,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await trx('successor_nominations')
          .where({ id })
          .update({
            current_version_number: n.current_version_number + 1,
            version: n.version + 1,
            updated_by: a.userId,
            updated_at: trx.fn.now(),
          });
        await audit(trx, a, n.company_id, 'succession_nomination.readiness', id, p, ctx, {
          authority,
        });
        return { id: id2, replayed: false };
      });
    },
    async history(a, c, id, p, ctx) {
      const row = await r.scoped(id, c, p);
      if (!row) throw missing();
      const h = await r.history(id),
        s = await sensitive(a),
        allowed = s && (await r.scoped(id, s, 'succession_sensitive.view'));
      if (allowed) {
        await audit(
          db,
          a,
          row.company_id,
          'succession_sensitive.view',
          id,
          'succession_sensitive.view',
          ctx,
        );
        return h;
      }
      return {
        versions: h.versions.map((x) => {
          const y = { ...x };
          for (const f of [
            'manager_readiness_recommendation',
            'confirmed_readiness',
            'strengths',
            'development_needs',
            'nomination_rationale',
            'competency_gap_narrative',
            'reason',
          ])
            delete y[f];
          return y;
        }),
        decisions: h.decisions.map((x) => ({ ...x, reason: undefined })),
        readiness: [],
        reassignments: [],
      };
    },
    async export(a, c, i, ctx) {
      owned(c, i.companyId);
      const rows = await r.list(c, 'succession.export', {
        ...i,
        page: 1,
        pageSize: L.maximumExportRows,
      });
      await audit(db, a, i.companyId, 'succession.export', i.companyId, 'succession.export', ctx, {
        rowCount: rows.length,
      });
      const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
      return [
        'employee_code,employee_name,status,branch_id,department_id',
        ...rows.map((x) =>
          [
            x.employee_code_snapshot,
            x.employee_name_snapshot,
            x.status,
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
