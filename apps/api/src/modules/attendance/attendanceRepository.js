import { assertAccessContext } from '../authorization/accessContext.js';

function applyRecordScope(query, context, alias = 'record', dateColumn = 'attendance_date') {
  const grants = context.grants;
  if (grants.some((grant) => grant.scope_type === 'all')) return query;
  return query.where((scope) => {
    let allowed = false;
    for (const grant of grants) {
      if (grant.scope_type === 'company') {
        scope.orWhere(`${alias}.company_id`, grant.company_id);
        allowed = true;
      } else if (grant.scope_type === 'own') {
        scope.orWhere((part) =>
          part
            .where(`${alias}.company_id`, grant.company_id)
            .where('employee.user_id', context.actor.userId),
        );
        allowed = true;
      } else if (grant.scope_type === 'branch') {
        scope.orWhere((part) =>
          part
            .where(`${alias}.company_id`, grant.company_id)
            .where('assignment.branch_id', grant.branch_id),
        );
        allowed = true;
      } else if (grant.scope_type === 'department') {
        scope.orWhere((part) =>
          part
            .where(`${alias}.company_id`, grant.company_id)
            .where('assignment.department_id', grant.department_id),
        );
        allowed = true;
      } else if (grant.scope_type === 'direct_reports') {
        scope.orWhere((part) =>
          part.where(`${alias}.company_id`, grant.company_id).whereIn(
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
              .where('manager_employee.user_id', context.actor.userId)
              .where('manager_employment.company_id', grant.company_id)
              .where(
                'manager_employment.joining_date',
                '<=',
                query.client.raw(`${alias}.${dateColumn}`),
              )
              .where((period) =>
                period
                  .whereNull('manager_employment.employment_end_date')
                  .orWhere(
                    'manager_employment.employment_end_date',
                    '>=',
                    query.client.raw(`${alias}.${dateColumn}`),
                  ),
              ),
          ),
        );
        allowed = true;
      }
    }
    if (!allowed) scope.whereRaw('1 = 0');
  });
}

function recordBase(trx, context, permission) {
  assertAccessContext(context, permission);
  let query = trx('attendance_records as record')
    .join('employments as employment', 'employment.id', 'record.employment_id')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .leftJoin('employee_assignments as assignment', function joinAssignment() {
      this.on('assignment.employment_id', 'record.employment_id')
        .andOnVal('assignment.history_status', 'current')
        .andOn('assignment.effective_start', '<=', trx.ref('record.attendance_date'))
        .andOn(function end() {
          this.onNull('assignment.effective_end').orOn(
            'assignment.effective_end',
            '>=',
            trx.ref('record.attendance_date'),
          );
        });
    });
  query = applyRecordScope(query, context);
  return query;
}

function eventBase(trx, context, permission) {
  assertAccessContext(context, permission);
  let query = trx('attendance_events as event')
    .join('employments as employment', 'employment.id', 'event.employment_id')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .leftJoin('employee_assignments as assignment', function joinAssignment() {
      this.on('assignment.employment_id', 'event.employment_id')
        .andOnVal('assignment.history_status', 'current')
        .andOn('assignment.effective_start', '<=', trx.ref('event.business_date'))
        .andOn(function end() {
          this.onNull('assignment.effective_end').orOn(
            'assignment.effective_end',
            '>=',
            trx.ref('event.business_date'),
          );
        });
    });
  query = applyRecordScope(query, context, 'event', 'business_date');
  return query;
}

function applyEmploymentScope(query, context, asOfDate) {
  if (context.grants.some((grant) => grant.scope_type === 'all')) return query;
  return query.where((scope) => {
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
          part.where('employment.company_id', grant.company_id).whereIn(
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
              .where('manager_employee.user_id', context.actor.userId)
              .where('manager_employment.company_id', grant.company_id)
              .where('manager_employment.joining_date', '<=', asOfDate)
              .where((period) =>
                period
                  .whereNull('manager_employment.employment_end_date')
                  .orWhere('manager_employment.employment_end_date', '>=', asOfDate),
              ),
          ),
        );
        allowed = true;
      }
    }
    if (!allowed) scope.whereRaw('1 = 0');
  });
}

