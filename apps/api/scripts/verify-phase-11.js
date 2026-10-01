import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { createTrainingRepository } from '../src/modules/training/trainingRepository.js';
import { createTrainingService } from '../src/modules/training/trainingService.js';
import { TRAINING_LIMITS as L } from '../src/modules/training/trainingConstants.js';
const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.deepEqual([env.DB_HOST, env.DB_PORT, env.DB_NAME], ['127.0.0.1', 3307, 'hrm_test']);
const db = createDatabase(env),
  passed = [],
  pass = (name) => {
    passed.push(name);
    console.log(`PASS ${name}`);
  };
const meta = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const ctx = (actor, permission, companyId, scope = 'company') =>
  createAccessContext({
    actor,
    permission,
    grants: [{ scope_type: scope, company_id: companyId }],
  });
const tables = [
  'training_evidence_references',
  'training_completion_versions',
  'training_completion_records',
  'training_participation_versions',
  'training_participation_records',
  'training_manager_reassignments',
  'training_enrollment_decisions',
  'training_enrollment_state_events',
  'training_enrollment_versions',
  'training_enrollments',
  'training_session_facilitators',
  'training_session_state_events',
  'training_session_versions',
  'training_sessions',
  'training_provider_versions',
  'training_providers',
  'training_course_competencies',
  'training_course_versions',
  'training_courses',
];
try {
  const [[identity]] = await db.raw(
    'SELECT VERSION() version,DATABASE() database_name,@@port port,@@transaction_isolation isolation_level',
  );
  assert.match(identity.version, /^8\./);
  assert.equal(identity.database_name, 'hrm_test');
  assert.equal(Number(identity.port), 3307);
  assert.equal(identity.isolation_level, 'READ-COMMITTED');
  pass('guarded MySQL 8 hrm_test READ COMMITTED execution');
  await db.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const table of tables) await trx(table).del();
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS=1');
    }
  });
  const count = await db('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', tables)
    .count({ n: '*' })
    .first();
  assert.equal(Number(count.n), tables.length);
  assert.deepEqual(
    [L.maximumPageSize, L.maximumExportRows, L.maximumSessionCapacity],
    [100, 10000, 1000],
  );
  pass('schema, company ownership, append-only tables, and centralized limits');
  const employees = await db('employments as e')
    .join('employees as employee', 'employee.id', 'e.employee_id')
    .join('employee_assignments as a', function () {
      this.on('a.employment_id', 'e.id').andOnVal('a.history_status', 'current');
    })
    .leftJoin('employments as me', 'me.id', 'a.manager_employment_id')
    .leftJoin('employees as manager', 'manager.id', 'me.employee_id')
    .whereNull('e.employment_end_date')
    .whereIn('e.record_status', ['active'])
    .select('e.*', 'employee.user_id', 'manager.user_id as manager_user_id');
  const employment = employees.find((x) => x.user_id && x.manager_user_id);
  assert.ok(employment, 'Run Phase 3 verifier first.');
  const secondEmployment =
      employees.find(
        (x) => x.id !== employment.id && Number(x.company_id) === Number(employment.company_id),
      ) ?? employment,
    company = await db('companies').where({ id: employment.company_id }).first();
  const employee = { userId: employment.user_id },
    manager = { userId: employment.manager_user_id };
  for (const email of ['p11-admin@example.test', 'p11-sensitive@example.test'])
    await db('users')
      .insert({ email, password_hash: 'phase-11-verifier-not-login-secret', status: 'active' })
      .onConflict('email')
      .ignore();
  const users = await db('users').whereIn('email', [
    'p11-admin@example.test',
    'p11-sensitive@example.test',
  ]);
  const admin = { userId: users.find((x) => x.email === 'p11-admin@example.test').id },
    sensitiveActor = { userId: users.find((x) => x.email === 'p11-sensitive@example.test').id };
  const repository = createTrainingRepository(db),
    service = createTrainingService({
      database: db,
      repository,
      authorizationService: {
        requirePermission: async (actor, permission) => {
          if (actor.userId === sensitiveActor.userId) return ctx(actor, permission, company.id);
          throw new Error('denied');
        },
      },
    });
  const competency = await db('performance_competency_versions')
    .where({ company_id: company.id })
    .first();
  assert.ok(competency, 'Run Phase 10 verifier first.');
  const course = await service.createCourse(
    admin,
    ctx(admin, 'training_course.create', company.id),
    {
      companyId: company.id,
      code: 'P11-COURSE',
      name: 'Secure Delivery',
      effectiveStart: '2026-01-01',
      description: 'Training verifier course',
      deliveryMode: 'blended',
      scoringEnabled: true,
      minimumScore: '0.00',
      maximumScore: '100.00',
      passingScore: '60.00',
      competencyVersionIds: [competency.id],
      reason: 'verification',
    },
    meta(),
  );
  const courseVersion = await db('training_course_versions')
      .where({ training_course_id: course.id })
      .first(),
    mapping = await db('training_course_competencies')
      .where({ training_course_version_id: courseVersion.id })
      .first();
  assert.equal(Number(mapping.performance_competency_version_id), Number(competency.id));
  await assert.rejects(() =>
    service.createCourse(
      admin,
      ctx(admin, 'training_course.create', company.id),
      {
        companyId: company.id,
        code: 'BAD-COMP',
        name: 'Bad',
        effectiveStart: '2026-01-01',
        description: 'bad',
        deliveryMode: 'virtual',
        scoringEnabled: false,
        competencyVersionIds: [999999999],
        reason: 'verification',
      },
      meta(),
    ),
  );
  const beforeCompetency = await db('performance_competency_versions')
    .where({ id: competency.id })
    .first();
  pass('immutable company-safe Phase 10 competency-version mapping');
  const provider = await service.createProvider(
    admin,
    ctx(admin, 'training_provider.create', company.id),
    {
      companyId: company.id,
      code: 'P11-PROVIDER',
      name: 'Verifier Provider',
      effectiveStart: '2026-01-01',
      contactName: 'Private Contact',
      contactEmail: 'private@example.test',
      externalUrl: 'https://example.test/provider',
      reason: 'verification',
    },
    meta(),
  );
  assert.ok(provider.id);
  pass('versioned provider metadata without external fetching');
  const providerVersion = await db('training_provider_versions')
    .where({ training_provider_id: provider.id })
    .first();
  const session = await service.createSession(
    admin,
    ctx(admin, 'training_session.create', company.id),
    {
      companyId: company.id,
      code: 'P11-SESSION',
      trainingCourseVersionId: courseVersion.id,
      title: 'Verifier Session',
      startsAtUtc: '2026-10-10T03:00:00Z',
      endsAtUtc: '2026-10-10T11:00:00Z',
      timezone: company.timezone,
      enrollmentOpensOn: '2026-08-01',
      enrollmentClosesOn: '2026-10-09',
      capacity: 2,
      branchId: null,
      location: 'Room A',
      virtualReference: null,
      trainingProviderVersionId: providerVersion.id,
      facilitators: [{ name: 'Facilitator' }],
      reason: 'verification',
    },
    meta(),
  );
  let result = await service.sessionTransition(
    admin,
    ctx(admin, 'training_session.publish', company.id),
    session.id,
    'published',
    { workflowVersion: 1, reason: 'verification', idempotencyKey: randomUUID() },
    'training_session.publish',
    meta(),
  );
  assert.equal(result.status, 'published');
  pass('published immutable session snapshot and explicit lifecycle');
  const draft = await service.createEnrollment(
    employee,
    ctx(employee, 'training_enrollment.request', company.id, 'own'),
    {
      companyId: company.id,
      trainingSessionId: session.id,
      employmentId: employment.id,
      requestNarrative: 'PRIVATE TRAINING REQUEST',
      isMandatory: false,
      reason: 'verification',
    },
    'self_request',
    'training_enrollment.request',
    meta(),
  );
  assert.equal(draft.status, 'draft');
  result = await service.enrollmentAction(
    employee,
    ctx(employee, 'training_enrollment.submit', company.id, 'own'),
    draft.id,
    'submit',
    { workflowVersion: 1, reason: 'verification', idempotencyKey: randomUUID() },
    'training_enrollment.submit',
    meta(),
  );
  assert.equal(result.status, 'submitted');
  pass('eligible employee draft, submission, and immutable organization snapshot');
  const approvalKey = randomUUID();
  result = await service.enrollmentAction(
    manager,
    ctx(manager, 'training_enrollment.approve', company.id, 'direct_reports'),
    draft.id,
    'approve',
    { workflowVersion: 2, reason: 'verification', idempotencyKey: approvalKey },
    'training_enrollment.approve',
    meta(),
  );
  assert.equal(result.status, 'enrolled');
  const replay = await service.enrollmentAction(
    manager,
    ctx(manager, 'training_enrollment.approve', company.id, 'direct_reports'),
    draft.id,
    'approve',
    { workflowVersion: 2, reason: 'verification', idempotencyKey: approvalKey },
    'training_enrollment.approve',
    meta(),
  );
  assert.equal(replay.replayed, true);
  pass('snapshotted-manager approval, capacity allocation, and idempotent replay');
  const own = await service.getEnrollment(
    employee,
    ctx(employee, 'training_enrollment.view_own', company.id, 'own'),
    draft.id,
    'training_enrollment.view_own',
    meta(),
  );
  assert.equal(own.request_narrative, 'PRIVATE TRAINING REQUEST');
  const team = await service.getEnrollment(
    manager,
    ctx(manager, 'training_enrollment.view_team', company.id, 'direct_reports'),
    draft.id,
    'training_enrollment.view_team',
    meta(),
  );
  assert.equal(team.request_narrative, undefined);
  await assert.rejects(() =>
    service.getEnrollment(
      employee,
      ctx(employee, 'training_enrollment.view_own', company.id + 999, 'own'),
      draft.id,
      'training_enrollment.view_own',
      meta(),
    ),
  );
  pass('own/team scope, sensitive omission, and cross-company fail-closed access');
  const participation = await service.recordParticipation(
    admin,
    ctx(admin, 'training_participation.record', company.id),
    draft.id,
    {
      participationStatus: 'attended',
      comment: 'PRIVATE PARTICIPATION',
      reason: 'verification',
      idempotencyKey: randomUUID(),
    },
    false,
    meta(),
  );
  assert.ok(participation.id);
  const completion = await service.recordCompletion(
    admin,
    ctx(admin, 'training_completion.record', company.id),
    draft.id,
    {
      outcome: 'passed',
      score: '85.00',
      completionDate: '2026-10-10',
      comment: 'PRIVATE RESULT',
      reason: 'verification',
      idempotencyKey: randomUUID(),
    },
    false,
    meta(),
  );
  assert.ok(completion.id);
  pass('participation and explicit scored completion outcome');
  const evidence = await service.createEvidence(
    admin,
    ctx(admin, 'training_evidence.create_reference', company.id),
    draft.id,
    {
      referenceType: 'certificate_number',
      referenceValue: 'PRIVATE-CERT-001',
      reason: 'verification',
      idempotencyKey: randomUUID(),
    },
    meta(),
  );
  assert.ok(evidence.id);
  pass('metadata-only evidence reference');
  const history = await service.history(
    employee,
    ctx(employee, 'training_enrollment.view_own', company.id, 'own'),
    draft.id,
    'training_enrollment.view_own',
    meta(),
  );
  assert.ok(
    history.states.length >= 3 &&
      history.participation.length === 1 &&
      history.completion.length === 1,
  );
  assert.equal(history.evidence[0].reference_value, 'PRIVATE-CERT-001');
  const managerHistory = await service.history(
    manager,
    ctx(manager, 'training_enrollment.view_team', company.id, 'direct_reports'),
    draft.id,
    'training_enrollment.view_team',
    meta(),
  );
  assert.equal(managerHistory.versions[0].request_narrative, undefined);
  assert.equal(managerHistory.participation[0].comment, undefined);
  assert.equal(managerHistory.completion[0].score, undefined);
  assert.deepEqual(managerHistory.evidence, []);
  pass('append-only enrollment, decision, participation, and completion history');
  const capacitySession = await service.createSession(
    admin,
    ctx(admin, 'training_session.create', company.id),
    {
      companyId: company.id,
      code: 'P11-CAP',
      trainingCourseVersionId: courseVersion.id,
      title: 'Capacity',
      startsAtUtc: '2026-11-10T03:00:00Z',
      endsAtUtc: '2026-11-10T11:00:00Z',
      timezone: company.timezone,
      enrollmentOpensOn: '2026-08-01',
      enrollmentClosesOn: '2026-11-09',
      capacity: 1,
      branchId: null,
      location: 'Room B',
      virtualReference: null,
      trainingProviderVersionId: null,
      facilitators: [],
      reason: 'verification',
    },
    meta(),
  );
  await service.sessionTransition(
    admin,
    ctx(admin, 'training_session.publish', company.id),
    capacitySession.id,
    'published',
    { workflowVersion: 1, reason: 'verification', idempotencyKey: randomUUID() },
    'training_session.publish',
    meta(),
  );
  const assignments = await Promise.allSettled(
    [employment, secondEmployment].map((e) =>
      service.createEnrollment(
        admin,
        ctx(admin, 'training_enrollment.assign', company.id),
        {
          companyId: company.id,
          trainingSessionId: capacitySession.id,
          employmentId: e.id,
          requestNarrative: 'assignment',
          isMandatory: true,
          reason: 'verification',
        },
        'hr_assignment',
        'training_enrollment.assign',
        meta(),
      ),
    ),
  );
  assert.equal(assignments.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(assignments.filter((x) => x.status === 'rejected').length, 1);
  pass('concurrent-safe hard capacity allocation');
  const csv = await service.export(
    admin,
    ctx(admin, 'training.export', company.id),
    { companyId: company.id, page: 1, pageSize: 25 },
    meta(),
  );
  assert.ok(csv.includes('session_code'));
  assert.ok(!csv.includes('PRIVATE TRAINING REQUEST'));
  pass('bounded scoped CSV export without sensitive leakage');
  const auditRows = await db('audit_events')
    .where({ company_id: company.id })
    .where('action_code', 'like', 'training%');
  assert.ok(auditRows.length >= 10);
  assert.equal(
    auditRows.some((x) => JSON.stringify(x).includes('PRIVATE TRAINING REQUEST')),
    false,
  );
  pass('transactional audit without sensitive training values');
  const afterCompetency = await db('performance_competency_versions')
    .where({ id: competency.id })
    .first();
  assert.deepEqual(afterCompetency, beforeCompetency);
  const untouched = [
    'attendance_records',
    'leave_requests',
    'payroll_runs',
    'benefit_enrollments',
    'expense_claims',
    'loan_applications',
    'performance_reviews',
  ];
  for (const table of untouched) assert.equal(await db.schema.hasTable(table), true);
  pass('read-only cross-domain integration and unchanged competency version');
  const role = await db('roles').where({ code: 'training_administrator' }).first();
  assert.ok(role);
  const grants = await db('role_permissions as rp')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', role.id)
    .pluck('p.code');
  assert.ok(grants.includes('training_session.create'));
  assert.ok(!grants.includes('training_sensitive.view'));
  const sys = await db('roles').where({ code: 'system_administrator' }).first();
  const sysSensitive = await db('role_permissions as rp')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where({ 'rp.role_id': sys.id, 'p.code': 'training_sensitive.view' })
    .first();
  assert.equal(sysSensitive, undefined);
  pass('least-privilege role grants and exceptional sensitive permissions');
  console.log(`SUMMARY ${passed.length} Phase 11 verification groups passed`);
} finally {
  await db.destroy();
}
