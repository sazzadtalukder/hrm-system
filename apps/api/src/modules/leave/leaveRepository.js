import { assertAccessContext } from '../authorization/accessContext.js';

function scopedBase(trx, context, permission) {
  assertAccessContext(context, permission);
  let query = trx('leave_requests as request')
    .join('employments as employment', 'employment.id', 'request.employment_id')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .join('leave_request_versions as request_version', function currentVersion() {
      this.on('request_version.leave_request_id', 'request.id').andOn(
        'request_version.version_number',
        'request.current_request_version',
      );
    })
    .leftJoin('employee_assignments as assignment', function effectiveAssignment() {
      this.on('assignment.employment_id', 'request.employment_id')
        .andOnVal('assignment.history_status', 'current')
        .andOn('assignment.effective_start', '<=', trx.ref('request_version.date_from'))
        .andOn(function end() {
          this.onNull('assignment.effective_end').orOn(
            'assignment.effective_end',
            '>=',
            trx.ref('request_version.date_from'),
          );
        });
    })
    .leftJoin(
      'employments as effective_manager',
      'effective_manager.id',
      'assignment.manager_employment_id',
    )
    .leftJoin(
      'employees as effective_manager_employee',
      'effective_manager_employee.id',
      'effective_manager.employee_id',
    );
  const grants = context.grants;
  if (!grants.some((grant) => grant.scope_type === 'all'))
    query.where((scope) => {
      let allowed = false;
      for (const grant of grants) {
        if (grant.scope_type === 'company') {
          scope.orWhere('request.company_id', grant.company_id);
          allowed = true;
        } else if (grant.scope_type === 'own') {
          scope.orWhere((part) =>
            part
              .where('request.company_id', grant.company_id)
              .where('employee.user_id', context.actor.userId),
          );
          allowed = true;
        } else if (grant.scope_type === 'branch') {
          scope.orWhere((part) =>
            part
              .where('request.company_id', grant.company_id)
              .where('assignment.branch_id', grant.branch_id),
          );
          allowed = true;
        } else if (grant.scope_type === 'department') {
          scope.orWhere((part) =>
            part
              .where('request.company_id', grant.company_id)
              .where('assignment.department_id', grant.department_id),
          );
          allowed = true;
        } else if (grant.scope_type === 'direct_reports') {
          scope.orWhere((part) =>
            part
              .where('request.company_id', grant.company_id)
              .whereIn(
                'assignment.manager_employment_id',
                trx('employments as manager')
                  .join(
                    'employees as manager_employee',
                    'manager_employee.id',
                    'manager.employee_id',
                  )
                  .where('manager_employee.user_id', context.actor.userId)
                  .where('manager.company_id', grant.company_id)
                  .select('manager.id'),
              ),
          );
          if (
            [
              'leave.approve',
              'leave.reject',
              'leave.approve_cancellation',
              'leave.reject_cancellation',
            ].includes(permission)
          )
            scope.orWhereExists(function snapshottedApprover() {
              this.select(trx.raw('1'))
                .from('leave_approval_attempts as scoped_attempt')
                .whereRaw('scoped_attempt.leave_request_id = request.id')
                .where('scoped_attempt.company_id', grant.company_id)
                .where('scoped_attempt.assigned_approver_user_id', context.actor.userId)
                .where('scoped_attempt.status', 'pending');
            });
          allowed = true;
        }
      }
      if (!allowed) scope.whereRaw('1=0');
    });
  return query;
}