export function createAttendanceRepository(database) {
  return {
    listEmploymentOptions(context, input, asOfDate) {
      assertAccessContext(context, 'attendance.view');
      let query = database('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .leftJoin('employee_assignments as assignment', function joinAssignment() {
          this.on('assignment.employment_id', 'employment.id')
            .andOnVal('assignment.history_status', 'current')
            .andOn('assignment.effective_start', '<=', database.raw('?', [asOfDate]))
            .andOn(function end() {
              this.onNull('assignment.effective_end').orOn(
                'assignment.effective_end',
                '>=',
                database.raw('?', [asOfDate]),
              );
            });
        })
        .where('employment.company_id', input.companyId)
        .where('employee.record_status', 'active')
        .where('employment.joining_date', '<=', asOfDate)
        .where((period) =>
          period
            .whereNull('employment.employment_end_date')
            .orWhere('employment.employment_end_date', '>=', asOfDate),
        )
        .select(
          'employment.id',
          'employment.employee_code',
          'employee.display_name',
          'assignment.branch_id',
          'assignment.department_id',
          'assignment.work_calendar_id',
        )
        .orderBy('employee.display_name')
        .limit(input.pageSize);
      query = applyEmploymentScope(query, context, asOfDate);
      if (input.search) {
        const term = `%${input.search}%`;
        query.where((search) =>
          search
            .where('employee.display_name', 'like', term)
            .orWhere('employment.employee_code', 'like', term)
            .orWhereRaw('CAST(employment.id AS CHAR) LIKE ?', [term]),
        );
      }
      return query;
    },
    listRecords(context, input) {
      let query = recordBase(database, context, 'attendance.view').select(
        'record.*',
        'employee.display_name',
        'employment.employee_code',
        'assignment.branch_id',
        'assignment.department_id',
      );
      query.where('record.company_id', input.companyId);
      if (input.dateFrom) query.where('record.attendance_date', '>=', input.dateFrom);
      if (input.dateTo) query.where('record.attendance_date', '<=', input.dateTo);
      if (input.employmentId) query.where('record.employment_id', input.employmentId);
      if (input.branchId) query.where('assignment.branch_id', input.branchId);
      if (input.departmentId) query.where('assignment.department_id', input.departmentId);
      if (input.status) query.where('record.status', input.status);
      const sorts = {
        attendance_date: 'record.attendance_date',
        status: 'record.status',
        created_at: 'record.created_at',
      };
      return query
        .orderBy(sorts[input.sort], input.direction)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    countRecords(context, input) {
      let query = recordBase(database, context, 'attendance.view').where(
        'record.company_id',
        input.companyId,
      );
      if (input.dateFrom) query.where('record.attendance_date', '>=', input.dateFrom);
      if (input.dateTo) query.where('record.attendance_date', '<=', input.dateTo);
      if (input.employmentId) query.where('record.employment_id', input.employmentId);
      if (input.branchId) query.where('assignment.branch_id', input.branchId);
      if (input.departmentId) query.where('assignment.department_id', input.departmentId);
      if (input.status) query.where('record.status', input.status);
      return query.countDistinct({ count: 'record.id' }).first();
    },
    getRecord(id, context, permission = 'attendance.view', trx = database) {
      return recordBase(trx, context, permission)
        .select(
          'record.*',
          'employee.user_id as employee_user_id',
          'assignment.branch_id',
          'assignment.department_id',
          'assignment.manager_employment_id',
        )
        .where('record.id', id)
        .first();
    },
    lockRecord(id, trx) {
      return trx('attendance_records').where({ id }).forUpdate().first();
    },
    async createRecord(values, trx) {
      const [id] = await trx('attendance_records').insert(values);
      return id;
    },
    updateRecord(id, version, values, trx) {
      return trx('attendance_records')
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() });
    },
    async createRecordVersion(values, trx) {
      const [id] = await trx('attendance_record_versions').insert(values);
      return id;
    },
    listRecordVersions(recordId, trx = database) {
      return trx('attendance_record_versions')
        .where({ attendance_record_id: recordId })
        .orderBy('version_number', 'desc');
    },
    getCurrentVersion(recordId, trx = database) {
      return trx('attendance_record_versions')
        .where({ attendance_record_id: recordId })
        .orderBy('version_number', 'desc')
        .first();
    },
    getCompany(id, trx = database) {
      return trx('companies').where({ id }).first();
    },
    lockCompany(id, trx) {
      return trx('companies').where({ id }).forUpdate().first();
    },
    findEmploymentByCode(companyId, code, occurredDate, trx = database) {
      return trx('employments')
        .where({ company_id: companyId, employee_code: code })
        .where('joining_date', '<=', occurredDate)
        .where((period) =>
          period
            .whereNull('employment_end_date')
            .orWhere('employment_end_date', '>=', occurredDate),
        )
        .first();
    },
    findEmployment(id, companyId, trx = database) {
      return trx('employments').where({ id, company_id: companyId }).first();
    },
    listEmploymentIds(input, trx) {
      let query = trx('employments as employment')
        .join('employee_assignments as assignment', function joinAssignment() {
          this.on('assignment.employment_id', 'employment.id')
            .andOnVal('assignment.history_status', 'current')
            .andOn('assignment.effective_start', '<=', trx.raw('?', [input.dateTo]))
            .andOn(function end() {
              this.onNull('assignment.effective_end').orOn(
                'assignment.effective_end',
                '>=',
                trx.raw('?', [input.dateFrom]),
              );
            });
        })
        .where('employment.company_id', input.companyId)
        .where('employment.joining_date', '<=', input.dateTo)
        .where((period) =>
          period
            .whereNull('employment.employment_end_date')
            .orWhere('employment.employment_end_date', '>=', input.dateFrom),
        )
        .distinct('employment.id', 'employment.joining_date', 'employment.employment_end_date');
      if (input.employmentIds) query.whereIn('employment.id', input.employmentIds);
      if (input.branchId) query.where('assignment.branch_id', input.branchId);
      if (input.departmentId) query.where('assignment.department_id', input.departmentId);
      return query;
    },
    getEffectiveAssignment(employmentId, date, trx) {
      return trx('employee_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((period) => period.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first();
    },
    getEffectiveShiftAssignment(employmentId, date, trx) {
      return trx('employee_shift_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((period) => period.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first();
    },
    getEffectiveShiftVersion(shiftId, date, trx) {
      return trx('attendance_shift_versions')
        .where({ attendance_shift_id: shiftId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((period) => period.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first();
    },
    getCalendarDay(calendarId, weekday, trx) {
      return trx('work_calendar_days').where({ work_calendar_id: calendarId, weekday }).first();
    },
    getHoliday(companyId, branchId, calendarId, date, trx) {
      return trx('holidays')
        .where({ company_id: companyId, holiday_date: date, status: 'active' })
        .where((scope) => scope.whereNull('branch_id').orWhere('branch_id', branchId))
        .where((scope) =>
          scope.whereNull('work_calendar_id').orWhere('work_calendar_id', calendarId),
        )
        .first();
    },
    async createShift(values, trx) {
      const [id] = await trx('attendance_shifts').insert(values);
      return id;
    },
    getShift(id, companyId, trx = database) {
      return trx('attendance_shifts').where({ id, company_id: companyId }).first();
    },
    listShifts(companyId, trx = database) {
      return trx('attendance_shifts').where({ company_id: companyId }).orderBy('name');
    },
    updateShift(id, version, values, trx) {
      return trx('attendance_shifts')
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() });
    },
    lockShift(id, trx) {
      return trx('attendance_shifts').where({ id }).forUpdate().first();
    },
    getCurrentShiftVersion(shiftId, trx) {
      return trx('attendance_shift_versions')
        .where({ attendance_shift_id: shiftId, history_status: 'current' })
        .orderBy('effective_start', 'desc')
        .first();
    },
    supersedeShiftVersion(id, actorId, trx) {
      return trx('attendance_shift_versions').where({ id, history_status: 'current' }).update({
        history_status: 'superseded',
        superseded_at: trx.fn.now(),
        superseded_by: actorId,
      });
    },
    closeShiftVersion(id, effectiveEnd, trx) {
      return trx('attendance_shift_versions')
        .where({ id, history_status: 'current' })
        .update({ effective_end: effectiveEnd });
    },
    async createShiftVersion(values, trx) {
      const [id] = await trx('attendance_shift_versions').insert(values);
      return id;
    },
    findShiftVersionOverlap(shiftId, start, end, excludedId, trx) {
      let query = trx('attendance_shift_versions')
        .where({ attendance_shift_id: shiftId, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((period) => period.whereNull('effective_end').orWhere('effective_end', '>=', start));
      if (excludedId) query.whereNot('id', excludedId);
      return query.first();
    },
    lockEmployment(id, trx) {
      return trx('employments').where({ id }).forUpdate().first();
    },
    getShiftAssignment(id, trx) {
      return trx('employee_shift_assignments').where({ id }).first();
    },
    findShiftAssignmentOverlap(employmentId, start, end, excludedId, trx) {
      let query = trx('employee_shift_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((period) => period.whereNull('effective_end').orWhere('effective_end', '>=', start));
      if (excludedId) query.whereNot('id', excludedId);
      return query.first();
    },
    supersedeShiftAssignment(id, actorId, trx) {
      return trx('employee_shift_assignments').where({ id, history_status: 'current' }).update({
        history_status: 'superseded',
        superseded_at: trx.fn.now(),
        superseded_by: actorId,
      });
    },
    async createShiftAssignment(values, trx) {
      const [id] = await trx('employee_shift_assignments').insert(values);
      return id;
    },
    listShiftAssignments(employmentId, trx = database) {
      return trx('employee_shift_assignments')
        .where({ employment_id: employmentId })
        .orderBy('effective_start', 'desc');
    },
    async createEvent(values, trx) {
      const [id] = await trx('attendance_events').insert(values);
      return id;
    },
    listEvents(context, input, trx = database) {
      const latest = trx('attendance_event_dispositions')
        .select('attendance_event_id')
        .max({ disposition_id: 'id' })
        .groupBy('attendance_event_id')
        .as('latest_disposition');
      let query = eventBase(trx, context, 'attendance_event.view')
        .join(latest, 'latest_disposition.attendance_event_id', 'event.id')
        .join(
          'attendance_event_dispositions as disposition',
          'disposition.id',
          'latest_disposition.disposition_id',
        )
        .where('event.company_id', input.companyId)
        .select(
          'event.id',
          'event.employment_id',
          'event.event_type',
          'event.occurred_at_utc',
          'event.business_date',
          'event.source_type',
          'event.source_event_key',
          'event.received_at',
          'employee.display_name',
          'employment.employee_code',
          'disposition.disposition',
          'disposition.reason as disposition_reason',
        );
      if (input.dateFrom) query.where('event.business_date', '>=', input.dateFrom);
      if (input.dateTo) query.where('event.business_date', '<=', input.dateTo);
      if (input.employmentId) query.where('event.employment_id', input.employmentId);
      if (input.disposition) query.where('disposition.disposition', input.disposition);
      return query
        .orderBy('event.occurred_at_utc', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    getEvent(id, trx = database) {
      return trx('attendance_events').where({ id }).first();
    },
    lockEvent(id, trx) {
      return trx('attendance_events').where({ id }).forUpdate().first();
    },
    findSourceEvent(companyId, sourceType, key, trx) {
      return key
        ? trx('attendance_events')
            .where({ company_id: companyId, source_type: sourceType, source_event_key: key })
            .first()
        : null;
    },
    findFingerprint(companyId, fingerprint, trx) {
      return trx('attendance_events')
        .where({ company_id: companyId, duplicate_fingerprint: fingerprint })
        .first();
    },
    findNearEvent(companyId, employmentId, eventType, occurredAt, seconds, trx) {
      return trx('attendance_events')
        .where({ company_id: companyId, employment_id: employmentId, event_type: eventType })
        .whereBetween('occurred_at_utc', [
          trx.raw('DATE_SUB(?, INTERVAL ? SECOND)', [occurredAt, seconds]),
          trx.raw('DATE_ADD(?, INTERVAL ? SECOND)', [occurredAt, seconds]),
        ])
        .first();
    },
    async createDisposition(values, trx) {
      const [id] = await trx('attendance_event_dispositions').insert(values);
      return id;
    },
    listAcceptedEvents(companyId, employmentId, from, to, trx) {
      return trx('attendance_events as event')
        .join(
          trx('attendance_event_dispositions')
            .select('attendance_event_id')
            .max({ id: 'id' })
            .groupBy('attendance_event_id')
            .as('latest'),
          'latest.attendance_event_id',
          'event.id',
        )
        .join('attendance_event_dispositions as disposition', 'disposition.id', 'latest.id')
        .where({
          'event.company_id': companyId,
          'event.employment_id': employmentId,
          'disposition.disposition': 'accepted',
        })
        .whereBetween('event.occurred_at_utc', [from, to])
        .select('event.*')
        .orderBy('event.occurred_at_utc');
    },
    async createImport(values, trx) {
      const [id] = await trx('attendance_import_batches').insert(values);
      return id;
    },
    getImportByKey(companyId, key, trx = database) {
      return trx('attendance_import_batches')
        .where({ company_id: companyId, idempotency_key: key })
        .first();
    },
    updateImport(id, values, trx) {
      return trx('attendance_import_batches').where({ id }).update(values);
    },
    createImportRow(values, trx) {
      return trx('attendance_import_row_results').insert(values);
    },
    getImport(id, companyId, trx = database) {
      return trx('attendance_import_batches').where({ id, company_id: companyId }).first();
    },
    listImportRows(id, trx = database) {
      return trx('attendance_import_row_results')
        .where({ import_batch_id: id })
        .orderBy('row_number');
    },
    getCorrection(id, trx = database) {
      return trx('attendance_correction_requests').where({ id }).first();
    },
    lockCorrection(id, trx) {
      return trx('attendance_correction_requests').where({ id }).forUpdate().first();
    },
    async createCorrection(values, trx) {
      const [id] = await trx('attendance_correction_requests').insert(values);
      return id;
    },
    updateCorrection(id, workflowVersion, values, trx) {
      return trx('attendance_correction_requests')
        .where({ id, workflow_version: workflowVersion })
        .update({
          ...values,
          workflow_version: workflowVersion + 1,
          version: trx.raw('version + 1'),
          updated_at: trx.fn.now(),
        });
    },
    createWorkflowEvent(values, trx) {
      return trx('attendance_workflow_state_events').insert(values);
    },
    createDecision(values, trx) {
      return trx('attendance_correction_decisions').insert(values);
    },
    getDecisionByKey(correctionId, idempotencyKey, trx) {
      return trx('attendance_correction_decisions')
        .where({ correction_request_id: correctionId, idempotency_key: idempotencyKey })
        .first();
    },
    listCorrections(context, companyId, trx = database) {
      return recordBase(trx, context, 'attendance_correction.view')
        .join(
          'attendance_correction_requests as correction',
          'correction.attendance_record_id',
          'record.id',
        )
        .where('correction.company_id', companyId)
        .select('correction.*')
        .distinct()
        .orderBy('correction.created_at', 'desc');
    },
    correctionHistory(id, trx = database) {
      return Promise.all([
        trx('attendance_workflow_state_events')
          .where({ correction_request_id: id })
          .orderBy('workflow_version'),
        trx('attendance_correction_decisions')
          .where({ correction_request_id: id })
          .orderBy('attempt_number'),
      ]);
    },
    findLockOverlap(companyId, branchId, start, end, excludedId, trx) {
      let query = trx('attendance_lock_periods')
        .where({ company_id: companyId, status: 'locked' })
        .where('period_start', '<=', end)
        .where('period_end', '>=', start);
      if (branchId)
        query.where((scope) => scope.whereNull('branch_id').orWhere('branch_id', branchId));
      if (excludedId) query.whereNot('id', excludedId);
      return query.first();
    },
    findApplicableLock(companyId, branchId, date, trx) {
      const query = trx('attendance_lock_periods')
        .where({ company_id: companyId, status: 'locked' })
        .where('period_start', '<=', date)
        .where('period_end', '>=', date);
      if (branchId)
        query.where((scope) => scope.whereNull('branch_id').orWhere('branch_id', branchId));
      else query.whereNull('branch_id');
      return query.first();
    },
    async createLock(values, trx) {
      const [id] = await trx('attendance_lock_periods').insert(values);
      return id;
    },
    lockLockPeriod(id, trx) {
      return trx('attendance_lock_periods').where({ id }).forUpdate().first();
    },
    updateLock(id, version, values, trx) {
      return trx('attendance_lock_periods')
        .where({ id, version })
        .update({ ...values, version: version + 1 });
    },
    listLocks(context, companyId, trx = database) {
      let query = trx('attendance_lock_periods').where({ company_id: companyId });
      const companyWide = context.grants.some(
        (grant) =>
          grant.scope_type === 'all' ||
          (grant.scope_type === 'company' && Number(grant.company_id) === Number(companyId)),
      );
      if (!companyWide) {
        const branches = context.grants
          .filter(
            (grant) =>
              grant.scope_type === 'branch' && Number(grant.company_id) === Number(companyId),
          )
          .map((grant) => grant.branch_id);
        query = branches.length ? query.whereIn('branch_id', branches) : query.whereRaw('1 = 0');
      }
      return query.orderBy('period_start', 'desc');
    },
  };
}
