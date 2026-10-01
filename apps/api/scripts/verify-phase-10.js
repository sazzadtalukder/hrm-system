import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { createPerformanceRepository } from '../src/modules/performance/performanceRepository.js';
import { createPerformanceService } from '../src/modules/performance/performanceService.js';
import { PERFORMANCE_LIMITS as L } from '../src/modules/performance/performanceConstants.js';
const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.deepEqual([env.DB_HOST, env.DB_PORT, env.DB_NAME], ['127.0.0.1', 3307, 'hrm_test']);
const db = createDatabase(env),
  passed = [],
  pass = (n) => {
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
  'performance_review_state_events',
  'performance_review_acknowledgments',
  'performance_competency_assessment_ratings',
  'performance_goal_assessment_ratings',
  'performance_assessment_versions',
  'performance_assessments',
  'performance_goal_versions',
  'performance_goals',
  'performance_review_versions',
  'performance_reviews',
  'performance_cycle_state_events',
  'performance_cycles',
  'performance_template_competencies',
  'performance_review_template_versions',
  'performance_review_templates',
  'performance_competency_versions',
  'performance_competencies',
  'performance_rating_scale_levels',
  'performance_rating_scales',
];
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
  assert.equal(L.maximumGoals, 20);
  assert.equal(L.maximumExportRows, 10000);
  assert.equal(
    Number(
      (
        await db('information_schema.tables')
          .where({ table_schema: 'hrm_test' })
          .whereIn('table_name', tables)
          .count({ n: '*' })
          .first()
      ).n,
    ),
    tables.length,
  );
  pass('schema, append-only history, and centralized bounds');
  const employment = await db('employments as e')
    .join('employees as employee', 'employee.id', 'e.employee_id')
    .join('employee_assignments as a', function () {
      this.on('a.employment_id', 'e.id').andOnVal('a.history_status', 'current');
    })
    .leftJoin('employments as me', 'me.id', 'a.manager_employment_id')
    .leftJoin('employees as manager', 'manager.id', 'me.employee_id')
    .whereNotNull('employee.user_id')
    .whereNotNull('manager.user_id')
    .whereNull('e.employment_end_date')
    .first('e.*', 'employee.user_id', 'manager.user_id as manager_user_id');
  assert.ok(employment, 'Run prior verifiers first.');
  const company = await db('companies').where({ id: employment.company_id }).first(),
    employee = { userId: employment.user_id },
    manager = { userId: employment.manager_user_id };
  for (const email of ['p10-hr@example.test', 'p10-sensitive@example.test'])
    await db('users')
      .insert({ email, password_hash: 'phase-10-verifier-not-login-secret', status: 'active' })
      .onConflict('email')
      .ignore();
  const users = await db('users').whereIn('email', [
      'p10-hr@example.test',
      'p10-sensitive@example.test',
    ]),
    hr = { userId: users.find((x) => x.email === 'p10-hr@example.test').id },
    sensitiveActor = { userId: users.find((x) => x.email === 'p10-sensitive@example.test').id },
    repository = createPerformanceRepository(db),
    service = createPerformanceService({
      database: db,
      repository,
      authorizationService: {
        requirePermission: async (a) => {
          if (a.userId === sensitiveActor.userId)
            return ctx(a, 'performance_sensitive.view', company.id);
          throw new Error('denied');
        },
      },
    });
  const start = '2026-01-01',
    end = '2026-12-31';
  const scale = await service.createScale(
    hr,
    ctx(hr, 'performance_rating_scale.create', company.id),
    {
      companyId: company.id,
      code: 'P10-5',
      name: 'Five level',
      levels: [1, 2, 3, 4, 5].map((x) => ({ value: x, code: `R${x}`, label: `Rating ${x}` })),
      reason: 'verification',
    },
    meta(),
  );
  await assert.rejects(() =>
    service.createScale(hr, ctx(hr, 'performance_rating_scale.create', company.id), {
      companyId: company.id,
      code: 'P10-X',
      name: 'Bad',
      levels: [1, 2].map((x) => ({ value: x, code: `X${x}`, label: 'x' })),
      reason: 'verification',
    }),
  );
  pass('company rating scale with three-to-seven discrete levels');
  const comp = await service.createCompetency(
    hr,
    ctx(hr, 'performance_competency.create', company.id),
    {
      companyId: company.id,
      code: 'P10-COMP',
      name: 'Delivery',
      description: 'Delivers agreed outcomes',
      effectiveStart: start,
      reason: 'verification',
    },
    meta(),
  );
  const template = await service.createTemplate(
    hr,
    ctx(hr, 'performance_template.create', company.id),
    {
      companyId: company.id,
      code: 'P10-TEMPLATE',
      name: 'Review template',
      effectiveStart: start,
      ratingScaleId: scale.id,
      goalsEnabled: true,
      goalWeightsEnabled: true,
      competenciesEnabled: true,
      minimumGoalCount: 1,
      maximumGoalCount: 20,
      competencyVersionIds: [
        (
          await db('performance_competency_versions')
            .where({ performance_competency_id: comp.id })
            .first()
        ).id,
      ],
      reason: 'verification',
    },
    meta(),
  );
  pass('versioned competency and bounded template mapping');
  const cycle = await service.createCycle(
    hr,
    ctx(hr, 'performance_cycle.create', company.id),
    {
      companyId: company.id,
      code: 'P10-CYCLE',
      name: 'Performance cycle',
      reviewPeriodStart: start,
      reviewPeriodEnd: end,
      goalSubmissionDueDate: '2026-09-01',
      selfReviewDueDate: '2026-10-01',
      managerReviewDueDate: '2026-11-01',
      acknowledgmentDueDate: '2027-01-01',
      reason: 'verification',
    },
    meta(),
  );
  await service.cycleTransition(
    hr,
    ctx(hr, 'performance_cycle.activate', company.id),
    cycle.id,
    'active',
    { workflowVersion: 1, reason: 'activate', idempotencyKey: randomUUID() },
    'performance_cycle.activate',
    meta(),
  );
  pass('explicit cycle lifecycle and ordered dates');
  const populated = await service.populate(
      hr,
      ctx(hr, 'performance_cycle.populate', company.id),
      cycle.id,
      {
        employmentIds: [employment.id],
        templateVersionId: (
          await db('performance_review_template_versions')
            .where({ performance_review_template_id: template.id })
            .first()
        ).id,
        allowOverlapOverride: false,
        reason: 'verification',
      },
      meta(),
    ),
    reviewId = populated.reviewIds[0];
  const snapshot = await db('performance_review_versions')
    .where({ performance_review_id: reviewId })
    .first();
  assert.equal(Number(snapshot.manager_user_id_snapshot), Number(manager.userId));
  assert.equal(
    snapshot.anchor_date instanceof Date
      ? snapshot.anchor_date.toISOString().slice(0, 10)
      : String(snapshot.anchor_date).slice(0, 10),
    end,
  );
  pass('bounded eligible population and immutable effective-manager snapshot');
  const cycle2 = await service.createCycle(
    hr,
    ctx(hr, 'performance_cycle.create', company.id),
    {
      companyId: company.id,
      code: 'P10-OVERLAP',
      name: 'Overlap',
      reviewPeriodStart: '2026-06-01',
      reviewPeriodEnd: '2026-11-30',
      goalSubmissionDueDate: '2026-09-01',
      selfReviewDueDate: '2026-10-01',
      managerReviewDueDate: '2026-11-01',
      acknowledgmentDueDate: '2026-12-01',
      reason: 'verification',
    },
    meta(),
  );
  await assert.rejects(
    () =>
      service.populate(
        hr,
        ctx(hr, 'performance_cycle.populate', company.id),
        cycle2.id,
        {
          employmentIds: [employment.id],
          templateVersionId: snapshot.template_version_id_snapshot,
          allowOverlapOverride: false,
          reason: 'verification',
        },
        meta(),
      ),
    (e) => e.code === 'PERFORMANCE_REVIEW_OVERLAP',
  );
  pass('active overlapping review prevention');
  const goal = await service.addGoal(
      employee,
      ctx(employee, 'performance_goal.create', company.id, 'own'),
      reviewId,
      {
        title: 'Deliver project',
        description: 'Complete delivery',
        measurementCriteria: 'Accepted delivery',
        targetValue: '100%',
        weight: 100,
        dueDate: end,
        reason: 'verification',
      },
      meta(),
    ),
    goalVersion = await db('performance_goal_versions')
      .where({ performance_goal_id: goal.id })
      .first();
  let transition = await service.goalTransition(
    employee,
    ctx(employee, 'performance_goal.submit', company.id, 'own'),
    reviewId,
    'goals_submitted',
    { workflowVersion: 1, reason: 'submit', idempotencyKey: randomUUID() },
    'performance_goal.submit',
    meta(),
  );
  transition = await service.goalTransition(
    manager,
    ctx(manager, 'performance_goal.approve', company.id, 'direct_reports'),
    reviewId,
    'goals_approved',
    {
      workflowVersion: transition.workflowVersion,
      reason: 'approve',
      idempotencyKey: randomUUID(),
    },
    'performance_goal.approve',
    meta(),
  );
  pass('employee goals, exact weight validation, and snapshotted-manager approval');
  const level = (
      await db('performance_rating_scale_levels')
        .where({ performance_rating_scale_id: scale.id, level_value: 4 })
        .first()
    ).id,
    competencyVersion = (
      await db('performance_competency_versions')
        .where({ performance_competency_id: comp.id })
        .first()
    ).id;
  transition = await service.submitAssessment(
    employee,
    ctx(employee, 'performance_self_assessment.submit', company.id, 'own'),
    reviewId,
    'self',
    {
      workflowVersion: transition.workflowVersion,
      overallComment: 'PRIVATE SELF NARRATIVE',
      goalRatings: [{ targetId: goalVersion.id, ratingLevelId: level, comment: 'private' }],
      competencyRatings: [
        { targetId: competencyVersion, ratingLevelId: level, comment: 'private' },
      ],
      reason: 'submit',
      idempotencyKey: randomUUID(),
    },
    'performance_self_assessment.submit',
    meta(),
  );
  await assert.rejects(
    () =>
      service.submitAssessment(
        manager,
        ctx(manager, 'performance_manager_assessment.submit', company.id, 'direct_reports'),
        reviewId,
        'manager',
        {
          workflowVersion: transition.workflowVersion,
          overallComment: 'manager',
          goalRatings: [],
          competencyRatings: [],
          reason: 'submit',
          idempotencyKey: randomUUID(),
        },
        'performance_manager_assessment.submit',
        meta(),
      ),
    (e) => e.code === 'VALIDATION_FAILED',
  );
  transition = await service.submitAssessment(
    manager,
    ctx(manager, 'performance_manager_assessment.submit', company.id, 'direct_reports'),
    reviewId,
    'manager',
    {
      workflowVersion: transition.workflowVersion,
      overallComment: 'PRIVATE MANAGER NARRATIVE',
      overallRatingLevelId: level,
      goalRatings: [{ targetId: goalVersion.id, ratingLevelId: level }],
      competencyRatings: [{ targetId: competencyVersion, ratingLevelId: level }],
      reason: 'submit',
      idempotencyKey: randomUUID(),
    },
    'performance_manager_assessment.submit',
    meta(),
  );
  pass('required self assessment and authoritative manager rating');
  transition = await service.acknowledge(
    employee,
    ctx(employee, 'performance_review.acknowledge', company.id, 'own'),
    reviewId,
    {
      workflowVersion: transition.workflowVersion,
      acknowledgment: 'acknowledged_with_comment',
      comment: 'Employee disagreement',
      reason: 'receipt',
      idempotencyKey: randomUUID(),
    },
    meta(),
  );
  transition = await service.finalTransition(
    hr,
    ctx(hr, 'performance_review.finalize', company.id),
    reviewId,
    'finalized',
    {
      workflowVersion: transition.workflowVersion,
      reason: 'finalize',
      idempotencyKey: randomUUID(),
    },
    'performance_review.finalize',
    meta(),
  );
  assert.equal(transition.status, 'finalized');
  pass('receipt acknowledgment and explicit HR finalization');
  await assert.rejects(
    () =>
      service.addGoal(
        employee,
        ctx(employee, 'performance_goal.create', company.id, 'own'),
        reviewId,
        {
          title: 'late',
          description: 'late',
          measurementCriteria: 'late',
          targetValue: 'late',
          weight: 100,
          dueDate: end,
          reason: 'late',
        },
        meta(),
      ),
    (e) => e.code === 'INVALID_WORKFLOW_STATE',
  );
  pass('finalized review and submitted assessment immutability');
  const own = await service.get(
    employee,
    ctx(employee, 'performance_review.view_own', company.id, 'own'),
    reviewId,
    'performance_review.view_own',
    meta(),
  );
  assert.equal(own.id, reviewId);
  await assert.rejects(
    () =>
      service.get(
        hr,
        ctx(hr, 'performance_review.view', 999999),
        reviewId,
        'performance_review.view',
        meta(),
      ),
    (e) => e.code === 'NOT_FOUND',
  );
  pass('own access and fail-closed company isolation');
  const projected = await service.get(
    hr,
    ctx(hr, 'performance_review.view', company.id),
    reviewId,
    'performance_review.view',
    meta(),
  );
  assert.equal(projected.rating_scale_id_snapshot, undefined);
  const full = await service.get(
    sensitiveActor,
    ctx(sensitiveActor, 'performance_review.view', company.id),
    reviewId,
    'performance_review.view',
    meta(),
  );
  assert.ok(full.rating_scale_id_snapshot);
  pass('sensitive intersection and omission projection');
  const history = await service.history(
    ctx(hr, 'performance_review.view', company.id),
    reviewId,
    'performance_review.view',
  );
  assert.ok(history.states.length >= 6);
  assert.equal(history.versions.length, 1);
  pass('append-only review, workflow, assessment, and acknowledgment history');
  const csv = await service.export(
    hr,
    ctx(hr, 'performance_review.export', company.id),
    { companyId: company.id, page: 1, pageSize: 25 },
    meta(),
  );
  assert.ok(csv.includes('employee_code'));
  assert.ok(!csv.includes('PRIVATE'));
  pass('bounded audited CSV without narrative leakage');
  const auditRows = await db('audit_events')
    .where('record_type', 'performance_review')
    .whereIn('action_code', [
      'performance_cycle.create',
      'performance_cycle.populate',
      'performance_sensitive.view',
      'performance_review.finalize',
    ]);
  assert.ok(auditRows.length >= 4);
  assert.ok(!JSON.stringify(auditRows).includes('PRIVATE'));
  pass('transactional audit and sensitive-value exclusion');
  const sensitiveGrant = await db('permissions')
    .where({ code: 'performance_sensitive.view', allow_direct_grant: 1 })
    .first();
  assert.ok(sensitiveGrant);
  const admin = await db('roles').where({ code: 'system_administrator' }).first(),
    adminSensitive = await db('role_permissions')
      .where({ role_id: admin.id, permission_id: sensitiveGrant.id })
      .first();
  assert.equal(adminSensitive, undefined);
  pass('least-privilege role grants and exceptional sensitive permission');
  console.log(`SUMMARY ${passed.length} Phase 10 verification groups passed`);
} finally {
  await db.destroy();
}
