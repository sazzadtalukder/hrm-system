import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import {
  createWorkflowNotification,
  notifyEmploymentUser,
} from '../notifications/workflowNotificationRepository.js';
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested onboarding record was not found.',
    statusCode: 404,
  });
export function createOnboardingService({ database: db, repository }) {
  const own = (c, id) => {
    if (!repository.allowed(c, id)) throw missing();
  };
  const audit = (trx, a, companyId, action, id, p, ctx) =>
    insertAuditEvent(trx, {
      actorUserId: a.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: 'onboarding',
      recordId: id,
      permissionCode: p,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  const list = async (c, i, p, table) => {
    own(c, i.companyId);
    const q = repository.scoped(
      db(`${table} as record`).where('record.company_id', i.companyId),
      c,
      p,
    );
    if (i.status) q.where('record.status', i.status);
    return q
      .orderBy('record.id', 'desc')
      .limit(i.pageSize)
      .offset((i.page - 1) * i.pageSize);
  };
  const get = async (c, id, p, table) => {
    const row = await repository
      .scoped(db(`${table} as record`).where('record.id', id), c, p)
      .first();
    if (!row) throw missing();
    if (table === 'onboarding_cases')
      return {
        ...row,
        tasks: await db('onboarding_case_tasks').where({ onboarding_case_id: id }).orderBy('id'),
        history: await db('onboarding_case_state_events')
          .where({ onboarding_case_id: id })
          .orderBy('id'),
        taskHistory: await db('onboarding_case_task_state_events')
          .where({ onboarding_case_id: id })
          .orderBy('id'),
        documents: await db('onboarding_document_requirements as requirement')
          .join('onboarding_case_tasks as task', 'task.id', 'requirement.onboarding_case_task_id')
          .leftJoin(
            'onboarding_document_evidence as evidence',
            'evidence.onboarding_document_requirement_id',
            'requirement.id',
          )
          .where('task.onboarding_case_id', id)
          .select(
            'requirement.*',
            'task.title_snapshot as task_title_snapshot',
            'evidence.id as evidence_id',
            'evidence.document_id as evidence_document_id',
            'evidence.document_version_id as evidence_document_version_id',
            'evidence.external_reference as evidence_external_reference',
          )
          .orderBy('requirement.id'),
        resourceRequests: await db('onboarding_resource_requests as request')
          .join('onboarding_case_tasks as task', 'task.id', 'request.onboarding_case_task_id')
          .where('task.onboarding_case_id', id)
          .select('request.*', 'task.title_snapshot as task_title_snapshot')
          .orderBy('request.id'),
        readiness: await db('onboarding_readiness_checks')
          .where({ onboarding_case_id: id })
          .orderBy('id'),
      };
    return row;
  };
  return {
    list,
    get,
    async createTemplate(a, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        const replay = await trx('onboarding_templates')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const [id] = await trx('onboarding_templates').insert({
          company_id: i.companyId,
          code: i.code,
          name: i.name,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        const [versionId] = await trx('onboarding_template_versions').insert({
          company_id: i.companyId,
          onboarding_template_id: id,
          version_number: 1,
          description: i.description ?? null,
          idempotency_key: `${i.idempotencyKey}:v1`,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          i.companyId,
          'onboarding_template.create',
          id,
          'onboarding_template.create',
          ctx,
        );
        return { id, versionId };
      });
    },
    async addTemplateTask(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const template = await repository.lock('onboarding_templates', id, trx);
        if (!template || !repository.allowed(c, template.company_id)) throw missing();
        if (template.status !== 'draft')
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'Only draft templates can be changed.');
        const version = await trx('onboarding_template_versions')
          .where({ onboarding_template_id: id, history_status: 'current' })
          .first();
        const [taskId] = await trx('onboarding_template_tasks').insert({
          company_id: template.company_id,
          onboarding_template_version_id: version.id,
          task_code: i.taskCode,
          title: i.title,
          task_type: i.taskType,
          is_mandatory: i.isMandatory,
          sequence_number: i.sequenceNumber,
          due_offset_days: i.dueOffsetDays ?? null,
          instructions: i.instructions ?? null,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          template.company_id,
          'onboarding_template.task_create',
          taskId,
          'onboarding_template.update',
          ctx,
        );
        return { id: taskId };
      });
    },
    async transitionTemplate(a, c, id, i, ctx, to) {
      return withTransaction(db, async (trx) => {
        const row = await repository.lock('onboarding_templates', id, trx);
        if (!row || !repository.allowed(c, row.company_id)) throw missing();
        const allowed =
          { draft: ['active', 'inactive'], active: ['inactive'], inactive: ['active'] }[
            row.status
          ] ?? [];
        if (!allowed.includes(to))
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The requested transition is not allowed.',
          );
        if (row.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The template changed.');
        await trx('onboarding_templates')
          .where({ id })
          .update({
            status: to,
            workflow_version: row.workflow_version + 1,
            version: row.version + 1,
            updated_by: a.userId,
          });
        await audit(
          trx,
          a,
          row.company_id,
          `onboarding_template.${to}`,
          id,
          'onboarding_template.update',
          ctx,
        );
        return { id, workflowVersion: row.workflow_version + 1 };
      });
    },
    async createCase(a, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        const replay = await trx('onboarding_cases')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const conversion = await trx('recruitment_hire_conversions')
          .where({
            id: i.recruitmentHireConversionId,
            company_id: i.companyId,
            status: 'completed',
          })
          .first();
        const template = await trx('onboarding_template_versions as version')
          .join('onboarding_templates as template', 'template.id', 'version.onboarding_template_id')
          .where({
            'version.id': i.onboardingTemplateVersionId,
            'version.company_id': i.companyId,
            'template.status': 'active',
          })
          .first('version.*');
        if (!conversion || !template)
          throw new ValidationError('The conversion or active template is invalid.');
        const employment = await trx('employments')
          .where({ id: conversion.employment_id, company_id: i.companyId })
          .first();
        const assignment = await trx('employee_assignments as assignment')
          .leftJoin(
            'employments as manager_employment',
            'manager_employment.id',
            'assignment.manager_employment_id',
          )
          .leftJoin(
            'employees as manager_employee',
            'manager_employee.id',
            'manager_employment.employee_id',
          )
          .where({
            'assignment.employment_id': employment.id,
            'assignment.history_status': 'current',
          })
          .first('assignment.*', 'manager_employee.user_id as manager_user_id');
        const [id] = await trx('onboarding_cases').insert({
          company_id: i.companyId,
          recruitment_hire_conversion_id: conversion.id,
          employee_id: conversion.employee_id,
          employment_id: conversion.employment_id,
          onboarding_template_version_id: template.id,
          manager_user_id_snapshot: assignment?.manager_user_id ?? null,
          branch_id_snapshot: assignment?.branch_id ?? null,
          department_id_snapshot: assignment?.department_id ?? null,
          joining_date_snapshot: employment.joining_date,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        const tasks = await trx('onboarding_template_tasks')
          .where({ onboarding_template_version_id: template.id })
          .orderBy('sequence_number');
        for (const task of tasks)
          await trx('onboarding_case_tasks').insert({
            company_id: i.companyId,
            onboarding_case_id: id,
            onboarding_template_task_id: task.id,
            task_code_snapshot: task.task_code,
            title_snapshot: task.title,
            task_type: task.task_type,
            is_mandatory: task.is_mandatory,
            due_date:
              task.due_offset_days == null
                ? null
                : trx.raw('DATE_ADD(?, INTERVAL ? DAY)', [
                    employment.joining_date,
                    task.due_offset_days,
                  ]),
            created_by: a.userId,
            updated_by: a.userId,
          });
        await trx('onboarding_case_versions').insert({
          company_id: i.companyId,
          onboarding_case_id: id,
          version_number: 1,
          status_snapshot: 'pre_joining',
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          i.companyId,
          'onboarding_case.create',
          id,
          'onboarding_case.create',
          ctx,
        );
        await notifyEmploymentUser(
          trx,
          {
            companyId: i.companyId,
            type: 'onboarding.case_created',
            title: 'Onboarding case created',
            message: 'Your onboarding checklist is ready.',
            referenceType: 'onboarding_case',
            referenceId: id,
            idempotencyKey: `onboarding:${id}:created`,
            actorUserId: a.userId,
          },
          conversion.employment_id,
        );
        if (assignment?.manager_user_id)
          await createWorkflowNotification(trx, {
            companyId: i.companyId,
            userId: assignment.manager_user_id,
            type: 'onboarding.manager_worklist',
            title: 'New employee onboarding',
            message: 'A new onboarding case is available for your direct report.',
            referenceType: 'onboarding_case',
            referenceId: id,
            idempotencyKey: `onboarding:${id}:manager`,
            actorUserId: a.userId,
          });
        return { id, replayed: false };
      });
    },
    async caseTransition(a, c, id, i, ctx, to) {
      return withTransaction(db, async (trx) => {
        const row = await repository.lock('onboarding_cases', id, trx);
        if (!row || !repository.allowed(c, row.company_id)) throw missing();
        const allowed =
          {
            pre_joining: ['in_progress', 'cancelled'],
            in_progress: ['joined', 'cancelled'],
            joined: ['completed', 'cancelled'],
          }[row.status] ?? [];
        if (!allowed.includes(to))
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The requested transition is not allowed.',
          );
        if (row.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The onboarding case changed.');
        if (to === 'completed') {
          const outstanding = await trx('onboarding_case_tasks')
            .where({ onboarding_case_id: id, is_mandatory: 1 })
            .whereNotIn('status', ['completed', 'waived'])
            .first();
          if (outstanding || !row.joining_confirmed_at)
            throw new ValidationError(
              'Mandatory onboarding requirements and joining confirmation are required.',
            );
        }
        await trx('onboarding_cases')
          .where({ id })
          .update({
            status: to,
            joining_confirmed_at: to === 'joined' ? trx.fn.now() : row.joining_confirmed_at,
            workflow_version: row.workflow_version + 1,
            version: row.version + 1,
            active_slot: ['completed', 'cancelled'].includes(to) ? null : row.active_slot,
            updated_by: a.userId,
          });
        await trx('onboarding_case_state_events').insert({
          company_id: row.company_id,
          onboarding_case_id: id,
          from_status: row.status,
          to_status: to,
          workflow_version: row.workflow_version + 1,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          row.company_id,
          `onboarding_case.${to}`,
          id,
          'onboarding_case.update',
          ctx,
        );
        await notifyEmploymentUser(
          trx,
          {
            companyId: row.company_id,
            type: 'onboarding.status_updated',
            title: 'Onboarding status updated',
            message: `Your onboarding case is now ${to.replaceAll('_', ' ')}.`,
            referenceType: 'onboarding_case',
            referenceId: id,
            idempotencyKey: `onboarding:${id}:${to}:${row.workflow_version + 1}`,
            actorUserId: a.userId,
          },
          row.employment_id,
        );
        return { id, workflowVersion: row.workflow_version + 1 };
      });
    },
    async taskAction(a, c, id, i, ctx, to) {
      return withTransaction(db, async (trx) => {
        const task = await repository.lock('onboarding_case_tasks', id, trx);
        if (!task) throw missing();
        const parent = await trx('onboarding_cases').where({ id: task.onboarding_case_id }).first();
        const accessible = parent
          ? await repository
              .scoped(
                trx('onboarding_cases as record').where('record.id', parent.id),
                c,
                c.permission,
              )
              .first()
          : null;
        if (!parent || !accessible) throw missing();
        if (task.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The task changed.');
        if (!['pending', 'in_progress'].includes(task.status))
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'The task is already resolved.');
        if (to === 'waived' && !i.reason) throw new ValidationError('A waiver reason is required.');
        await trx('onboarding_case_tasks')
          .where({ id })
          .update({
            status: to,
            completion_note: i.note ?? null,
            waiver_reason: to === 'waived' ? i.reason : null,
            workflow_version: task.workflow_version + 1,
            version: task.version + 1,
            updated_by: a.userId,
          });
        await trx('onboarding_case_task_state_events').insert({
          company_id: parent.company_id,
          onboarding_case_id: parent.id,
          onboarding_case_task_id: task.id,
          from_status: task.status,
          to_status: to,
          workflow_version: task.workflow_version + 1,
          reason: to === 'waived' ? i.reason : null,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          parent.company_id,
          `onboarding_task.${to}`,
          id,
          to === 'waived' ? 'onboarding_task.waive' : 'onboarding_task.update',
          ctx,
        );
        return { id };
      });
    },
    async caseChildren(c, caseId, permission, table) {
      const parent = await get(c, caseId, permission, 'onboarding_cases');
      if (
        [
          'onboarding_readiness_checks',
          'onboarding_case_state_events',
          'onboarding_case_task_state_events',
          'onboarding_case_tasks',
        ].includes(table)
      )
        return db(table).where({ onboarding_case_id: parent.id }).orderBy('id');
      return db(`${table} as child`)
        .join('onboarding_case_tasks as task', 'task.id', 'child.onboarding_case_task_id')
        .where('task.onboarding_case_id', parent.id)
        .select('child.*')
        .orderBy('child.id');
    },
    async addDocument(a, c, caseId, i, ctx) {
      return withTransaction(db, async (trx) => {
        const parent = await repository.lock('onboarding_cases', caseId, trx);
        const task = await trx('onboarding_case_tasks')
          .where({ id: i.onboardingCaseTaskId, onboarding_case_id: caseId })
          .first();
        if (
          !parent ||
          !task ||
          !repository.allowed(c, parent.company_id) ||
          task.task_type !== 'document'
        )
          throw missing();
        const [id] = await trx('onboarding_document_requirements').insert({
          company_id: parent.company_id,
          onboarding_case_task_id: task.id,
          document_type_code: i.documentTypeCode,
          status:
            i.documentId || i.documentVersionId || i.externalReference ? 'verified' : 'pending',
          reason: i.reason ?? null,
          created_by: a.userId,
          updated_by: a.userId,
        });
        if (i.documentId || i.documentVersionId || i.externalReference)
          await trx('onboarding_document_evidence').insert({
            company_id: parent.company_id,
            onboarding_document_requirement_id: id,
            document_id: i.documentId ?? null,
            document_version_id: i.documentVersionId ?? null,
            external_reference: i.externalReference ?? null,
            verification_note: i.reason ?? null,
            created_by: a.userId,
            updated_by: a.userId,
          });
        await audit(
          trx,
          a,
          parent.company_id,
          'onboarding_document.require',
          id,
          'onboarding_case.update',
          ctx,
        );
        return { id };
      });
    },
    async addResource(a, c, caseId, i, ctx) {
      return withTransaction(db, async (trx) => {
        const parent = await repository.lock('onboarding_cases', caseId, trx);
        const task = await trx('onboarding_case_tasks')
          .where({ id: i.onboardingCaseTaskId, onboarding_case_id: caseId })
          .first();
        if (
          !parent ||
          !task ||
          !repository.allowed(c, parent.company_id) ||
          !['equipment', 'access'].includes(task.task_type)
        )
          throw missing();
        const [id] = await trx('onboarding_resource_requests').insert({
          company_id: parent.company_id,
          onboarding_case_task_id: task.id,
          request_type: i.requestType,
          resource_name: i.resourceName,
          reason: i.reason ?? null,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          parent.company_id,
          'onboarding_resource_request.create',
          id,
          'onboarding_case.update',
          ctx,
        );
        return { id };
      });
    },
    async readiness(a, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const parent = await repository.lock('onboarding_cases', id, trx);
        if (!parent || !repository.allowed(c, parent.company_id)) throw missing();
        const replay = await trx('onboarding_readiness_checks')
          .where({ company_id: parent.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const snapshot = JSON.stringify({
          employmentId: parent.employment_id,
          assessedOn: i.assessedOn,
        });
        const [checkId] = await trx('onboarding_readiness_checks').insert({
          company_id: parent.company_id,
          onboarding_case_id: id,
          readiness_type: i.readinessType,
          status: i.status,
          assessed_on: i.assessedOn,
          reason: i.reason,
          snapshot_json: snapshot,
          idempotency_key: i.idempotencyKey,
          created_by: a.userId,
          updated_by: a.userId,
        });
        await audit(
          trx,
          a,
          parent.company_id,
          'onboarding_readiness.confirm',
          checkId,
          'onboarding_readiness.confirm',
          ctx,
        );
        await notifyEmploymentUser(
          trx,
          {
            companyId: parent.company_id,
            type: 'onboarding.readiness_updated',
            title: 'Onboarding readiness updated',
            message: `${i.readinessType === 'attendance' ? 'Attendance' : 'Payroll'} readiness has been recorded.`,
            referenceType: 'onboarding_case',
            referenceId: id,
            idempotencyKey: `onboarding:${id}:readiness:${i.readinessType}:${checkId}`,
            actorUserId: a.userId,
          },
          parent.employment_id,
        );
        return { id: checkId, replayed: false };
      });
    },
  };
}
