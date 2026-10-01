import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { ATTENDANCE_LIMITS } from '../src/modules/attendance/attendanceConstants.js';
import { createAttendanceRepository } from '../src/modules/attendance/attendanceRepository.js';
import { createAttendanceService } from '../src/modules/attendance/attendanceService.js';
import { calculationSchema } from '../src/modules/attendance/attendanceSchemas.js';
import { seed } from '../seeds/001_identity_catalog.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.equal(env.DB_HOST, '127.0.0.1');
assert.equal(env.DB_PORT, 3307);
assert.equal(env.DB_NAME, 'hrm_test');
const db = createDatabase(env);
const passed = [];
const pass = (name) => {
  passed.push(name);
  console.log(`PASS ${name}`);
};
const requestContext = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
async function rejects(operation, code) {
  try {
    await operation();
  } catch (error) {
    if (code) assert.equal(error.code, code);
    return error;
  }
  assert.fail('Expected rejection.');
}

const phase4Tables = [
  'attendance_lock_periods',
  'attendance_workflow_state_events',
  'attendance_correction_decisions',
  'attendance_record_versions',
  'attendance_correction_requests',
  'attendance_records',
  'attendance_import_row_results',
  'attendance_event_dispositions',
  'attendance_events',
  'attendance_import_batches',
  'employee_shift_assignments',
  'attendance_shift_versions',
  'attendance_shifts',
];
const allTables = [
  'leave_attendance_reconciliation_events',
  'leave_workflow_state_events',
  'leave_approval_decisions',
  'leave_approval_attempts',
  'leave_balance_ledger_entries',
  'leave_request_days',
  'leave_request_versions',
  'leave_requests',
  'leave_balance_accounts',
  'employee_leave_policy_assignments',
  'leave_policy_type_configs',
  'leave_policy_versions',
  'leave_policies',
  'leave_type_versions',
  'leave_types',
  ...phase4Tables,
  'employee_assignments',
  'employment_status_history',
  'employments',
  'employee_emergency_contacts',
  'employee_contacts',
  'employee_personal_details',
  'employees',
  'audit_events',
  'auth_refresh_tokens',
  'auth_sessions',
  'user_permission_grants',
  'role_assignments',
  'holidays',
  'work_calendar_days',
  'cost_centers',
  'grades',
  'designations',
  'departments',
  'branches',
  'work_calendars',
  'companies',
  'role_permissions',
  'permissions',
  'roles',
  'users',
];

async function reset() {
  const [[identity]] = await db.raw(
    'SELECT VERSION() AS version, DATABASE() AS database_name, @@port AS port',
  );
  assert.match(identity.version, /^8\./);
  assert.equal(identity.database_name, 'hrm_test');
  assert.equal(Number(identity.port), 3307);
  await db.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const table of allTables) await trx(table).del();
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS=1');
    }
  });
  await seed(db);
}

