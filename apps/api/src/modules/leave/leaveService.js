import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { scopeMatches } from '../authorization/accessContext.js';
import {
  createWorkflowNotification,
  notifyPermissionHolders,
} from '../notifications/workflowNotificationRepository.js';
import { addDays, daysInclusive, weekday } from '../attendance/attendanceCalculation.js';
import { LEAVE_LIMITS } from './leaveConstants.js';

const notFound = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested leave record was not found.',
    statusCode: 404,
  });
const dateOnly = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const contextMeta = (context) => ({
  requestId: context?.requestId,
  correlationId: context?.correlationId,
});
const localDate = (timezone) => {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};
const periodFor = (date, month, day) => {
  const year = Number(date.slice(0, 4));
  const make = (y) => {
    const value = new Date(Date.UTC(y, month - 1, day));
    if (value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day)
      throw new ValidationError('The configured leave-year start date is invalid.');
    return value.toISOString().slice(0, 10);
  };
  let start = make(year);
  if (date < start) start = make(year - 1);
  return { start, end: addDays(make(Number(start.slice(0, 4)) + 1), -1) };
};
const signed = (value) => Number(value);

export function createLeaveService({ database, repository, authorizationService }) {
  async function audit(
    trx,
    actor,
    companyId,
    action,
    type,
    id,
    permission,
    requestContext,
    extra = {},
  ) {
    await insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: type,
      recordId: id,
      permissionCode: permission,
      ...extra,
      ...contextMeta(requestContext),
    });
  }
  async function sensitiveContext(actor) {
    try {
      return await authorizationService.requirePermission(actor, 'leave_sensitive.view');
    } catch {
      return null;
    }
  }
  function canSeeSensitive(row, context) {
    if (!context) return false;
    const record = {
      companyId: row.company_id,
      ownerUserId: row.owner_user_id,
      actorUserId: context.actor.userId,
      branchId: row.branch_id,
      departmentId: row.department_id,
      isDirectReport: Number(row.manager_user_id) === Number(context.actor.userId),
    };
    return context.grants.some((grant) => scopeMatches(grant, record));
  }
  function project(row, sensitive) {
    const value = { ...row };
    if (row.is_sensitive && !canSeeSensitive(row, sensitive)) {
      delete value.reason;
      value.reasonRestricted = true;
    }
    return value;
  }
  async function calculateDraft(input, actor, trx) {
    if (
      daysInclusive(input.dateFrom, input.dateTo) < 1 ||
      daysInclusive(input.dateFrom, input.dateTo) > LEAVE_LIMITS.maximumRequestRangeDays
    )
      throw new ValidationError(
        `Leave requests cannot exceed ${LEAVE_LIMITS.maximumRequestRangeDays} calendar days.`,
      );
    const employment = await repository.lockEmployment(input.employmentId, trx);
    if (!employment || Number(employment.company_id) !== Number(input.companyId)) throw notFound();
    if (
      dateOnly(employment.joining_date) > input.dateFrom ||
      (employment.employment_end_date && dateOnly(employment.employment_end_date) < input.dateTo)
    )
      throw new ValidationError('Leave dates must fall within the employment episode.');
    const type = await repository.getType(input.leaveTypeId, input.companyId, trx);
    if (!type || type.status !== 'active')
      throw new ValidationError('The leave type is invalid or inactive.');
    const days = [];
    let anchor;
    for (let date = input.dateFrom; date <= input.dateTo; date = addDays(date, 1)) {
      const assignment = await repository.getAssignment(input.employmentId, date, trx);
      if (!assignment?.work_calendar_id)
        throw new ValidationError(
          'An effective assignment and work calendar are required for every leave date.',
        );
      const typeVersion = await repository.getTypeVersion(input.leaveTypeId, date, trx);
      const policyAssignment = await repository.getPolicyAssignment(input.employmentId, date, trx);
      const policyVersion = policyAssignment
        ? await repository.getPolicyVersion(policyAssignment.leave_policy_id, date, trx)
        : null;
      const config =
        typeVersion && policyVersion
          ? await repository.getPolicyConfig(policyVersion.id, typeVersion.id, trx)
          : null;
      if (!typeVersion || !policyVersion || !config)
        throw new ValidationError('Effective leave type and policy configuration is missing.');
      if (input.dayPart === 'full_day' && typeVersion.unit !== 'full_day')
        throw new ValidationError('This leave type permits half-day requests only.');
      if (input.dayPart !== 'full_day' && typeVersion.unit !== 'half_day')
        throw new ValidationError('This leave type permits full-day requests only.');
      const serviceDays = daysInclusive(dateOnly(employment.joining_date), date) - 1;
      if (serviceDays < config.minimum_service_days)
        throw new ValidationError('Minimum service eligibility is not satisfied.');
      const calendarDay = await repository.getCalendarDay(
        assignment.work_calendar_id,
        weekday(date),
        trx,
      );
      if (!calendarDay) throw new ValidationError('The work calendar is incomplete.');
      const holiday = await repository.getHoliday(
        input.companyId,
        assignment.branch_id,
        assignment.work_calendar_id,
        date,
        trx,
      );
      const counts = holiday
        ? Boolean(typeVersion.counts_holidays)
        : calendarDay.is_working_day
          ? true
          : Boolean(typeVersion.counts_rest_days);
      const units = counts ? (input.dayPart === 'full_day' ? 1 : 0.5) : 0;
      const item = {
        company_id: input.companyId,
        leave_date: date,
        day_part: input.dayPart,
        units,
        is_working_day: Boolean(calendarDay.is_working_day),
        holiday_id: holiday?.id ?? null,
        work_calendar_id: assignment.work_calendar_id,
        leave_type_version_id: typeVersion.id,
        leave_policy_version_id: policyVersion.id,
        calculation_reason: counts ? 'counted' : holiday ? 'holiday_excluded' : 'rest_day_excluded',
        created_by: actor.userId,
        config,
        policyVersion,
        assignment,
        typeVersion,
      };
      days.push(item);
      anchor ??= item;
    }
    const units = days.reduce((total, item) => total + item.units, 0);
    if (units <= 0)
      throw new ValidationError('The selected dates contain no countable leave units.');
    return { employment, type, days, units, anchor };
  }
  async function appendDraft(requestId, versionNumber, input, actor, trx) {
    const calculated = await calculateDraft(input, actor, trx);
    const versionId = await repository.createRequestVersion(
      {
        company_id: input.companyId,
        leave_request_id: requestId,
        version_number: versionNumber,
        leave_type_version_id: calculated.anchor.typeVersion.id,
        leave_policy_version_id: calculated.anchor.policyVersion.id,
        date_from: input.dateFrom,
        date_to: input.dateTo,
        requested_units: calculated.units,
        reason: input.reason,
        assignment_snapshot: JSON.stringify({
          branchId: calculated.anchor.assignment.branch_id,
          departmentId: calculated.anchor.assignment.department_id,
          designationId: calculated.anchor.assignment.designation_id,
          managerEmploymentId: calculated.anchor.assignment.manager_employment_id,
          workCalendarId: calculated.anchor.assignment.work_calendar_id,
        }),
        created_by: actor.userId,
      },
      trx,
    );
    await repository.createRequestDays(
      calculated.days.map(
        ({ config: _, policyVersion: __, assignment: ___, typeVersion: ____, ...day }) => ({
          ...day,
          leave_request_id: requestId,
          leave_request_version_id: versionId,
        }),
      ),
      trx,
    );
    return { ...calculated, versionId };
  }
  async function balanceAccount(employmentId, typeId, day, config, policyVersion, actor, trx) {
    const period = periodFor(
      dateOnly(day.leave_date),
      policyVersion.leave_year_start_month,
      policyVersion.leave_year_start_day,
    );
    let account = await repository.lockBalanceAccount(
      employmentId,
      typeId,
      period.start,
      period.end,
      trx,
    );
    if (!account) {
      const id = await repository.createBalanceAccount(
        {
          company_id: day.company_id,
          employment_id: employmentId,
          leave_type_id: typeId,
          period_start: period.start,
          period_end: period.end,
          created_by: actor.userId,
          updated_by: actor.userId,
        },
        trx,
      );
      account = await repository.lockBalanceAccount(
        employmentId,
        typeId,
        period.start,
        period.end,
        trx,
      );
      await repository.createLedgerEntry(
        {
          company_id: day.company_id,
          leave_balance_account_id: id,
          entry_type: 'entitlement',
          units: config.entitlement_units,
          effective_date: period.start,
          source_type: 'policy',
          source_id: policyVersion.id,
          idempotency_key: `entitlement:${employmentId}:${typeId}:${period.start}`,
          reason: 'Full-period policy entitlement.',
          created_by: actor.userId,
        },
        trx,
      );
    }
    return account;
  }
  async function allocationFor(request, version, days, actor, trx) {
    const allocations = new Map();
    for (const day of days.filter((item) => Number(item.units) > 0)) {
      const config = await repository.getPolicyConfig(
        day.leave_policy_version_id,
        day.leave_type_version_id,
        trx,
      );
      const policyVersion = await trx('leave_policy_versions')
        .where({ id: day.leave_policy_version_id })
        .first();
      const account = await balanceAccount(
        request.employment_id,
        request.leave_type_id,
        day,
        config,
        policyVersion,
        actor,
        trx,
      );
      const current = allocations.get(account.id) ?? {
        account,
        units: 0,
        allowNegative: Boolean(
          (await trx('leave_type_versions').where({ id: day.leave_type_version_id }).first())
            .allow_negative_balance,
        ),
      };
      current.units += Number(day.units);
      allocations.set(account.id, current);
    }
    return [...allocations.values()];
  }
  async function releaseReservations(request, version, actor, trx, reason) {
    const reservations = await repository.findRequestLedger(request.id, 'reservation', trx);
    for (const entry of reservations) {
      const reversed = await trx('leave_balance_ledger_entries')
        .where({ reversal_of_entry_id: entry.id })
        .first();
      if (!reversed)
        await repository.createLedgerEntry(
          {
            company_id: request.company_id,
            leave_balance_account_id: entry.leave_balance_account_id,
            entry_type: 'reservation_release',
            units: -signed(entry.units),
            effective_date: dateOnly(version.date_from),
            source_type: 'leave_request',
            source_id: request.id,
            idempotency_key: `request:${request.id}:reservation-release:${entry.id}`,
            reversal_of_entry_id: entry.id,
            reason,
            created_by: actor.userId,
          },
          trx,
        );
    }
  }
  async function lockedReconciliation(request, version, actor, trx, reason) {
    const days = await repository.getRequestDays(version.id, trx);
    for (const day of days) {
      const record = await repository.findAttendanceRecord(
        request.company_id,
        request.employment_id,
        dateOnly(day.leave_date),
        trx,
      );
      if (record?.locked_at)
        await repository.createReconciliation(
          {
            company_id: request.company_id,
            leave_request_day_id: day.id,
            attendance_record_id: record.id,
            event_type: 'required',
            reason,
            actor_user_id: actor.userId,
          },
          trx,
        );
    }
  }
  return {
    limits: LEAVE_LIMITS,
    async getOwnEmployment(context, companyId) {
      const company = await repository.getCompany(companyId);
      if (!company) throw notFound();
      const employment = await repository.getOwnEmployment(
        context,
        companyId,
        localDate(company.timezone),
      );
      if (!employment) throw notFound();
      return {
        id: employment.id,
        companyId: employment.company_id,
        employeeCode: employment.employee_code,
        displayName: employment.display_name,
      };
    },
    async listTypes(context, companyId) {
      if (
        !context.grants.some(
          (g) => g.scope_type === 'all' || Number(g.company_id) === Number(companyId),
        )
      )
        throw notFound();
      return repository.listTypes(companyId);
    },
    async createType(actor, context, input, requestContext) {
      if (
        !context.grants.some(
          (g) =>
            g.scope_type === 'all' ||
            (g.scope_type === 'company' && Number(g.company_id) === Number(input.companyId)),
        )
      )
        throw notFound();
      return withTransaction(database, async (trx) => {
        const company = await repository.lockCompany(input.companyId, trx);
        if (!company || company.status !== 'active')
          throw new ValidationError('The company is not active.');
        const id = await repository.createType(
          {
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            category: input.category,
            is_sensitive: input.isSensitive,
            created_by: actor.userId,
            updated_by: actor.userId,
          },
          trx,
        );
        const versionId = await repository.createTypeVersion(
          {
            company_id: input.companyId,
            leave_type_id: id,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            unit: input.unit,
            minimum_increment: input.minimumIncrement,
            counts_rest_days: input.countsRestDays,
            counts_holidays: input.countsHolidays,
            requires_reason: input.requiresReason,
            requires_approval: input.requiresApproval,
            allow_negative_balance: input.allowNegativeBalance,
            reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          'leave_type.create',
          'leave_type',
          id,
          'leave_type.create',
          requestContext,
          { reason: input.reason },
        );
        return { id, version: 1, leaveTypeVersionId: versionId };
      });
    },
    async listPolicies(context, companyId) {
      if (
        !context.grants.some(
          (g) => g.scope_type === 'all' || Number(g.company_id) === Number(companyId),
        )
      )
        throw notFound();
      return repository.listPolicies(companyId);
    },
    async createPolicy(actor, context, input, requestContext) {
      if (
        !context.grants.some(
          (g) =>
            g.scope_type === 'all' ||
            (g.scope_type === 'company' && Number(g.company_id) === Number(input.companyId)),
        )
      )
        throw notFound();
      return withTransaction(database, async (trx) => {
        await repository.lockCompany(input.companyId, trx);
        periodFor(input.effectiveStart, input.leaveYearStartMonth, input.leaveYearStartDay);
        const id = await repository.createPolicy(
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
        const versionId = await repository.createPolicyVersion(
          {
            company_id: input.companyId,
            leave_policy_id: id,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            leave_year_start_month: input.leaveYearStartMonth,
            leave_year_start_day: input.leaveYearStartDay,
            reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        const configs = [];
        for (const config of input.configs) {
          const typeVersion = await trx('leave_type_versions')
            .where({ id: config.leaveTypeVersionId, company_id: input.companyId })
            .first();
          if (!typeVersion) throw new ValidationError('A leave-type version is invalid.');
          configs.push({
            company_id: input.companyId,
            leave_policy_version_id: versionId,
            leave_type_version_id: config.leaveTypeVersionId,
            entitlement_units: config.entitlementUnits,
            minimum_service_days: config.minimumServiceDays,
            created_by: actor.userId,
          });
        }
        await repository.createPolicyConfigs(configs, trx);
        await audit(
          trx,
          actor,
          input.companyId,
          'leave_policy.create',
          'leave_policy',
          id,
          'leave_policy.create',
          requestContext,
          { reason: input.reason },
        );
        return { id, version: 1, leavePolicyVersionId: versionId };
      });
    },
    async assignPolicy(actor, context, employmentId, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const employment = await repository.lockEmployment(employmentId, trx);
        if (!employment) throw notFound();
        const scoped = await repository.getScopedEmployment(
          context,
          employmentId,
          'leave_policy.assign',
          input.effectiveStart,
          trx,
        );
        if (!scoped) throw notFound();
        const policy = await repository.getPolicy(input.leavePolicyId, employment.company_id, trx);
        if (!policy || policy.status !== 'active')
          throw new ValidationError('The leave policy is invalid.');
        const superseded = input.supersedesAssignmentId
          ? await repository.getPolicyAssignmentById(input.supersedesAssignmentId, trx)
          : null;
        if (superseded && Number(superseded.employment_id) !== Number(employmentId))
          throw new ConflictError(
            'INVALID_HISTORY_CORRECTION',
            'The assignment belongs to another employment.',
          );
        if (
          await repository.findPolicyAssignmentOverlap(
            employmentId,
            input.effectiveStart,
            input.effectiveEnd,
            superseded?.id,
            trx,
          )
        )
          throw new ConflictError(
            'LEAVE_POLICY_OVERLAP',
            'Leave-policy assignment periods cannot overlap.',
          );
        if (
          superseded &&
          !(await repository.supersedePolicyAssignment(superseded.id, actor.userId, trx))
        )
          throw new ConflictError(
            'CONCURRENT_MODIFICATION',
            'The policy assignment changed concurrently.',
          );
        const id = await repository.createPolicyAssignment(
          {
            company_id: employment.company_id,
            employment_id: employmentId,
            leave_policy_id: input.leavePolicyId,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            supersedes_assignment_id: superseded?.id ?? null,
            reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          employment.company_id,
          'leave_policy.assign',
          'employee_leave_policy_assignment',
          id,
          'leave_policy.assign',
          requestContext,
          { reason: input.reason },
        );
        return { id };
      });
    },
    async listPolicyAssignments(context, employmentId) {
      const employment = await repository.getScopedEmployment(
        context,
        employmentId,
        'leave_policy.view',
        new Date().toISOString().slice(0, 10),
      );
      if (!employment) throw notFound();
      return repository.listPolicyAssignments(employmentId);
    },
    async createRequest(actor, context, input, requestContext, { historical = false } = {}) {
      const scoped = await repository.getScopedEmployment(
        context,
        input.employmentId,
        historical ? 'leave.administer_historical' : 'leave.apply',
        input.dateFrom,
      );
      if (!scoped || Number(scoped.company_id) !== Number(input.companyId)) throw notFound();
      return withTransaction(database, async (trx) => {
        const id = await repository.createRequest(
          {
            company_id: input.companyId,
            employment_id: input.employmentId,
            leave_type_id: input.leaveTypeId,
            created_by: actor.userId,
            updated_by: actor.userId,
          },
          trx,
        );
        const calculated = await appendDraft(id, 1, input, actor, trx);
        await repository.createWorkflowEvent(
          {
            company_id: input.companyId,
            leave_request_id: id,
            from_state: null,
            to_state: 'draft',
            workflow_version: 1,
            actor_user_id: actor.userId,
            reason: input.reason,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          'leave.create',
          'leave_request',
          id,
          historical ? 'leave.administer_historical' : 'leave.apply',
          requestContext,
          { metadata: { units: calculated.units } },
        );
        return { id, version: 1, workflowVersion: 1, requestVersion: 1 };
      });
    },
    async updateDraft(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const request = await repository.lockRequest(id, trx);
        if (!request || request.status !== 'draft' || request.version !== input.version)
          throw new ConflictError('STALE_VERSION', 'The draft changed or is no longer editable.');
        const visible = await repository.getRequest(id, context, 'leave.update_draft', trx);
        if (!visible) throw notFound();
        const calculated = await appendDraft(
          id,
          request.current_request_version + 1,
          { ...input, companyId: request.company_id, employmentId: request.employment_id },
          actor,
          trx,
        );
        if (
          !(await repository.updateDraft(
            id,
            input.version,
            {
              leave_type_id: input.leaveTypeId,
              current_request_version: request.current_request_version + 1,
              updated_by: actor.userId,
            },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The draft changed concurrently.');
        await audit(
          trx,
          actor,
          request.company_id,
          'leave.update_draft',
          'leave_request',
          id,
          'leave.update_draft',
          requestContext,
        );
        return {
          id,
          version: input.version + 1,
          requestVersion: request.current_request_version + 1,
          units: calculated.units,
        };
      });
    },
    async listRequests(actor, context, input, requestContext) {
      const effective = input.scopeView
        ? { ...context, grants: context.grants.filter((g) => g.scope_type === input.scopeView) }
        : context;
      const rows = await repository.listRequests(effective, input);
      const sensitive = await sensitiveContext(actor);
      const projected = rows.map((row) => project(row, sensitive));
      if (rows.some((row) => row.is_sensitive && canSeeSensitive(row, sensitive)))
        await insertAuditEvent(database, {
          actorUserId: actor.userId,
          companyId: input.companyId,
          actionCode: 'leave_sensitive.view',
          outcome: 'success',
          recordType: 'leave_request_collection',
          permissionCode: 'leave_sensitive.view',
          metadata: { resultCount: rows.length },
          ...contextMeta(requestContext),
        });
      return { items: projected, pagination: { page: input.page, pageSize: input.pageSize } };
    },
    async getRequest(actor, context, id, requestContext) {
      const row = await repository.getRequest(id, context);
      if (!row) throw notFound();
      const sensitive = await sensitiveContext(actor);
      const value = project(row, sensitive);
      const [workflowStates, attempts, decisions] = await repository.history(id);
      const versions = await repository.listRequestVersions(id);
      value.history = { versions, workflowStates, attempts, decisions };
      value.days = await repository.getRequestDays(row.request_version_id);
      if (row.is_sensitive && canSeeSensitive(row, sensitive))
        await insertAuditEvent(database, {
          actorUserId: actor.userId,
          companyId: row.company_id,
          actionCode: 'leave_sensitive.view',
          outcome: 'success',
          recordType: 'leave_request',
          recordId: id,
          permissionCode: 'leave_sensitive.view',
          ...contextMeta(requestContext),
        });
      return value;
    },
    async submit(actor, context, id, input, requestContext, { historical = false } = {}) {
      return withTransaction(database, async (trx) => {
        const request = await repository.lockRequest(id, trx);
        if (!request) throw notFound();
        const permission = historical ? 'leave.administer_historical' : 'leave.submit';
        const visible = await repository.getRequest(id, context, permission, trx);
        if (!visible) throw notFound();
        if (request.status !== 'draft' || request.workflow_version !== input.workflowVersion)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'Only the current draft can be submitted.',
          );
        const version = await repository.getCurrentRequestVersion(id, trx);
        const company = await repository.getCompany(request.company_id, trx);
        const today = localDate(company.timezone);
        if (!historical && dateOnly(version.date_from) < today)
          throw new ValidationError('Employees cannot submit backdated leave.');
        if (
          daysInclusive(today, dateOnly(version.date_from)) - 1 >
          LEAVE_LIMITS.maximumFutureApplicationDays
        )
          throw new ValidationError(
            `Leave cannot be submitted more than ${LEAVE_LIMITS.maximumFutureApplicationDays} days ahead.`,
          );
        await repository.lockEmployment(request.employment_id, trx);
        const days = await repository.getRequestDays(version.id, trx);
        for (const day of days) {
          const status = await repository.getEmploymentStatus(
            request.employment_id,
            dateOnly(day.leave_date),
            trx,
          );
          if (!status || !['probation', 'confirmed'].includes(status.status))
            throw new ValidationError(
              'Employment status is not eligible for leave on every requested date.',
            );
        }
        if (await repository.findOverlap(request.employment_id, days, id, trx))
          throw new ConflictError('LEAVE_OVERLAP', 'The request overlaps blocking leave.');
        const allocations = await allocationFor(request, version, days, actor, trx);
        for (const allocation of allocations) {
          const balance = signed(
            (await repository.ledgerSum(allocation.account.id, trx)).balance ?? 0,
          );
          if (!allocation.allowNegative && balance < allocation.units)
            throw new ConflictError(
              'INSUFFICIENT_LEAVE_BALANCE',
              'Available leave balance is insufficient.',
            );
          await repository.createLedgerEntry(
            {
              company_id: request.company_id,
              leave_balance_account_id: allocation.account.id,
              entry_type: 'reservation',
              units: -allocation.units,
              effective_date: dateOnly(version.date_from),
              source_type: 'leave_request',
              source_id: id,
              idempotency_key: `request:${id}:reservation:${allocation.account.id}`,
              reason: 'Reserved on leave submission.',
              created_by: actor.userId,
            },
            trx,
          );
        }
        const assignment = await repository.getAssignment(
          request.employment_id,
          dateOnly(version.date_from),
          trx,
        );
        const manager = await repository.getManagerUser(assignment.manager_employment_id, trx);
        if (
          !(await repository.updateRequest(
            id,
            request.version,
            input.workflowVersion,
            { status: 'submitted', submitted_at: trx.fn.now(), updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The request changed concurrently.');
        await repository.createWorkflowEvent(
          {
            company_id: request.company_id,
            leave_request_id: id,
            from_state: 'draft',
            to_state: 'submitted',
            workflow_version: input.workflowVersion + 1,
            actor_user_id: actor.userId,
            reason: input.reason ?? null,
          },
          trx,
        );
        await repository.createApprovalAttempt(
          {
            company_id: request.company_id,
            leave_request_id: id,
            request_version_number: request.current_request_version,
            decision_kind: 'request',
            attempt_number: 1,
            assigned_approver_user_id: manager?.user_id ?? null,
            assigned_manager_employment_id: assignment.manager_employment_id ?? null,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          request.company_id,
          historical ? 'leave.administer_historical' : 'leave.submit',
          'leave_request',
          id,
          permission,
          requestContext,
          {
            metadata: {
              managerEmploymentId: assignment.manager_employment_id ?? null,
              approvalException: manager?.user_id ? null : 'HR_FALLBACK_REQUIRED',
            },
          },
        );
        const notification = {
          companyId: request.company_id,
          type: 'leave.approval_required',
          title: 'Leave request awaiting your decision',
          message: 'A leave request has been submitted and requires review.',
          referenceType: 'leave_request',
          referenceId: id,
          idempotencyKey: `leave:${id}:submitted:${input.workflowVersion + 1}`,
          actorUserId: actor.userId,
        };
        if (manager?.user_id)
          await createWorkflowNotification(trx, { ...notification, userId: manager.user_id });
        else
          await notifyPermissionHolders(trx, notification, 'leave.approve', {
            branchId: assignment.branch_id,
            departmentId: assignment.department_id,
          });
        return { id, status: 'submitted', workflowVersion: input.workflowVersion + 1 };
      });
    },
    async withdrawDraft(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const request = await repository.lockRequest(id, trx);
        if (!request) throw notFound();
        if (!(await repository.getRequest(id, context, 'leave.cancel', trx))) throw notFound();
        if (request.status !== 'draft')
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'Only drafts can be withdrawn.');
        if (
          !(await repository.updateRequest(
            id,
            request.version,
            input.workflowVersion,
            { status: 'withdrawn', updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The request changed concurrently.');
        await repository.createWorkflowEvent(
          {
            company_id: request.company_id,
            leave_request_id: id,
            from_state: 'draft',
            to_state: 'withdrawn',
            workflow_version: input.workflowVersion + 1,
            actor_user_id: actor.userId,
            reason: input.reason ?? null,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          request.company_id,
          'leave.cancel',
          'leave_request',
          id,
          'leave.cancel',
          requestContext,
        );
        return { id, status: 'withdrawn' };
      });
    },
    async decide(
      actor,
      context,
      id,
      decision,
      input,
      requestContext,
      { cancellation = false } = {},
    ) {
      return withTransaction(database, async (trx) => {
        const request = await repository.lockRequest(id, trx);
        if (!request) throw notFound();
        const permission = cancellation ? `leave.${decision}_cancellation` : `leave.${decision}`;
        const visible = await repository.getRequest(id, context, permission, trx);
        if (!visible) throw notFound();
        if (Number(visible.owner_user_id) === Number(actor.userId))
          throw new ConflictError(
            'SELF_APPROVAL_FORBIDDEN',
            'A requester cannot decide their own leave.',
          );
        const prior = await repository.getDecisionByKey(
          request.company_id,
          input.idempotencyKey,
          trx,
        );
        const expected = decision === 'approve' ? 'approved' : 'rejected';
        if (prior) {
          if (prior.decision !== expected)
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The key was used for another decision.',
            );
          return {
            id,
            status: request.status,
            workflowVersion: request.workflow_version,
            replayed: true,
          };
        }
        const expectedState = cancellation ? 'cancellation_requested' : 'submitted';
        if (
          request.status !== expectedState ||
          request.workflow_version !== input.workflowVersion ||
          request.current_request_version !== input.requestVersion
        )
          throw new ConflictError(
            'STALE_WORKFLOW_VERSION',
            'The request is no longer awaiting this decision.',
          );
        const attempt = await repository.getPendingAttempt(
          id,
          cancellation ? 'cancellation' : 'request',
          trx,
        );
        if (!attempt)
          throw new ConflictError('APPROVAL_PATH_UNAVAILABLE', 'No approval attempt is available.');
        if (
          attempt.assigned_approver_user_id &&
          Number(attempt.assigned_approver_user_id) !== Number(actor.userId)
        )
          throw notFound();
        await repository.createDecision(
          {
            company_id: request.company_id,
            leave_approval_attempt_id: attempt.id,
            approver_user_id: actor.userId,
            decision: expected,
            reason: input.reason,
            expected_workflow_version: input.workflowVersion,
            expected_request_version: input.requestVersion,
            idempotency_key: input.idempotencyKey,
          },
          trx,
        );
        await repository.completeAttempt(attempt.id, expected, trx);
        const version = await repository.getCurrentRequestVersion(id, trx);
        let target;
        if (cancellation) {
          target = decision === 'approve' ? 'cancelled' : 'cancellation_rejected';
          if (decision === 'approve') {
            const consumptions = await repository.findRequestLedger(id, 'consumption', trx);
            for (const entry of consumptions)
              await repository.createLedgerEntry(
                {
                  company_id: request.company_id,
                  leave_balance_account_id: entry.leave_balance_account_id,
                  entry_type: 'reversal',
                  units: -signed(entry.units),
                  effective_date: dateOnly(version.date_from),
                  source_type: 'leave_request',
                  source_id: id,
                  idempotency_key: `request:${id}:consumption-reversal:${entry.id}`,
                  reversal_of_entry_id: entry.id,
                  reason: input.reason,
                  created_by: actor.userId,
                },
                trx,
              );
            await lockedReconciliation(
              request,
              version,
              actor,
              trx,
              'Approved leave cancellation requires attendance reconciliation.',
            );
          }
        } else {
          target = decision === 'approve' ? 'approved' : 'rejected';
          if (decision === 'approve') {
            const reservations = await repository.findRequestLedger(id, 'reservation', trx);
            for (const entry of reservations) {
              await repository.createLedgerEntry(
                {
                  company_id: request.company_id,
                  leave_balance_account_id: entry.leave_balance_account_id,
                  entry_type: 'reservation_release',
                  units: -signed(entry.units),
                  effective_date: dateOnly(version.date_from),
                  source_type: 'leave_request',
                  source_id: id,
                  idempotency_key: `request:${id}:approval-release:${entry.id}`,
                  reversal_of_entry_id: entry.id,
                  reason: 'Reservation converted on approval.',
                  created_by: actor.userId,
                },
                trx,
              );
              await repository.createLedgerEntry(
                {
                  company_id: request.company_id,
                  leave_balance_account_id: entry.leave_balance_account_id,
                  entry_type: 'consumption',
                  units: signed(entry.units),
                  effective_date: dateOnly(version.date_from),
                  source_type: 'leave_request',
                  source_id: id,
                  idempotency_key: `request:${id}:consumption:${entry.leave_balance_account_id}`,
                  reason: 'Consumed on leave approval.',
                  created_by: actor.userId,
                },
                trx,
              );
            }
            await lockedReconciliation(
              request,
              version,
              actor,
              trx,
              'Approved leave requires attendance reconciliation.',
            );
          } else await releaseReservations(request, version, actor, trx, input.reason);
        }
        if (
          !(await repository.updateRequest(
            id,
            request.version,
            input.workflowVersion,
            {
              status: target,
              ...(target === 'approved'
                ? { approved_at: trx.fn.now() }
                : target === 'rejected'
                  ? { rejected_at: trx.fn.now() }
                  : target === 'cancelled'
                    ? { cancelled_at: trx.fn.now() }
                    : {}),
            },
            trx,
          ))
        )
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The request changed concurrently.');
        await repository.createWorkflowEvent(
          {
            company_id: request.company_id,
            leave_request_id: id,
            from_state: expectedState,
            to_state: target,
            workflow_version: input.workflowVersion + 1,
            actor_user_id: actor.userId,
            reason: input.reason,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          request.company_id,
          cancellation ? `leave.${decision}_cancellation` : `leave.${decision}`,
          'leave_request',
          id,
          permission,
          requestContext,
        );
        await createWorkflowNotification(trx, {
          companyId: request.company_id,
          userId: visible.owner_user_id,
          type: cancellation ? 'leave.cancellation_decided' : 'leave.request_decided',
          title: cancellation ? 'Leave cancellation updated' : 'Leave request updated',
          message: cancellation
            ? `Your leave cancellation request was ${decision === 'approve' ? 'approved' : 'rejected'}.`
            : `Your leave request was ${decision === 'approve' ? 'approved' : 'rejected'}.`,
          referenceType: 'leave_request',
          referenceId: id,
          idempotencyKey: `leave:${id}:${target}:${input.workflowVersion + 1}`,
          actorUserId: actor.userId,
        });
        return { id, status: target, workflowVersion: input.workflowVersion + 1 };
      });
    },
    async requestCancellation(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const request = await repository.lockRequest(id, trx);
        if (!request) throw notFound();
        const visible = await repository.getRequest(id, context, 'leave.request_cancellation', trx);
        if (!visible) throw notFound();
        if (
          Number(visible.owner_user_id) !== Number(actor.userId) ||
          request.status !== 'approved' ||
          request.workflow_version !== input.workflowVersion
        )
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The approved request cannot enter cancellation.',
          );
        const original = await repository.getLatestAttempt(id, 'request', trx);
        if (
          !(await repository.updateRequest(
            id,
            request.version,
            input.workflowVersion,
            { status: 'cancellation_requested' },
            trx,
          ))
        )
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The request changed concurrently.');
        await repository.createWorkflowEvent(
          {
            company_id: request.company_id,
            leave_request_id: id,
            from_state: 'approved',
            to_state: 'cancellation_requested',
            workflow_version: input.workflowVersion + 1,
            actor_user_id: actor.userId,
            reason: input.reason,
          },
          trx,
        );
        await repository.createApprovalAttempt(
          {
            company_id: request.company_id,
            leave_request_id: id,
            request_version_number: request.current_request_version,
            decision_kind: 'cancellation',
            attempt_number: 1,
            assigned_approver_user_id: original?.assigned_approver_user_id ?? null,
            assigned_manager_employment_id: original?.assigned_manager_employment_id ?? null,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          request.company_id,
          'leave.request_cancellation',
          'leave_request',
          id,
          'leave.request_cancellation',
          requestContext,
        );
        const notification = {
          companyId: request.company_id,
          type: 'leave.cancellation_approval_required',
          title: 'Leave cancellation awaiting your decision',
          message: 'A leave cancellation request requires review.',
          referenceType: 'leave_request',
          referenceId: id,
          idempotencyKey: `leave:${id}:cancellation_requested:${input.workflowVersion + 1}`,
          actorUserId: actor.userId,
        };
        if (original?.assigned_approver_user_id)
          await createWorkflowNotification(trx, {
            ...notification,
            userId: original.assigned_approver_user_id,
          });
        else await notifyPermissionHolders(trx, notification, 'leave.approve_cancellation');
        return { id, status: 'cancellation_requested', workflowVersion: input.workflowVersion + 1 };
      });
    },
    async listBalances(context, employmentId, date) {
      const employment = await repository.getScopedEmployment(
        context,
        employmentId,
        'leave_balance.view',
        date,
      );
      if (!employment) throw notFound();
      return repository.listBalances(employmentId);
    },
    async exportBalances(actor, context, employmentId, date, requestContext) {
      const employment = await repository.getScopedEmployment(
        context,
        employmentId,
        'leave_balance.export',
        date,
      );
      if (!employment) throw notFound();
      const rows = await repository.listBalances(employmentId);
      await insertAuditEvent(database, {
        actorUserId: actor.userId,
        companyId: employment.company_id,
        actionCode: 'leave_balance.export',
        outcome: 'success',
        recordType: 'employment_leave_balances',
        recordId: employmentId,
        permissionCode: 'leave_balance.export',
        metadata: { rowCount: rows.length, asOfDate: date },
        ...contextMeta(requestContext),
      });
      const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      return [
        ['leave_type', 'period_start', 'period_end', 'balance'].join(','),
        ...rows.map((row) =>
          [row.leave_type_name, dateOnly(row.period_start), dateOnly(row.period_end), row.balance]
            .map(cell)
            .join(','),
        ),
      ].join('\n');
    },
    async ledger(context, accountId, date) {
      const account = await repository.getBalanceAccount(accountId);
      if (
        !account ||
        !(await repository.getScopedEmployment(
          context,
          account.employment_id,
          'leave_balance.view',
          date,
        ))
      )
        throw notFound();
      return repository.listLedger(accountId);
    },
    async adjustBalance(actor, context, accountId, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const account = await trx('leave_balance_accounts')
          .where({ id: accountId })
          .forUpdate()
          .first();
        if (
          !account ||
          !(await repository.getScopedEmployment(
            context,
            account.employment_id,
            'leave_balance.adjust',
            input.effectiveDate,
            trx,
          ))
        )
          throw notFound();
        try {
          await repository.createLedgerEntry(
            {
              company_id: account.company_id,
              leave_balance_account_id: accountId,
              entry_type: 'adjustment',
              units: input.units,
              effective_date: input.effectiveDate,
              source_type: 'manual',
              source_id: null,
              idempotency_key: input.idempotencyKey,
              reason: input.reason,
              created_by: actor.userId,
            },
            trx,
          );
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key has already been used.',
            );
          throw error;
        }
        await audit(
          trx,
          actor,
          account.company_id,
          'leave_balance.adjust',
          'leave_balance_account',
          accountId,
          'leave_balance.adjust',
          requestContext,
          { reason: input.reason, metadata: { units: input.units } },
        );
        return { id: accountId };
      });
    },
    async reverseLedger(actor, context, entryId, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const entry = await repository.getLedgerEntry(entryId, trx);
        if (
          !entry ||
          !(await repository.getScopedEmployment(
            context,
            (await repository.getBalanceAccount(entry.leave_balance_account_id, trx)).employment_id,
            'leave_balance.adjust',
            dateOnly(entry.effective_date),
            trx,
          ))
        )
          throw notFound();
        if (!['adjustment', 'opening'].includes(entry.entry_type))
          throw new ConflictError(
            'REVERSAL_NOT_ALLOWED',
            'Only manual balance entries can be reversed directly.',
          );
        try {
          await repository.createLedgerEntry(
            {
              company_id: entry.company_id,
              leave_balance_account_id: entry.leave_balance_account_id,
              entry_type: 'reversal',
              units: -signed(entry.units),
              effective_date: dateOnly(entry.effective_date),
              source_type: 'manual',
              source_id: entry.id,
              idempotency_key: input.idempotencyKey,
              reversal_of_entry_id: entry.id,
              reason: input.reason,
              created_by: actor.userId,
            },
            trx,
          );
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'REVERSAL_CONFLICT',
              'The entry or idempotency key has already been reversed/used.',
            );
          throw error;
        }
        await audit(
          trx,
          actor,
          entry.company_id,
          'leave_balance.reverse',
          'leave_balance_ledger_entry',
          entryId,
          'leave_balance.adjust',
          requestContext,
          { reason: input.reason },
        );
        return { id: entryId, reversed: true };
      });
    },
    getApprovedLeaveDay: (companyId, employmentId, date, trx) =>
      repository.getApprovedLeaveDay(companyId, employmentId, date, trx),
  };
}
