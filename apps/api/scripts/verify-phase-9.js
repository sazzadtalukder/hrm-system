import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { createLoanRepository } from '../src/modules/loans/loanRepository.js';
import { createLoanService } from '../src/modules/loans/loanService.js';
import { LOAN_LIMITS } from '../src/modules/loans/loanConstants.js';
const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.deepEqual([env.DB_HOST, env.DB_PORT, env.DB_NAME], ['127.0.0.1', 3307, 'hrm_test']);
const db = createDatabase(env),
  passed = [];
const pass = (n) => {
    passed.push(n);
    console.log(`PASS ${n}`);
  },
  meta = () => ({ requestId: randomUUID(), correlationId: randomUUID() }),
  ctx = (actor, p, companyId, scope = 'company') =>
    createAccessContext({
      actor,
      permission: p,
      grants: [{ scope_type: scope, company_id: companyId }],
    });
const tables = [
  'loan_repayment_ledger',
  'loan_repayment_installments',
  'loan_repayment_schedules',
  'loan_disbursements',
  'loan_accounts',
  'loan_state_events',
  'loan_approval_decisions',
  'loan_approval_attempts',
  'loan_application_versions',
  'loan_applications',
  'loan_facility_type_versions',
  'loan_facility_types',
  'loan_number_sequences',
];
const localDate = (tz) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
};
try {
  const [[identity]] = await db.raw(
    'SELECT VERSION() version,DATABASE() database_name,@@port port',
  );
  assert.match(identity.version, /^8\./);
  assert.equal(identity.database_name, 'hrm_test');
  assert.equal(Number(identity.port), 3307);
  pass('guarded MySQL 8 hrm_test execution');
  await db.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const t of tables) await trx(t).del();
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS=1');
    }
  });
  const found = await db('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', tables)
    .count({ n: '*' })
    .first();
  assert.equal(Number(found.n), tables.length);
  assert.equal(LOAN_LIMITS.maximumExportRows, 10000);
  const columns = await db('information_schema.columns')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', tables)
    .whereRaw("(column_name LIKE '%interest%' OR column_name LIKE '%rate%')");
  assert.equal(columns.length, 0);
  pass('interest-free schema, history tables, and centralized limits');
  const employment = await db('employments as e')
    .join('employees as employee', 'employee.id', 'e.employee_id')
    .join('employee_assignments as a', function () {
      this.on('a.employment_id', 'e.id').andOnVal('a.history_status', 'current');
    })
    .leftJoin('employments as me', 'me.id', 'a.manager_employment_id')
    .leftJoin('employees as manager', 'manager.id', 'me.employee_id')
    .whereNotNull('employee.user_id')
    .whereNotNull('manager.user_id')
    .where('e.record_status', 'active')
    .whereNull('e.employment_end_date')
    .first('e.*', 'employee.user_id', 'manager.user_id as manager_user_id');
  assert.ok(employment, 'Run prior verifiers first.');
  const company = await db('companies').where({ id: employment.company_id }).first(),
    today = localDate(company.timezone),
    employee = { userId: employment.user_id },
    manager = { userId: employment.manager_user_id };
  for (const email of [
    'p9-finance@example.test',
    'p9-disbursement@example.test',
    'p9-repayment@example.test',
    'p9-sensitive@example.test',
  ])
    await db('users')
      .insert({ email, password_hash: 'phase-9-verifier-not-login-secret', status: 'active' })
      .onConflict('email')
      .ignore();
  const users = await db('users').whereIn('email', [
      'p9-finance@example.test',
      'p9-disbursement@example.test',
      'p9-repayment@example.test',
      'p9-sensitive@example.test',
    ]),
    actor = (email) => ({ userId: users.find((x) => x.email === email).id }),
    finance = actor('p9-finance@example.test'),
    disburser = actor('p9-disbursement@example.test'),
    repayment = actor('p9-repayment@example.test'),
    sensitiveActor = actor('p9-sensitive@example.test');
  const repository = createLoanRepository(db),
    service = createLoanService({
      database: db,
      repository,
      authorizationService: {
        requirePermission: async (a) => {
          if (a.userId === sensitiveActor.userId) return ctx(a, 'loan_sensitive.view', company.id);
          throw new Error('denied');
        },
      },
    });
  const typeInput = {
    companyId: company.id,
    code: 'P9-LOAN',
    name: 'Verification Loan',
    description: null,
    facilityKind: 'loan',
    effectiveStart: today,
    effectiveEnd: null,
    currencyCode: company.currency_code,
    minimumPrincipal: '100.00',
    maximumPrincipal: '10000.00',
    minimumTermMonths: 2,
    maximumTermMonths: 12,
    installmentDueDay: 31,
    minimumServiceDays: 0,
    maximumActiveFacilities: 2,
    sensitiveClassification: 'sensitive',
    reason: 'Phase 9 verification',
  };
  const type = await service.createType(
    manager,
    ctx(manager, 'loan_type.create', company.id),
    typeInput,
    meta(),
  );
  await assert.rejects(
    () =>
      service.createType(manager, ctx(manager, 'loan_type.create', company.id), typeInput, meta()),
    (e) => e.code === 'LOAN_TYPE_CONFLICT',
  );
  pass('shared facility type and company-scoped identity');
  const appInput = {
    companyId: company.id,
    employmentId: employment.id,
    loanFacilityTypeId: type.id,
    requestedPrincipal: '1000.00',
    requestedTermMonths: 3,
    currencyCode: company.currency_code,
    purpose: 'SECRET-P9-PURPOSE',
    reason: 'Create application',
  };
  const created = await service.create(
    employee,
    ctx(employee, 'loan.apply', company.id, 'own'),
    appInput,
    meta(),
  );
  const updated = await service.updateDraft(
    employee,
    ctx(employee, 'loan.update_draft', company.id, 'own'),
    created.id,
    { ...appInput, version: 1 },
    meta(),
  );
  assert.equal(updated.currentVersionNumber, 2);
  await assert.rejects(
    () =>
      service.updateDraft(
        employee,
        ctx(employee, 'loan.update_draft', company.id, 'own'),
        created.id,
        { ...appInput, version: 1 },
        meta(),
      ),
    (e) => e.code === 'STALE_VERSION',
  );
  pass('own draft, immutable versions, and optimistic concurrency');
  const submitted = await service.submit(
    employee,
    ctx(employee, 'loan.submit', company.id, 'own'),
    created.id,
    { workflowVersion: 1, reason: 'Submit' },
    meta(),
  );
  assert.match(submitted.applicationNumber, /^LON-\d{4}-\d{6}$/);
  const snap = await db('loan_application_versions')
    .where({ loan_application_id: created.id })
    .orderBy('version_number', 'desc')
    .first();
  assert.equal(snap.manager_user_id_snapshot, manager.userId);
  assert.equal(snap.compensation_amount_snapshot, null);
  pass('eligibility, locked numbering, and immutable submission snapshot');
  await assert.rejects(
    () =>
      service.decide(
        employee,
        ctx(employee, 'loan.approve', company.id, 'own'),
        created.id,
        'manager',
        'approve',
        { workflowVersion: 2, reason: 'self', idempotencyKey: randomUUID() },
        meta(),
      ),
    (e) => ['NOT_FOUND', 'MAKER_CHECKER_VIOLATION'].includes(e.code),
  );
  const ma = await service.decide(
    manager,
    ctx(manager, 'loan.approve', company.id, 'direct_reports'),
    created.id,
    'manager',
    'approve',
    { workflowVersion: 2, reason: 'Manager approved', idempotencyKey: randomUUID() },
    meta(),
  );
  assert.equal(ma.status, 'manager_approved');
  const fa = await service.decide(
    finance,
    ctx(finance, 'loan.finance_approve', company.id),
    created.id,
    'finance',
    'approve',
    { workflowVersion: 3, reason: 'Finance approved', idempotencyKey: randomUUID() },
    meta(),
  );
  assert.equal(fa.status, 'finance_approved');
  pass('manager and Finance approval with claimant prohibition');
  await assert.rejects(
    () =>
      service.disburse(
        finance,
        ctx(finance, 'loan.disburse', company.id),
        created.id,
        {
          workflowVersion: 4,
          reason: 'same actor',
          idempotencyKey: randomUUID(),
          disbursementDate: today,
          reference: 'BAD',
        },
        meta(),
      ),
    (e) => e.code === 'MAKER_CHECKER_VIOLATION',
  );
  const disbursed = await service.disburse(
    disburser,
    ctx(disburser, 'loan.disburse', company.id),
    created.id,
    {
      workflowVersion: 4,
      reason: 'Disbursed',
      idempotencyKey: randomUUID(),
      disbursementDate: today,
      reference: 'P9-DISB',
    },
    meta(),
  );
  assert.equal(disbursed.status, 'disbursed');
  const schedule = await db('loan_repayment_schedules')
      .where({ loan_account_id: disbursed.accountId })
      .first(),
    installments = await db('loan_repayment_installments')
      .where({ loan_repayment_schedule_id: schedule.id })
      .orderBy('installment_number');
  assert.equal(installments.length, 3);
  assert.equal(
    installments.reduce((n, x) => n + Number(x.principal_amount), 0),
    1000,
  );
  assert.equal(schedule.scheduled_total, '1000.00');
  pass('separate disbursement and exact immutable interest-free schedule');
  await assert.rejects(
    () =>
      service.recordLedger(
        employee,
        ctx(employee, 'loan_repayment.record', company.id, 'own'),
        disbursed.accountId,
        { amount: '100.00', effectiveDate: today, reason: 'self', idempotencyKey: randomUUID() },
        'repayment',
        'loan_repayment.record',
        meta(),
      ),
    (e) => ['NOT_FOUND', 'MAKER_CHECKER_VIOLATION'].includes(e.code),
  );
  const first = await service.recordLedger(
    repayment,
    ctx(repayment, 'loan_repayment.record', company.id),
    disbursed.accountId,
    {
      amount: '300.00',
      effectiveDate: today,
      reference: 'P9-R1',
      reason: 'Partial repayment',
      idempotencyKey: randomUUID(),
    },
    'repayment',
    'loan_repayment.record',
    meta(),
  );
  assert.equal(first.outstandingAmount, '700.00');
  await assert.rejects(
    () =>
      service.recordLedger(
        repayment,
        ctx(repayment, 'loan_repayment.record', company.id),
        disbursed.accountId,
        { amount: '701.00', effectiveDate: today, reason: 'overpay', idempotencyKey: randomUUID() },
        'repayment',
        'loan_repayment.record',
        meta(),
      ),
    (e) => e.code === 'VALIDATION_FAILED',
  );
  pass('separate repayment actor, partial payment, and overpayment prohibition');
  const adjustment = await service.recordLedger(
    repayment,
    ctx(repayment, 'loan_repayment.adjust', company.id),
    disbursed.accountId,
    { amount: '50.00', effectiveDate: today, reason: 'Adjustment', idempotencyKey: randomUUID() },
    'adjustment',
    'loan_repayment.adjust',
    meta(),
  );
  assert.equal(adjustment.outstandingAmount, '650.00');
  const reversed = await service.reverse(
    repayment,
    ctx(repayment, 'loan_repayment.reverse', company.id),
    disbursed.accountId,
    adjustment.entryId,
    { effectiveDate: today, reason: 'Reverse adjustment', idempotencyKey: randomUUID() },
    meta(),
  );
  assert.equal(reversed.outstandingAmount, '700.00');
  await assert.rejects(
    () =>
      service.reverse(
        repayment,
        ctx(repayment, 'loan_repayment.reverse', company.id),
        disbursed.accountId,
        adjustment.entryId,
        { effectiveDate: today, reason: 'double', idempotencyKey: randomUUID() },
        meta(),
      ),
    (e) => e.code === 'REVERSAL_CONFLICT',
  );
  pass('append-only adjustment and single reversal');
  const settled = await service.recordLedger(
    repayment,
    ctx(repayment, 'loan_repayment.record', company.id),
    disbursed.accountId,
    {
      amount: '700.00',
      effectiveDate: today,
      reason: 'Early full settlement',
      idempotencyKey: randomUUID(),
    },
    'repayment',
    'loan_repayment.record',
    meta(),
  );
  assert.equal(settled.status, 'settled');
  assert.equal(settled.outstandingAmount, '0.00');
  pass('early full settlement and reconciled outstanding balance');
  const cancelApp = await service.create(
    employee,
    ctx(employee, 'loan.apply', company.id, 'own'),
    { ...appInput, purpose: 'Cancellation candidate' },
    meta(),
  );
  await service.submit(
    employee,
    ctx(employee, 'loan.submit', company.id, 'own'),
    cancelApp.id,
    { workflowVersion: 1, reason: 'Submit' },
    meta(),
  );
  await service.transition(
    employee,
    ctx(employee, 'loan.request_cancellation', company.id, 'own'),
    cancelApp.id,
    'cancellation_requested',
    { workflowVersion: 2, reason: 'Cancel' },
    'loan.request_cancellation',
    meta(),
  );
  const cancelled = await service.decideCancellation(
    manager,
    ctx(manager, 'loan.approve_cancellation', company.id, 'direct_reports'),
    cancelApp.id,
    'approve',
    { workflowVersion: 3, reason: 'Cancellation approved', idempotencyKey: randomUUID() },
    meta(),
  );
  assert.equal(cancelled.status, 'cancelled');
  pass('controlled pre-disbursement cancellation');
  const masked = await service.get(manager, ctx(manager, 'loan.view', company.id), created.id);
  assert.equal(masked.purpose, undefined);
  const own = await service.get(
    employee,
    ctx(employee, 'loan.view_own', company.id, 'own'),
    created.id,
    'loan.view_own',
  );
  assert.equal(own.purpose, 'SECRET-P9-PURPOSE');
  const full = await service.get(
    sensitiveActor,
    ctx(sensitiveActor, 'loan.view', company.id),
    created.id,
  );
  assert.equal(full.purpose, 'SECRET-P9-PURPOSE');
  pass('own financial visibility and sensitive intersection projection');
  const history = await service.history(ctx(manager, 'loan.view_history', company.id), created.id);
  assert.equal(history.versions.length, 2);
  assert.equal(history.states.at(-1).to_state, 'disbursed');
  assert.equal(history.decisions.length, 2);
  pass('append-only application, workflow, and decision history');
  const other = await db('companies').whereNot({ id: company.id }).first();
  if (other)
    await assert.rejects(
      () => service.get(manager, ctx(manager, 'loan.view', other.id), created.id),
      (e) => e.code === 'NOT_FOUND',
    );
  const csv = await service.export(
    finance,
    ctx(finance, 'loan.export', company.id),
    { companyId: company.id, page: 1, pageSize: 100 },
    meta(),
  );
  assert.ok(csv.includes(submitted.applicationNumber));
  assert.ok(!csv.includes('SECRET-P9-PURPOSE'));
  pass('cross-company isolation and bounded safe CSV');
  const audits = JSON.stringify(await db('audit_events').whereRaw("action_code LIKE 'loan%'"));
  assert.ok(!audits.includes('SECRET-P9-PURPOSE'));
  pass('transactional audit without sensitive purpose leakage');
  const financeRole = await db('roles').where({ code: 'finance_approver' }).first(),
    paymentRole = await db('roles').where({ code: 'finance_payment_officer' }).first(),
    repaymentRole = await db('roles').where({ code: 'finance_repayment_officer' }).first(),
    grant = async (r, c) =>
      Boolean(
        await db('role_permissions as rp')
          .join('permissions as p', 'p.id', 'rp.permission_id')
          .where({ 'rp.role_id': r.id, 'p.code': c })
          .first(),
      );
  assert.equal(await grant(financeRole, 'loan.finance_approve'), true);
  assert.equal(await grant(financeRole, 'loan.disburse'), false);
  assert.equal(await grant(paymentRole, 'loan.disburse'), true);
  assert.equal(await grant(paymentRole, 'loan_repayment.record'), false);
  assert.equal(await grant(repaymentRole, 'loan_repayment.record'), true);
  pass('least-privilege Finance, disbursement, and repayment roles');
  console.log(`SUMMARY ${passed.length} Phase 9 verification groups passed`);
} finally {
  await db.destroy();
}
