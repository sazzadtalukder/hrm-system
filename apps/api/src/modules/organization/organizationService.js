import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';

const resources = {
  branch: { get: 'getBranch', list: 'listBranches', count: 'countBranches' },
  department: { get: 'getDepartment', list: 'listDepartments', count: 'countDepartments' },
  designation: { get: 'getDesignation', list: 'listDesignations', count: 'countDesignations' },
  grade: { get: 'getGrade', list: 'listGrades', count: 'countGrades' },
  cost_center: { get: 'getCostCenter', list: 'listCostCenters', count: 'countCostCenters' },
  work_calendar: { get: 'getWorkCalendar', list: 'listWorkCalendars', count: 'countWorkCalendars' },
  holiday: { get: 'getHoliday', list: 'listHolidays', count: 'countHolidays' },
};

function notFound() {
  return new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested record was not found.',
    statusCode: 404,
  });
}

function scopeAllowsCompany(accessContext, companyId) {
  return accessContext.grants.some(
    (grant) => grant.scope_type === 'all' || Number(grant.company_id) === Number(companyId),
  );
}

function databaseConflict(error) {
  if (error.code === 'ER_DUP_ENTRY')
    return new ConflictError(
      'DUPLICATE_RECORD',
      'A record with these unique values already exists.',
    );
  if (error.code?.startsWith('ER_NO_REFERENCED'))
    return new ValidationError('A referenced organization record is invalid.');
  return error;
}

