import { assertAccessContext } from '../authorization/accessContext.js';

function companyAllowed(context, companyId) {
  return context.grants.some(
    (g) => g.scope_type === 'all' || Number(g.company_id) === Number(companyId),
  );
}

function companyWideAllowed(context, companyId) {
  return context.grants.some(
    (grant) =>
      grant.scope_type === 'all' ||
      (grant.scope_type === 'company' && Number(grant.company_id) === Number(companyId)),
  );
}

function recordAllowed(context, record) {
  return context.grants.some(
    (grant) =>
      grant.scope_type === 'all' ||
      (Number(grant.company_id) === Number(record.company_id) &&
        (grant.scope_type === 'company' ||
          (grant.scope_type === 'branch' &&
            Number(grant.branch_id) === Number(record.branch_id_snapshot ?? record.branch_id)) ||
          (grant.scope_type === 'department' &&
            Number(grant.department_id) ===
              Number(record.department_id_snapshot ?? record.department_id)))),
  );
}

export function createPayrollRepository(database) {
  return {
    companyAllowed,
    companyWideAllowed,
    recordAllowed,
    getCompany: (id, trx = database) => trx('companies').where({ id }).first(),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    findPeriodOverlap: (companyId, start, end, trx) =>
      trx('payroll_periods')
        .where({ company_id: companyId })
        .where('period_start', '<=', end)
        .where('period_end', '>=', start)
        .first(),
    createPeriod: async (values, trx) => (await trx('payroll_periods').insert(values))[0],
    listPeriods(context, input) {
      assertAccessContext(context, 'payroll_period.view');
      if (!companyAllowed(context, input.companyId)) return [];
      return database('payroll_periods')
        .where({ company_id: input.companyId })
        .orderBy('period_start', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    getPeriod: (id, companyId, trx = database) =>
      trx('payroll_periods').where({ id, company_id: companyId }).first(),
    lockPeriod: (id, trx) => trx('payroll_periods').where({ id }).forUpdate().first(),
    updatePeriod: (id, version, values, trx) =>
      trx('payroll_periods')
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() }),
    createComponent: async (values, trx) => (await trx('payroll_components').insert(values))[0],
    createComponentVersion: (values, trx) => trx('payroll_component_versions').insert(values),
    lockComponent: (id, trx) => trx('payroll_components').where({ id }).forUpdate().first(),
    updateComponent: (id, version, values, trx) =>
      trx('payroll_components')
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() }),
    listComponents(context, input) {
      assertAccessContext(context, 'payroll_component.view');
      if (!companyAllowed(context, input.companyId)) return [];
      return database('payroll_components').where({ company_id: input.companyId }).orderBy('name');
    },
    lockEmployment: (id, trx) => trx('employments').where({ id }).forUpdate().first(),
    getEmployment: (id, companyId, trx = database) =>
      trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .where({ 'employment.id': id, 'employment.company_id': companyId })
        .select('employment.*', 'employee.display_name', 'employee.user_id')
        .first(),
    getEmploymentById: (id, trx = database) =>
      trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .where('employment.id', id)
        .select('employment.*', 'employee.display_name', 'employee.user_id')
        .first(),
    getEmploymentAssignment: (employmentId, date, trx = database) =>
      trx('employee_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    findCompOverlap: (employmentId, start, end, trx) =>
      trx('employment_compensation_periods')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', start))
        .first(),
    createCompensation: async (values, trx) =>
      (await trx('employment_compensation_periods').insert(values))[0],
    listCompensation: (employmentId, trx = database) =>
      trx('employment_compensation_periods')
        .where({ employment_id: employmentId })
        .orderBy('effective_start', 'desc'),
    findRecurringOverlap: (employmentId, componentId, start, end, trx) =>
      trx('employment_recurring_payroll_components')
        .where({
          employment_id: employmentId,
          payroll_component_id: componentId,
          history_status: 'current',
        })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', start))
        .first(),
    createRecurring: async (values, trx) =>
      (await trx('employment_recurring_payroll_components').insert(values))[0],
    listRecurring: (employmentId, trx = database) =>
      trx('employment_recurring_payroll_components')
        .where({ employment_id: employmentId })
        .orderBy('effective_start', 'desc'),
    createInput: async (values, trx) => (await trx('payroll_one_time_inputs').insert(values))[0],
    lockRun: (id, trx) => trx('payroll_runs').where({ id }).forUpdate().first(),
    getRun(id, context, permission = 'payroll.view', trx = database) {
      assertAccessContext(context, permission);
      let q = trx('payroll_runs as run')
        .join('payroll_periods as period', 'period.id', 'run.payroll_period_id')
        .where('run.id', id)
        .select(
          'run.*',
          'period.period_start',
          'period.period_end',
          'period.payment_date',
          'period.code as period_code',
        );
      if (!context.grants.some((g) => g.scope_type === 'all'))
        q.whereIn('run.company_id', context.grants.map((g) => g.company_id).filter(Boolean));
      if (!context.grants.some((g) => ['all', 'company'].includes(g.scope_type))) {
        const branches = context.grants
          .filter((g) => g.scope_type === 'branch')
          .map((g) => g.branch_id);
        const departments = context.grants
          .filter((g) => g.scope_type === 'department')
          .map((g) => g.department_id);
        q.whereNotExists(function () {
          this.select(trx.raw('1'))
            .from('payroll_run_employees as scoped_member')
            .whereRaw('scoped_member.payroll_run_id = run.id')
            .where((outside) => {
              if (branches.length && departments.length)
                outside
                  .whereNotIn('scoped_member.branch_id_snapshot', branches)
                  .whereNotIn('scoped_member.department_id_snapshot', departments);
              else if (branches.length)
                outside.whereNotIn('scoped_member.branch_id_snapshot', branches);
              else if (departments.length)
                outside.whereNotIn('scoped_member.department_id_snapshot', departments);
              else outside.whereRaw('1=1');
            });
        });
      }
      return q.first();
    },
    listRuns(context, input) {
      assertAccessContext(context, 'payroll.view');
      let q = database('payroll_runs as run')
        .join('payroll_periods as period', 'period.id', 'run.payroll_period_id')
        .where('run.company_id', input.companyId)
        .select('run.*', 'period.code as period_code', 'period.period_start', 'period.period_end');
      if (!context.grants.some((g) => g.scope_type === 'all'))
        q.whereIn('run.company_id', context.grants.map((g) => g.company_id).filter(Boolean));
      if (!context.grants.some((g) => ['all', 'company'].includes(g.scope_type))) {
        const branches = context.grants
          .filter((g) => g.scope_type === 'branch')
          .map((g) => g.branch_id);
        const departments = context.grants
          .filter((g) => g.scope_type === 'department')
          .map((g) => g.department_id);
        q.whereNotExists(function () {
          this.select(database.raw('1'))
            .from('payroll_run_employees as scoped_member')
            .whereRaw('scoped_member.payroll_run_id = run.id')
            .where((outside) => {
              if (branches.length && departments.length)
                outside
                  .whereNotIn('scoped_member.branch_id_snapshot', branches)
                  .whereNotIn('scoped_member.department_id_snapshot', departments);
              else if (branches.length)
                outside.whereNotIn('scoped_member.branch_id_snapshot', branches);
              else if (departments.length)
                outside.whereNotIn('scoped_member.department_id_snapshot', departments);
              else outside.whereRaw('1=1');
            });
        });
      }
      if (input.status) q.where('run.status', input.status);
      return q
        .orderBy('period.period_start', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    createRun: async (values, trx) => (await trx('payroll_runs').insert(values))[0],
    resolvePopulation(input, period, context, trx) {
      let q = trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .leftJoin('employee_assignments as assignment', function () {
          this.on('assignment.employment_id', 'employment.id')
            .andOnVal('assignment.history_status', 'current')
            .andOn('assignment.effective_start', '<=', trx.raw('?', [period.period_end]))
            .andOn(function () {
              this.onNull('assignment.effective_end').orOn(
                'assignment.effective_end',
                '>=',
                trx.raw('?', [period.period_start]),
              );
            });
        })
        .where('employment.company_id', input.companyId)
        .where('employment.joining_date', '<=', period.period_end)
        .where((x) =>
          x
            .whereNull('employment.employment_end_date')
            .orWhere('employment.employment_end_date', '>=', period.period_start),
        )
        .select(
          'employment.id as employment_id',
          'employment.employment_end_date',
          'employment.employee_code',
          'employee.display_name',
          'assignment.branch_id',
          'assignment.department_id',
        )
        .distinct();
      if (input.employmentIds) q.whereIn('employment.id', input.employmentIds);
      if (input.branchId) q.where('assignment.branch_id', input.branchId);
      if (input.departmentId) q.where('assignment.department_id', input.departmentId);
      if (!context.grants.some((g) => g.scope_type === 'all'))
        q.where((scope) => {
          let any = false;
          for (const g of context.grants) {
            if (g.scope_type === 'company') {
              scope.orWhere('employment.company_id', g.company_id);
              any = true;
            } else if (g.scope_type === 'branch') {
              scope.orWhere('assignment.branch_id', g.branch_id);
              any = true;
            } else if (g.scope_type === 'department') {
              scope.orWhere('assignment.department_id', g.department_id);
              any = true;
            }
          }
          if (!any) scope.whereRaw('1=0');
        });
      return q;
    },
    addRunEmployees: (values, trx) => trx('payroll_run_employees').insert(values),
    listRunEmployees: (runId, trx = database) =>
      trx('payroll_run_employees').where({ payroll_run_id: runId }).orderBy('id'),
    nextAttemptNumber: async (runId, trx) =>
      Number(
        (
          await trx('payroll_calculation_attempts')
            .where({ payroll_run_id: runId })
            .max({ value: 'attempt_number' })
            .first()
        ).value ?? 0,
      ) + 1,
    createAttempt: async (values, trx) =>
      (await trx('payroll_calculation_attempts').insert(values))[0],
    effectiveCompensation: (employmentId, date, trx) =>
      trx('employment_compensation_periods')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .orderBy('effective_start', 'desc')
        .first(),
    recurringAt: (employmentId, date, trx) =>
      trx('employment_recurring_payroll_components as recurring')
        .join('payroll_components as component', 'component.id', 'recurring.payroll_component_id')
        .leftJoin('payroll_component_versions as version', function () {
          this.on('version.payroll_component_id', 'component.id')
            .andOnVal('version.history_status', 'current')
            .andOn('version.effective_start', '<=', trx.raw('?', [date]))
            .andOn(function () {
              this.onNull('version.effective_end').orOn(
                'version.effective_end',
                '>=',
                trx.raw('?', [date]),
              );
            });
        })
        .where({
          'recurring.employment_id': employmentId,
          'recurring.history_status': 'current',
          'component.status': 'active',
        })
        .where('recurring.effective_start', '<=', date)
        .where((q) =>
          q.whereNull('recurring.effective_end').orWhere('recurring.effective_end', '>=', date),
        )
        .select(
          'recurring.*',
          'component.code',
          'component.name',
          'component.component_type',
          'version.show_on_payslip',
        ),
    inputsFor: (periodId, employmentId, trx) =>
      trx('payroll_one_time_inputs as input')
        .join('payroll_components as component', 'component.id', 'input.payroll_component_id')
        .where({
          'input.payroll_period_id': periodId,
          'input.employment_id': employmentId,
          'input.status': 'active',
        })
        .select('input.*', 'component.code', 'component.name', 'component.component_type'),
    attendanceSummary: (companyId, employmentId, start, end, trx) =>
      trx('attendance_records as record')
        .join('attendance_record_versions as version', function () {
          this.on('version.attendance_record_id', 'record.id').andOn(
            'version.version_number',
            'record.current_version_number',
          );
        })
        .where({ 'record.company_id': companyId, 'record.employment_id': employmentId })
        .whereBetween('record.attendance_date', [start, end])
        .groupBy('version.status')
        .select('version.status')
        .count({ count: '*' }),
    leaveSummary: (companyId, employmentId, start, end, trx) =>
      trx('leave_request_days as day')
        .join('leave_requests as request', 'request.id', 'day.leave_request_id')
        .where({
          'request.company_id': companyId,
          'request.employment_id': employmentId,
          'request.status': 'approved',
        })
        .whereBetween('day.leave_date', [start, end])
        .sum({ units: 'day.units' })
        .first(),
    activeResult: (runEmployeeId, trx) =>
      trx('payroll_result_versions as result')
        .where({ 'result.payroll_run_employee_id': runEmployeeId })
        .whereNotExists(function () {
          this.select(trx.raw('1'))
            .from('payroll_result_state_events as state')
            .whereRaw('state.payroll_result_version_id = result.id')
            .whereIn('state.state', ['superseded', 'reversed']);
        })
        .orderBy('result.version_number', 'desc')
        .first('result.*'),
    createResultState: (values, trx) => trx('payroll_result_state_events').insert(values),
    nextResultVersion: async (runEmployeeId, trx) =>
      Number(
        (
          await trx('payroll_result_versions')
            .where({ payroll_run_employee_id: runEmployeeId })
            .max({ value: 'version_number' })
            .first()
        ).value ?? 0,
      ) + 1,
    createResult: async (values, trx) => (await trx('payroll_result_versions').insert(values))[0],
    createAttendanceSnapshot: (values, trx) => trx('payroll_attendance_summaries').insert(values),
    createLeaveSnapshot: (values, trx) => trx('payroll_leave_summaries').insert(values),
    cloneResultSnapshots: async (fromResultId, toResultId, companyId, trx) => {
      await trx.raw(
        `INSERT INTO payroll_attendance_summaries
          (company_id, payroll_result_version_id, present_days, absent_days, incomplete_days,
           on_leave_days, rest_days, holiday_days, configuration_exception_days, source_record_count)
         SELECT company_id, ?, present_days, absent_days, incomplete_days, on_leave_days,
           rest_days, holiday_days, configuration_exception_days, source_record_count
         FROM payroll_attendance_summaries WHERE payroll_result_version_id = ? AND company_id = ?`,
        [toResultId, fromResultId, companyId],
      );
      await trx.raw(
        `INSERT INTO payroll_leave_summaries
          (company_id, payroll_result_version_id, approved_units)
         SELECT company_id, ?, approved_units
         FROM payroll_leave_summaries WHERE payroll_result_version_id = ? AND company_id = ?`,
        [toResultId, fromResultId, companyId],
      );
    },
    createItems: (values, trx) => trx('payroll_result_items').insert(values),
    updateRunEmployee: (id, values, trx) =>
      trx('payroll_run_employees').where({ id }).update(values),
    finishAttempt: (id, values, trx) =>
      trx('payroll_calculation_attempts').where({ id }).update(values),
    createTotals: (values, trx) => trx('payroll_control_totals').insert(values),
    updateRun: (id, workflowVersion, values, trx) =>
      trx('payroll_runs')
        .where({ id, workflow_version: workflowVersion })
        .update({
          ...values,
          workflow_version: workflowVersion + 1,
          version: trx.raw('version + 1'),
          updated_at: trx.fn.now(),
        }),
    createState: (values, trx) => trx('payroll_state_events').insert(values),
    nextApprovalAttempt: async (runId, trx) =>
      Number(
        (
          await trx('payroll_approval_attempts')
            .where({ payroll_run_id: runId })
            .max({ value: 'attempt_number' })
            .first()
        ).value ?? 0,
      ) + 1,
    createApprovalAttempt: async (values, trx) =>
      (await trx('payroll_approval_attempts').insert(values))[0],
    pendingApprovalAttempt: (runId, trx) =>
      trx('payroll_approval_attempts')
        .where({ payroll_run_id: runId, status: 'pending' })
        .forUpdate()
        .first(),
    finishApprovalAttempt: (id, status, trx) =>
      trx('payroll_approval_attempts')
        .where({ id, status: 'pending' })
        .update({ status, completed_at: trx.fn.now() }),
    decisionByKey: (companyId, key, trx) =>
      trx('payroll_approval_decisions')
        .where({ company_id: companyId, idempotency_key: key })
        .first(),
    createDecision: (values, trx) => trx('payroll_approval_decisions').insert(values),
    getResults(runId, trx = database) {
      return trx('payroll_result_versions as result')
        .join('payroll_run_employees as member', 'member.id', 'result.payroll_run_employee_id')
        .where({ 'member.payroll_run_id': runId })
        .whereNotExists(function () {
          this.select(trx.raw('1'))
            .from('payroll_result_state_events as state')
            .whereRaw('state.payroll_result_version_id = result.id')
            .whereIn('state.state', ['superseded', 'reversed']);
        })
        .select('result.*', 'member.employee_code_snapshot', 'member.employee_name_snapshot');
    },
    getResult: (id, trx = database) =>
      trx('payroll_result_versions as result')
        .join('payroll_run_employees as member', 'member.id', 'result.payroll_run_employee_id')
        .join('payroll_runs as run', 'run.id', 'member.payroll_run_id')
        .join('payroll_periods as period', 'period.id', 'run.payroll_period_id')
        .where('result.id', id)
        .select(
          'result.*',
          'member.employment_id',
          'member.employee_code_snapshot',
          'member.employee_name_snapshot',
          'member.branch_id_snapshot',
          'member.department_id_snapshot',
          'run.id as payroll_run_id',
          'run.status as run_status',
          'period.code as period_code',
          'period.period_start',
          'period.period_end',
          'period.payment_date',
        )
        .first(),
    getItems: (resultId, trx = database) =>
      trx('payroll_result_items')
        .where({ payroll_result_version_id: resultId })
        .orderBy(['component_type', 'id']),
    createPublication: (values, trx) => trx('payslip_publications').insert(values),
    latestPublication: (resultId, trx = database) =>
      trx('payslip_publications')
        .where({ payroll_result_version_id: resultId })
        .orderBy('publication_version', 'desc')
        .first(),
    listOwnPayslips(userId, trx = database) {
      return trx('payslip_publications as publication')
        .join(
          'payroll_result_versions as result',
          'result.id',
          'publication.payroll_result_version_id',
        )
        .join('payroll_run_employees as member', 'member.id', 'result.payroll_run_employee_id')
        .join('employments as employment', 'employment.id', 'member.employment_id')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .join('payroll_runs as run', 'run.id', 'member.payroll_run_id')
        .join('payroll_periods as period', 'period.id', 'run.payroll_period_id')
        .where({
          'employee.user_id': userId,
          'publication.status': 'published',
          'result.state': 'active',
        })
        .whereNotExists(function () {
          this.select(database.raw('1'))
            .from('payslip_publications as newer')
            .whereRaw('newer.payroll_result_version_id = publication.payroll_result_version_id')
            .whereRaw('newer.publication_version > publication.publication_version');
        })
        .select(
          'result.id',
          'result.gross_earnings',
          'result.total_deductions',
          'result.net_pay',
          'result.currency_code',
          'period.code as period_code',
          'period.period_start',
          'period.period_end',
          'publication.occurred_at as published_at',
        );
    },
  };
}
