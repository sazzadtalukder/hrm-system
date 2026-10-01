import { assertAccessContext } from '../authorization/accessContext.js';

const tables = {
  branch: 'branches',
  department: 'departments',
  designation: 'designations',
  grade: 'grades',
  cost_center: 'cost_centers',
  work_calendar: 'work_calendars',
  holiday: 'holidays',
};

function applyScope(query, accessContext, alias, resource) {
  const grants = accessContext.grants;
  if (grants.some(({ scope_type: type }) => type === 'all')) return query;
  const companies = grants
    .filter(({ scope_type: type }) => ['company', 'own', 'direct_reports'].includes(type))
    .map(({ company_id: id }) => id);
  const branches = grants
    .filter(({ scope_type: type }) => type === 'branch')
    .map(({ branch_id: id }) => id);
  const departments = grants
    .filter(({ scope_type: type }) => type === 'department')
    .map(({ department_id: id }) => id);
  return query.where((builder) => {
    if (companies.length) builder.orWhereIn(`${alias}.company_id`, companies);
    if (resource === 'branch' && branches.length) builder.orWhereIn(`${alias}.id`, branches);
    if (resource === 'department' && departments.length)
      builder.orWhereIn(`${alias}.id`, departments);
    if (
      !companies.length &&
      !(resource === 'branch' && branches.length) &&
      !(resource === 'department' && departments.length)
    )
      builder.whereRaw('1 = 0');
  });
}

function assertPermission(accessContext, action) {
  assertAccessContext(accessContext, action);
}

function listRecords(database, resource, accessContext, queryInput) {
  const table = tables[resource];
  assertPermission(accessContext, `${resource}.view`);
  let query = database(`${table} as record`).select('record.*');
  query = applyScope(query, accessContext, 'record', resource).where(
    'record.company_id',
    queryInput.companyId,
  );
  if (queryInput.status) query.where('record.status', queryInput.status);
  if (queryInput.search)
    query.where((builder) => {
      builder.whereLike('record.name', `%${queryInput.search}%`);
      if (resource !== 'holiday') builder.orWhereLike('record.code', `%${queryInput.search}%`);
    });
  const allowedSort =
    resource === 'holiday'
      ? queryInput.sort
      : queryInput.sort === 'holiday_date'
        ? 'name'
        : queryInput.sort;
  return query
    .orderBy(`record.${allowedSort}`, queryInput.direction)
    .limit(queryInput.pageSize)
    .offset((queryInput.page - 1) * queryInput.pageSize);
}

function countRecords(database, resource, accessContext, queryInput) {
  const table = tables[resource];
  assertPermission(accessContext, `${resource}.view`);
  let query = database(`${table} as record`);
  query = applyScope(query, accessContext, 'record', resource).where(
    'record.company_id',
    queryInput.companyId,
  );
  if (queryInput.status) query.where('record.status', queryInput.status);
  if (queryInput.search)
    query.where((builder) => {
      builder.whereLike('record.name', `%${queryInput.search}%`);
      if (resource !== 'holiday') builder.orWhereLike('record.code', `%${queryInput.search}%`);
    });
  return query.count({ count: '*' }).first();
}

function getRecord(
  database,
  resource,
  id,
  accessContext,
  permission = `${resource}.view`,
  trx = database,
) {
  const table = tables[resource];
  assertPermission(accessContext, permission);
  return applyScope(
    trx(`${table} as record`).select('record.*').where('record.id', id),
    accessContext,
    'record',
    resource,
  ).first();
}