function masterValues(resource, input) {
  const values = {};
  for (const [inputKey, column] of [
    ['code', 'code'],
    ['name', 'name'],
    ['description', 'description'],
    ['rank', 'rank'],
    ['parentDepartmentId', 'parent_department_id'],
    ['defaultWorkCalendarId', 'default_work_calendar_id'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['addressLine1', 'address_line_1'],
    ['addressLine2', 'address_line_2'],
    ['city', 'city'],
    ['postalCode', 'postal_code'],
    ['timezone', 'timezone'],
    ['branchId', 'branch_id'],
    ['workCalendarId', 'work_calendar_id'],
    ['holidayDate', 'holiday_date'],
  ]) {
    if (input[inputKey] !== undefined) values[column] = input[inputKey];
  }
  if (resource !== 'grade') delete values.rank;
  if (resource !== 'department') delete values.parent_department_id;
  if (resource !== 'branch') {
    delete values.default_work_calendar_id;
    delete values.email;
    delete values.phone;
    delete values.address_line_1;
    delete values.address_line_2;
    delete values.city;
    delete values.postal_code;
  }
  if (resource !== 'work_calendar') delete values.timezone;
  if (resource !== 'holiday') {
    delete values.branch_id;
    delete values.work_calendar_id;
    delete values.holiday_date;
  }
  return values;
}

function auditContext(requestContext) {
  return { requestId: requestContext?.requestId, correlationId: requestContext?.correlationId };
}

export function createOrganizationService({ database, repository }) {
  async function list(resource, accessContext, input) {
    const config = resources[resource];
    const [items, totalRow] = await Promise.all([
      repository[config.list](accessContext, input),
      repository[config.count](accessContext, input),
    ]);
    return {
      items,
      pagination: { page: input.page, pageSize: input.pageSize, total: Number(totalRow.count) },
    };
  }

  async function get(resource, id, accessContext) {
    const record = await repository[resources[resource].get](id, accessContext);
    if (!record) throw notFound();
    if (resource === 'work_calendar')
      record.days = await repository.getCalendarDays(record.id, accessContext);
    return record;
  }

  async function validateReferences(resource, values, companyId, trx, recordId = null) {
    const references = [
      ['parent_department_id', 'departments'],
      ['default_work_calendar_id', 'work_calendars'],
      ['branch_id', 'branches'],
      ['work_calendar_id', 'work_calendars'],
    ];
    for (const [column, table] of references) {
      if (
        values[column] &&
        !(await repository.findOwnedReference(table, values[column], companyId, trx))
      )
        throw new ValidationError('A referenced record does not belong to the selected company.');
    }
    if (resource === 'department' && values.parent_department_id) {
      const [ancestors] = await repository.listDepartmentAncestors(
        values.parent_department_id,
        trx,
      );
      if (ancestors.some(({ id }) => Number(id) === Number(recordId)))
        throw new ConflictError(
          'DEPARTMENT_CYCLE',
          'The department hierarchy cannot contain a cycle.',
        );
    }
  }

  async function create(resource, actor, accessContext, input, requestContext) {
    if (!scopeAllowsCompany(accessContext, input.companyId)) throw notFound();
    return withTransaction(database, async (trx) => {
      const company = await repository.lockCompany(input.companyId, trx);
      if (!company || company.status !== 'active')
        throw new ValidationError('The company is not active.');
      const values = masterValues(resource, input);
      await validateReferences(resource, values, input.companyId, trx);
      try {
        const id = await repository.createRecord(
          resource,
          {
            company_id: input.companyId,
            ...values,
            created_by: actor.userId,
            updated_by: actor.userId,
          },
          accessContext,
          trx,
        );
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: input.companyId,
          actionCode: `${resource}.create`,
          outcome: 'success',
          recordType: resource,
          recordId: id,
          permissionCode: `${resource}.create`,
          ...auditContext(requestContext),
        });
        return { id };
      } catch (error) {
        throw databaseConflict(error);
      }
    });
  }

  async function update(resource, actor, accessContext, id, input, requestContext) {
    const permission = `${resource}.update`;
    return withTransaction(database, async (trx) => {
      const existing = await repository[resources[resource].get](
        id,
        accessContext,
        permission,
        trx,
      );
      if (!existing) throw notFound();
      await repository.lockCompany(existing.company_id, trx);
      const values = masterValues(resource, { ...input, id });
      await validateReferences(resource, values, existing.company_id, trx, id);
      try {
        const changed = await repository.updateRecord(
          resource,
          id,
          input.version,
          { ...values, updated_by: actor.userId },
          accessContext,
          permission,
          trx,
        );
        if (!changed)
          throw new ConflictError('STALE_VERSION', 'The record was changed by another request.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: existing.company_id,
          actionCode: `${resource}.update`,
          outcome: 'success',
          recordType: resource,
          recordId: id,
          permissionCode: permission,
          metadata: { fromVersion: input.version, changedFields: Object.keys(values) },
          ...auditContext(requestContext),
        });
        return { id, version: input.version + 1 };
      } catch (error) {
        throw databaseConflict(error);
      }
    });
  }

  async function setStatus(resource, actor, accessContext, id, status, input, requestContext) {
    const permission = status === 'inactive' ? `${resource}.deactivate` : `${resource}.update`;
    return withTransaction(database, async (trx) => {
      const existing = await repository[resources[resource].get](
        id,
        accessContext,
        permission,
        trx,
      );
      if (!existing) throw notFound();
      await repository.lockCompany(existing.company_id, trx);
      if (
        status === 'inactive' &&
        (await repository.hasActiveDependents(resource, existing.id, trx))
      )
        throw new ConflictError(
          'ACTIVE_DEPENDENCIES',
          'The record cannot be deactivated while active records depend on it.',
        );
      const changed = await repository.updateRecord(
        resource,
        id,
        input.version,
        {
          status,
          deactivated_at: status === 'inactive' ? trx.fn.now() : null,
          deactivated_by: status === 'inactive' ? actor.userId : null,
          deactivation_reason: status === 'inactive' ? input.reason : null,
          updated_by: actor.userId,
        },
        accessContext,
        permission,
        trx,
      );
      if (!changed)
        throw new ConflictError('STALE_VERSION', 'The record was changed by another request.');
      await insertAuditEvent(trx, {
        actorUserId: actor.userId,
        companyId: existing.company_id,
        actionCode: `${resource}.${status === 'active' ? 'activate' : 'deactivate'}`,
        outcome: 'success',
        recordType: resource,
        recordId: id,
        permissionCode: permission,
        reason: input.reason,
        ...auditContext(requestContext),
      });
    });
  }

  return {
    listCompanies: (accessContext) => repository.listCompanies(accessContext),
    async getCompany(id, accessContext) {
      const company = await repository.getCompany(id, accessContext);
      if (!company) throw notFound();
      return company;
    },
    async updateCompany(actor, accessContext, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const existing = await repository.getCompany(id, accessContext, 'company.update', trx);
        if (!existing) throw notFound();
        const values = {
          name: input.name,
          legal_name: input.legalName,
          country_code: input.countryCode,
          currency_code: input.currencyCode,
          timezone: input.timezone,
          locale: input.locale,
          email: input.email,
          phone: input.phone,
          address_line_1: input.addressLine1,
          address_line_2: input.addressLine2,
          city: input.city,
          postal_code: input.postalCode,
          updated_by: actor.userId,
        };
        const changed = await repository.updateCompany(
          id,
          input.version,
          values,
          accessContext,
          trx,
        );
        if (!changed)
          throw new ConflictError('STALE_VERSION', 'The company was changed by another request.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: id,
          actionCode: 'company.update',
          outcome: 'success',
          recordType: 'company',
          recordId: id,
          permissionCode: 'company.update',
          metadata: { fromVersion: input.version, changedFields: Object.keys(values) },
          ...auditContext(requestContext),
        });
        return { id, version: input.version + 1 };
      });
    },
    list,
    get,
    create,
    update,
    setStatus,
    async replaceCalendarDays(actor, accessContext, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const calendar = await repository.getWorkCalendar(
          id,
          accessContext,
          'work_calendar.update',
          trx,
        );
        if (!calendar) throw notFound();
        const updated = await repository.updateRecord(
          'work_calendar',
          id,
          input.version,
          { updated_by: actor.userId },
          accessContext,
          'work_calendar.update',
          trx,
        );
        if (!updated)
          throw new ConflictError('STALE_VERSION', 'The calendar was changed by another request.');
        await repository.replaceCalendarDays(
          id,
          calendar.company_id,
          input.days,
          actor.userId,
          trx,
        );
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: calendar.company_id,
          actionCode: 'work_calendar.days_update',
          outcome: 'success',
          recordType: 'work_calendar',
          recordId: id,
          permissionCode: 'work_calendar.update',
          metadata: { fromVersion: input.version },
          ...auditContext(requestContext),
        });
        return { id, version: input.version + 1 };
      });
    },
    async cancelHoliday(actor, accessContext, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const holiday = await repository.getHoliday(id, accessContext, 'holiday.cancel', trx);
        if (!holiday) throw notFound();
        const changed = await repository.updateRecord(
          'holiday',
          id,
          input.version,
          {
            status: 'cancelled',
            cancelled_at: trx.fn.now(),
            cancelled_by: actor.userId,
            cancellation_reason: input.reason,
            updated_by: actor.userId,
          },
          accessContext,
          'holiday.cancel',
          trx,
        );
        if (!changed)
          throw new ConflictError('STALE_VERSION', 'The holiday was changed by another request.');
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          companyId: holiday.company_id,
          actionCode: 'holiday.cancel',
          outcome: 'success',
          recordType: 'holiday',
          recordId: id,
          permissionCode: 'holiday.cancel',
          reason: input.reason,
          ...auditContext(requestContext),
        });
      });
    },
  };
}
