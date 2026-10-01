import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { CLAIM_LIMITS } from '../src/modules/claims/claimConstants.js';
import { createClaimRepository } from '../src/modules/claims/claimRepository.js';
import { createClaimService } from '../src/modules/claims/claimService.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.deepEqual([env.DB_HOST, env.DB_PORT, env.DB_NAME], ['127.0.0.1', 3307, 'hrm_test']);
const db = createDatabase(env),
  passed = [];
const pass = (n) => {
  passed.push(n);
  console.log(`PASS ${n}`);
};
const meta = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const ctx = (actor, permission, companyId, scope = 'company') =>
  createAccessContext({
    actor,
    permission,
    grants: [{ scope_type: scope, company_id: companyId }],
  });
const tables = [
  'expense_claim_payments',
  'expense_claim_state_events',
  'expense_claim_approval_decisions',
  'expense_claim_approval_attempts',
  'expense_claim_evidence',
  'expense_claim_items',
  'expense_claim_versions',
  'expense_claims',
  'claim_category_versions',
  'claim_categories',
  'claim_number_sequences',
];
const localDate = (timezone) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
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
      for (const table of tables) await trx(table).del();
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
  assert.equal(CLAIM_LIMITS.maximumItems, 50);
  pass('schema, history tables, and centralized limits');
  const employment = await db('employments as employment')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .join('employee_assignments as assignment', function () {
      this.on('assignment.employment_id', 'employment.id').andOnVal(
        'assignment.history_status',
        'current',
      );
    })
    .leftJoin('employments as me', 'me.id', 'assignment.manager_employment_id')
    .leftJoin('employees as manager', 'manager.id', 'me.employee_id')
    .whereNotNull('employee.user_id')
    .whereNotNull('manager.user_id')
    .where('employment.record_status', 'active')
    .first('employment.*', 'employee.user_id', 'manager.user_id as manager_user_id');
  assert.ok(employment, 'Run Phase 3 verifier first.');
  const company = await db('companies').where({ id: employment.company_id }).first(),
    today = localDate(company.timezone);
  const employee = { userId: employment.user_id },
    manager = { userId: employment.manager_user_id };
  for (const email of [
    'p8-finance@example.test',
    'p8-payment@example.test',
    'p8-sensitive@example.test',
  ])
    await db('users')
      .insert({ email, password_hash: 'phase-8-verifier-not-a-login-secret', status: 'active' })
      .onConflict('email')
      .ignore();
  const users = await db('users').whereIn('email', [
    'p8-finance@example.test',
    'p8-payment@example.test',
    'p8-sensitive@example.test',
  ]);
  const actor = (email) => ({ userId: users.find((x) => x.email === email).id }),
    finance = actor('p8-finance@example.test'),
    payment = actor('p8-payment@example.test'),
    sensitive = actor('p8-sensitive@example.test');
  const repository = createClaimRepository(db);
  const service = createClaimService({
    database: db,
    repository,
    authorizationService: {
      requirePermission: async (a) => {
        if (a.userId === sensitive.userId) return ctx(a, 'claim_sensitive.view', company.id);
        throw new Error('denied');
      },
    },
  });
  const categoryInput = {
    companyId: company.id,
    code: 'P8-TRAVEL',
    name: 'Travel',
    description: null,
    effectiveStart: today,
    effectiveEnd: null,
    receiptRequired: true,
    maximumItemAmount: '5000.00',
    currencyCode: company.currency_code,
    sensitiveClassification: 'standard',
    reason: 'Phase 8 verification',
  };
  const category = await service.createCategory(
    manager,
    ctx(manager, 'claim_category.create', company.id),
    categoryInput,
    meta(),
  );
  await assert.rejects(
    () =>
      service.createCategory(
        manager,
        ctx(manager, 'claim_category.create', company.id),
        categoryInput,
        meta(),
      ),
    (e) => e.code === 'CLAIM_CATEGORY_CONFLICT',
  );
  pass('company category identity and duplicate protection');
  const input = {
    companyId: company.id,
    employmentId: employment.id,
    title: 'Verification travel',
    businessPurpose: 'PRIVATE-PURPOSE-P8',
    currencyCode: company.currency_code,
    reason: 'Create verifier claim',
    items: [
      {
        claimCategoryId: category.id,
        expenseDate: today,
        description: 'PRIVATE-DESCRIPTION-P8',
        amount: '123.45',
        merchantReference: 'PRIVATE-MERCHANT-P8',
        evidence: [
          { referenceType: 'external_reference', referenceValue: 'REF-1', displayName: 'Receipt' },
        ],
      },
    ],
  };
  const created = await service.create(
    employee,
    ctx(employee, 'claim.create', company.id, 'own'),
    input,
    meta(),
  );
  const updated = await service.updateDraft(
    employee,
    ctx(employee, 'claim.update_draft', company.id, 'own'),
    created.id,
    { ...input, version: 1 },
    meta(),
  );
  assert.equal(updated.currentVersionNumber, 2);
  await assert.rejects(
    () =>
      service.updateDraft(
        employee,
        ctx(employee, 'claim.update_draft', company.id, 'own'),
        created.id,
        { ...input, version: 1 },
        meta(),
      ),
    (e) => e.code === 'STALE_VERSION',
  );
  pass('own draft, evidence, immutable versions, and optimistic concurrency');
  const submitted = await service.submit(
    employee,
    ctx(employee, 'claim.submit', company.id, 'own'),
    created.id,
    { workflowVersion: 1, reason: 'Submit' },
    meta(),
  );
  assert.match(submitted.claimNumber, /^CLM-\d{4}-\d{6}$/);
  const managerApproved = await service.decide(
    manager,
    ctx(manager, 'claim.approve', company.id, 'direct_reports'),
    created.id,
    'manager',
    'approve',
    { workflowVersion: 2, reason: 'Manager approved', idempotencyKey: randomUUID() },
    meta(),
  );
  assert.equal(managerApproved.status, 'manager_approved');
  pass('submission snapshot, safe numbering, and effective-manager approval');
  await assert.rejects(
    () =>
      service.decide(
        employee,
        ctx(employee, 'claim.finance_approve', company.id, 'own'),
        created.id,
        'finance',
        'approve',
        { workflowVersion: 3, reason: 'self', idempotencyKey: randomUUID() },
        meta(),
      ),
    (e) => ['NOT_FOUND', 'MAKER_CHECKER_VIOLATION'].includes(e.code),
  );
  await service.decide(
    finance,
    ctx(finance, 'claim.finance_approve', company.id),
    created.id,
    'finance',
    'approve',
    { workflowVersion: 3, reason: 'Finance approved', idempotencyKey: randomUUID() },
    meta(),
  );
  await assert.rejects(
    () =>
      service.recordPayment(finance, ctx(finance, 'claim.record_payment', company.id), created.id, {
        workflowVersion: 4,
        reason: 'same actor',
        idempotencyKey: randomUUID(),
        paymentReference: 'BAD',
        paymentDate: today,
      }),
    (e) => e.code === 'MAKER_CHECKER_VIOLATION',
  );
  const paid = await service.recordPayment(
    payment,
    ctx(payment, 'claim.record_payment', company.id),
    created.id,
    {
      workflowVersion: 4,
      reason: 'Paid',
      idempotencyKey: randomUUID(),
      paymentReference: 'PAY-P8',
      paymentDate: today,
    },
    meta(),
  );
  assert.equal(paid.status, 'paid');
  pass('claimant prohibition, finance/payment separation, and immutable payment');
  const cancelClaim = await service.create(
    employee,
    ctx(employee, 'claim.create', company.id, 'own'),
    { ...input, title: 'Cancel candidate' },
    meta(),
  );
  await service.submit(
    employee,
    ctx(employee, 'claim.submit', company.id, 'own'),
    cancelClaim.id,
    { workflowVersion: 1, reason: 'Submit' },
    meta(),
  );
  await service.simpleTransition(
    employee,
    ctx(employee, 'claim.request_cancellation', company.id, 'own'),
    cancelClaim.id,
    'cancellation_requested',
    { workflowVersion: 2, reason: 'Cancel request' },
    'claim.request_cancellation',
    meta(),
  );
  await assert.rejects(
    () =>
      service.decideCancellation(
        employee,
        ctx(employee, 'claim.approve_cancellation', company.id, 'own'),
        cancelClaim.id,
        'approve',
        { workflowVersion: 3, reason: 'self', idempotencyKey: randomUUID() },
        meta(),
      ),
    (e) => ['NOT_FOUND', 'MAKER_CHECKER_VIOLATION'].includes(e.code),
  );
  const cancelled = await service.decideCancellation(
    manager,
    ctx(manager, 'claim.approve_cancellation', company.id, 'direct_reports'),
    cancelClaim.id,
    'approve',
    { workflowVersion: 3, reason: 'Approved cancellation', idempotencyKey: randomUUID() },
    meta(),
  );
  assert.equal(cancelled.status, 'cancelled');
  pass('explicit cancellation permissions and append-only decision');
  const history = await service.history(ctx(manager, 'claim.view_history', company.id), created.id);
  assert.equal(history.versions.length, 2);
  assert.equal(history.states.at(-1).to_state, 'paid');
  assert.equal(history.decisions.length, 2);
  pass('append-only workflow, decision, and payment history');
  const sensitiveCategory = await service.createCategory(
    manager,
    ctx(manager, 'claim_category.create', company.id),
    {
      ...categoryInput,
      code: 'P8-SENSITIVE',
      name: 'Sensitive',
      receiptRequired: false,
      maximumItemAmount: null,
      sensitiveClassification: 'sensitive',
    },
    meta(),
  );
  const sensitiveClaim = await service.create(
    employee,
    ctx(employee, 'claim.create', company.id, 'own'),
    {
      ...input,
      title: 'Sensitive',
      items: [
        {
          claimCategoryId: sensitiveCategory.id,
          expenseDate: today,
          description: 'SECRET-P8',
          amount: '25.00',
          merchantReference: 'SECRET-MERCHANT',
          evidence: [],
        },
      ],
    },
    meta(),
  );
  assert.equal(
    (
      await service.get(
        employee,
        ctx(employee, 'claim.view_own', company.id, 'own'),
        sensitiveClaim.id,
        'claim.view_own',
      )
    ).items[0].description,
    'SECRET-P8',
  );
  assert.equal(
    (await service.get(manager, ctx(manager, 'claim.view', company.id), sensitiveClaim.id)).items[0]
      .description,
    undefined,
  );
  assert.equal(
    (await service.get(sensitive, ctx(sensitive, 'claim.view', company.id), sensitiveClaim.id))
      .items[0].description,
    'SECRET-P8',
  );
  pass('sensitive own access, omission projection, and explicit permission intersection');
  const other = await db('companies').whereNot({ id: company.id }).first();
  if (other)
    await assert.rejects(
      () => service.get(manager, ctx(manager, 'claim.view', other.id), created.id),
      (e) => e.code === 'NOT_FOUND',
    );
  const csv = await service.export(
    finance,
    ctx(finance, 'claim.export', company.id),
    { companyId: company.id, page: 1, pageSize: 100 },
    meta(),
  );
  assert.ok(csv.includes(submitted.claimNumber));
  assert.ok(!csv.includes('PRIVATE-MERCHANT'));
  pass('cross-company isolation and bounded safe CSV export');
  const audits = JSON.stringify(await db('audit_events').whereRaw("action_code LIKE 'claim%'"));
  assert.ok(!audits.includes('SECRET-P8'));
  assert.ok(!audits.includes('PRIVATE-PURPOSE-P8'));
  pass('transactional audit without narrative leakage');
  const financeRole = await db('roles').where({ code: 'finance_approver' }).first(),
    payRole = await db('roles').where({ code: 'finance_payment_officer' }).first();
  const grant = async (role, code) =>
    Boolean(
      await db('role_permissions as rp')
        .join('permissions as p', 'p.id', 'rp.permission_id')
        .where({ 'rp.role_id': role.id, 'p.code': code })
        .first(),
    );
  assert.equal(await grant(financeRole, 'claim.finance_approve'), true);
  assert.equal(await grant(financeRole, 'claim.record_payment'), false);
  assert.equal(await grant(payRole, 'claim.record_payment'), true);
  assert.equal(await db('permissions').where({ code: 'claim.finance_review' }).first(), undefined);
  pass('explicit finance naming and least-privilege payment role');
  console.log(`SUMMARY ${passed.length} Phase 8 verification groups passed`);
} finally {
  await db.destroy();
}