export function createOrganizationRepository(database) {
  return {
    listCompanies(accessContext) {
      assertPermission(accessContext, 'company.view');
      let query = database('companies as company').select('company.*');
      if (!accessContext.grants.some(({ scope_type: type }) => type === 'all'))
        query.whereIn(
          'company.id',
          accessContext.grants.map(({ company_id: id }) => id).filter(Boolean),
        );
      return query.orderBy('company.name');
    },
    getCompany(id, accessContext, permission = 'company.view', trx = database) {
      assertPermission(accessContext, permission);
      let query = trx('companies').where({ id });
      if (!accessContext.grants.some(({ scope_type: type }) => type === 'all'))
        query.whereIn(
          'id',
          accessContext.grants.map(({ company_id: companyId }) => companyId).filter(Boolean),
        );
      return query.first();
    },
    updateCompany(id, version, changes, accessContext, trx) {
      assertPermission(accessContext, 'company.update');
      return trx('companies')
        .where({ id, version })
        .update({ ...changes, version: version + 1, updated_at: trx.fn.now() });
    },
    listBranches(accessContext, input) {
      return listRecords(database, 'branch', accessContext, input);
    },
    countBranches(accessContext, input) {
      return countRecords(database, 'branch', accessContext, input);
    },
    getBranch(id, accessContext, permission, trx) {
      return getRecord(database, 'branch', id, accessContext, permission, trx);
    },
    listDepartments(accessContext, input) {
      return listRecords(database, 'department', accessContext, input);
    },
    countDepartments(accessContext, input) {
      return countRecords(database, 'department', accessContext, input);
    },
    getDepartment(id, accessContext, permission, trx) {
      return getRecord(database, 'department', id, accessContext, permission, trx);
    },
    listDesignations(accessContext, input) {
      return listRecords(database, 'designation', accessContext, input);
    },
    countDesignations(accessContext, input) {
      return countRecords(database, 'designation', accessContext, input);
    },
    getDesignation(id, accessContext, permission, trx) {
      return getRecord(database, 'designation', id, accessContext, permission, trx);
    },
    listGrades(accessContext, input) {
      return listRecords(database, 'grade', accessContext, input);
    },
    countGrades(accessContext, input) {
      return countRecords(database, 'grade', accessContext, input);
    },
    getGrade(id, accessContext, permission, trx) {
      return getRecord(database, 'grade', id, accessContext, permission, trx);
    },
    listCostCenters(accessContext, input) {
      return listRecords(database, 'cost_center', accessContext, input);
    },
    countCostCenters(accessContext, input) {
      return countRecords(database, 'cost_center', accessContext, input);
    },
    getCostCenter(id, accessContext, permission, trx) {
      return getRecord(database, 'cost_center', id, accessContext, permission, trx);
    },
    listWorkCalendars(accessContext, input) {
      return listRecords(database, 'work_calendar', accessContext, input);
    },
    countWorkCalendars(accessContext, input) {
      return countRecords(database, 'work_calendar', accessContext, input);
    },
    getWorkCalendar(id, accessContext, permission, trx) {
      return getRecord(database, 'work_calendar', id, accessContext, permission, trx);
    },
    listHolidays(accessContext, input) {
      return listRecords(database, 'holiday', accessContext, input);
    },
    countHolidays(accessContext, input) {
      return countRecords(database, 'holiday', accessContext, input);
    },
    getHoliday(id, accessContext, permission, trx) {
      return getRecord(database, 'holiday', id, accessContext, permission, trx);
    },
    async createRecord(resource, values, accessContext, trx) {
      assertPermission(accessContext, `${resource}.create`);
      const [id] = await trx(tables[resource]).insert(values);
      return id;
    },
    updateRecord(resource, id, version, values, accessContext, permission, trx) {
      assertPermission(accessContext, permission);
      return trx(tables[resource])
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() });
    },
    lockCompany(id, trx) {
      return trx('companies').where({ id }).forUpdate().first();
    },
    lockDepartment(id, trx) {
      return trx('departments').where({ id }).forUpdate().first();
    },
    findOwnedReference(table, id, companyId, trx) {
      return trx(table).where({ id, company_id: companyId }).first();
    },
    async hasActiveDependents(resource, id, trx) {
      if (resource === 'department')
        return Boolean(
          await trx('departments')
            .where({ parent_department_id: id, status: 'active' })
            .first('id'),
        );
      if (resource === 'work_calendar')
        return Boolean(
          await trx('branches')
            .where({ default_work_calendar_id: id, status: 'active' })
            .first('id'),
        );
      return false;
    },
    listDepartmentAncestors(id, trx) {
      return trx.raw(
        `WITH RECURSIVE ancestors AS (
          SELECT id, parent_department_id FROM departments WHERE id = ?
          UNION ALL
          SELECT department.id, department.parent_department_id
          FROM departments department JOIN ancestors ON department.id = ancestors.parent_department_id
        ) SELECT id FROM ancestors`,
        [id],
      );
    },
    replaceCalendarDays(calendarId, companyId, days, actorId, trx) {
      return trx('work_calendar_days')
        .where({ work_calendar_id: calendarId })
        .del()
        .then(() =>
          trx('work_calendar_days').insert(
            days.map((day) => ({
              company_id: companyId,
              work_calendar_id: calendarId,
              weekday: day.weekday,
              is_working_day: day.isWorkingDay,
              start_time: day.startTime,
              end_time: day.endTime,
              break_minutes: day.breakMinutes,
              created_by: actorId,
              updated_by: actorId,
            })),
          ),
        );
    },
    getCalendarDays(calendarId, accessContext) {
      assertPermission(accessContext, 'work_calendar.view');
      return database('work_calendar_days')
        .where({ work_calendar_id: calendarId })
        .orderBy('weekday');
    },
  };
}
