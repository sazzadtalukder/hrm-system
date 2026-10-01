import {
  ApplicationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import {
  createWorkflowNotification,
  notifyPermissionHolders,
  notifyUsers,
} from '../notifications/workflowNotificationRepository.js';
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested recruitment record was not found.',
    statusCode: 404,
  });
const maps = {
  manpower: {
    table: 'manpower_plans',
    version: 'manpower_plan_versions',
    states: ['draft', 'submitted', 'approved', 'rejected', 'closed', 'cancelled'],
    transitions: {
      draft: ['submitted', 'cancelled'],
      submitted: ['approved', 'rejected'],
      approved: ['closed', 'cancelled'],
    },
  },
  requisition: {
    table: 'job_requisitions',
    version: 'job_requisition_versions',
    states: ['draft', 'submitted', 'approved', 'rejected', 'open', 'filled', 'closed', 'cancelled'],
    transitions: {
      draft: ['submitted', 'cancelled'],
      submitted: ['approved', 'rejected'],
      approved: ['open'],
      open: ['filled', 'closed', 'cancelled'],
    },
  },
  posting: {
    table: 'job_postings',
    version: 'job_posting_versions',
    states: ['draft', 'published', 'closed', 'withdrawn'],
    transitions: { draft: ['published', 'withdrawn'], published: ['closed', 'withdrawn'] },
  },
  offer: {
    table: 'recruitment_offers',
    version: 'recruitment_offer_versions',
    states: [
      'draft',
      'submitted',
      'approved',
      'rejected',
      'issued',
      'accepted',
      'declined',
      'expired',
      'withdrawn',
      'converted',
    ],
    transitions: {
      draft: ['submitted', 'withdrawn'],
      submitted: ['approved', 'rejected'],
      approved: ['issued'],
      issued: ['accepted', 'declined', 'expired', 'withdrawn'],
      accepted: ['converted'],
    },
  },
};
export function createRecruitmentService({
  database: db,
  repository,
  employeeService,
  authorizationService,
}) {
  const own = (c, id) => {
    if (!repository.allowed(c, id)) throw missing();
  };
  const audit = (trx, actor, companyId, action, id, permission, ctx) =>
    insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: 'recruitment',
      recordId: id,
      permissionCode: permission,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  const list = async (c, input, permission, kind) => {
    own(c, input.companyId);
    const m = maps[kind] ?? { table: kind };
    const q = repository.scoped(
      db(`${m.table} as record`).where('record.company_id', input.companyId),
      c,
      permission,
      'record',
      m.table,
    );
    if (input.status) q.where('record.status', input.status);
    if (input.search)
      q.whereLike('record.code' in {} ? 'record.code' : 'record.id', `%${input.search}%`);
    return q
      .orderBy('record.id', 'desc')
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
  };
  const dashboard = async (actor, input) => {
    const permissions = new Map();
    for (const permission of [
      'job_requisition.view',
      'job_posting.view',
      'candidate.view',
      'recruitment_application.view',
      'recruitment_interview.view',
      'recruitment_offer.view',
    ]) {
      try {
        const context = await authorizationService.requirePermission(actor, permission);
        if (repository.allowed(context, input.companyId)) permissions.set(permission, context);
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
    }
    if (!permissions.size) throw new AuthorizationError();
    const count = async (permission, table, statuses = null) => {
      const context = permissions.get(permission);
      if (!context) return null;
      const query = repository.scoped(
        db(`${table} as record`).where('record.company_id', input.companyId),
        context,
        permission,
        'record',
        table,
      );
      if (statuses) query.whereIn('record.status', statuses);
      const result = await query.countDistinct({ count: 'record.id' }).first();
      return Number(result.count);
    };
    const applications = permissions.get('recruitment_application.view');
    let pipeline = null;
    if (applications) {
      const rows = await repository
        .scoped(
          db('candidate_applications as record').where('record.company_id', input.companyId),
          applications,
          'recruitment_application.view',
          'record',
          'candidate_applications',
        )
        .select('record.status')
        .count({ count: 'record.id' })
        .groupBy('record.status')
        .orderBy('record.status');
      pipeline = rows.map((row) => ({ status: row.status, count: Number(row.count) }));
    }
    return {
      metrics: {
        openRequisitions: await count('job_requisition.view', 'job_requisitions', ['open']),
        pendingApprovalRequisitions: await count('job_requisition.view', 'job_requisitions', [
          'submitted',
        ]),
        activeJobPostings: await count('job_posting.view', 'job_postings', ['published']),
        candidates: await count('candidate.view', 'recruitment_candidates'),
        applications: await count('recruitment_application.view', 'candidate_applications'),
        interviews: await count('recruitment_interview.view', 'recruitment_interviews'),
        offers: await count('recruitment_offer.view', 'recruitment_offers'),
        acceptedOffersAwaitingConversion: await count(
          'recruitment_offer.view',
          'recruitment_offers',
          ['accepted'],
        ),
      },
      pipeline,
    };
  };
  const detail = async (c, id, permission, kind, sensitive = false) => {
    const m = maps[kind] ?? { table: kind };
    const row = await repository
      .scoped(db(`${m.table} as record`).where('record.id', id), c, permission, 'record', m.table)
      .first();
    if (!row) throw missing();
    const result = {
      ...row,
      history:
        m.table === 'candidate_applications'
          ? await repository.history('application_screenings', 'candidate_application_id', id)
          : m.table === 'recruitment_candidates'
            ? await repository.history('recruitment_candidate_versions', 'candidate_id', id)
            : m.version
              ? await repository.history(m.version, `${m.table.slice(0, -1)}_id`, id)
              : [],
    };
    if (kind === 'recruitment_candidates' && !sensitive)
      result.history = result.history.map((version) => {
        const projection = { ...version };
        delete projection.email;
        delete projection.phone;
        delete projection.profile_summary;
        return projection;
      });
    return result;
  };
  const transition = async (actor, c, id, input, ctx, permission, kind, to) =>
    withTransaction(db, async (trx) => {
      const m = maps[kind],
        row = await repository.lock(m.table, id, trx);
      if (!row || !(await repository.recordAllowed(c, permission, m.table, id, trx)))
        throw missing();
      const replay = await trx(`${m.table}_state_events`)
        .where({ company_id: row.company_id, idempotency_key: input.idempotencyKey })
        .first();
      if (replay) return { id, replayed: true, workflowVersion: row.workflow_version };
      if (row.workflow_version !== input.workflowVersion)
        throw new ConflictError('STALE_WORKFLOW_VERSION', 'The record changed.');
      if (!(m.transitions[row.status] ?? []).includes(to))
        throw new ConflictError(
          'INVALID_WORKFLOW_STATE',
          'The requested transition is not allowed.',
        );
      if (['approved'].includes(to) && Number(row.created_by) === Number(actor.userId))
        throw new ConflictError(
          'MAKER_CHECKER_VIOLATION',
          'The requester cannot approve this record.',
        );
      await trx(m.table)
        .where({ id })
        .update({
          status: to,
          workflow_version: row.workflow_version + 1,
          version: row.version + 1,
          updated_by: actor.userId,
          updated_at: trx.fn.now(),
        });
      if (kind === 'offer' && ['issued', 'accepted', 'converted'].includes(to)) {
        const applicationStatus = to === 'issued' ? 'offered' : to;
        await trx('candidate_applications').where({ id: row.candidate_application_id }).update({
          status: applicationStatus,
          updated_by: actor.userId,
          updated_at: trx.fn.now(),
        });
      }
      await trx(`${m.table}_state_events`).insert({
        company_id: row.company_id,
        [`${m.table.slice(0, -1)}_id`]: id,
        from_status: row.status,
        to_status: to,
        workflow_version: row.workflow_version + 1,
        reason: input.reason,
        idempotency_key: input.idempotencyKey,
        created_by: actor.userId,
        updated_by: actor.userId,
      });
      await audit(trx, actor, row.company_id, `${kind}.${to}`, id, permission, ctx);
      const referenceType = m.table.slice(0, -1);
      if (to === 'submitted')
        await notifyPermissionHolders(
          trx,
          {
            companyId: row.company_id,
            type: `recruitment.${kind}_approval_required`,
            title: `${kind === 'offer' ? 'Offer' : kind === 'requisition' ? 'Job requisition' : 'Manpower plan'} awaiting approval`,
            message: 'A recruitment workflow item requires an approval decision.',
            referenceType,
            referenceId: id,
            idempotencyKey: `recruitment:${kind}:${id}:submitted:${row.workflow_version + 1}`,
            actorUserId: actor.userId,
          },
          `${kind === 'requisition' ? 'job_requisition' : kind === 'offer' ? 'recruitment_offer' : 'manpower_plan'}.approve`,
          { branchId: row.branch_id, departmentId: row.department_id },
        );
      if (['approved', 'rejected'].includes(to))
        await createWorkflowNotification(trx, {
          companyId: row.company_id,
          userId: row.created_by,
          type: `recruitment.${kind}_decision`,
          title: 'Recruitment workflow updated',
          message: `Your ${kind.replaceAll('_', ' ')} was ${to}.`,
          referenceType,
          referenceId: id,
          idempotencyKey: `recruitment:${kind}:${id}:${to}:${row.workflow_version + 1}`,
          actorUserId: actor.userId,
        });
      if (kind === 'offer' && to === 'accepted') {
        const application = await trx('candidate_applications')
          .where({ id: row.candidate_application_id })
          .first('job_requisition_id');
        const requisition = application
          ? await trx('job_requisitions')
              .where({ id: application.job_requisition_id })
              .first('created_by', 'hiring_manager_user_id')
          : null;
        await notifyUsers(
          trx,
          {
            companyId: row.company_id,
            type: 'recruitment.offer_accepted',
            title: 'Offer accepted',
            message: 'An accepted offer is ready for employee conversion.',
            referenceType: 'recruitment_offer',
            referenceId: id,
            idempotencyKey: `recruitment:offer:${id}:accepted:${row.workflow_version + 1}`,
            actorUserId: actor.userId,
          },
          [row.created_by, requisition?.created_by, requisition?.hiring_manager_user_id],
        );
      }
      return { id, workflowVersion: row.workflow_version + 1, replayed: false };
    });
  return {
    dashboard,
    list,
    detail,
    async createManpower(actor, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        const replay = await trx('manpower_plans')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const [id] = await trx('manpower_plans').insert({
          company_id: i.companyId,
          code: i.code,
          name: i.name,
          period_start: i.periodStart,
          period_end: i.periodEnd,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('manpower_plan_versions').insert({
          company_id: i.companyId,
          manpower_plan_id: id,
          version_number: 1,
          notes: i.notes ?? null,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          i.companyId,
          'manpower_plan.create',
          id,
          'manpower_plan.create',
          ctx,
        );
        return { id, replayed: false };
      });
    },
    async createRequisition(actor, c, i, ctx) {
      own(c, i.companyId);
      if (!repository.organizationAllowed(c, i.companyId, i.branchId, i.departmentId))
        throw missing();
      return withTransaction(db, async (trx) => {
        const replay = await trx('job_requisitions')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const [id] = await trx('job_requisitions').insert({
          company_id: i.companyId,
          code: i.code,
          manpower_plan_line_id: i.manpowerPlanLineId ?? null,
          title: i.title,
          branch_id: i.branchId,
          department_id: i.departmentId,
          designation_id: i.designationId,
          hiring_manager_user_id: i.hiringManagerUserId ?? null,
          requested_headcount: i.requestedHeadcount,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('job_requisition_versions').insert({
          company_id: i.companyId,
          job_requisition_id: id,
          version_number: 1,
          reason: i.reason,
          description: i.description ?? null,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          i.companyId,
          'job_requisition.create',
          id,
          'job_requisition.create',
          ctx,
        );
        return { id, replayed: false };
      });
    },
    async createPosting(actor, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        const req = await trx('job_requisitions')
          .where({ id: i.jobRequisitionId, company_id: i.companyId })
          .first();
        if (
          !req ||
          !(await repository.recordAllowed(
            c,
            'job_posting.create',
            'job_requisitions',
            req.id,
            trx,
          ))
        )
          throw new ValidationError('The requisition is invalid.');
        const [id] = await trx('job_postings').insert({
          company_id: i.companyId,
          job_requisition_id: i.jobRequisitionId,
          code: i.code,
          title: i.title,
          closes_on: i.closesOn ?? null,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('job_posting_versions').insert({
          company_id: i.companyId,
          job_posting_id: id,
          version_number: 1,
          description: i.description ?? null,
          channel: i.channel ?? null,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(trx, actor, i.companyId, 'job_posting.create', id, 'job_posting.create', ctx);
        return { id };
      });
    },
    async createCandidate(actor, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        const replay = await trx('recruitment_candidates')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const [id] = await trx('recruitment_candidates').insert({
          company_id: i.companyId,
          candidate_number: i.candidateNumber,
          normalized_email: i.email?.toLowerCase() ?? null,
          normalized_phone: i.phone ?? null,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('recruitment_candidate_versions').insert({
          company_id: i.companyId,
          candidate_id: id,
          version_number: 1,
          first_name: i.firstName,
          last_name: i.lastName,
          email: i.email ?? null,
          phone: i.phone ?? null,
          profile_summary: i.profileSummary ?? null,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(trx, actor, i.companyId, 'candidate.create', id, 'candidate.create', ctx);
        return { id, replayed: false };
      });
    },
    async createApplication(actor, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        for (const [table, key] of [
          ['recruitment_candidates', 'candidateId'],
          ['job_requisitions', 'jobRequisitionId'],
          ['job_postings', 'jobPostingId'],
        ])
          if (i[key] && !(await trx(table).where({ id: i[key], company_id: i.companyId }).first()))
            throw new ValidationError('A referenced recruitment record is invalid.');
        if (
          !(await repository.recordAllowed(
            c,
            'recruitment_application.create',
            'job_requisitions',
            i.jobRequisitionId,
            trx,
          ))
        )
          throw new ValidationError('A referenced recruitment record is invalid.');
        const replay = await trx('candidate_applications')
          .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const [id] = await trx('candidate_applications').insert({
          company_id: i.companyId,
          candidate_id: i.candidateId,
          job_requisition_id: i.jobRequisitionId,
          job_posting_id: i.jobPostingId ?? null,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          i.companyId,
          'recruitment_application.create',
          id,
          'recruitment_application.create',
          ctx,
        );
        return { id, replayed: false };
      });
    },
    transition,
    async screen(actor, c, id, i, ctx) {
      return withTransaction(db, async (trx) => {
        const row = await repository.lock('candidate_applications', id, trx);
        if (
          !row ||
          !(await repository.recordAllowed(
            c,
            'recruitment_application.screen',
            'candidate_applications',
            id,
            trx,
          ))
        )
          throw missing();
        if (row.workflow_version !== i.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The application changed.');
        const replay = await trx('application_screenings')
          .where({ company_id: row.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) return { id, replayed: true };
        const status =
          i.outcome === 'shortlisted'
            ? 'shortlisted'
            : i.outcome === 'rejected'
              ? 'rejected'
              : 'screening';
        await trx('candidate_applications')
          .where({ id })
          .update({
            status,
            workflow_version: row.workflow_version + 1,
            version: row.version + 1,
            updated_by: actor.userId,
          });
        await trx('application_screenings').insert({
          company_id: row.company_id,
          candidate_application_id: id,
          outcome: i.outcome,
          reason: i.reason,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          row.company_id,
          'recruitment_application.screen',
          id,
          'recruitment_application.screen',
          ctx,
        );
        return { id, workflowVersion: row.workflow_version + 1 };
      });
    },
    async createInterview(actor, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        if (
          !(await repository.recordAllowed(
            c,
            'recruitment_interview.create',
            'candidate_applications',
            i.candidateApplicationId,
            trx,
          ))
        )
          throw new ValidationError('The application is invalid.');
        const [id] = await trx('recruitment_interviews').insert({
          company_id: i.companyId,
          candidate_application_id: i.candidateApplicationId,
          scheduled_at: i.scheduledAt,
          duration_minutes: i.durationMinutes,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        for (const userId of i.participantUserIds)
          await trx('interview_participants').insert({
            company_id: i.companyId,
            recruitment_interview_id: id,
            user_id: userId,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
        await audit(
          trx,
          actor,
          i.companyId,
          'recruitment_interview.create',
          id,
          'recruitment_interview.create',
          ctx,
        );
        await notifyUsers(
          trx,
          {
            companyId: i.companyId,
            type: 'recruitment.interview_assigned',
            title: 'Recruitment interview assigned',
            message: 'You have been added as a participant to a recruitment interview.',
            referenceType: 'recruitment_interview',
            referenceId: id,
            idempotencyKey: `recruitment:interview:${id}:created`,
            actorUserId: actor.userId,
          },
          i.participantUserIds,
        );
        return { id };
      });
    },
    async createAssessment(actor, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        if (
          !(await repository.recordAllowed(
            c,
            'recruitment_assessment.create',
            'candidate_applications',
            i.candidateApplicationId,
            trx,
          ))
        )
          throw new ValidationError('The application is invalid.');
        const [id] = await trx('recruitment_assessments').insert({
          company_id: i.companyId,
          candidate_application_id: i.candidateApplicationId,
          assessment_type: i.assessmentType,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          i.companyId,
          'recruitment_assessment.create',
          id,
          'recruitment_assessment.create',
          ctx,
        );
        return { id };
      });
    },
    async createOffer(actor, c, i, ctx) {
      own(c, i.companyId);
      return withTransaction(db, async (trx) => {
        const app = await trx('candidate_applications')
          .where({ id: i.candidateApplicationId, company_id: i.companyId })
          .first();
        if (
          !app ||
          !(await repository.recordAllowed(
            c,
            'recruitment_offer.create',
            'candidate_applications',
            app.id,
            trx,
          )) ||
          !repository.organizationAllowed(c, i.companyId, i.branchId, i.departmentId)
        )
          throw new ValidationError('The application is invalid.');
        const [id] = await trx('recruitment_offers').insert({
          company_id: i.companyId,
          candidate_application_id: i.candidateApplicationId,
          offer_number: i.offerNumber,
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('recruitment_offer_versions').insert({
          company_id: i.companyId,
          recruitment_offer_id: id,
          version_number: 1,
          employment_type: i.employmentType,
          proposed_joining_date: i.proposedJoiningDate,
          monthly_amount: i.monthlyAmount ?? null,
          currency_code: i.currencyCode,
          branch_id: i.branchId,
          department_id: i.departmentId,
          designation_id: i.designationId,
          manager_employment_id: i.managerEmploymentId ?? null,
          terms: i.terms ?? null,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          i.companyId,
          'recruitment_offer.create',
          id,
          'recruitment_offer.create',
          ctx,
        );
        return { id };
      });
    },
    async convert(actor, c, id, i, ctx) {
      // Conversion is deliberately dual-authorized: recruitment authority cannot
      // become an alternative route around the Phase 3 employee.create boundary.
      const employeeContext = await authorizationService.requirePermission(
        actor,
        'employee.create',
      );
      return withTransaction(db, async (trx) => {
        const offer = await repository.lock('recruitment_offers', id, trx);
        if (
          !offer ||
          !(await repository.recordAllowed(
            c,
            'recruitment_hire.convert',
            'recruitment_offers',
            id,
            trx,
          ))
        )
          throw missing();
        const replay = await trx('recruitment_hire_conversions')
          .where({ company_id: offer.company_id, idempotency_key: i.idempotencyKey })
          .first();
        if (replay) {
          if (replay.recruitment_offer_id !== id)
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key was used for a different conversion.',
            );
          return {
            employeeId: replay.employee_id,
            employmentId: replay.employment_id,
            replayed: true,
          };
        }
        if (offer.status !== 'accepted' || offer.workflow_version !== i.workflowVersion)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'Only the current accepted offer can be converted.',
          );
        const app = await trx('candidate_applications')
          .where({ id: offer.candidate_application_id })
          .first();
        const req = await trx('job_requisitions')
          .where({ id: app.job_requisition_id })
          .forUpdate()
          .first();
        if (req.filled_headcount >= req.requested_headcount)
          throw new ConflictError(
            'HIRING_CAPACITY_EXHAUSTED',
            'The requisition has no remaining hiring capacity.',
          );
        const terms = await trx('recruitment_offer_versions')
          .where({ recruitment_offer_id: id, history_status: 'current' })
          .first();
        const employee = await employeeService.create(
          actor,
          employeeContext,
          {
            companyId: offer.company_id,
            firstName: i.firstName,
            middleName: i.middleName ?? null,
            lastName: i.lastName,
            preferredName: i.preferredName ?? null,
            employeeCode: i.employeeCode,
            employmentType: terms.employment_type,
            joiningDate: terms.proposed_joining_date,
            confirmationDate: null,
            initialStatus: i.initialStatus,
            statusReason: i.statusReason,
            assignment: {
              branchId: terms.branch_id,
              departmentId: terms.department_id,
              designationId: terms.designation_id,
              gradeId: i.gradeId ?? null,
              costCenterId: i.costCenterId ?? null,
              workCalendarId: i.workCalendarId ?? null,
              managerEmploymentId: terms.manager_employment_id,
              effectiveStart: terms.proposed_joining_date,
              effectiveEnd: null,
              reason: 'Recruitment conversion',
            },
          },
          ctx,
          trx,
        );
        const [conversionId] = await trx('recruitment_hire_conversions').insert({
          company_id: offer.company_id,
          recruitment_offer_id: id,
          employee_id: employee.id,
          employment_id: employee.employmentId,
          status: 'completed',
          idempotency_key: i.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('job_requisitions')
          .where({ id: req.id })
          .update({
            filled_headcount: req.filled_headcount + 1,
            workflow_version: req.workflow_version + 1,
            version: req.version + 1,
            updated_by: actor.userId,
          });
        await trx('recruitment_offers')
          .where({ id })
          .update({
            status: 'converted',
            workflow_version: offer.workflow_version + 1,
            version: offer.version + 1,
            active_slot: null,
            updated_by: actor.userId,
          });
        await trx('candidate_applications')
          .where({ id: app.id })
          .update({ status: 'converted', active_slot: null, updated_by: actor.userId });
        await audit(
          trx,
          actor,
          offer.company_id,
          'recruitment_hire.convert',
          conversionId,
          'recruitment_hire.convert',
          ctx,
        );
        await notifyPermissionHolders(
          trx,
          {
            companyId: offer.company_id,
            type: 'onboarding.case_creation_required',
            title: 'New hire ready for onboarding',
            message: 'A recruitment conversion is complete and ready for onboarding case creation.',
            referenceType: 'recruitment_hire_conversion',
            referenceId: conversionId,
            idempotencyKey: `recruitment:conversion:${conversionId}:onboarding`,
            actorUserId: actor.userId,
          },
          'onboarding_case.create',
          { branchId: terms.branch_id, departmentId: terms.department_id },
        );
        return {
          conversionId,
          employeeId: employee.id,
          employmentId: employee.employmentId,
          replayed: false,
        };
      });
    },
  };
}
