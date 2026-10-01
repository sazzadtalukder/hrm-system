import { assertAccessContext } from '../authorization/accessContext.js';

function applyScope(query, accessContext, asOfDate) {
  const grants = accessContext.grants;
  if (grants.some(({ scope_type: type }) => type === 'all')) return query;
  return query.where((scope) => {
    let hasClause = false;
    for (const grant of grants) {
      if (grant.scope_type === 'company') {
        scope.orWhere('employee.company_id', grant.company_id);
        hasClause = true;
      } else if (grant.scope_type === 'branch') {
        scope.orWhere((part) =>
          part
            .where('employee.company_id', grant.company_id)
            .where('assignment.branch_id', grant.branch_id),
        );
        hasClause = true;
      } else if (grant.scope_type === 'department') {
        scope.orWhere((part) =>
          part
            .where('employee.company_id', grant.company_id)
            .where('assignment.department_id', grant.department_id),
        );
        hasClause = true;
      } else if (grant.scope_type === 'own') {
        scope.orWhere((part) =>
          part
            .where('employee.company_id', grant.company_id)
            .where('employee.user_id', accessContext.actor.userId),
        );
        hasClause = true;
      } else if (grant.scope_type === 'direct_reports') {
        scope.orWhere((part) =>
          part.where('employee.company_id', grant.company_id).whereIn(
            'assignment.manager_employment_id',
            query.client
              .queryBuilder()
              .from('employments as manager_employment')
              .join(
                'employees as manager_employee',
                'manager_employee.id',
                'manager_employment.employee_id',
              )
              .select('manager_employment.id')
              .where('manager_employee.user_id', accessContext.actor.userId)
              .where('manager_employment.company_id', grant.company_id)
              .where('manager_employment.joining_date', '<=', asOfDate)
              .where((date) =>
                date
                  .whereNull('manager_employment.employment_end_date')
                  .orWhere('manager_employment.employment_end_date', '>=', asOfDate),
              ),
          ),
        );
        hasClause = true;
      }
    }
    if (!hasClause) scope.whereRaw('1 = 0');
  });
}

function employeeBase(database, accessContext, permission, asOfDate, trx = database) {
  assertAccessContext(accessContext, permission);
  let query = trx('employees as employee')
    .leftJoin('employments as employment', function joinEmployment() {
      this.on('employment.employee_id', 'employee.id')
        .andOn('employment.joining_date', '<=', trx.raw('?', [asOfDate]))
        .andOn(function endDate() {
          this.onNull('employment.employment_end_date').orOn(
            'employment.employment_end_date',
            '>=',
            trx.raw('?', [asOfDate]),
          );
        });
    })
    .leftJoin('employee_assignments as assignment', function joinAssignment() {
      this.on('assignment.employment_id', 'employment.id')
        .andOnVal('assignment.history_status', 'current')
        .andOn('assignment.effective_start', '<=', trx.raw('?', [asOfDate]))
        .andOn(function endDate() {
          this.onNull('assignment.effective_end').orOn(
            'assignment.effective_end',
            '>=',
            trx.raw('?', [asOfDate]),
          );
        });
    })
    .leftJoin('employment_status_history as employment_status', function joinStatus() {
      this.on('employment_status.employment_id', 'employment.id')
        .andOnVal('employment_status.history_status', 'current')
        .andOn('employment_status.effective_start', '<=', trx.raw('?', [asOfDate]))
        .andOn(function endDate() {
          this.onNull('employment_status.effective_end').orOn(
            'employment_status.effective_end',
            '>=',
            trx.raw('?', [asOfDate]),
          );
        });
    });
  query
    .leftJoin('branches as branch', function joinBranch() {
      this.on('branch.id', 'assignment.branch_id').andOn(
        'branch.company_id',
        'employee.company_id',
      );
    })
    .leftJoin('departments as department', function joinDepartment() {
      this.on('department.id', 'assignment.department_id').andOn(
        'department.company_id',
        'employee.company_id',
      );
    })
    .leftJoin('designations as designation', function joinDesignation() {
      this.on('designation.id', 'assignment.designation_id').andOn(
        'designation.company_id',
        'employee.company_id',
      );
    })
    .leftJoin('grades as grade', function joinGrade() {
      this.on('grade.id', 'assignment.grade_id').andOn('grade.company_id', 'employee.company_id');
    })
    .leftJoin('cost_centers as cost_center', function joinCostCenter() {
      this.on('cost_center.id', 'assignment.cost_center_id').andOn(
        'cost_center.company_id',
        'employee.company_id',
      );
    })
    .leftJoin('work_calendars as work_calendar', function joinWorkCalendar() {
      this.on('work_calendar.id', 'assignment.work_calendar_id').andOn(
        'work_calendar.company_id',
        'employee.company_id',
      );
    })
    .leftJoin('employments as manager_employment', function joinManagerEmployment() {
      this.on('manager_employment.id', 'assignment.manager_employment_id').andOn(
        'manager_employment.company_id',
        'employee.company_id',
      );
    })
    .leftJoin('employees as manager_employee', function joinManagerEmployee() {
      this.on('manager_employee.id', 'manager_employment.employee_id').andOn(
        'manager_employee.company_id',
        'employee.company_id',
      );
    });
  return applyScope(query, accessContext, asOfDate);
}

