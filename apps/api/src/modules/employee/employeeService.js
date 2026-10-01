import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { projectContact, projectEmployee, projectPersonal } from './employeeProjection.js';

const terminalStatuses = new Set(['resigned', 'terminated', 'retired']);
const transitions = {
  probation: new Set(['confirmed', 'suspended', 'resigned', 'terminated']),
  confirmed: new Set(['suspended', 'resigned', 'terminated', 'retired']),
  suspended: new Set(['confirmed', 'resigned', 'terminated', 'retired']),
  resigned: new Set(),
  terminated: new Set(),
  retired: new Set(),
};

function notFound() {
  return new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested employee record was not found.',
    statusCode: 404,
  });
}
function conflict(error) {
  if (error.code === 'ER_DUP_ENTRY')
    return new ConflictError(
      'EMPLOYEE_CONFLICT',
      'The employee code or linked user is already in use.',
    );
  if (error.code?.startsWith('ER_NO_REFERENCED'))
    return new ValidationError('A referenced record is invalid or belongs to another company.');
  return error;
}
function displayName(input) {
  return (
    input.preferredName ||
    [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' ')
  );
}
function businessDate(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}
function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
function previousDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
function auditContext(context) {
  return { requestId: context?.requestId, correlationId: context?.correlationId };
}
function scopeAllowsEmployeeCreation(accessContext, input) {
  return accessContext.grants.some((grant) => {
    if (grant.scope_type === 'all') return true;
    if (Number(grant.company_id) !== Number(input.companyId)) return false;
    if (grant.scope_type === 'company') return true;
    if (grant.scope_type === 'branch')
      return Number(grant.branch_id) === Number(input.assignment.branchId);
    if (grant.scope_type === 'department')
      return Number(grant.department_id) === Number(input.assignment.departmentId);
    return false;
  });
}
function employeeValues(input) {
  const values = {};
  for (const [key, column] of [
    ['firstName', 'first_name'],
    ['middleName', 'middle_name'],
    ['lastName', 'last_name'],
    ['preferredName', 'preferred_name'],
  ])
    if (input[key] !== undefined) values[column] = input[key];
  return values;
}
function assignmentValues(input) {
  return {
    branch_id: input.branchId,
    department_id: input.departmentId,
    designation_id: input.designationId,
    grade_id: input.gradeId ?? null,
    cost_center_id: input.costCenterId ?? null,
    work_calendar_id: input.workCalendarId ?? null,
    manager_employment_id: input.managerEmploymentId ?? null,
    effective_start: input.effectiveStart,
    effective_end: input.effectiveEnd ?? null,
    reason: input.reason,
  };
}
function personalValues(input) {
  const result = {};
  for (const [key, column] of [
    ['dateOfBirth', 'date_of_birth'],
    ['gender', 'gender'],
    ['maritalStatus', 'marital_status'],
    ['nationalityCountryCode', 'nationality_country_code'],
  ])
    if (input[key] !== undefined) result[column] = input[key];
  return result;
}
function contactValues(input) {
  const result = {};
  for (const key of [
    'personalEmail',
    'personalPhone',
    'alternatePhone',
    'presentAddressLine1',
    'presentAddressLine2',
    'presentCity',
    'presentPostalCode',
    'presentCountryCode',
    'permanentAddressLine1',
    'permanentAddressLine2',
    'permanentCity',
    'permanentPostalCode',
    'permanentCountryCode',
  ])
    if (input[key] !== undefined)
      result[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = input[key];
  return result;
}

export function createEmployeeService({ database, repository, authorizationService }) {
  async function companyDate(companyId, requested, trx = database) {
    const company = await repository.getCompany(companyId, trx);
    if (!company) throw notFound();
    return requested ?? businessDate(company.timezone);
  }
  async function validateAssignment(values, companyId, employmentId, trx) {
    for (const [column, table, required] of [
      ['branch_id', 'branches', true],
      ['department_id', 'departments', true],
      ['designation_id', 'designations', true],
      ['grade_id', 'grades', false],
      ['cost_center_id', 'cost_centers', false],
      ['work_calendar_id', 'work_calendars', false],
    ])
      if (
        (required || values[column]) &&
        !(await repository.findOwnedReference(table, values[column], companyId, trx))
      )
        throw new ValidationError(
          'An assignment reference is inactive, invalid, or belongs to another company.',
        );
    if (values.manager_employment_id) {
      const manager = await repository.findOwnedEmployment(
        values.manager_employment_id,
        companyId,
        trx,
      );
      if (!manager)
        throw new ValidationError('The reporting manager employment is not in this company.');
      if (
        dateOnly(manager.joining_date) > values.effective_start ||
        (manager.employment_end_date &&
          dateOnly(manager.employment_end_date) < values.effective_start)
      )
        throw new ValidationError(
          'The reporting manager employment is not effective on the assignment start date.',
        );
      if (Number(values.manager_employment_id) === Number(employmentId))
        throw new ConflictError(
          'REPORTING_SELF_REFERENCE',
          'An employee cannot report to their own employment.',
        );
      if (
        await repository.hasReportingCycle(
          employmentId,
          values.manager_employment_id,
          values.effective_start,
          trx,
        )
      )
        throw new ConflictError(
          'REPORTING_CYCLE',
          'The reporting relationship would create a cycle.',
        );
    }
  }
  async function requireEmployee(id, context, permission, asOfDate, trx = database) {
    const row = await repository.get(id, context, permission, asOfDate, trx);
    if (!row) throw notFound();
    return row;
  }
  async function requireSensitive(
    actor,
    employee,
    baseContext,
    permission,
    asOfDate,
    trx = database,
  ) {
    const sensitive = await authorizationService.requirePermission(actor, permission);
    await requireEmployee(employee.id, baseContext, 'employee.view', asOfDate, trx);
    await requireEmployee(employee.id, sensitive, permission, asOfDate, trx);
    return sensitive;
  }
  async function synchronizeEmploymentLifecycle(employment, actorId, today, trx) {
    const statuses = await repository.listStatuses([employment.id], false, trx);
    const terminal = statuses
      .filter((row) => terminalStatuses.has(row.status))
      .sort((left, right) =>
        dateOnly(left.effective_start).localeCompare(dateOnly(right.effective_start)),
      )[0];
    const values = terminal
      ? { record_status: 'inactive', employment_end_date: dateOnly(terminal.effective_start) }
      : { record_status: 'active', employment_end_date: null };
    try {
      await trx('employments')
        .where({ id: employment.id })
        .update({
          ...values,
          updated_by: actorId,
          updated_at: trx.fn.now(),
          version: trx.raw('version + 1'),
        });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY')
        throw new ConflictError(
          'ACTIVE_EMPLOYMENT',
          'The corrected status would overlap another active employment episode.',
        );
      throw error;
    }
    if (terminal && dateOnly(terminal.effective_start) > today)
      throw new ValidationError('Future-dated terminal employment statuses are not supported yet.');
  }

  return {
    async list(accessContext, input) {
      const asOfDate = await companyDate(input.companyId, input.asOfDate);
      const [rows, count] = await Promise.all([
        repository.list(accessContext, input, asOfDate),
        repository.count(accessContext, input, asOfDate),
      ]);
      return {
        items: rows.map(projectEmployee),
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total: Number(count.count),
          totalPages: Math.ceil(Number(count.count) / input.pageSize),
        },
        asOfDate,
      };
    },
    async get(id, accessContext, asOfDate) {
      const provisional = await repository.lockEmployee(id, database);
      if (!provisional) throw notFound();
      const date = await companyDate(provisional.company_id, asOfDate);
      return projectEmployee(await requireEmployee(id, accessContext, 'employee.view', date));
    },
    // Cross-domain callers (Recruitment conversion) pass their transaction so Employee,
    // Employment and the caller's immutable conversion record commit or roll back together.
    async create(actor, accessContext, input, context, transaction = null) {
      try {
        const createWithinTransaction = async (trx) => {
          const company = await repository.getCompany(input.companyId, trx);
          if (!company || company.status !== 'active')
            throw new ValidationError('The company is not active.');
          if (!scopeAllowsEmployeeCreation(accessContext, input)) throw notFound();
          if (!['probation', 'confirmed'].includes(input.initialStatus))
            throw new ValidationError('Initial employment status must be probation or confirmed.');
          const employeeId = await repository.createEmployee(
            {
              company_id: input.companyId,
              ...employeeValues(input),
              display_name: displayName(input),
              created_by: actor.userId,
              updated_by: actor.userId,
            },
            trx,
          );
          await trx('employee_personal_details').insert({
            employee_id: employeeId,
            company_id: input.companyId,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          await trx('employee_contacts').insert({
            employee_id: employeeId,
            company_id: input.companyId,
            created_by: actor.userId,
            updated_by: actor.userId,
          });
          const employmentId = await repository.createEmployment(
            {
              company_id: input.companyId,
              employee_id: employeeId,
              employee_code: input.employeeCode,
              employment_type: input.employmentType,
              joining_date: input.joiningDate,
              confirmation_date: input.confirmationDate ?? null,
              created_by: actor.userId,
              updated_by: actor.userId,
            },
            trx,
          );
          const assignment = assignmentValues(input.assignment);
          if (assignment.effective_start < input.joiningDate)
            throw new ValidationError('Assignment cannot begin before employment.');
          if (assignment.manager_employment_id)
            await repository.lockEmployments([assignment.manager_employment_id], trx);
          await validateAssignment(assignment, input.companyId, employmentId, trx);
          await repository.createStatus(
            {
              company_id: input.companyId,
              employment_id: employmentId,
              status: input.initialStatus,
              effective_start: input.joiningDate,
              effective_end: null,
              reason: input.statusReason,
              created_by: actor.userId,
            },
            trx,
          );
          await repository.createAssignment(
            {
              company_id: input.companyId,
              employment_id: employmentId,
              ...assignment,
              created_by: actor.userId,
            },
            trx,
          );
          await insertAuditEvent(trx, {
            actorUserId: actor.userId,
            companyId: input.companyId,
            actionCode: 'employee.create',
            outcome: 'success',
            recordType: 'employee',
            recordId: employeeId,
            permissionCode: 'employee.create',
            metadata: { employmentId, assignmentEffectiveStart: assignment.effective_start },
            ...auditContext(context),
          });
          return { id: employeeId, employmentId, version: 1 };
        };
        return transaction
          ? await createWithinTransaction(transaction)
          : await withTransaction(database, createWithinTransaction);
      } catch (error) {
        throw conflict(error);
      }
    },
    async update(actor, accessContext, id, input, context) {
      return withTransaction(database, async (trx) => {
        const locked = await repository.lockEmployee(id, trx);
        if (!locked) throw notFound();
        const date = await companyDate(locked.company_id, null, trx);
        await requireEmployee(id, accessContext, 'employee.update', date, trx);
        const values = employeeValues(input);
        const merged = {
          firstName: values.first_name ?? locked.first_name,
          middleName: values.middle_name === undefined ? locked.middle_name : values.middle_name,
          lastName: values.last_name ?? locked.last_name,
          preferredName:
            values.preferred_name === undefined ? locked.preferred_name : values.preferred_name,
        };
        values.display_name = displayName(merged);
        values.updated_by = actor.userId;
        if (!(await repository.updateEmployee(id, input.version, values, trx)))
          throw new ConflictError('STALE_VERSION', 'The employee was changed by another request.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: locked.company_id,
          actionCode: 'employee.update',
          outcome: 'success',
          recordType: 'employee',
          recordId: id,
          permissionCode: 'employee.update',
          metadata: {
            fromVersion: input.version,
            changedFields: Object.keys(values).filter((key) => key !== 'updated_by'),
          },
          ...auditContext(context),
        });
        return { id, version: input.version + 1 };
      });
    },
    async setRecordStatus(actor, accessContext, id, target, input, context) {
      const permission = `employee.${target === 'active' ? 'activate' : 'deactivate'}`;
      return withTransaction(database, async (trx) => {
        const locked = await repository.lockEmployee(id, trx);
        if (!locked) throw notFound();
        const date = await companyDate(locked.company_id, null, trx);
        await requireEmployee(id, accessContext, permission, date, trx);
        if (
          target === 'inactive' &&
          (await repository.listEmployments(id, locked.company_id, trx)).some(
            (employment) => employment.record_status === 'active',
          )
        )
          throw new ConflictError(
            'ACTIVE_EMPLOYMENT',
            'End the active employment before deactivating the employee record.',
          );
        const values = {
          record_status: target,
          deactivated_at: target === 'inactive' ? trx.fn.now() : null,
          deactivated_by: target === 'inactive' ? actor.userId : null,
          deactivation_reason: target === 'inactive' ? input.reason : null,
          updated_by: actor.userId,
        };
        if (!(await repository.updateEmployee(id, input.version, values, trx)))
          throw new ConflictError('STALE_VERSION', 'The employee was changed by another request.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: locked.company_id,
          actionCode: `employee.${target === 'active' ? 'activate' : 'deactivate'}`,
          outcome: 'success',
          recordType: 'employee',
          recordId: id,
          permissionCode: permission,
          reason: input.reason,
          ...auditContext(context),
        });
      });
    },
    async history(id, accessContext, asOfDate) {
      const employee = await repository.lockEmployee(id, database);
      if (!employee) throw notFound();
      const date = await companyDate(employee.company_id, asOfDate);
      await requireEmployee(id, accessContext, 'employee.view_history', date);
      const employments = await repository.listEmployments(id, employee.company_id);
      const ids = employments.map(({ id: employmentId }) => employmentId);
      return {
        employments,
        assignments: ids.length ? await repository.listAssignments(ids) : [],
        statuses: ids.length ? await repository.listStatuses(ids) : [],
      };
    },
    async createEmployment(actor, accessContext, employeeId, input, context) {
      try {
        return await withTransaction(database, async (trx) => {
          const employee = await repository.lockEmployee(employeeId, trx);
          if (!employee) throw notFound();
          const date = await companyDate(employee.company_id, input.joiningDate, trx);
          await requireEmployee(employeeId, accessContext, 'employee.create', date, trx);
          if (employee.record_status !== 'active')
            throw new ConflictError(
              'INACTIVE_EMPLOYEE_RECORD',
              'Reactivate the employee record before creating a new employment episode.',
            );
          if (
            (await repository.listEmployments(employeeId, employee.company_id, trx)).some(
              (row) => row.record_status === 'active',
            )
          )
            throw new ConflictError(
              'ACTIVE_EMPLOYMENT',
              'The employee already has an active employment episode.',
            );
          if (await repository.findEmploymentOverlap(employeeId, input.joiningDate, trx))
            throw new ConflictError(
              'EMPLOYMENT_PERIOD_OVERLAP',
              'Employment episodes cannot overlap.',
            );
          if (!['probation', 'confirmed'].includes(input.initialStatus))
            throw new ValidationError('Initial employment status must be probation or confirmed.');
          const employmentId = await repository.createEmployment(
            {
              company_id: employee.company_id,
              employee_id: employeeId,
              employee_code: input.employeeCode,
              employment_type: input.employmentType,
              joining_date: input.joiningDate,
              confirmation_date: input.confirmationDate ?? null,
              created_by: actor.userId,
              updated_by: actor.userId,
            },
            trx,
          );
          const assignment = assignmentValues(input.assignment);
          if (assignment.effective_start < input.joiningDate)
            throw new ValidationError('Assignment cannot begin before employment.');
          if (assignment.manager_employment_id)
            await repository.lockEmployments([assignment.manager_employment_id], trx);
          await validateAssignment(assignment, employee.company_id, employmentId, trx);
          await repository.createStatus(
            {
              company_id: employee.company_id,
              employment_id: employmentId,
              status: input.initialStatus,
              effective_start: input.joiningDate,
              effective_end: null,
              reason: input.statusReason,
              created_by: actor.userId,
            },
            trx,
          );
          await repository.createAssignment(
            {
              company_id: employee.company_id,
              employment_id: employmentId,
              ...assignment,
              created_by: actor.userId,
            },
            trx,
          );
          await insertAuditEvent(trx, {
            actorUserId: actor.userId,
            companyId: employee.company_id,
            actionCode: 'employee.employment_create',
            outcome: 'success',
            recordType: 'employment',
            recordId: employmentId,
            permissionCode: 'employee.create',
            reason: input.statusReason,
            metadata: { employeeId, assignmentEffectiveStart: assignment.effective_start },
            ...auditContext(context),
          });
          return { id: employmentId, employeeId, version: 1 };
        });
      } catch (error) {
        throw conflict(error);
      }
    },
    async addAssignment(actor, accessContext, employeeId, input, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(employeeId, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, input.effectiveStart, trx);
        const visible = await requireEmployee(
          employeeId,
          accessContext,
          'employee.manage_assignment',
          date,
          trx,
        );
        const employmentId = visible.employment_id;
        if (!employmentId)
          throw new ConflictError(
            'NO_ACTIVE_EMPLOYMENT',
            'No active employment is available for assignment.',
          );
        const values = assignmentValues(input);
        await repository.lockEmployments(
          [employmentId, values.manager_employment_id].filter(Boolean),
          trx,
        );
        await validateAssignment(values, employee.company_id, employmentId, trx);
        let superseded = input.supersedesAssignmentId
          ? await repository.getAssignment(input.supersedesAssignmentId, trx)
          : null;
        if (
          input.supersedesAssignmentId &&
          (!superseded ||
            Number(superseded.employment_id) !== Number(employmentId) ||
            superseded.history_status !== 'current')
        )
          throw new ConflictError(
            'INVALID_HISTORY_CORRECTION',
            'The assignment being corrected is not current for this employment.',
          );
        const overlap = await repository.findAssignmentOverlap(
          employmentId,
          values.effective_start,
          values.effective_end,
          superseded?.id,
          trx,
        );
        if (
          !superseded &&
          overlap &&
          dateOnly(overlap.effective_start) < values.effective_start &&
          (overlap.effective_end == null ||
            dateOnly(overlap.effective_end) >= values.effective_start)
        ) {
          superseded = overlap;
          if (!(await repository.supersedeAssignment(overlap.id, actor.userId, trx)))
            throw new ConflictError(
              'CONCURRENT_MODIFICATION',
              'The assignment history changed concurrently.',
            );
          await repository.createAssignment(
            {
              company_id: employee.company_id,
              employment_id: employmentId,
              branch_id: overlap.branch_id,
              department_id: overlap.department_id,
              designation_id: overlap.designation_id,
              grade_id: overlap.grade_id,
              cost_center_id: overlap.cost_center_id,
              work_calendar_id: overlap.work_calendar_id,
              manager_employment_id: overlap.manager_employment_id,
              effective_start: dateOnly(overlap.effective_start),
              effective_end: previousDate(values.effective_start),
              reason: input.reason,
              supersedes_assignment_id: overlap.id,
              created_by: actor.userId,
            },
            trx,
          );
        } else if (overlap)
          throw new ConflictError(
            'ASSIGNMENT_PERIOD_OVERLAP',
            'Assignment effective periods cannot overlap.',
          );
        if (
          input.supersedesAssignmentId &&
          !(await repository.supersedeAssignment(superseded.id, actor.userId, trx))
        )
          throw new ConflictError(
            'CONCURRENT_MODIFICATION',
            'The assignment history changed concurrently.',
          );
        const id = await repository.createAssignment(
          {
            company_id: employee.company_id,
            employment_id: employmentId,
            ...values,
            supersedes_assignment_id: superseded?.id ?? null,
            created_by: actor.userId,
          },
          trx,
        );
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: employee.company_id,
          actionCode: superseded ? 'employee.assignment_correct' : 'employee.assignment_create',
          outcome: 'success',
          recordType: 'employee_assignment',
          recordId: id,
          permissionCode: 'employee.manage_assignment',
          reason: input.reason,
          metadata: { employeeId, employmentId, supersedesAssignmentId: superseded?.id ?? null },
          ...auditContext(context),
        });
        return { id };
      });
    },
    async transitionStatus(actor, accessContext, employeeId, input, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(employeeId, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, input.effectiveStart, trx);
        await requireEmployee(employeeId, accessContext, 'employee.manage_status', date, trx);
        const employment = await repository.lockEmployment(input.employmentId, trx);
        if (
          !employment ||
          Number(employment.employee_id) !== Number(employeeId) ||
          Number(employment.company_id) !== Number(employee.company_id)
        )
          throw notFound();
        const today = await companyDate(employee.company_id, null, trx);
        if (terminalStatuses.has(input.status) && input.effectiveStart > today)
          throw new ValidationError(
            'Future-dated terminal employment statuses are not supported yet.',
          );
        if (terminalStatuses.has(input.status) && input.effectiveEnd)
          throw new ValidationError(
            'A terminal employment status cannot have an effective end date.',
          );
        let superseded = input.supersedesStatusHistoryId
          ? await repository.getStatus(input.supersedesStatusHistoryId, trx)
          : null;
        if (
          superseded &&
          (Number(superseded.employment_id) !== Number(employment.id) ||
            superseded.history_status !== 'current')
        )
          throw new ConflictError(
            'INVALID_HISTORY_CORRECTION',
            'The status being corrected is not current for this employment.',
          );
        if (!superseded) {
          const currentRows = await repository.listStatuses([employment.id], false, trx);
          const previous = currentRows
            .filter((row) => dateOnly(row.effective_start) <= input.effectiveStart)
            .sort((a, b) =>
              dateOnly(b.effective_start).localeCompare(dateOnly(a.effective_start)),
            )[0];
          if (previous && !transitions[previous.status].has(input.status))
            throw new ConflictError(
              'INVALID_STATUS_TRANSITION',
              'The requested employment status transition is not allowed.',
            );
          if (previous && dateOnly(previous.effective_start) === input.effectiveStart)
            throw new ConflictError(
              'STATUS_PERIOD_OVERLAP',
              'Use an explicit historical correction when replacing a status on the same effective date.',
            );
          if (
            previous &&
            (previous.effective_end == null ||
              dateOnly(previous.effective_end) >= input.effectiveStart)
          ) {
            superseded = previous;
            if (!(await repository.supersedeStatus(previous.id, actor.userId, trx)))
              throw new ConflictError(
                'CONCURRENT_MODIFICATION',
                'The status history changed concurrently.',
              );
            await repository.createStatus(
              {
                company_id: employee.company_id,
                employment_id: employment.id,
                status: previous.status,
                effective_start: dateOnly(previous.effective_start),
                effective_end: previousDate(input.effectiveStart),
                reason: input.reason,
                supersedes_status_history_id: previous.id,
                created_by: actor.userId,
              },
              trx,
            );
          }
        }
        const existing = await repository.findStatusOverlap(
          employment.id,
          input.effectiveStart,
          input.effectiveEnd ?? null,
          superseded?.id,
          trx,
        );
        if (existing)
          throw new ConflictError(
            'STATUS_PERIOD_OVERLAP',
            'Employment status effective periods cannot overlap.',
          );
        if (
          input.supersedesStatusHistoryId &&
          !(await repository.supersedeStatus(superseded.id, actor.userId, trx))
        )
          throw new ConflictError(
            'CONCURRENT_MODIFICATION',
            'The status history changed concurrently.',
          );
        const id = await repository.createStatus(
          {
            company_id: employee.company_id,
            employment_id: employment.id,
            status: input.status,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            reason: input.reason,
            supersedes_status_history_id: superseded?.id ?? null,
            created_by: actor.userId,
          },
          trx,
        );
        await synchronizeEmploymentLifecycle(employment, actor.userId, today, trx);
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: employee.company_id,
          actionCode: superseded ? 'employee.status_correct' : 'employee.status_transition',
          outcome: 'success',
          recordType: 'employment_status_history',
          recordId: id,
          permissionCode: 'employee.manage_status',
          reason: input.reason,
          metadata: {
            employeeId,
            employmentId: employment.id,
            status: input.status,
            supersedesStatusHistoryId: superseded?.id ?? null,
          },
          ...auditContext(context),
        });
        return { id };
      });
    },
    async getPersonal(actor, baseContext, id, context) {
      const employee = await repository.lockEmployee(id, database);
      if (!employee) throw notFound();
      const date = await companyDate(employee.company_id);
      await requireSensitive(actor, employee, baseContext, 'employee_personal.view', date);
      const row = await repository.getPersonal(id, employee.company_id);
      await insertAuditEvent(database, {
        actorUserId: actor.userId,
        companyId: employee.company_id,
        actionCode: 'employee_personal.view',
        outcome: 'success',
        recordType: 'employee',
        recordId: id,
        permissionCode: 'employee_personal.view',
        ...auditContext(context),
      });
      return projectPersonal(row);
    },
    async updatePersonal(actor, baseContext, id, input, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(id, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, null, trx);
        await requireSensitive(actor, employee, baseContext, 'employee_personal.update', date, trx);
        const values = personalValues(input);
        if (
          !(await repository.updatePersonal(
            id,
            input.version,
            { ...values, updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'Personal information changed concurrently.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: employee.company_id,
          actionCode: 'employee_personal.update',
          outcome: 'success',
          recordType: 'employee',
          recordId: id,
          permissionCode: 'employee_personal.update',
          metadata: { changedFields: Object.keys(values) },
          ...auditContext(context),
        });
        return { id, version: input.version + 1 };
      });
    },
    async getContact(actor, baseContext, id, context) {
      const employee = await repository.lockEmployee(id, database);
      if (!employee) throw notFound();
      const date = await companyDate(employee.company_id);
      await requireSensitive(actor, employee, baseContext, 'employee_contact.view', date);
      const [row, emergency] = await Promise.all([
        repository.getContact(id, employee.company_id),
        repository.listEmergencyContacts(id),
      ]);
      await insertAuditEvent(database, {
        actorUserId: actor.userId,
        companyId: employee.company_id,
        actionCode: 'employee_contact.view',
        outcome: 'success',
        recordType: 'employee',
        recordId: id,
        permissionCode: 'employee_contact.view',
        ...auditContext(context),
      });
      return projectContact(row, emergency);
    },
    async updateContact(actor, baseContext, id, input, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(id, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, null, trx);
        await requireSensitive(actor, employee, baseContext, 'employee_contact.update', date, trx);
        const verification = await authorizationService.requirePermission(
          actor,
          'employee_contact.verify_sensitive_change',
        );
        await requireEmployee(
          id,
          verification,
          'employee_contact.verify_sensitive_change',
          date,
          trx,
        );
        const values = contactValues(input);
        if (
          !(await repository.updateContact(
            id,
            input.version,
            { ...values, updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'Contact information changed concurrently.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: employee.company_id,
          actionCode: 'employee_contact.update',
          outcome: 'success',
          recordType: 'employee',
          recordId: id,
          permissionCode: 'employee_contact.update',
          metadata: { changedFields: Object.keys(values) },
          ...auditContext(context),
        });
        return { id, version: input.version + 1 };
      });
    },
    async createEmergencyContact(actor, baseContext, employeeId, input, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(employeeId, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, null, trx);
        await requireSensitive(actor, employee, baseContext, 'employee_contact.update', date, trx);
        const verification = await authorizationService.requirePermission(
          actor,
          'employee_contact.verify_sensitive_change',
        );
        await requireEmployee(
          employeeId,
          verification,
          'employee_contact.verify_sensitive_change',
          date,
          trx,
        );
        if (input.isPrimary) await repository.clearPrimaryContact(employeeId, actor.userId, trx);
        const id = await repository.createEmergencyContact(
          {
            company_id: employee.company_id,
            employee_id: employeeId,
            name: input.name,
            relationship: input.relationship,
            phone: input.phone,
            alternate_phone: input.alternatePhone ?? null,
            is_primary: input.isPrimary,
            created_by: actor.userId,
            updated_by: actor.userId,
          },
          trx,
        );
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: employee.company_id,
          actionCode: 'employee_contact.emergency_create',
          outcome: 'success',
          recordType: 'employee_emergency_contact',
          recordId: id,
          permissionCode: 'employee_contact.update',
          metadata: { employeeId, isPrimary: input.isPrimary },
          ...auditContext(context),
        });
        return { id, version: 1 };
      });
    },
    async updateEmergencyContact(actor, baseContext, employeeId, contactId, input, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(employeeId, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, null, trx);
        await requireSensitive(actor, employee, baseContext, 'employee_contact.update', date, trx);
        const verification = await authorizationService.requirePermission(
          actor,
          'employee_contact.verify_sensitive_change',
        );
        await requireEmployee(
          employeeId,
          verification,
          'employee_contact.verify_sensitive_change',
          date,
          trx,
        );
        const contact = await repository.getEmergencyContact(contactId, employeeId, trx);
        if (!contact) throw notFound();
        if (input.isPrimary) await repository.clearPrimaryContact(employeeId, actor.userId, trx);
        const values = {};
        for (const [key, column] of [
          ['name', 'name'],
          ['relationship', 'relationship'],
          ['phone', 'phone'],
          ['alternatePhone', 'alternate_phone'],
          ['isPrimary', 'is_primary'],
        ])
          if (input[key] !== undefined) values[column] = input[key];
        values.updated_by = actor.userId;
        if (!(await repository.updateEmergencyContact(contactId, input.version, values, trx)))
          throw new ConflictError('STALE_VERSION', 'The emergency contact changed concurrently.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: employee.company_id,
          actionCode: 'employee_contact.emergency_update',
          outcome: 'success',
          recordType: 'employee_emergency_contact',
          recordId: contactId,
          permissionCode: 'employee_contact.update',
          metadata: {
            employeeId,
            changedFields: Object.keys(values).filter((key) => key !== 'updated_by'),
          },
          ...auditContext(context),
        });
        return { id: contactId, version: input.version + 1 };
      });
    },
    async deactivateEmergencyContact(actor, baseContext, employeeId, contactId, input, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(employeeId, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, null, trx);
        await requireSensitive(actor, employee, baseContext, 'employee_contact.update', date, trx);
        const verification = await authorizationService.requirePermission(
          actor,
          'employee_contact.verify_sensitive_change',
        );
        await requireEmployee(
          employeeId,
          verification,
          'employee_contact.verify_sensitive_change',
          date,
          trx,
        );
        if (!(await repository.getEmergencyContact(contactId, employeeId, trx))) throw notFound();
        if (
          !(await repository.updateEmergencyContact(
            contactId,
            input.version,
            {
              status: 'inactive',
              is_primary: false,
              deactivated_at: trx.fn.now(),
              deactivated_by: actor.userId,
              deactivation_reason: input.reason,
              updated_by: actor.userId,
            },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The emergency contact changed concurrently.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: employee.company_id,
          actionCode: 'employee_contact.emergency_deactivate',
          outcome: 'success',
          recordType: 'employee_emergency_contact',
          recordId: contactId,
          permissionCode: 'employee_contact.update',
          reason: input.reason,
          metadata: { employeeId },
          ...auditContext(context),
        });
      });
    },
    async linkUser(actor, accessContext, id, userId, reason, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(id, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, null, trx);
        await requireEmployee(id, accessContext, 'employee.link_user', date, trx);
        if (!(await repository.findUser(userId, trx)))
          throw new ValidationError('The selected user does not exist.');
        try {
          if (
            !(await repository.updateEmployee(
              id,
              employee.version,
              { user_id: userId, updated_by: actor.userId },
              trx,
            ))
          )
            throw new ConflictError('STALE_VERSION', 'The employee changed concurrently.');
        } catch (error) {
          throw conflict(error);
        }
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: userId,
          companyId: employee.company_id,
          actionCode: 'employee.link_user',
          outcome: 'success',
          recordType: 'employee',
          recordId: id,
          permissionCode: 'employee.link_user',
          reason,
          ...auditContext(context),
        });
        return { id, version: employee.version + 1 };
      });
    },
    async unlinkUser(actor, accessContext, id, input, context) {
      return withTransaction(database, async (trx) => {
        const employee = await repository.lockEmployee(id, trx);
        if (!employee) throw notFound();
        const date = await companyDate(employee.company_id, null, trx);
        await requireEmployee(id, accessContext, 'employee.link_user', date, trx);
        if (
          !(await repository.updateEmployee(
            id,
            input.version,
            { user_id: null, updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The employee changed concurrently.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: employee.user_id,
          companyId: employee.company_id,
          actionCode: 'employee.unlink_user',
          outcome: 'success',
          recordType: 'employee',
          recordId: id,
          permissionCode: 'employee.link_user',
          reason: input.reason,
          ...auditContext(context),
        });
        return { id, version: input.version + 1 };
      });
    },
  };
}