export function createLeaveRepository(database) {
  return {
    getCompany: (id, trx = database) => trx('companies').where({ id }).first(),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    lockEmployment: (id, trx) => trx('employments').where({ id }).forUpdate().first(),
    getEmployment: (id, trx = database) =>
      trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .where('employment.id', id)
        .select('employment.*', 'employee.user_id')
        .first(),
    getOwnEmployment(context, companyId, date, trx = database) {
      assertAccessContext(context, 'leave.view');
      const hasOwnScope = context.grants.some(
        (grant) => grant.scope_type === 'own' && Number(grant.company_id) === Number(companyId),
      );
      if (!hasOwnScope) return null;
      return trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .where('employment.company_id', companyId)
        .where('employee.user_id', context.actor.userId)
        .where('employment.joining_date', '<=', date)
        .where((period) =>
          period
            .whereNull('employment.employment_end_date')
            .orWhere('employment.employment_end_date', '>=', date),
        )
        .select(
          'employment.id',
          'employment.company_id',
          'employment.employee_code',
          'employee.display_name',
        )
        .orderBy('employment.joining_date', 'desc')
        .first();
    },
    getAssignment: (employmentId, date, trx = database) =>
      trx('employee_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    getEmploymentStatus: (employmentId, date, trx = database) =>
      trx('employment_status_history')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    getScopedEmployment(context, employmentId, permission, date, trx = database) {
      assertAccessContext(context, permission);
      let q = trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .leftJoin('employee_assignments as assignment', function joinAssignment() {
          this.on('assignment.employment_id', 'employment.id')
            .andOnVal('assignment.history_status', 'current')
            .andOn('assignment.effective_start', '<=', trx.raw('?', [date]))
            .andOn(function end() {
              this.onNull('assignment.effective_end').orOn(
                'assignment.effective_end',
                '>=',
                trx.raw('?', [date]),
              );
            });
        })
        .leftJoin(
          'employments as effective_manager',
          'effective_manager.id',
          'assignment.manager_employment_id',
        )
        .leftJoin(
          'employees as effective_manager_employee',
          'effective_manager_employee.id',
          'effective_manager.employee_id',
        )
        .where('employment.id', employmentId)
        .select(
          'employment.*',
          'employee.user_id',
          'assignment.branch_id',
          'assignment.department_id',
          'assignment.manager_employment_id',
          'effective_manager_employee.user_id as manager_user_id',
        );
      if (!context.grants.some((grant) => grant.scope_type === 'all'))
        q.where((scope) => {
          let allowed = false;
          for (const grant of context.grants) {
            if (grant.scope_type === 'company') {
              scope.orWhere('employment.company_id', grant.company_id);
              allowed = true;
            } else if (grant.scope_type === 'own') {
              scope.orWhere((part) =>
                part
                  .where('employment.company_id', grant.company_id)
                  .where('employee.user_id', context.actor.userId),
              );
              allowed = true;
            } else if (grant.scope_type === 'branch') {
              scope.orWhere((part) =>
                part
                  .where('employment.company_id', grant.company_id)
                  .where('assignment.branch_id', grant.branch_id),
              );
              allowed = true;
            } else if (grant.scope_type === 'department') {
              scope.orWhere((part) =>
                part
                  .where('employment.company_id', grant.company_id)
                  .where('assignment.department_id', grant.department_id),
              );
              allowed = true;
            } else if (grant.scope_type === 'direct_reports') {
              scope.orWhere((part) =>
                part
                  .where('employment.company_id', grant.company_id)
                  .whereIn(
                    'assignment.manager_employment_id',
                    trx('employments as manager')
                      .join(
                        'employees as manager_employee',
                        'manager_employee.id',
                        'manager.employee_id',
                      )
                      .where('manager_employee.user_id', context.actor.userId)
                      .select('manager.id'),
                  ),
              );
              allowed = true;
            }
          }
          if (!allowed) scope.whereRaw('1=0');
        });
      return q.first();
    },
    async createType(values, trx) {
      const [id] = await trx('leave_types').insert(values);
      return id;
    },
    async createTypeVersion(values, trx) {
      const [id] = await trx('leave_type_versions').insert(values);
      return id;
    },
    lockType: (id, trx) => trx('leave_types').where({ id }).forUpdate().first(),
    getType: (id, companyId, trx = database) =>
      trx('leave_types').where({ id, company_id: companyId }).first(),
    listTypes: (companyId, trx = database) =>
      trx('leave_types').where({ company_id: companyId }).orderBy('name'),
    getTypeVersion: (typeId, date, trx = database) =>
      trx('leave_type_versions')
        .where({ leave_type_id: typeId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    getLatestTypeVersion: (typeId, trx) =>
      trx('leave_type_versions')
        .where({ leave_type_id: typeId, history_status: 'current' })
        .orderBy('effective_start', 'desc')
        .first(),
    supersedeTypeVersion: (id, userId, trx) =>
      trx('leave_type_versions').where({ id, history_status: 'current' }).update({
        history_status: 'superseded',
        superseded_at: trx.fn.now(),
        superseded_by: userId,
      }),
    updateType: (id, version, values, trx) =>
      trx('leave_types')
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() }),
    async createPolicy(values, trx) {
      const [id] = await trx('leave_policies').insert(values);
      return id;
    },
    async createPolicyVersion(values, trx) {
      const [id] = await trx('leave_policy_versions').insert(values);
      return id;
    },
    createPolicyConfigs: (values, trx) => trx('leave_policy_type_configs').insert(values),
    listPolicies: (companyId, trx = database) =>
      trx('leave_policies').where({ company_id: companyId }).orderBy('name'),
    getPolicy: (id, companyId, trx = database) =>
      trx('leave_policies').where({ id, company_id: companyId }).first(),
    getPolicyAssignment: (employmentId, date, trx = database) =>
      trx('employee_leave_policy_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    getPolicyVersion: (policyId, date, trx = database) =>
      trx('leave_policy_versions')
        .where({ leave_policy_id: policyId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    getPolicyConfig: (policyVersionId, typeVersionId, trx = database) =>
      trx('leave_policy_type_configs')
        .where({ leave_policy_version_id: policyVersionId, leave_type_version_id: typeVersionId })
        .first(),
    findPolicyAssignmentOverlap: (employmentId, start, end, exclude, trx) => {
      let q = trx('employee_leave_policy_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((p) => p.whereNull('effective_end').orWhere('effective_end', '>=', start));
      if (exclude) q.whereNot('id', exclude);
      return q.first();
    },
    getPolicyAssignmentById: (id, trx) =>
      trx('employee_leave_policy_assignments').where({ id }).first(),
    supersedePolicyAssignment: (id, userId, trx) =>
      trx('employee_leave_policy_assignments').where({ id, history_status: 'current' }).update({
        history_status: 'superseded',
        superseded_at: trx.fn.now(),
        superseded_by: userId,
      }),
    async createPolicyAssignment(values, trx) {
      const [id] = await trx('employee_leave_policy_assignments').insert(values);
      return id;
    },
    listPolicyAssignments: (employmentId, trx = database) =>
      trx('employee_leave_policy_assignments')
        .where({ employment_id: employmentId })
        .orderBy('effective_start', 'desc'),
    getCalendarDay: (calendarId, weekday, trx) =>
      trx('work_calendar_days').where({ work_calendar_id: calendarId, weekday }).first(),
    getHoliday: (companyId, branchId, calendarId, date, trx) =>
      trx('holidays')
        .where({ company_id: companyId, holiday_date: date, status: 'active' })
        .where((q) => q.whereNull('branch_id').orWhere('branch_id', branchId))
        .where((q) => q.whereNull('work_calendar_id').orWhere('work_calendar_id', calendarId))
        .first(),
    async createRequest(values, trx) {
      const [id] = await trx('leave_requests').insert(values);
      return id;
    },
    async createRequestVersion(values, trx) {
      const [id] = await trx('leave_request_versions').insert(values);
      return id;
    },
    createRequestDays: (values, trx) => trx('leave_request_days').insert(values),
    lockRequest: (id, trx) => trx('leave_requests').where({ id }).forUpdate().first(),
    updateRequest: (id, version, workflowVersion, values, trx) =>
      trx('leave_requests')
        .where({ id, version, workflow_version: workflowVersion })
        .update({
          ...values,
          version: version + 1,
          workflow_version: workflowVersion + 1,
          updated_at: trx.fn.now(),
        }),
    updateDraft: (id, version, values, trx) =>
      trx('leave_requests')
        .where({ id, version, status: 'draft' })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() }),
    getCurrentRequestVersion: (id, trx = database) =>
      trx('leave_request_versions')
        .where({ leave_request_id: id })
        .orderBy('version_number', 'desc')
        .first(),
    getRequestDays: (versionId, trx = database) =>
      trx('leave_request_days')
        .where({ leave_request_version_id: versionId })
        .orderBy(['leave_date', 'day_part']),
    listRequests(context, input, trx = database) {
      let q = scopedBase(trx, context, 'leave.view')
        .join('leave_types as leave_type', 'leave_type.id', 'request.leave_type_id')
        .where('request.company_id', input.companyId)
        .select(
          'request.*',
          'request_version.date_from',
          'request_version.date_to',
          'request_version.requested_units',
          'request_version.reason',
          'request_version.assignment_snapshot',
          'leave_type.name as leave_type_name',
          'leave_type.is_sensitive',
          'employee.display_name',
          'employment.employee_code',
          'employee.user_id as owner_user_id',
          'assignment.branch_id',
          'assignment.department_id',
          'assignment.manager_employment_id',
          'effective_manager_employee.user_id as manager_user_id',
        )
        .distinct();
      if (input.employmentId) q.where('request.employment_id', input.employmentId);
      if (input.status) q.where('request.status', input.status);
      if (input.dateFrom) q.where('request_version.date_to', '>=', input.dateFrom);
      if (input.dateTo) q.where('request_version.date_from', '<=', input.dateTo);
      return q
        .orderBy('request.created_at', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    getRequest(id, context, permission = 'leave.view', trx = database) {
      return scopedBase(trx, context, permission)
        .join('leave_types as leave_type', 'leave_type.id', 'request.leave_type_id')
        .where('request.id', id)
        .select(
          'request.*',
          'request_version.id as request_version_id',
          'request_version.date_from',
          'request_version.date_to',
          'request_version.requested_units',
          'request_version.reason',
          'request_version.assignment_snapshot',
          'leave_type.name as leave_type_name',
          'leave_type.is_sensitive',
          'employee.user_id as owner_user_id',
          'assignment.branch_id',
          'assignment.department_id',
          'assignment.manager_employment_id',
        )
        .first();
    },
    listRequestVersions: (id, trx = database) =>
      trx('leave_request_versions')
        .where({ leave_request_id: id })
        .orderBy('version_number', 'desc'),
    findOverlap: (employmentId, days, excludeRequestId, trx) => {
      let q = trx('leave_request_days as day')
        .join('leave_requests as request', 'request.id', 'day.leave_request_id')
        .where('request.employment_id', employmentId)
        .whereIn('request.status', ['submitted', 'approved', 'cancellation_requested'])
        .where('day.units', '>', 0)
        .where((outer) => {
          for (const day of days.filter((item) => item.units > 0))
            outer.orWhere((part) =>
              part
                .where('day.leave_date', day.leave_date)
                .where((parts) =>
                  day.day_part === 'full_day'
                    ? parts.whereIn('day.day_part', ['full_day', 'first_half', 'second_half'])
                    : parts.whereIn('day.day_part', ['full_day', day.day_part]),
                ),
            );
        });
      if (excludeRequestId) q.whereNot('request.id', excludeRequestId);
      return q.first();
    },
    getManagerUser: (managerEmploymentId, trx) =>
      managerEmploymentId
        ? trx('employments as employment')
            .join('employees as employee', 'employee.id', 'employment.employee_id')
            .where('employment.id', managerEmploymentId)
            .select('employee.user_id')
            .first()
        : null,
    createWorkflowEvent: (values, trx) => trx('leave_workflow_state_events').insert(values),
    async createApprovalAttempt(values, trx) {
      const [id] = await trx('leave_approval_attempts').insert(values);
      return id;
    },
    getPendingAttempt: (requestId, kind, trx) =>
      trx('leave_approval_attempts')
        .where({ leave_request_id: requestId, decision_kind: kind, status: 'pending' })
        .forUpdate()
        .first(),
    getLatestAttempt: (requestId, kind, trx) =>
      trx('leave_approval_attempts')
        .where({ leave_request_id: requestId, decision_kind: kind })
        .orderBy('attempt_number', 'desc')
        .first(),
    getDecisionByKey: (companyId, key, trx) =>
      trx('leave_approval_decisions')
        .where({ company_id: companyId, idempotency_key: key })
        .first(),
    createDecision: (values, trx) => trx('leave_approval_decisions').insert(values),
    completeAttempt: (id, status, trx) =>
      trx('leave_approval_attempts')
        .where({ id, status: 'pending' })
        .update({ status, completed_at: trx.fn.now() }),
    history: (id, trx = database) =>
      Promise.all([
        trx('leave_workflow_state_events')
          .where({ leave_request_id: id })
          .orderBy('workflow_version'),
        trx('leave_approval_attempts').where({ leave_request_id: id }).orderBy('created_at'),
        trx('leave_approval_decisions as decision')
          .join(
            'leave_approval_attempts as attempt',
            'attempt.id',
            'decision.leave_approval_attempt_id',
          )
          .where('attempt.leave_request_id', id)
          .select('decision.*')
          .orderBy('decision.decided_at'),
      ]),
    lockBalanceAccount: (employmentId, typeId, start, end, trx) =>
      trx('leave_balance_accounts')
        .where({
          employment_id: employmentId,
          leave_type_id: typeId,
          period_start: start,
          period_end: end,
        })
        .forUpdate()
        .first(),
    async createBalanceAccount(values, trx) {
      const [id] = await trx('leave_balance_accounts').insert(values);
      return id;
    },
    createLedgerEntry: (values, trx) => trx('leave_balance_ledger_entries').insert(values),
    ledgerSum: (accountId, trx) =>
      trx('leave_balance_ledger_entries')
        .where({ leave_balance_account_id: accountId })
        .sum({ balance: 'units' })
        .first(),
    listBalances: (employmentId, trx = database) =>
      trx('leave_balance_accounts as account')
        .leftJoin(
          'leave_balance_ledger_entries as entry',
          'entry.leave_balance_account_id',
          'account.id',
        )
        .join('leave_types as type', 'type.id', 'account.leave_type_id')
        .where('account.employment_id', employmentId)
        .groupBy('account.id', 'type.name')
        .select('account.*', 'type.name as leave_type_name')
        .sum({ balance: 'entry.units' }),
    getBalanceAccount: (id, trx = database) => trx('leave_balance_accounts').where({ id }).first(),
    listLedger: (id, trx = database) =>
      trx('leave_balance_ledger_entries')
        .where({ leave_balance_account_id: id })
        .orderBy(['effective_date', 'id']),
    getLedgerEntry: (id, trx) =>
      trx('leave_balance_ledger_entries').where({ id }).forUpdate().first(),
    findRequestLedger: (requestId, type, trx) =>
      trx('leave_balance_ledger_entries').where({
        source_type: 'leave_request',
        source_id: requestId,
        entry_type: type,
      }),
    findAttendanceRecord: (companyId, employmentId, date, trx) =>
      trx('attendance_records')
        .where({ company_id: companyId, employment_id: employmentId, attendance_date: date })
        .first(),
    createReconciliation: (values, trx) =>
      trx('leave_attendance_reconciliation_events').insert(values),
    getApprovedLeaveDay: (companyId, employmentId, date, trx = database) =>
      trx('leave_request_days as day')
        .join('leave_requests as request', 'request.id', 'day.leave_request_id')
        .where({
          'day.company_id': companyId,
          'request.employment_id': employmentId,
          'day.leave_date': date,
        })
        .whereIn('request.status', ['approved', 'cancellation_requested', 'cancellation_rejected'])
        .where('day.units', '>', 0)
        .select('day.*')
        .orderBy('day.units', 'desc')
        .first(),
  };
}