const employeeColumns = [
  'employee.*',
  'employment.id as employment_id',
  'employment.employee_code',
  'employment.employment_type',
  'employment.joining_date',
  'employment.confirmation_date',
  'employment.employment_end_date',
  'employment_status.status as employment_status',
  'assignment.id as assignment_id',
  'assignment.branch_id',
  'assignment.department_id',
  'assignment.designation_id',
  'assignment.grade_id',
  'assignment.cost_center_id',
  'assignment.work_calendar_id',
  'assignment.manager_employment_id',
  'branch.name as branch_name',
  'department.name as department_name',
  'designation.name as designation_name',
  'grade.name as grade_name',
  'cost_center.name as cost_center_name',
  'work_calendar.name as work_calendar_name',
  'work_calendar.code as work_calendar_code',
  'manager_employee.display_name as manager_display_name',
  'manager_employment.employee_code as manager_employee_code',
];

export function createEmployeeRepository(database) {
  return {
    list(accessContext, input, asOfDate) {
      let query = employeeBase(database, accessContext, 'employee.view', asOfDate).select(
        employeeColumns,
      );
      query.where('employee.company_id', input.companyId);
      if (input.recordStatus) query.where('employee.record_status', input.recordStatus);
      if (input.employmentStatus) query.where('employment_status.status', input.employmentStatus);
      for (const [inputKey, column] of [
        ['branchId', 'assignment.branch_id'],
        ['departmentId', 'assignment.department_id'],
        ['designationId', 'assignment.designation_id'],
        ['managerEmploymentId', 'assignment.manager_employment_id'],
      ])
        if (input[inputKey]) query.where(column, input[inputKey]);
      if (input.search)
        query.where((search) =>
          search
            .where('employee.display_name', 'like', `%${input.search}%`)
            .orWhere('employment.employee_code', 'like', `%${input.search}%`),
        );
      const sorts = {
        display_name: 'employee.display_name',
        employee_code: 'employment.employee_code',
        joining_date: 'employment.joining_date',
        created_at: 'employee.created_at',
      };
      return query
        .orderBy(sorts[input.sort], input.direction)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    count(accessContext, input, asOfDate) {
      let query = employeeBase(database, accessContext, 'employee.view', asOfDate).where(
        'employee.company_id',
        input.companyId,
      );
      if (input.recordStatus) query.where('employee.record_status', input.recordStatus);
      if (input.employmentStatus) query.where('employment_status.status', input.employmentStatus);
      for (const [inputKey, column] of [
        ['branchId', 'assignment.branch_id'],
        ['departmentId', 'assignment.department_id'],
        ['designationId', 'assignment.designation_id'],
        ['managerEmploymentId', 'assignment.manager_employment_id'],
      ])
        if (input[inputKey]) query.where(column, input[inputKey]);
      if (input.search)
        query.where((search) =>
          search
            .where('employee.display_name', 'like', `%${input.search}%`)
            .orWhere('employment.employee_code', 'like', `%${input.search}%`),
        );
      return query.countDistinct({ count: 'employee.id' }).first();
    },
    get(id, accessContext, permission, asOfDate, trx = database) {
      return employeeBase(database, accessContext, permission, asOfDate, trx)
        .select(employeeColumns)
        .where('employee.id', id)
        .first();
    },
    lockEmployee(id, trx) {
      return trx('employees').where({ id }).forUpdate().first();
    },
    lockEmployment(id, trx) {
      return trx('employments').where({ id }).forUpdate().first();
    },
    lockEmployments(ids, trx) {
      return trx('employments')
        .whereIn(
          'id',
          [...new Set(ids)].sort((a, b) => Number(a) - Number(b)),
        )
        .orderBy('id')
        .forUpdate();
    },
    getCompany(id, trx = database) {
      return trx('companies').where({ id }).first();
    },
    findOwnedReference(table, id, companyId, trx) {
      return trx(table).where({ id, company_id: companyId, status: 'active' }).first();
    },
    findOwnedEmployment(id, companyId, trx) {
      return trx('employments').where({ id, company_id: companyId }).first();
    },
    findUser(id, trx) {
      return trx('users').where({ id }).first();
    },
    async createEmployee(values, trx) {
      const [id] = await trx('employees').insert(values);
      return id;
    },
    async createEmployment(values, trx) {
      const [id] = await trx('employments').insert(values);
      return id;
    },
    async createAssignment(values, trx) {
      const [id] = await trx('employee_assignments').insert(values);
      return id;
    },
    async createStatus(values, trx) {
      const [id] = await trx('employment_status_history').insert(values);
      return id;
    },
    updateEmployee(id, version, values, trx) {
      return trx('employees')
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() });
    },
    listEmployments(employeeId, companyId, trx = database) {
      return trx('employments')
        .where({ employee_id: employeeId, company_id: companyId })
        .orderBy('joining_date', 'desc');
    },
    findEmploymentOverlap(employeeId, joiningDate, trx) {
      return trx('employments')
        .where({ employee_id: employeeId })
        .where((period) =>
          period.whereNull('employment_end_date').orWhere('employment_end_date', '>=', joiningDate),
        )
        .first();
    },
    listAssignments(employmentIds, includeSuperseded = true, trx = database) {
      let query = trx('employee_assignments')
        .whereIn('employment_id', employmentIds)
        .orderBy('effective_start', 'desc');
      if (!includeSuperseded) query.where('history_status', 'current');
      return query;
    },
    listStatuses(employmentIds, includeSuperseded = true, trx = database) {
      let query = trx('employment_status_history')
        .whereIn('employment_id', employmentIds)
        .orderBy('effective_start', 'desc');
      if (!includeSuperseded) query.where('history_status', 'current');
      return query;
    },
    findAssignmentOverlap(employmentId, start, end, excludedId, trx) {
      let query = trx('employee_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((period) => period.whereNull('effective_end').orWhere('effective_end', '>=', start));
      if (excludedId) query.whereNot('id', excludedId);
      return query.first();
    },
    findStatusOverlap(employmentId, start, end, excludedId, trx) {
      let query = trx('employment_status_history')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((period) => period.whereNull('effective_end').orWhere('effective_end', '>=', start));
      if (excludedId) query.whereNot('id', excludedId);
      return query.first();
    },
    getAssignment(id, trx) {
      return trx('employee_assignments').where({ id }).first();
    },
    getStatus(id, trx) {
      return trx('employment_status_history').where({ id }).first();
    },
    supersedeAssignment(id, actorId, trx) {
      return trx('employee_assignments').where({ id, history_status: 'current' }).update({
        history_status: 'superseded',
        superseded_at: trx.fn.now(),
        superseded_by: actorId,
      });
    },
    supersedeStatus(id, actorId, trx) {
      return trx('employment_status_history').where({ id, history_status: 'current' }).update({
        history_status: 'superseded',
        superseded_at: trx.fn.now(),
        superseded_by: actorId,
      });
    },
    async hasReportingCycle(employmentId, managerEmploymentId, asOfDate, trx) {
      if (!managerEmploymentId) return false;
      const [rows] = await trx.raw(
        `WITH RECURSIVE chain AS (
        SELECT employment_id, manager_employment_id FROM employee_assignments
        WHERE employment_id = ? AND history_status = 'current' AND effective_start <= ? AND (effective_end IS NULL OR effective_end >= ?)
        UNION ALL
        SELECT a.employment_id, a.manager_employment_id FROM employee_assignments a
        JOIN chain c ON a.employment_id = c.manager_employment_id
        WHERE a.history_status = 'current' AND a.effective_start <= ? AND (a.effective_end IS NULL OR a.effective_end >= ?)
      ) SELECT employment_id, manager_employment_id FROM chain WHERE manager_employment_id = ? LIMIT 1`,
        [managerEmploymentId, asOfDate, asOfDate, asOfDate, asOfDate, employmentId],
      );
      return rows.length > 0;
    },
    getPersonal(employeeId, companyId, trx = database) {
      return trx('employee_personal_details')
        .where({ employee_id: employeeId, company_id: companyId })
        .first();
    },
    updatePersonal(employeeId, version, values, trx) {
      return trx('employee_personal_details')
        .where({ employee_id: employeeId, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() });
    },
    getContact(employeeId, companyId, trx = database) {
      return trx('employee_contacts')
        .where({ employee_id: employeeId, company_id: companyId })
        .first();
    },
    updateContact(employeeId, version, values, trx) {
      return trx('employee_contacts')
        .where({ employee_id: employeeId, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() });
    },
    listEmergencyContacts(employeeId, trx = database) {
      return trx('employee_emergency_contacts')
        .where({ employee_id: employeeId })
        .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'name' }]);
    },
    clearPrimaryContact(employeeId, actorId, trx) {
      return trx('employee_emergency_contacts')
        .where({ employee_id: employeeId, status: 'active', is_primary: true })
        .update({
          is_primary: false,
          updated_by: actorId,
          updated_at: trx.fn.now(),
          version: trx.raw('version + 1'),
        });
    },
    async createEmergencyContact(values, trx) {
      const [id] = await trx('employee_emergency_contacts').insert(values);
      return id;
    },
    getEmergencyContact(id, employeeId, trx) {
      return trx('employee_emergency_contacts').where({ id, employee_id: employeeId }).first();
    },
    updateEmergencyContact(id, version, values, trx) {
      return trx('employee_emergency_contacts')
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() });
    },
  };
}
