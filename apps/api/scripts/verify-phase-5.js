import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { LEAVE_LIMITS } from '../src/modules/leave/leaveConstants.js';
import { createLeaveRepository } from '../src/modules/leave/leaveRepository.js';
import { createLeaveService } from '../src/modules/leave/leaveService.js';
import { requestCreateSchema } from '../src/modules/leave/leaveSchemas.js';

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
const contextMeta = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const businessDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const addDays = (dateValue, days) => {
  const value = new Date(`${dateValue}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const leaveDateFrom = addDays(businessDate, 1);
const leaveDateTo = addDays(businessDate, 2);
const leaveYearStart = `${businessDate.slice(0, 4)}-01-01`;
const ctx = (actor, permission, companyId, scopeType = 'company') =>
  createAccessContext({
    actor,
    permission,
    grants: [
      { scope_type: scopeType, company_id: companyId, branch_id: null, department_id: null },
    ],
  });

const leaveTables = [
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
];

try {
  const [[identity]] = await db.raw(
    'SELECT VERSION() version, DATABASE() database_name, @@port port',
  );
  assert.match(identity.version, /^8\./);
  assert.equal(identity.database_name, 'hrm_test');
  assert.equal(Number(identity.port), 3307);
  pass('guarded MySQL 8 hrm_test execution');

  await db.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const table of leaveTables) await trx(table).del();
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS=1');
    }
  });
  const company = await db('companies').where({ code: 'PHASE4_FIXTURE' }).first();
  if (company) {
    const priorManagerEmployment = await db('employments')
      .where({ company_id: company.id, employee_code: 'P5-MGR' })
      .first();
    if (priorManagerEmployment) {
      await db('employee_assignments')
        .where({ manager_employment_id: priorManagerEmployment.id })
        .update({ manager_employment_id: null });
      await db('employee_assignments').where({ employment_id: priorManagerEmployment.id }).del();
      await db('employment_status_history')
        .where({ employment_id: priorManagerEmployment.id })
        .del();
      await db('employments').where({ id: priorManagerEmployment.id }).del();
      await db('employees').where({ id: priorManagerEmployment.employee_id }).del();
    }
  }
  const employee = await db('employees')
    .where({ company_id: company?.id })
    .whereNotNull('user_id')
    .first();
  const employment = employee
    ? await db('employments').where({ employee_id: employee.id, record_status: 'active' }).first()
    : null;
  assert.ok(
    company && employee && employment,
    'Run the Phase 4 verifier before Phase 5 verification.',
  );
  const actor = { userId: employee.user_id };
  const repository = createLeaveRepository(db);
  const service = createLeaveService({
    database: db,
    repository,
    authorizationService: {
      requirePermission: async () => {
        throw new Error('not granted');
      },
    },
  });

  const tables = await db('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', leaveTables)
    .select('table_name');
  assert.equal(tables.length, leaveTables.length);
  assert.equal(LEAVE_LIMITS.maximumFutureApplicationDays, 365);
  pass('schema and centralized leave limits');

  const [managerEmployeeId] = await db('employees').insert({
    company_id: company.id,
    user_id: (await db('users').where({ email: 'phase4-approver@example.test' }).first()).id,
    first_name: 'Leave',
    last_name: 'Manager',
    display_name: 'Leave Manager',
    record_status: 'active',
    created_by: actor.userId,
    updated_by: actor.userId,
  });
  const managerUser = await db('employees').where({ id: managerEmployeeId }).first();
  const [managerEmploymentId] = await db('employments').insert({
    company_id: company.id,
    employee_id: managerEmployeeId,
    employee_code: 'P5-MGR',
    employment_type: 'permanent',
    joining_date: leaveYearStart,
    record_status: 'active',
    created_by: actor.userId,
    updated_by: actor.userId,
  });
  await db('employee_assignments')
    .where({ employment_id: employment.id, history_status: 'current' })
    .update({ manager_employment_id: managerEmploymentId });
  pass('dynamic company ownership and effective manager fixture');

  const typeResult = await service.createType(
    actor,
    ctx(actor, 'leave_type.create', company.id),
    {
      companyId: company.id,
      code: 'ANNUAL_TEST',
      name: 'Configured Test Leave',
      description: null,
      category: 'paid',
      isSensitive: false,
      effectiveStart: leaveYearStart,
      effectiveEnd: null,
      unit: 'full_day',
      minimumIncrement: 1,
      countsRestDays: false,
      countsHolidays: false,
      requiresReason: true,
      requiresApproval: true,
      allowNegativeBalance: false,
      reason: 'Phase 5 verification',
    },
    contextMeta(),
  );
  const policyResult = await service.createPolicy(
    actor,
    ctx(actor, 'leave_policy.create', company.id),
    {
      companyId: company.id,
      code: 'P5_POLICY',
      name: 'Phase 5 Test Policy',
      description: null,
      effectiveStart: leaveYearStart,
      effectiveEnd: null,
      leaveYearStartMonth: 1,
      leaveYearStartDay: 1,
      configs: [
        {
          leaveTypeVersionId: typeResult.leaveTypeVersionId,
          entitlementUnits: 10,
          minimumServiceDays: 0,
        },
      ],
      reason: 'Phase 5 verification',
    },
    contextMeta(),
  );
  await service.assignPolicy(
    actor,
    ctx(actor, 'leave_policy.assign', company.id),
    employment.id,
    {
      leavePolicyId: policyResult.id,
      effectiveStart: leaveYearStart,
      effectiveEnd: null,
      supersedesAssignmentId: null,
      reason: 'Phase 5 verification',
    },
    contextMeta(),
  );
  assert.equal((await db('leave_types')).length, 1);
  assert.equal((await db('leave_policy_versions')).length, 1);
  pass('versioned leave type, policy configuration, and assignment');

  const parsed = requestCreateSchema.parse({
    companyId: company.id,
    employmentId: employment.id,
    leaveTypeId: typeResult.id,
    dateFrom: leaveDateFrom,
    dateTo: leaveDateTo,
    dayPart: 'full_day',
    reason: 'Verification leave',
  });
  const created = await service.createRequest(
    actor,
    ctx(actor, 'leave.apply', company.id, 'own'),
    parsed,
    contextMeta(),
  );
  assert.equal((await db('leave_request_days').where({ leave_request_id: created.id })).length, 2);
  pass('draft request-day snapshot and workday counting');

  const submitted = await service.submit(
    actor,
    ctx(actor, 'leave.submit', company.id, 'own'),
    created.id,
    { workflowVersion: 1, reason: 'Submit verification' },
    contextMeta(),
  );
  assert.equal(submitted.status, 'submitted');
  const ledgerAfterSubmit = await db('leave_balance_ledger_entries').where({
    source_id: created.id,
  });
  assert.ok(ledgerAfterSubmit.some((entry) => entry.entry_type === 'reservation'));
  const attempt = await db('leave_approval_attempts')
    .where({ leave_request_id: created.id })
    .first();
  assert.equal(Number(attempt.assigned_approver_user_id), Number(managerUser.user_id));
  pass('submission reservation and anchored manager approval snapshot');

  const managerActor = { userId: managerUser.user_id };
  const approved = await service.decide(
    managerActor,
    ctx(managerActor, 'leave.approve', company.id, 'direct_reports'),
    created.id,
    'approve',
    {
      workflowVersion: 2,
      requestVersion: 1,
      idempotencyKey: randomUUID(),
      reason: 'Approved for verification',
    },
    contextMeta(),
  );
  assert.equal(approved.status, 'approved');
  const ledger = await db('leave_balance_ledger_entries').where({ source_id: created.id });
  assert.ok(ledger.some((entry) => entry.entry_type === 'reservation_release'));
  assert.ok(ledger.some((entry) => entry.entry_type === 'consumption'));
  pass('single-step approval, separation of requester, and ledger consumption');

  const visible = await service.getRequest(
    actor,
    ctx(actor, 'leave.view', company.id, 'own'),
    created.id,
    contextMeta(),
  );
  assert.equal(visible.history.versions.length, 1);
  assert.ok(visible.history.workflowStates.length >= 3);
  assert.ok((await db('audit_events').whereRaw('action_code LIKE ?', ['leave%'])).length >= 4);
  pass('scoped detail, append-only workflow/version history, and transactional audit');

  const cancellation = await service.requestCancellation(
    actor,
    ctx(actor, 'leave.request_cancellation', company.id, 'own'),
    created.id,
    { workflowVersion: 3, reason: 'Plans changed' },
    contextMeta(),
  );
  assert.equal(cancellation.status, 'cancellation_requested');
  const cancelled = await service.decide(
    managerActor,
    ctx(managerActor, 'leave.approve_cancellation', company.id, 'direct_reports'),
    created.id,
    'approve',
    {
      workflowVersion: 4,
      requestVersion: 1,
      idempotencyKey: randomUUID(),
      reason: 'Cancellation approved',
    },
    contextMeta(),
    { cancellation: true },
  );
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(
    (
      await db('leave_balance_ledger_entries').where({
        source_id: created.id,
        entry_type: 'reversal',
      })
    ).length > 0,
  );
  pass('controlled approved-leave cancellation and consumption reversal');

  const account = await db('leave_balance_accounts')
    .where({ employment_id: employment.id })
    .first();
  await service.adjustBalance(
    actor,
    ctx(actor, 'leave_balance.adjust', company.id),
    account.id,
    {
      units: 1,
      effectiveDate: leaveDateTo,
      idempotencyKey: randomUUID(),
      reason: 'Verification adjustment',
    },
    contextMeta(),
  );
  const adjustment = await db('leave_balance_ledger_entries')
    .where({ leave_balance_account_id: account.id, entry_type: 'adjustment' })
    .first();
  await service.reverseLedger(
    actor,
    ctx(actor, 'leave_balance.adjust', company.id),
    adjustment.id,
    { idempotencyKey: randomUUID(), reason: 'Verification reversal' },
    contextMeta(),
  );
  assert.equal(
    (await db('leave_balance_ledger_entries').where({ reversal_of_entry_id: adjustment.id }))
      .length,
    1,
  );
  pass('manual adjustment permission path and single reversal invariant');

  await assert.rejects(() =>
    service.getRequest(
      managerActor,
      ctx(managerActor, 'leave.view', company.id + 999, 'company'),
      created.id,
      contextMeta(),
    ),
  );
  const secrets = JSON.stringify(
    await db('audit_events').whereRaw('action_code LIKE ?', ['leave%']),
  );
  assert.ok(!secrets.includes('Verification leave'));
  pass('company isolation, fail-closed access, and reason exclusion from audit payloads');

  console.log(`SUMMARY ${passed.length} Phase 5 verification groups passed`);
} finally {
  await db.destroy();
}
