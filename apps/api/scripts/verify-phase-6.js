import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { PAYROLL_LIMITS } from '../src/modules/payroll/payrollConstants.js';
import { createPayrollRepository } from '../src/modules/payroll/payrollRepository.js';
import { createPayrollService } from '../src/modules/payroll/payrollService.js';

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
const meta = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const context = (actor, permission, companyId) =>
  createAccessContext({
    actor,
    permission,
    grants: [
      { scope_type: 'company', company_id: companyId, branch_id: null, department_id: null },
    ],
  });
const tables = [
  'payslip_publications',
  'payroll_reversals',
  'payroll_adjustments',
  'payroll_locks',
  'payroll_result_state_events',
  'payroll_approval_decisions',
  'payroll_approval_attempts',
  'payroll_state_events',
  'payroll_control_totals',
  'payroll_result_items',
  'payroll_result_versions',
  'payroll_calculation_attempts',
  'payroll_run_employees',
  'payroll_runs',
  'payroll_one_time_inputs',
  'employment_recurring_payroll_components',
  'employment_compensation_periods',
  'payroll_component_versions',
  'payroll_components',
  'payroll_periods',
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
      for (const table of tables) await trx(table).del();
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS=1');
    }
  });
  const company = await db('companies').where({ status: 'active' }).first();
  assert.ok(company);
  const employments = await db('employments as employment')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .where({
      'employment.company_id': company.id,
      'employment.record_status': 'active',
      'employee.record_status': 'active',
    })
    .select('employment.*', 'employee.user_id')
    .limit(2);
  assert.ok(employments.length >= 2);
  for (const email of [
    'p6-maker@example.test',
    'p6-approver@example.test',
    'p6-locker@example.test',
  ])
    await db('users')
      .insert({ email, password_hash: 'phase-6-verifier-not-a-login-secret', status: 'active' })
      .onConflict('email')
      .ignore();
  const users = await db('users')
    .whereIn('email', [
      'p6-maker@example.test',
      'p6-approver@example.test',
      'p6-locker@example.test',
    ])
    .orderBy('id');
  assert.equal(users.length, 3);
  const maker = { userId: users[0].id };
  const approver = { userId: users[1].id };
  const locker = { userId: users[2].id };
  const repository = createPayrollRepository(db);
  const service = createPayrollService({ database: db, repository });
  assert.equal(PAYROLL_LIMITS.maximumRunEmployments, 500);
  pass('centralized conservative payroll limits');

  const period = await service.createPeriod(
    maker,
    context(maker, 'payroll_period.create', company.id),
    {
      companyId: company.id,
      code: 'P6-2026-08',
      name: 'Phase 6 August',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      paymentDate: '2026-09-01',
    },
    meta(),
  );
  await assert.rejects(
    () =>
      service.createPeriod(
        maker,
        context(maker, 'payroll_period.create', company.id),
        {
          companyId: company.id,
          code: 'P6-OVERLAP',
          name: 'Overlap',
          periodStart: '2026-08-15',
          periodEnd: '2026-09-15',
          paymentDate: '2026-09-16',
        },
        meta(),
      ),
    /overlaps/,
  );
  pass('company payroll period overlap protection');

  const earning = await service.createComponent(
    maker,
    context(maker, 'payroll_component.create', company.id),
    {
      companyId: company.id,
      code: 'P6-EARN',
      name: 'Fixed earning',
      componentType: 'earning',
      effectiveStart: '2026-01-01',
      showOnPayslip: true,
      displayOrder: 1,
    },
    meta(),
  );
  const deduction = await service.createComponent(
    maker,
    context(maker, 'payroll_component.create', company.id),
    {
      companyId: company.id,
      code: 'P6-DEDUCT',
      name: 'Fixed deduction',
      componentType: 'deduction',
      effectiveStart: '2026-01-01',
      showOnPayslip: true,
      displayOrder: 2,
    },
    meta(),
  );
  await service.addCompensation(
    maker,
    context(maker, 'employee_compensation.update', company.id),
    employments[0].id,
    {
      companyId: company.id,
      effectiveStart: '2026-01-01',
      monthlyBaseAmount: '10000.00',
      currencyCode: company.currency_code,
      reason: 'Phase 6 verification',
    },
    meta(),
  );
  await assert.rejects(
    () =>
      service.addCompensation(
        maker,
        context(maker, 'employee_compensation.update', company.id),
        employments[0].id,
        {
          companyId: company.id,
          effectiveStart: '2026-06-01',
          monthlyBaseAmount: '12000.00',
          currencyCode: company.currency_code,
          reason: 'Overlap',
        },
        meta(),
      ),
    /overlaps/,
  );
  pass('sensitive compensation currency and overlap invariants');
  await service.addRecurring(
    maker,
    context(maker, 'payroll_input.create', company.id),
    employments[0].id,
    {
      companyId: company.id,
      payrollComponentId: earning.id,
      effectiveStart: '2026-01-01',
      amount: '1000.25',
      reason: 'Verification earning',
    },
    meta(),
  );
  const key = randomUUID();
  await service.createInput(
    maker,
    context(maker, 'payroll_input.create', company.id),
    {
      companyId: company.id,
      payrollPeriodId: period.id,
      employmentId: employments[0].id,
      payrollComponentId: deduction.id,
      amount: '500.10',
      reason: 'Verification deduction',
      idempotencyKey: key,
    },
    meta(),
  );
  await assert.rejects(
    () =>
      service.createInput(
        maker,
        context(maker, 'payroll_input.create', company.id),
        {
          companyId: company.id,
          payrollPeriodId: period.id,
          employmentId: employments[0].id,
          payrollComponentId: deduction.id,
          amount: '500.10',
          reason: 'Duplicate',
          idempotencyKey: key,
        },
        meta(),
      ),
    /idempotency/,
  );
  pass('fixed recurring and one-time input idempotency');

  const run = await service.createRun(
    maker,
    context(maker, 'payroll.create', company.id),
    {
      companyId: company.id,
      payrollPeriodId: period.id,
      code: 'P6-RUN-1',
      employmentIds: [employments[0].id],
    },
    meta(),
  );
  assert.equal(run.employeeCount, 1);
  pass('explicit bounded authorized run population');
  const member = (await repository.listRunEmployees(run.id))[0];
  assert.ok(member.branch_id_snapshot);
  const branchContext = (branchId) =>
    createAccessContext({
      actor: maker,
      permission: 'payroll.view',
      grants: [
        {
          scope_type: 'branch',
          company_id: company.id,
          branch_id: branchId,
          department_id: null,
        },
      ],
    });
  assert.ok(await repository.getRun(run.id, branchContext(member.branch_id_snapshot)));
  assert.equal(
    await repository.getRun(run.id, branchContext(member.branch_id_snapshot + 999)),
    undefined,
  );
  pass('branch-scoped run isolation from frozen assignment snapshots');
  const processed = await service.process(
    maker,
    context(maker, 'payroll.process', company.id),
    run.id,
    { workflowVersion: 1, idempotencyKey: randomUUID(), reason: 'Initial calculation' },
    meta(),
  );
  assert.equal(processed.status, 'completed');
  const result = (await repository.getResults(run.id))[0];
  assert.equal(result.gross_earnings, '11000.25');
  assert.equal(result.total_deductions, '500.10');
  assert.equal(result.net_pay, '10500.15');
  assert.ok(
    await db('payroll_attendance_summaries')
      .where({
        payroll_result_version_id: result.id,
      })
      .first(),
  );
  assert.ok(
    await db('payroll_leave_summaries')
      .where({
        payroll_result_version_id: result.id,
      })
      .first(),
  );
  pass('exact decimal calculation and immutable snapshots');
  const reprocessed = await service.process(
    maker,
    context(maker, 'payroll.process', company.id),
    run.id,
    { workflowVersion: 2, idempotencyKey: randomUUID(), reason: 'Reprocessing verification' },
    meta(),
  );
  assert.equal(reprocessed.status, 'completed');
  assert.equal(
    (
      await db('payroll_result_versions').where({
        payroll_run_employee_id: result.payroll_run_employee_id,
      })
    ).length,
    2,
  );
  pass('append-only reprocessing and supersession history');
  const submitted = await service.submit(
    maker,
    context(maker, 'payroll.submit', company.id),
    run.id,
    { workflowVersion: 3, reason: 'Submit verification' },
    meta(),
  );
  assert.equal(submitted.status, 'submitted');
  await assert.rejects(
    () =>
      service.decide(
        maker,
        context(maker, 'payroll.approve', company.id),
        run.id,
        'approved',
        { workflowVersion: 4, reason: 'Self approval', idempotencyKey: randomUUID() },
        meta(),
      ),
    /Separation/,
  );
  const approved = await service.decide(
    approver,
    context(approver, 'payroll.approve', company.id),
    run.id,
    'approved',
    { workflowVersion: 4, reason: 'Finance approval', idempotencyKey: randomUUID() },
    meta(),
  );
  assert.equal(approved.status, 'approved');
  pass('maker-checker approval and one terminal decision');
  await assert.rejects(
    () =>
      service.lock(
        approver,
        context(approver, 'payroll.lock', company.id),
        run.id,
        { workflowVersion: 5, reason: 'Approver lock' },
        meta(),
      ),
    /Separation/,
  );
  const locked = await service.lock(
    locker,
    context(locker, 'payroll.lock', company.id),
    run.id,
    { workflowVersion: 5, reason: 'Independent lock' },
    meta(),
  );
  assert.equal(locked.status, 'locked');
  assert.equal((await db('payroll_locks').where({ payroll_run_id: run.id })).length, 1);
  pass('separate high-risk locking and immutable lock evidence');
  const publication = await service.publish(
    maker,
    context(maker, 'payslip.publish', company.id),
    run.id,
    { reason: 'Publish verification' },
    meta(),
  );
  assert.equal(publication.publishedCount, 1);
  pass('post-lock payslip publication');

  const currentResult = (await repository.getResults(run.id))[0];
  const adjustment = await service.createAdjustment(
    locker,
    context(locker, 'payroll.adjust', company.id),
    currentResult.id,
    {
      payrollComponentId: earning.id,
      componentType: 'earning',
      amount: '100.00',
      reason: 'Correction',
      idempotencyKey: randomUUID(),
    },
    meta(),
  );
  const submittedAdjustment = await service.adjustmentTransition(
    locker,
    context(locker, 'payroll.adjust', company.id),
    adjustment.id,
    'submit',
    { workflowVersion: 1, reason: 'Submit adjustment' },
    meta(),
  );
  await assert.rejects(
    () =>
      service.adjustmentTransition(
        locker,
        context(locker, 'payroll_adjustment.approve', company.id),
        adjustment.id,
        'approve',
        { workflowVersion: submittedAdjustment.workflowVersion, reason: 'Self decide' },
        meta(),
      ),
    /requester/,
  );
  const adjustmentApproved = await service.adjustmentTransition(
    approver,
    context(approver, 'payroll_adjustment.approve', company.id),
    adjustment.id,
    'approve',
    { workflowVersion: 2, reason: 'Approve adjustment' },
    meta(),
  );
  const applied = await service.adjustmentTransition(
    approver,
    context(approver, 'payroll_adjustment.approve', company.id),
    adjustment.id,
    'apply',
    { workflowVersion: adjustmentApproved.workflowVersion, reason: 'Apply adjustment' },
    meta(),
  );
  assert.ok(applied.correctedResultId);
  pass('controlled adjustment approval and append-only corrected result');
  const reversed = await service.reverseResult(
    locker,
    context(locker, 'payroll.reverse', company.id),
    applied.correctedResultId,
    { reason: 'Reverse verification result', idempotencyKey: randomUUID() },
    meta(),
  );
  assert.equal(reversed.reversed, true);
  await assert.rejects(
    () =>
      service.reverseResult(
        locker,
        context(locker, 'payroll.reverse', company.id),
        applied.correctedResultId,
        { reason: 'Double reverse', idempotencyKey: randomUUID() },
        meta(),
      ),
    /reversed/,
  );
  pass('employee-result reversal and double-reversal protection');

  const secondPeriod = await service.createPeriod(
    maker,
    context(maker, 'payroll_period.create', company.id),
    {
      companyId: company.id,
      code: 'P6-2026-09',
      name: 'Phase 6 September',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      paymentDate: '2026-10-01',
    },
    meta(),
  );
  const partialRun = await service.createRun(
    maker,
    context(maker, 'payroll.create', company.id),
    {
      companyId: company.id,
      payrollPeriodId: secondPeriod.id,
      code: 'P6-RUN-2',
      employmentIds: [employments[0].id, employments[1].id],
    },
    meta(),
  );
  const partial = await service.process(
    maker,
    context(maker, 'payroll.process', company.id),
    partialRun.id,
    { workflowVersion: 1, idempotencyKey: randomUUID(), reason: 'Partial verification' },
    meta(),
  );
  assert.equal(partial.status, 'partially_failed');
  await assert.rejects(
    () =>
      service.submit(
        maker,
        context(maker, 'payroll.submit', company.id),
        partialRun.id,
        { workflowVersion: 2, reason: 'Must fail submission' },
        meta(),
      ),
    /successful result/,
  );
  pass('partially failed run submission prohibition');
  const auditText = JSON.stringify(
    await db('audit_events').whereRaw('action_code LIKE ?', ['payroll%']),
  );
  assert.ok(!auditText.includes('10000.00'));
  assert.ok((await db('audit_events').where({ action_code: 'payroll.lock' })).length > 0);
  pass('transactional payroll audit without salary payloads');
  console.log(`SUMMARY ${passed.length} Phase 6 verification groups passed`);
} finally {
  await db.destroy();
}