try {
  await reset();
  const found = await db('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', phase4Tables)
    .select('table_name');
  assert.equal(found.length, phase4Tables.length);
  assert.deepEqual(ATTENDANCE_LIMITS, {
    checkInWindowBeforeMinutes: 120,
    checkOutWindowAfterMinutes: 240,
    nearDuplicateWindowSeconds: 60,
    maxCalculationRangeDays: 31,
    maxCalculationEmploymentIds: 500,
    maxImportRows: 10000,
    importChunkSize: 500,
  });
  pass('schema and centralized approved limits');

  const [userId] = await db('users').insert({
    email: 'phase4-attendance@example.test',
    password_hash: 'not-used-by-phase4-verifier',
  });
  const [approverId] = await db('users').insert({
    email: 'phase4-approver@example.test',
    password_hash: 'not-used-by-phase4-verifier',
  });
  const [companyId] = await db('companies').insert({
    code: 'PHASE4_FIXTURE',
    name: 'Phase 4 Isolated Test Company',
    timezone: 'Asia/Dhaka',
  });
  const [otherCompanyId] = await db('companies').insert({
    code: 'PHASE4_OTHER',
    name: 'Phase 4 Other Test Company',
    timezone: 'UTC',
  });
  const [calendarId] = await db('work_calendars').insert({
    company_id: companyId,
    code: 'STANDARD',
    name: 'Standard Calendar',
  });
  const [branchId] = await db('branches').insert({
    company_id: companyId,
    code: 'MAIN',
    name: 'Main Branch',
    default_work_calendar_id: calendarId,
  });
  const [departmentId] = await db('departments').insert({
    company_id: companyId,
    code: 'OPS',
    name: 'Operations',
  });
  const [designationId] = await db('designations').insert({
    company_id: companyId,
    code: 'OFFICER',
    name: 'Officer',
  });
  for (let weekday = 1; weekday <= 7; weekday += 1)
    await db('work_calendar_days').insert({
      company_id: companyId,
      work_calendar_id: calendarId,
      weekday,
      is_working_day: weekday <= 5,
      start_time: weekday <= 5 ? '09:00' : null,
      end_time: weekday <= 5 ? '17:00' : null,
      created_by: userId,
      updated_by: userId,
    });
  const [employeeId] = await db('employees').insert({
    company_id: companyId,
    user_id: userId,
    first_name: 'Phase',
    last_name: 'Four',
    display_name: 'Phase Four',
    created_by: userId,
    updated_by: userId,
  });
  const [employmentId] = await db('employments').insert({
    company_id: companyId,
    employee_id: employeeId,
    employee_code: 'P4-001',
    employment_type: 'permanent',
    joining_date: '2026-01-01',
    created_by: userId,
    updated_by: userId,
  });
  await db('employment_status_history').insert({
    company_id: companyId,
    employment_id: employmentId,
    status: 'confirmed',
    effective_start: '2026-01-01',
    reason: 'Fixture',
    created_by: userId,
  });
  await db('employee_assignments').insert({
    company_id: companyId,
    employment_id: employmentId,
    branch_id: branchId,
    department_id: departmentId,
    designation_id: designationId,
    work_calendar_id: calendarId,
    effective_start: '2026-01-01',
    reason: 'Fixture',
    created_by: userId,
  });
  pass('isolated dynamic company and employee fixture');

  const repository = createAttendanceRepository(db);
  const service = createAttendanceService({ database: db, repository });
  const actor = { userId };
  const access = (permission, scope_type = 'company', overrides = {}) =>
    createAccessContext({
      actor,
      permission,
      grants: [{ scope_type, company_id: companyId, ...overrides }],
    });
  const [shift] = [
    await service.createShift(
      actor,
      access('attendance_shift.create'),
      {
        companyId,
        code: 'DAY',
        name: 'Day shift',
        description: null,
        effectiveStart: '2026-01-01',
        effectiveEnd: null,
        timezone: 'Asia/Dhaka',
        startTime: '09:00',
        endTime: '17:00',
        crossesMidnight: false,
        unpaidBreakMinutes: 60,
        graceInMinutes: 10,
        graceOutMinutes: 0,
        reason: 'Fixture',
      },
      requestContext(),
    ),
  ];
  const version = await db('attendance_shift_versions').where({ id: shift.shiftVersionId }).first();
  assert.equal(version.check_in_window_before_minutes, 120);
  assert.equal(version.check_out_window_after_minutes, 240);
  await service.assignShift(
    actor,
    access('attendance_shift.assign'),
    employmentId,
    {
      attendanceShiftId: shift.id,
      effectiveStart: '2026-01-01',
      effectiveEnd: null,
      supersedesShiftAssignmentId: null,
      reason: 'Initial shift',
    },
    requestContext(),
  );
  await rejects(
    () =>
      service.assignShift(
        actor,
        access('attendance_shift.assign'),
        employmentId,
        {
          attendanceShiftId: shift.id,
          effectiveStart: '2026-02-01',
          effectiveEnd: null,
          supersedesShiftAssignmentId: null,
          reason: 'Overlap',
        },
        requestContext(),
      ),
    'SHIFT_ASSIGNMENT_OVERLAP',
  );
  const changedShift = await service.updateShift(
    actor,
    access('attendance_shift.update'),
    shift.id,
    {
      version: 1,
      name: 'Day shift revised',
      description: null,
      effectiveStart: '2027-01-01',
      effectiveEnd: null,
      timezone: 'Asia/Dhaka',
      startTime: '09:30',
      endTime: '17:30',
      crossesMidnight: false,
      unpaidBreakMinutes: 60,
      graceInMinutes: 10,
      graceOutMinutes: 0,
      reason: 'Future schedule change',
    },
    requestContext(),
  );
  assert.notEqual(changedShift.shiftVersionId, shift.shiftVersionId);
  assert.equal(
    (await repository.getEffectiveShiftVersion(shift.id, '2026-08-17', db)).id,
    shift.shiftVersionId,
  );
  pass('versioned shift configuration and overlap protection');

  const checkIn = await service.createManualEvent(
    actor,
    access('attendance_event.create'),
    {
      companyId,
      employeeCode: 'P4-001',
      eventType: 'check_in',
      occurredAt: '2026-08-17T09:00:00+06:00',
      sourceEventKey: null,
      reason: 'Verification',
    },
    requestContext(),
  );
  const near = await service.createManualEvent(
    actor,
    access('attendance_event.create'),
    {
      companyId,
      employeeCode: 'P4-001',
      eventType: 'check_in',
      occurredAt: '2026-08-17T09:00:30+06:00',
      sourceEventKey: null,
      reason: 'Verification duplicate',
    },
    requestContext(),
  );
  const checkOut = await service.createManualEvent(
    actor,
    access('attendance_event.create'),
    {
      companyId,
      employeeCode: 'P4-001',
      eventType: 'check_out',
      occurredAt: '2026-08-17T17:30:00+06:00',
      sourceEventKey: 'OUT-1',
      reason: 'Verification',
    },
    requestContext(),
  );
  assert.equal(checkIn.disposition, 'accepted');
  assert.equal(near.disposition, 'review_required');
  assert.equal(checkOut.disposition, 'accepted');
  assert.equal(
    await db('attendance_events')
      .count({ count: 'id' })
      .first()
      .then((row) => Number(row.count)),
    3,
  );
  const rawEvents = await service.listEvents(
    actor,
    access('attendance_event.view'),
    { companyId, page: 1, pageSize: 20 },
    requestContext(),
  );
  assert.equal(rawEvents.items.length, 3);
  assert.equal(
    rawEvents.items.filter((event) => event.disposition === 'review_required').length,
    1,
  );
  pass('immutable raw events and near-duplicate disposition');

  const importResult = await service.importEvents(
    actor,
    access('attendance_import.create'),
    {
      companyId,
      idempotencyKey: 'phase4-import-1',
      sourceReference: 'verification',
      format: 'json',
      rows: [
        {
          employee_code: 'P4-001',
          event_type: 'check_in',
          occurred_at: '2026-08-18T09:00:00+06:00',
          source_event_key: 'IN-2',
        },
        {
          employee_code: 'UNKNOWN',
          event_type: 'check_out',
          occurred_at: '2026-08-18T17:00:00+06:00',
          source_event_key: 'BAD-1',
        },
      ],
    },
    requestContext(),
  );
  assert.equal(importResult.status, 'partially_failed');
  assert.equal(importResult.successfulRows, 1);
  assert.equal(importResult.failedRows, 1);
  const replay = await service.importEvents(
    actor,
    access('attendance_import.create'),
    {
      companyId,
      idempotencyKey: 'phase4-import-1',
      sourceReference: 'verification',
      format: 'json',
      rows: [
        {
          employee_code: 'P4-001',
          event_type: 'check_in',
          occurred_at: '2026-08-18T09:00:00+06:00',
          source_event_key: 'IN-2',
        },
        {
          employee_code: 'UNKNOWN',
          event_type: 'check_out',
          occurred_at: '2026-08-18T17:00:00+06:00',
          source_event_key: 'BAD-1',
        },
      ],
    },
    requestContext(),
  );
  assert.equal(replay.replayed, true);
  pass('bounded partial import, row outcomes, and idempotency');

  const calculation = await service.calculate(
    actor,
    access('attendance.calculate'),
    { companyId, dateFrom: '2026-08-17', dateTo: '2026-08-18', employmentIds: [employmentId] },
    requestContext(),
  );
  assert.equal(calculation.calculatedRecords, 2);
  const firstRecord = await db('attendance_records')
    .where({ employment_id: employmentId, attendance_date: '2026-08-17' })
    .first();
  const firstVersion = await db('attendance_record_versions')
    .where({ attendance_record_id: firstRecord.id })
    .first();
  assert.equal(firstRecord.status, 'present');
  assert.equal(firstVersion.attendance_shift_version_id, shift.shiftVersionId);
  const sourceEventIds = Array.isArray(firstVersion.source_event_ids)
    ? firstVersion.source_event_ids
    : String(firstVersion.source_event_ids)
        .replace(/^\[|\]$/g, '')
        .split(',')
        .filter(Boolean)
        .map(Number);
  assert.deepEqual(sourceEventIds, [checkIn.id, checkOut.id]);
  pass('calculation snapshots and earliest/latest accepted punches');

  await rejects(() =>
    service.calculate(
      actor,
      access('attendance.calculate'),
      { companyId, dateFrom: '2026-01-01', dateTo: '2026-02-01', employmentIds: [employmentId] },
      requestContext(),
    ),
  );
  assert.equal(
    calculationSchema.safeParse({ companyId, dateFrom: '2026-08-17', dateTo: '2026-08-17' })
      .success,
    false,
  );
  pass('calculation request bounds and explicit target requirement');

  const correction = await service.createCorrection(
    actor,
    access('attendance_correction.create'),
    firstRecord.id,
    {
      requestedCheckInUtc: '2026-08-17T03:05:00Z',
      requestedCheckOutUtc: null,
      reason: 'Correct check-in',
    },
    requestContext(),
  );
  await service.transitionCorrection(
    actor,
    access('attendance_correction.submit'),
    correction.id,
    'submit',
    { workflowVersion: correction.workflowVersion },
    requestContext(),
  );
  await rejects(
    () =>
      service.decideCorrection(
        actor,
        access('attendance_correction.approve'),
        correction.id,
        'approve',
        { workflowVersion: 2, idempotencyKey: 'decision-self', reason: 'Self decision' },
        requestContext(),
      ),
    'SELF_APPROVAL_FORBIDDEN',
  );
  const approved = await service.decideCorrection(
    { userId: approverId },
    createAccessContext({
      actor: { userId: approverId },
      permission: 'attendance_correction.approve',
      grants: [{ scope_type: 'company', company_id: companyId }],
    }),
    correction.id,
    'approve',
    { workflowVersion: 2, idempotencyKey: 'decision-approved', reason: 'Approved correction' },
    requestContext(),
  );
  assert.equal(approved.status, 'approved');
  const approvalReplay = await service.decideCorrection(
    { userId: approverId },
    createAccessContext({
      actor: { userId: approverId },
      permission: 'attendance_correction.approve',
      grants: [{ scope_type: 'company', company_id: companyId }],
    }),
    correction.id,
    'approve',
    { workflowVersion: 2, idempotencyKey: 'decision-approved', reason: 'Approved correction' },
    requestContext(),
  );
  assert.equal(approvalReplay.replayed, true);
  assert.equal(
    (await db('attendance_record_versions').where({ attendance_record_id: firstRecord.id })).length,
    2,
  );
  pass('single-step correction approval, self-approval denial, and version history');

  const lock = await service.createLock(
    actor,
    access('attendance.lock'),
    {
      companyId,
      branchId,
      periodStart: '2026-08-17',
      periodEnd: '2026-08-18',
      reason: 'Period close',
    },
    requestContext(),
  );
  assert.ok((await db('attendance_records').where({ id: firstRecord.id }).first()).locked_at);
  await rejects(
    () =>
      service.calculate(
        actor,
        access('attendance.calculate'),
        {
          companyId,
          dateFrom: '2026-08-17',
          dateTo: '2026-08-17',
          employmentIds: [employmentId],
        },
        requestContext(),
      ),
    'ATTENDANCE_LOCKED',
  );
  await rejects(
    () =>
      service.createCorrection(
        actor,
        access('attendance_correction.create'),
        firstRecord.id,
        { requestedCheckInUtc: '2026-08-17T03:00:00Z', reason: 'Locked correction' },
        requestContext(),
      ),
    'ATTENDANCE_LOCKED',
  );
  await service.reverseLock(
    actor,
    access('attendance.unlock'),
    lock.id,
    { version: 1, reason: 'Controlled reopen' },
    requestContext(),
  );
  assert.equal(
    (await db('attendance_lock_periods').where({ id: lock.id }).first()).status,
    'reversed',
  );
  pass('branch lock, immutable reversal history, and locked mutation denial');

  await rejects(
    () =>
      service.createShift(
        actor,
        createAccessContext({
          actor,
          permission: 'attendance_shift.create',
          grants: [{ scope_type: 'company', company_id: otherCompanyId }],
        }),
        {
          companyId,
          code: 'DENIED',
          name: 'Denied',
          effectiveStart: '2026-01-01',
          timezone: 'Asia/Dhaka',
          startTime: '09:00',
          endTime: '17:00',
          crossesMidnight: false,
          unpaidBreakMinutes: 0,
          graceInMinutes: 0,
          graceOutMinutes: 0,
          reason: 'Denied',
        },
        requestContext(),
      ),
    'NOT_FOUND',
  );
  pass('company boundary and fail-closed scope');

  const auditCount = Number(
    (
      await db('audit_events')
        .where({ company_id: companyId })
        .where('action_code', 'like', 'attendance%')
        .count({ count: 'id' })
        .first()
    ).count,
  );
  assert.ok(auditCount >= 8);
  pass('transactional attendance audit coverage');

  const immutableCounts = await Promise.all(
    [
      'attendance_events',
      'attendance_event_dispositions',
      'attendance_record_versions',
      'attendance_workflow_state_events',
      'attendance_correction_decisions',
      'attendance_lock_periods',
    ].map(async (table) => Number((await db(table).count({ count: 'id' }).first()).count)),
  );
  assert.ok(immutableCounts.every((count) => count > 0));
  pass('append-only and non-deletion persistence baseline');

  console.log(`SUMMARY ${passed.length} Phase 4 verification groups passed`);
} finally {
  await db.destroy();
}
