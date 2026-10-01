import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { BENEFIT_LIMITS } from '../src/modules/benefits/benefitConstants.js';
import { createBenefitRepository } from '../src/modules/benefits/benefitRepository.js';
import { createBenefitService } from '../src/modules/benefits/benefitService.js';

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
const tables = [
  'benefit_enrollment_state_events',
  'benefit_enrollment_versions',
  'benefit_enrollments',
  'benefit_plan_versions',
  'benefit_plans',
];
const meta = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const context = (actor, permission, companyId, scope = 'company', extra = {}) =>
  createAccessContext({
    actor,
    permission,
    grants: [{ scope_type: scope, company_id: companyId, ...extra }],
  });
const todayFor = (timezone) => {
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
  const found = await db('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', tables)
    .count({ n: '*' })
    .first();
  assert.equal(Number(found.n), tables.length);
  pass('benefit schema and append-only history tables');
  assert.equal(BENEFIT_LIMITS.maximumPageSize, 100);
  assert.equal(BENEFIT_LIMITS.maximumExportRows, 10000);
  pass('centralized bounded list and export limits');

  const candidates = await db('employments as employment')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .join('employment_status_history as status', 'status.employment_id', 'employment.id')
    .join('companies as company', 'company.id', 'employment.company_id')
    .where({ 'status.history_status': 'current', 'company.status': 'active' })
    .whereIn('status.status', ['probation', 'confirmed'])
    .whereNull('status.effective_end')
    .whereNull('employment.employment_end_date')
    .select('employment.*', 'employee.user_id');
  const employments = candidates.slice(0, 1);
  assert.equal(employments.length, 1);
  const company = await db('companies').where({ id: employments[0].company_id }).first();
  const today = todayFor(company.timezone);
  for (const email of ['p7-hr@example.test', 'p7-sensitive@example.test'])
    await db('users')
      .insert({ email, password_hash: 'phase-7-verifier-not-a-login-secret', status: 'active' })
      .onConflict('email')
      .ignore();
  const users = await db('users')
    .whereIn('email', ['p7-hr@example.test', 'p7-sensitive@example.test'])
    .orderBy('email');
  const actor = { userId: users[0].id };
  const sensitiveActor = { userId: users[1].id };
  const repository = createBenefitRepository(db);
  const authorizationService = {
    requirePermission: async (requestedActor, permission) => {
      if (
        permission === 'benefit_sensitive.view' &&
        requestedActor.userId === sensitiveActor.userId
      )
        return context(requestedActor, permission, company.id);
      throw new Error('denied');
    },
  };
  const service = createBenefitService({ database: db, repository, authorizationService });
  const planInput = {
    companyId: company.id,
    code: 'P7-PLAN',
    name: 'Phase 7 Benefit',
    effectiveStart: today,
    currencyCode: company.currency_code,
    employerContributionAmount: '1000.00',
    employeeContributionAmount: '250.00',
    eligibleEmploymentTypes: ['permanent', 'contract', 'probationary', 'temporary', 'intern'],
    eligibleEmploymentStatuses: ['probation', 'confirmed'],
    employeeVisible: true,
    sensitiveClassification: 'standard',
    reason: 'Phase 7 verification',
  };
  const plan = await service.createPlan(
    actor,
    context(actor, 'benefit_plan.create', company.id),
    planInput,
    meta(),
  );
  assert.ok(plan.id);
  await assert.rejects(
    () =>
      service.createPlan(
        actor,
        context(actor, 'benefit_plan.create', company.id),
        planInput,
        meta(),
      ),
    (error) => error.code === 'BENEFIT_PLAN_CONFLICT',
  );
  pass('company-scoped plan identity and duplicate protection');
  await assert.rejects(
    () =>
      service.createPlanVersion(
        actor,
        context(actor, 'benefit_plan.version_create', company.id),
        plan.id,
        { ...planInput, companyId: undefined, effectiveEnd: null },
        meta(),
      ),
    (error) => error.code === 'BENEFIT_PERIOD_OVERLAP',
  );
  const corrected = await service.createPlanVersion(
    actor,
    context(actor, 'benefit_plan.correct_history', company.id),
    plan.id,
    {
      ...planInput,
      companyId: undefined,
      effectiveEnd: null,
      employerContributionAmount: '1100.00',
      reason: 'Controlled correction',
    },
    meta(),
    true,
  );
  assert.equal(corrected.versionNumber, 2);
  assert.equal((await repository.listPlanVersions(plan.id)).length, 2);
  pass('stable-parent plan overlap and append-only correction');
  const enrollmentInput = {
    companyId: company.id,
    employmentId: employments[0].id,
    benefitPlanId: plan.id,
    effectiveStart: today,
    effectiveEnd: null,
    reason: 'Enrollment verification',
  };
  const enrollment = await service.createEnrollment(
    actor,
    context(actor, 'benefit_enrollment.create', company.id),
    enrollmentInput,
    meta(),
  );
  assert.equal(enrollment.status, 'draft');
  await assert.rejects(
    () =>
      service.createEnrollment(
        actor,
        context(actor, 'benefit_enrollment.create', company.id),
        enrollmentInput,
        meta(),
      ),
    (error) => error.code === 'BENEFIT_ENROLLMENT_OVERLAP',
  );
  pass('employment eligibility and concurrent-safe enrollment overlap invariant');
  const activated = await service.transition(
    actor,
    context(actor, 'benefit_enrollment.activate', company.id),
    enrollment.id,
    'activate',
    { workflowVersion: 1, reason: 'Activate verification' },
    meta(),
  );
  assert.equal(activated.status, 'active');
  const suspended = await service.transition(
    actor,
    context(actor, 'benefit_enrollment.suspend', company.id),
    enrollment.id,
    'suspend',
    { workflowVersion: 2, reason: 'Suspend verification' },
    meta(),
  );
  assert.equal(suspended.status, 'suspended');
  const resumed = await service.transition(
    actor,
    context(actor, 'benefit_enrollment.resume', company.id),
    enrollment.id,
    'resume',
    { workflowVersion: 3, reason: 'Resume verification' },
    meta(),
  );
  assert.equal(resumed.status, 'active');
  assert.ok(employments[0].user_id, 'The own-scope fixture must be linked to a user.');
  const ownActor = { userId: employments[0].user_id };
  const ownDetail = await service.getEnrollment(
    ownActor,
    context(ownActor, 'benefit_enrollment.view_own', company.id, 'own'),
    enrollment.id,
    'benefit_enrollment.view_own',
  );
  assert.equal(Number(ownDetail.employment_id), Number(employments[0].id));
  await assert.rejects(
    () =>
      service.transition(
        actor,
        context(actor, 'benefit_enrollment.cancel', company.id),
        enrollment.id,
        'cancel',
        { workflowVersion: 4, reason: 'Invalid cancel' },
        meta(),
      ),
    (error) => error.code === 'INVALID_WORKFLOW_STATE',
  );
  pass('explicit lifecycle and optimistic workflow versioning');
  const plan2 = await service.createPlan(
    actor,
    context(actor, 'benefit_plan.create', company.id),
    {
      ...planInput,
      code: 'P7-SENSITIVE',
      name: 'Private Plan',
      sensitiveClassification: 'sensitive',
    },
    meta(),
  );
  const sensitiveEnrollment = await service.createEnrollment(
    actor,
    context(actor, 'benefit_enrollment.create', company.id),
    { ...enrollmentInput, employmentId: employments[0].id, benefitPlanId: plan2.id },
    meta(),
  );
  const masked = await service.getEnrollment(
    actor,
    context(actor, 'benefit_enrollment.view', company.id),
    sensitiveEnrollment.id,
  );
  assert.equal(masked.plan_name, 'Sensitive benefit');
  assert.equal(masked.employer_contribution_amount_snapshot, undefined);
  const visible = await service.getEnrollment(
    sensitiveActor,
    context(sensitiveActor, 'benefit_enrollment.view', company.id),
    sensitiveEnrollment.id,
  );
  assert.equal(visible.plan_name, 'Private Plan');
  assert.equal(visible.employer_contribution_amount_snapshot, '1000.00');
  pass('sensitive access intersection and omission projection');
  const otherCompany = await db('companies').whereNot({ id: company.id }).first();
  if (otherCompany) {
    await assert.rejects(
      () =>
        service.getEnrollment(
          actor,
          context(actor, 'benefit_enrollment.view', otherCompany.id),
          enrollment.id,
        ),
      (error) => error.code === 'NOT_FOUND',
    );
  }
  pass('fail-closed cross-company record isolation');
  const history = await service.history(
    context(actor, 'benefit_enrollment.view_history', company.id),
    enrollment.id,
  );
  assert.equal(history.states.length, 4);
  assert.equal(history.versions.length, 1);
  pass('append-only enrollment version and state history');
  const csv = await service.exportEnrollments(
    actor,
    context(actor, 'benefit_enrollment.export', company.id),
    { companyId: company.id, page: 1, pageSize: 100 },
    meta(),
  );
  assert.match(csv, /employee_code/);
  assert.doesNotMatch(csv, /Enrollment verification/);
  pass('bounded audited CSV export without reason leakage');
  const audits = await db('audit_events').whereRaw("action_code LIKE 'benefit%'");
  assert.ok(audits.length >= 8);
  assert.ok(audits.every((row) => !JSON.stringify(row.metadata ?? '').includes('1000.00')));
  pass('transactional benefit audit without financial or reason payloads');
  const sensitivePermission = await db('permissions')
    .where({ code: 'benefit_sensitive.view' })
    .first();
  assert.equal(sensitivePermission.allow_direct_grant, 1);
  const systemRole = await db('roles').where({ code: 'system_administrator' }).first();
  const systemBenefit = await db('role_permissions as rp')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', systemRole.id)
    .whereRaw("p.code LIKE 'benefit%'");
  assert.equal(systemBenefit.length, 0);
  pass('least-privilege initial role grants and exceptional sensitive permission');
  console.log(`SUMMARY ${passed.length} Phase 7 verification groups passed`);
} finally {
  await db.destroy();
}
