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
  TRAINING_ELIGIBLE_STATUSES as ELIGIBLE,
  TRAINING_LIMITS as LIMITS,
  TRAINING_SESSION_TRANSITIONS as SESSION_TRANSITIONS,
} from './trainingConstants.js';
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested training record was not found.',
    statusCode: 404,
  });
const asDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const localDate = (value, timeZone) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(value))
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
};
export function createTrainingService({ database, repository, authorizationService }) {
  const audit = (trx, actor, companyId, action, id, permission, ctx, metadata) =>
    insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: 'training',
      recordId: id,
      permissionCode: permission,
      metadata,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  const owned = (c, id) => {
    if (!repository.companyAllowed(c, id)) throw missing();
  };
  async function sensitive(actor, permission = 'training_sensitive.view') {
    try {
      return await authorizationService.requirePermission(actor, permission);
    } catch {
      return null;
    }
  }
  async function snapshot(trx, employmentId, anchor, companyId) {
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
      .join('employee_assignments as assignment', function () {
        this.on('assignment.employment_id', 'e.id')
          .andOnVal('assignment.history_status', 'current')
          .andOn('assignment.effective_start', '<=', trx.raw('?', [anchor]))
          .andOn(function () {
            this.onNull('assignment.effective_end').orOn(
              'assignment.effective_end',
              '>=',
              trx.raw('?', [anchor]),
            );
          });
      })
      .leftJoin(
        'employments as manager_employment',
        'manager_employment.id',
        'assignment.manager_employment_id',
      )
      .leftJoin('employees as manager', 'manager.id', 'manager_employment.employee_id')
      .where({
        'e.id': employmentId,
        'e.company_id': companyId,
        'e.record_status': 'active',
        'employee.record_status': 'active',
      })
      .where((q) =>
        q.whereNull('e.employment_end_date').orWhere('e.employment_end_date', '>=', anchor),
      )
      .first(
        'e.id as employment_id',
        'e.employee_id',
        'e.employee_code',
        'e.employment_end_date',
        'employee.display_name',
        'employee.user_id',
        'status.status as employment_status',
        'assignment.branch_id',
        'assignment.department_id',
        'assignment.manager_employment_id',
        'manager.user_id as manager_user_id',
      );
  }
  async function transition(trx, enrollment, actor, to, reason, key, ctx) {
    const replay = key
      ? await trx('training_enrollment_state_events')
          .where({ company_id: enrollment.company_id, idempotency_key: key })
          .first()
      : null;
    if (replay) {
      if (Number(replay.training_enrollment_id) === Number(enrollment.id) && replay.to_state === to)
        return { workflowVersion: replay.workflow_version, replayed: true };
      throw new ConflictError(
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was used for another transition.',
      );
    }
    const next = enrollment.workflow_version + 1;
    await trx('training_enrollment_state_events').insert({
      company_id: enrollment.company_id,
      training_enrollment_id: enrollment.id,
      from_state: enrollment.status,
      to_state: to,
      workflow_version: next,
      reason,
      acting_user_id: actor.userId,
      idempotency_key: key ?? null,
      request_id: ctx?.requestId,
      correlation_id: ctx?.correlationId,
    });
    await trx('training_enrollments')
      .where({ id: enrollment.id })
      .update({
        status: to,
        workflow_version: next,
        version: enrollment.version + 1,
        updated_by: actor.userId,
        updated_at: trx.fn.now(),
      });
    enrollment.status = to;
    enrollment.workflow_version = next;
    enrollment.version += 1;
    return { workflowVersion: next, replayed: false };
  }
  async function allocate(trx, session, _enrollmentId) {
    const version = await trx('training_session_versions')
      .where({ training_session_id: session.id, version_number: session.current_version_number })
      .first();
    const [{ n }] = await trx('training_enrollments')
      .where({ training_session_id: session.id })
      .whereIn('status', ['enrolled', 'cancellation_requested'])
      .count({ n: '*' });
    if (Number(n) >= Number(version.capacity))
      throw new ConflictError(
        'TRAINING_CAPACITY_FULL',
        'The training session has reached capacity.',
      );
    return version;
  }
  async function project(actor, row, ctx, trx = database) {
    const own = Number(row.user_id) === Number(actor.userId),
      manager = Number(row.manager_user_id_snapshot) === Number(actor.userId);
    const s = await sensitive(actor);
    const allowed =
      s && (await repository.enrollmentScoped(row.id, s, 'training_sensitive.view', trx));
    if (own || allowed) {
      await audit(
        trx,
        actor,
        row.company_id,
        'training_sensitive.view',
        row.id,
        allowed ? 'training_sensitive.view' : 'training_enrollment.view_own',
        ctx,
      );
      return row;
    }
    const safe = { ...row };
    delete safe.request_narrative;
    if (!manager) delete safe.employee_name_snapshot;
    return safe;
  }
  async function createConfiguration(kind, actor, c, input, ctx) {
    owned(c, input.companyId);
    return withTransaction(database, async (trx) => {
      await repository.lockCompany(input.companyId, trx);
      const parentTable = kind === 'course' ? 'training_courses' : 'training_providers';
      const versionTable =
        kind === 'course' ? 'training_course_versions' : 'training_provider_versions';
      let parentId;
      try {
        [parentId] = await trx(parentTable).insert({
          company_id: input.companyId,
          code: input.code,
          name: input.name,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        const data =
          kind === 'course'
            ? {
                description: input.description,
                delivery_mode: input.deliveryMode,
                scoring_enabled: input.scoringEnabled,
                minimum_score: input.scoringEnabled ? input.minimumScore : null,
                maximum_score: input.scoringEnabled ? input.maximumScore : null,
                passing_score: input.scoringEnabled ? input.passingScore : null,
              }
            : {
                contact_name: input.contactName ?? null,
                contact_email: input.contactEmail ?? null,
                external_url: input.externalUrl ?? null,
              };
        const fk = kind === 'course' ? 'training_course_id' : 'training_provider_id';
        const [versionId] = await trx(versionTable).insert({
          company_id: input.companyId,
          [fk]: parentId,
          version_number: 1,
          effective_start: input.effectiveStart,
          reason: input.reason,
          ...data,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        if (kind === 'course' && input.competencyVersionIds.length) {
          const rows = await trx('performance_competency_versions')
            .where({ company_id: input.companyId })
            .whereIn('id', input.competencyVersionIds);
          if (rows.length !== new Set(input.competencyVersionIds.map(Number)).size)
            throw new ValidationError('Every competency version must exist in the same company.');
          await trx('training_course_competencies').insert(
            [...new Set(input.competencyVersionIds.map(Number))].map((id) => ({
              company_id: input.companyId,
              training_course_version_id: versionId,
              performance_competency_version_id: id,
              created_by: actor.userId,
              updated_by: actor.userId,
            })),
          );
        }
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY')
          throw new ConflictError('TRAINING_CONFLICT', `The ${kind} already exists.`);
        throw e;
      }
      await audit(
        trx,
        actor,
        input.companyId,
        `training_${kind}.create`,
        parentId,
        `training_${kind}.create`,
        ctx,
      );
      return { id: parentId };
    });
  }
  return {
    limits: LIMITS,
    createCourse: (a, c, i, x) => createConfiguration('course', a, c, i, x),
    createProvider: (a, c, i, x) => createConfiguration('provider', a, c, i, x),
    async listCourses(c, input) {
      owned(c, input.companyId);
      return database('training_courses as course')
        .join('training_course_versions as version', function () {
          this.on('version.training_course_id', 'course.id').andOn(
            'version.version_number',
            'course.current_version_number',
          );
        })
        .where('course.company_id', input.companyId)
        .select(
          'course.*',
          'version.id as course_version_id',
          'version.delivery_mode',
          'version.effective_start',
        )
        .orderBy('course.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    async listProviders(c, input) {
      owned(c, input.companyId);
      return database('training_providers as provider')
        .join('training_provider_versions as version', function () {
          this.on('version.training_provider_id', 'provider.id').andOn(
            'version.version_number',
            'provider.current_version_number',
          );
        })
        .where('provider.company_id', input.companyId)
        .select('provider.*', 'version.id as provider_version_id')
        .orderBy('provider.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    async createSession(actor, c, input, ctx) {
      owned(c, input.companyId);
      if (
        new Date(input.endsAtUtc) <= new Date(input.startsAtUtc) ||
        input.enrollmentClosesOn < input.enrollmentOpensOn
      )
        throw new ValidationError('Session dates are invalid.');
      return withTransaction(database, async (trx) => {
        await repository.lockCompany(input.companyId, trx);
        const course = await trx('training_course_versions as v')
          .join('training_courses as c', 'c.id', 'v.training_course_id')
          .where({
            'v.id': input.trainingCourseVersionId,
            'v.company_id': input.companyId,
            'c.record_status': 'active',
          })
          .first('v.*', 'c.code', 'c.name');
        if (!course) throw new ValidationError('The course version is unavailable.');
        if (
          input.trainingProviderVersionId &&
          !(await trx('training_provider_versions')
            .where({ id: input.trainingProviderVersionId, company_id: input.companyId })
            .first())
        )
          throw new ValidationError('The provider version is unavailable.');
        if (
          input.branchId &&
          !(await trx('branches')
            .where({ id: input.branchId, company_id: input.companyId })
            .first())
        )
          throw new ValidationError('The branch is unavailable.');
        let sessionId;
        try {
          [sessionId] = await trx('training_sessions').insert({
            company_id: input.companyId,
            code: input.code,
            training_course_version_id: course.id,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY')
            throw new ConflictError('TRAINING_CONFLICT', 'The session code already exists.');
          throw e;
        }
        const [versionId] = await trx('training_session_versions').insert({
          company_id: input.companyId,
          training_session_id: sessionId,
          version_number: 1,
          title_snapshot: input.title,
          course_code_snapshot: course.code,
          delivery_mode_snapshot: course.delivery_mode,
          starts_at_utc: new Date(input.startsAtUtc),
          ends_at_utc: new Date(input.endsAtUtc),
          timezone_snapshot: input.timezone,
          enrollment_opens_on: input.enrollmentOpensOn,
          enrollment_closes_on: input.enrollmentClosesOn,
          capacity: input.capacity,
          branch_id: input.branchId ?? null,
          location: input.location ?? null,
          virtual_reference: input.virtualReference ?? null,
          training_provider_version_id: input.trainingProviderVersionId ?? null,
          scoring_enabled_snapshot: course.scoring_enabled,
          minimum_score_snapshot: course.minimum_score,
          maximum_score_snapshot: course.maximum_score,
          passing_score_snapshot: course.passing_score,
          reason: input.reason,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        if (input.facilitators.length)
          await trx('training_session_facilitators').insert(
            input.facilitators.map((f, index) => ({
              company_id: input.companyId,
              training_session_version_id: versionId,
              name: f.name,
              organization: f.organization ?? null,
              reference: f.reference ?? null,
              display_order: index + 1,
              created_by: actor.userId,
              updated_by: actor.userId,
            })),
          );
        await audit(
          trx,
          actor,
          input.companyId,
          'training_session.create',
          sessionId,
          'training_session.create',
          ctx,
        );
        return { id: sessionId, version: 1, workflowVersion: 1 };
      });
    },
    async listSessions(c, input) {
      owned(c, input.companyId);
      return database('training_sessions as session')
        .join('training_session_versions as version', function () {
          this.on('version.training_session_id', 'session.id').andOn(
            'version.version_number',
            'session.current_version_number',
          );
        })
        .where('session.company_id', input.companyId)
        .modify((q) => {
          if (input.status) q.where('session.status', input.status);
        })
        .select(
          'session.*',
          'version.title_snapshot',
          'version.starts_at_utc',
          'version.ends_at_utc',
          'version.capacity',
        )
        .orderBy('session.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    async sessionTransition(actor, c, id, target, input, permission, ctx) {
      return withTransaction(database, async (trx) => {
        const session = await repository.lockSession(id, trx);
        if (!session || !repository.companyAllowed(c, session.company_id)) throw missing();
        const replay = await trx('training_session_state_events')
          .where({ company_id: session.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (replay) {
          if (Number(replay.training_session_id) === Number(id) && replay.to_state === target)
            return { id, status: target, workflowVersion: replay.workflow_version, replayed: true };
          throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used.');
        }
        if (session.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The session changed.');
        if (!SESSION_TRANSITIONS[session.status]?.includes(target))
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The session cannot perform this transition.',
          );
        const next = session.workflow_version + 1;
        await trx('training_session_state_events').insert({
          company_id: session.company_id,
          training_session_id: id,
          from_state: session.status,
          to_state: target,
          workflow_version: next,
          reason: input.reason,
          acting_user_id: actor.userId,
          idempotency_key: input.idempotencyKey,
          request_id: ctx?.requestId,
          correlation_id: ctx?.correlationId,
        });
        await trx('training_sessions')
          .where({ id })
          .update({
            status: target,
            workflow_version: next,
            version: session.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          actor,
          session.company_id,
          `training_session.${target}`,
          id,
          permission,
          ctx,
        );
        return { id, status: target, workflowVersion: next, replayed: false };
      });
    },
    async createEnrollment(actor, c, input, source, permission, ctx) {
      owned(c, input.companyId);
      return withTransaction(database, async (trx) => {
        const session = await repository.lockSession(input.trainingSessionId, trx);
        if (
          !session ||
          Number(session.company_id) !== Number(input.companyId) ||
          !['published'].includes(session.status)
        )
          throw new ValidationError('The session is not accepting enrollments.');
        const sv = await trx('training_session_versions')
          .where({
            training_session_id: session.id,
            version_number: session.current_version_number,
          })
          .first();
        const anchor = localDate(sv.starts_at_utc, sv.timezone_snapshot),
          end = localDate(sv.ends_at_utc, sv.timezone_snapshot);
        const e = await snapshot(trx, input.employmentId, anchor, input.companyId);
        if (
          !e ||
          !ELIGIBLE.includes(e.employment_status) ||
          (e.employment_end_date && asDate(e.employment_end_date) < end)
        )
          throw new ValidationError('The employment is not eligible for this session.');
        if (source === 'self_request' && Number(e.user_id) !== Number(actor.userId))
          throw missing();
        const blocking = await trx('training_enrollments')
          .where({ training_session_id: session.id, employment_id: e.employment_id })
          .whereIn('status', [
            'submitted',
            'employee_accepted',
            'enrolled',
            'cancellation_requested',
          ])
          .first();
        if (blocking)
          throw new ConflictError(
            'TRAINING_ENROLLMENT_CONFLICT',
            'A blocking enrollment already exists.',
          );
        const status =
          source === 'self_request'
            ? 'draft'
            : source === 'manager_nomination'
              ? 'submitted'
              : 'enrolled';
        if (source === 'manager_nomination' && Number(e.manager_user_id) !== Number(actor.userId))
          throw missing();
        if (source === 'hr_assignment') await allocate(trx, session, 0);
        const [id] = await trx('training_enrollments').insert({
          company_id: input.companyId,
          training_session_id: session.id,
          employment_id: e.employment_id,
          source,
          is_mandatory: source === 'hr_assignment' ? input.isMandatory : false,
          status,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('training_enrollment_versions').insert({
          company_id: input.companyId,
          training_enrollment_id: id,
          version_number: 1,
          training_session_version_id_snapshot: sv.id,
          employee_id_snapshot: e.employee_id,
          employee_code_snapshot: e.employee_code,
          employee_name_snapshot: e.display_name,
          employment_status_snapshot: e.employment_status,
          branch_id_snapshot: e.branch_id,
          department_id_snapshot: e.department_id,
          manager_employment_id_snapshot: e.manager_employment_id,
          manager_user_id_snapshot: e.manager_user_id,
          request_narrative: input.requestNarrative,
          reason: input.reason,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('training_enrollment_state_events').insert({
          company_id: input.companyId,
          training_enrollment_id: id,
          from_state: null,
          to_state: status,
          workflow_version: 1,
          reason: input.reason,
          acting_user_id: actor.userId,
          request_id: ctx?.requestId,
          correlation_id: ctx?.correlationId,
        });
        await audit(
          trx,
          actor,
          input.companyId,
          `training_enrollment.${source}`,
          id,
          permission,
          ctx,
          { mandatory: source === 'hr_assignment' ? input.isMandatory : false },
        );
        if (source === 'manager_nomination')
          await createWorkflowNotification(trx, {
            companyId: input.companyId,
            userId: e.user_id,
            type: 'training.nomination',
            title: 'Training nomination',
            message: 'You have been nominated for a training session.',
            referenceType: 'training_enrollment',
            referenceId: id,
            idempotencyKey: `training:${id}:nomination:1`,
            actorUserId: actor.userId,
          });
        return { id, status, version: 1, workflowVersion: 1 };
      });
    },
    async listEnrollments(actor, c, input, permission, ctx) {
      const rows = await repository.listEnrollments(c, permission, input);
      return Promise.all(rows.map((r) => project(actor, r, ctx)));
    },
    async getEnrollment(actor, c, id, permission, ctx) {
      const row = await repository.enrollmentScoped(id, c, permission);
      if (!row) throw missing();
      return project(actor, row, ctx);
    },
    async enrollmentAction(actor, c, id, action, input, permission, ctx) {
      return withTransaction(database, async (trx) => {
        let e = await repository.lockEnrollment(id, trx);
        if (!e) throw missing();
        const scoped = await repository.enrollmentScoped(id, c, permission, trx);
        if (!scoped) throw missing();
        const existing = await trx('training_enrollment_state_events')
          .where({ company_id: e.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (existing) {
          const targetMap = {
            submit: 'submitted',
            withdraw: 'withdrawn',
            accept_nomination: 'enrolled',
            decline_nomination: 'employee_declined',
            approve: 'enrolled',
            reject: 'rejected',
            request_cancellation: 'cancellation_requested',
            approve_cancellation: 'cancelled',
            reject_cancellation: 'enrolled',
          };
          const expected = targetMap[action];
          if (
            Number(existing.training_enrollment_id) === Number(id) &&
            existing.to_state === expected
          )
            return {
              id,
              status: expected,
              workflowVersion: existing.workflow_version,
              replayed: true,
            };
          throw new ConflictError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used.');
        }
        if (e.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The enrollment changed.');
        let target;
        const valid = {
          submit: [['draft'], 'submitted'],
          withdraw: [['draft', 'submitted'], 'withdrawn'],
          accept_nomination: [['submitted'], 'enrolled'],
          decline_nomination: [['submitted'], 'employee_declined'],
          approve: [['submitted'], 'enrolled'],
          reject: [['submitted', 'employee_accepted'], 'rejected'],
          request_cancellation: [['enrolled'], 'cancellation_requested'],
          approve_cancellation: [['cancellation_requested'], 'cancelled'],
          reject_cancellation: [['cancellation_requested'], 'enrolled'],
        }[action];
        if (!valid || !valid[0].includes(e.status))
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The enrollment cannot perform this transition.',
          );
        target = valid[1];
        if (
          ['approve', 'reject'].includes(action) &&
          Number(scoped.user_id) === Number(actor.userId)
        )
          throw new ConflictError(
            'SEPARATION_OF_DUTIES',
            'The employee cannot decide their own enrollment.',
          );
        if (
          action === 'approve' &&
          scoped.manager_user_id_snapshot &&
          Number(scoped.manager_user_id_snapshot) !== Number(actor.userId) &&
          !c.grants.some((g) => ['company', 'branch', 'department', 'all'].includes(g.scope_type))
        )
          throw missing();
        if (
          ['accept_nomination', 'decline_nomination'].includes(action) &&
          e.source !== 'manager_nomination'
        )
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'This is not a nomination.');
        if (['approve', 'accept_nomination'].includes(action)) {
          const session = await repository.lockSession(e.training_session_id, trx);
          await allocate(trx, session, e.id);
        }
        const result = await transition(
          trx,
          e,
          actor,
          target,
          input.reason,
          input.idempotencyKey,
          ctx,
        );
        if (['approve', 'reject', 'approve_cancellation', 'reject_cancellation'].includes(action))
          await trx('training_enrollment_decisions').insert({
            company_id: e.company_id,
            training_enrollment_id: e.id,
            step: action.includes('cancellation') ? 'cancellation' : 'approval',
            decision:
              action === 'approve'
                ? 'approved'
                : action === 'reject'
                  ? 'rejected'
                  : action === 'approve_cancellation'
                    ? 'cancelled'
                    : 'cancellation_rejected',
            decision_user_id: actor.userId,
            reason: input.reason,
            idempotency_key: input.idempotencyKey,
          });
        await audit(trx, actor, e.company_id, `training_enrollment.${action}`, id, permission, ctx);
        if (action === 'submit') {
          const notification = {
            companyId: e.company_id,
            type: 'training.approval_required',
            title: 'Training request awaiting review',
            message: 'An employee training request requires a decision.',
            referenceType: 'training_enrollment',
            referenceId: id,
            idempotencyKey: `training:${id}:submitted:${result.workflowVersion}`,
            actorUserId: actor.userId,
          };
          if (scoped.manager_user_id_snapshot)
            await createWorkflowNotification(trx, {
              ...notification,
              userId: scoped.manager_user_id_snapshot,
            });
          else
            await notifyPermissionHolders(trx, notification, 'training_enrollment.approve', {
              branchId: scoped.branch_id_snapshot,
              departmentId: scoped.department_id_snapshot,
            });
        } else if (
          ['approve', 'reject', 'approve_cancellation', 'reject_cancellation'].includes(action)
        )
          await createWorkflowNotification(trx, {
            companyId: e.company_id,
            userId: scoped.user_id,
            type: 'training.status_updated',
            title: 'Training enrollment updated',
            message: `Your training enrollment is now ${target.replaceAll('_', ' ')}.`,
            referenceType: 'training_enrollment',
            referenceId: id,
            idempotencyKey: `training:${id}:${target}:${result.workflowVersion}`,
            actorUserId: actor.userId,
          });
        return { id, status: target, workflowVersion: result.workflowVersion, replayed: false };
      });
    },
    async recordParticipation(actor, c, id, input, correction, ctx) {
      return withTransaction(database, async (trx) => {
        const enrollment = await repository.lockEnrollment(id, trx);
        if (!enrollment || !repository.companyAllowed(c, enrollment.company_id)) throw missing();
        if (!['enrolled', 'cancellation_requested'].includes(enrollment.status))
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'Participation cannot be recorded.');
        let record = await trx('training_participation_records')
          .where({ training_enrollment_id: id })
          .forUpdate()
          .first();
        if (record && !correction)
          throw new ConflictError('TRAINING_PARTICIPATION_EXISTS', 'Participation already exists.');
        if (!record) {
          const [recordId] = await trx('training_participation_records').insert({
            company_id: enrollment.company_id,
            training_enrollment_id: id,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          record = await trx('training_participation_records').where({ id: recordId }).first();
        }
        if (correction && input.version !== record.version)
          throw new ConflictError('STALE_VERSION', 'The participation record changed.');
        const prior = correction
          ? await trx('training_participation_versions')
              .where({
                training_participation_record_id: record.id,
                version_number: record.current_version_number,
              })
              .first()
          : null;
        const next = correction ? record.current_version_number + 1 : 1;
        if (prior)
          await trx('training_participation_versions')
            .where({ id: prior.id })
            .update({ history_status: 'superseded' });
        const [versionId] = await trx('training_participation_versions').insert({
          company_id: enrollment.company_id,
          training_participation_record_id: record.id,
          version_number: next,
          participation_status: input.participationStatus,
          comment: input.comment ?? null,
          reason: input.reason,
          supersedes_version_id: prior?.id ?? null,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('training_participation_records')
          .where({ id: record.id })
          .update({
            current_version_number: next,
            version: correction ? record.version + 1 : 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          actor,
          enrollment.company_id,
          correction ? 'training_participation.correct' : 'training_participation.record',
          record.id,
          correction ? 'training_participation.correct' : 'training_participation.record',
          ctx,
        );
        return { id: record.id, versionId, version: correction ? record.version + 1 : 1 };
      });
    },
    async recordCompletion(actor, c, id, input, correction, ctx) {
      return withTransaction(database, async (trx) => {
        const enrollment = await repository.lockEnrollment(id, trx);
        if (!enrollment || !repository.companyAllowed(c, enrollment.company_id)) throw missing();
        const participation = await trx('training_participation_records as r')
          .join('training_participation_versions as v', function () {
            this.on('v.training_participation_record_id', 'r.id').andOn(
              'v.version_number',
              'r.current_version_number',
            );
          })
          .where('r.training_enrollment_id', id)
          .first('v.participation_status');
        if (
          !participation ||
          ['not_recorded', 'no_show'].includes(participation.participation_status)
        )
          throw new ValidationError('Eligible participation must be recorded before completion.');
        const session = await trx('training_sessions as s')
          .join('training_session_versions as v', function () {
            this.on('v.training_session_id', 's.id').andOn(
              'v.version_number',
              's.current_version_number',
            );
          })
          .where('s.id', enrollment.training_session_id)
          .first('v.*');
        if (!session.scoring_enabled_snapshot && input.score != null)
          throw new ValidationError('This session does not accept scores.');
        if (session.scoring_enabled_snapshot) {
          const score = Number(input.score);
          if (
            !Number.isFinite(score) ||
            score < Number(session.minimum_score_snapshot) ||
            score > Number(session.maximum_score_snapshot)
          )
            throw new ValidationError('The score is outside the published range.');
          if (input.outcome === 'passed' && score < Number(session.passing_score_snapshot))
            throw new ValidationError('The selected outcome conflicts with the passing score.');
        }
        let record = await trx('training_completion_records')
          .where({ training_enrollment_id: id })
          .forUpdate()
          .first();
        if (record && !correction)
          throw new ConflictError('TRAINING_COMPLETION_EXISTS', 'Completion already exists.');
        if (!record) {
          const [recordId] = await trx('training_completion_records').insert({
            company_id: enrollment.company_id,
            training_enrollment_id: id,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          record = await trx('training_completion_records').where({ id: recordId }).first();
        }
        if (correction && input.version !== record.version)
          throw new ConflictError('STALE_VERSION', 'The completion record changed.');
        const prior = correction
          ? await trx('training_completion_versions')
              .where({
                training_completion_record_id: record.id,
                version_number: record.current_version_number,
              })
              .first()
          : null;
        const next = correction ? record.current_version_number + 1 : 1;
        if (prior)
          await trx('training_completion_versions')
            .where({ id: prior.id })
            .update({ history_status: 'superseded' });
        const [versionId] = await trx('training_completion_versions').insert({
          company_id: enrollment.company_id,
          training_completion_record_id: record.id,
          version_number: next,
          outcome: input.outcome,
          score: input.score ?? null,
          completion_date: input.completionDate,
          comment: input.comment ?? null,
          reason: input.reason,
          supersedes_version_id: prior?.id ?? null,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('training_completion_records')
          .where({ id: record.id })
          .update({
            current_version_number: next,
            version: correction ? record.version + 1 : 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          actor,
          enrollment.company_id,
          correction ? 'training_completion.correct' : 'training_completion.record',
          record.id,
          correction ? 'training_completion.correct' : 'training_completion.record',
          ctx,
        );
        return { id: record.id, versionId, version: correction ? record.version + 1 : 1 };
      });
    },
    async createEvidence(actor, c, enrollmentId, input, ctx) {
      return withTransaction(database, async (trx) => {
        const e = await repository.lockEnrollment(enrollmentId, trx);
        if (!e || !repository.companyAllowed(c, e.company_id)) throw missing();
        const completion = await trx('training_completion_records')
          .where({ training_enrollment_id: enrollmentId })
          .first();
        if (!completion) throw new ValidationError('Completion must be recorded first.');
        const prior = await trx('training_evidence_references')
          .where({ company_id: e.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (prior) return { id: prior.id, replayed: true };
        const [id] = await trx('training_evidence_references').insert({
          company_id: e.company_id,
          training_completion_record_id: completion.id,
          reference_type: input.referenceType,
          reference_value: input.referenceValue,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          e.company_id,
          'training_evidence.create_reference',
          id,
          'training_evidence.create_reference',
          ctx,
          { referenceType: input.referenceType },
        );
        return { id, replayed: false };
      });
    },
    async history(actor, c, id, permission, ctx) {
      const row = await repository.enrollmentScoped(id, c, permission);
      if (!row) throw missing();
      const history = await repository.history(id);
      const own = Number(row.user_id) === Number(actor.userId),
        sensitiveContext = await sensitive(actor),
        allowed =
          sensitiveContext &&
          (await repository.enrollmentScoped(row.id, sensitiveContext, 'training_sensitive.view'));
      if (own || allowed) {
        await audit(
          database,
          actor,
          row.company_id,
          'training_sensitive.view',
          row.id,
          allowed ? 'training_sensitive.view' : 'training_enrollment.view_own',
          ctx,
        );
        return history;
      }
      const omit = (item, fields) => {
        const projected = { ...item };
        for (const field of fields) delete projected[field];
        return projected;
      };
      return {
        ...history,
        versions: history.versions.map((item) => omit(item, ['request_narrative', 'reason'])),
        states: history.states.map((item) => omit(item, ['reason'])),
        decisions: history.decisions.map((item) => omit(item, ['reason'])),
        reassignments: history.reassignments.map((item) => omit(item, ['reason'])),
        participation: history.participation.map((item) => omit(item, ['comment', 'reason'])),
        completion: history.completion.map((item) => omit(item, ['score', 'comment', 'reason'])),
        evidence: [],
      };
    },
    async export(actor, c, input, ctx) {
      const rows = await repository.listEnrollments(c, 'training.export', {
        ...input,
        page: 1,
        pageSize: LIMITS.maximumExportRows,
      });
      const allowSensitive = Boolean(await sensitive(actor, 'training_sensitive.export'));
      await audit(
        database,
        actor,
        input.companyId,
        'training.export',
        input.companyId,
        'training.export',
        ctx,
        { rowCount: rows.length, sensitive: allowSensitive },
      );
      const header = [
        'session_code',
        'course_title',
        'employee_code',
        'employee_name',
        'branch_id',
        'department_id',
        'source',
        'status',
        'starts_at_utc',
        'ends_at_utc',
        ...(allowSensitive ? ['request_narrative'] : []),
      ];
      const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
      return [
        header.join(','),
        ...rows.map((r) =>
          header
            .map((h) =>
              esc(
                {
                  course_title: r.title_snapshot,
                  employee_code: r.employee_code_snapshot,
                  employee_name: r.employee_name_snapshot,
                  branch_id: r.branch_id_snapshot,
                  department_id: r.department_id_snapshot,
                }[h] ?? r[h],
              ),
            )
            .join(','),
        ),
      ].join('\n');
    },
  };
}
