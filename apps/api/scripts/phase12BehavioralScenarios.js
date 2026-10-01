import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { ApplicationError } from '../src/common/errors/ApplicationError.js';
import { errorHandler } from '../src/common/middleware/errorHandler.js';
import { requestContext } from '../src/common/middleware/requestContext.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { createCareerController } from '../src/modules/career/careerController.js';
import { createCareerRepository } from '../src/modules/career/careerRepository.js';
import { createCareerRouter } from '../src/modules/career/careerRoutes.js';
import { createCareerService } from '../src/modules/career/careerService.js';
import { createCareerSnapshotReader } from '../src/modules/career/careerSnapshotReader.js';
import { createSuccessionController } from '../src/modules/succession/successionController.js';
import { createSuccessionRepository } from '../src/modules/succession/successionRepository.js';
import { createSuccessionRouter } from '../src/modules/succession/successionRoutes.js';
import { createSuccessionService } from '../src/modules/succession/successionService.js';

const phase12Tables = [
  'career_development_action_evidence_references',
  'career_plan_manager_reassignments',
  'career_plan_decisions',
  'career_plan_state_events',
  'career_plan_goal_competencies',
  'career_plan_goal_versions',
  'career_plan_goals',
  'career_development_action_versions',
  'career_development_actions',
  'career_plan_versions',
  'career_plans',
  'career_path_step_competencies',
  'career_path_steps',
  'career_path_versions',
  'career_paths',
  'successor_nomination_manager_reassignments',
  'successor_nomination_readiness_events',
  'successor_nomination_decisions',
  'successor_nomination_state_events',
  'successor_nomination_versions',
  'successor_nominations',
  'succession_plan_state_events',
  'succession_plan_versions',
  'succession_plans',
  'critical_position_competencies',
  'critical_position_versions',
  'critical_positions',
];

const metadata = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const key = (label) => `${label}:${randomUUID()}`;
const context = (actor, permission, companyId, scope = 'company', extra = {}) =>
  createAccessContext({
    actor,
    permission,
    grants: [{ scope_type: scope, company_id: companyId, ...extra }],
  });
const expectCode = async (work, code) => {
  await assert.rejects(work, (error) => error?.code === code || error?.statusCode === code);
};
const count = async (db, table, where) =>
  Number((await db(table).where(where).count({ total: '*' }).first()).total);

async function resetPhase12(db) {
  await db.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const table of phase12Tables) await trx(table).del();
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS=1');
    }
  });
}

async function ensureManagerFixture(db, subject, label, existingEmploymentId = null) {
  let employment = existingEmploymentId
    ? await db('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .join('employment_status_history as status', function () {
          this.on('status.employment_id', 'employment.id').andOnVal(
            'status.history_status',
            'current',
          );
        })
        .where({
          'employment.id': existingEmploymentId,
          'employment.company_id': subject.company_id,
          'employment.record_status': 'active',
          'employee.record_status': 'active',
        })
        .whereNull('employment.employment_end_date')
        .whereNotNull('employee.user_id')
        .whereIn('status.status', ['probation', 'confirmed'])
        .first('employment.*', 'employee.user_id')
    : null;
  const email = `p12-manager-${label}-${subject.company_id}@example.test`;
  let user;
  let employee;
  if (employment) {
    user = await db('users').where({ id: employment.user_id, status: 'active' }).first();
    employee = await db('employees').where({ id: employment.employee_id }).first();
    if (!user) {
      employment = null;
      employee = null;
    }
  }
  if (!employment) {
    await db('users')
      .insert({ email, password_hash: 'phase-12-verifier-non-login-value', status: 'active' })
      .onConflict('email')
      .ignore();
    user = await db('users').where({ email }).first();
    employee = await db('employees')
      .where({ company_id: subject.company_id, user_id: user.id })
      .first();
  }
  if (!employee) {
    const [id] = await db('employees').insert({
      company_id: subject.company_id,
      user_id: user.id,
      first_name: 'Phase 12',
      last_name: `Manager ${label.toUpperCase()}`,
      display_name: `Phase 12 Manager ${label.toUpperCase()}`,
      record_status: 'active',
      created_by: subject.user_id,
      updated_by: subject.user_id,
    });
    employee = await db('employees').where({ id }).first();
  }
  employment ??= await db('employments')
    .where({
      company_id: subject.company_id,
      employee_code: `P12-MGR-${label.toUpperCase()}-${subject.company_id}`,
    })
    .first();
  if (!employment) {
    const [id] = await db('employments').insert({
      company_id: subject.company_id,
      employee_id: employee.id,
      employee_code: `P12-MGR-${label.toUpperCase()}-${subject.company_id}`,
      employment_type: 'permanent',
      joining_date: '2026-01-01',
      record_status: 'active',
      created_by: subject.user_id,
      updated_by: subject.user_id,
    });
    employment = await db('employments').where({ id }).first();
  }
  if (
    !(await db('employment_status_history')
      .where({ employment_id: employment.id, history_status: 'current' })
      .first())
  )
    await db('employment_status_history').insert({
      company_id: subject.company_id,
      employment_id: employment.id,
      status: 'confirmed',
      effective_start: '2026-01-01',
      reason: 'Phase 12 verifier fixture',
      created_by: subject.user_id,
    });
  if (
    !(await db('employee_assignments')
      .where({ employment_id: employment.id, history_status: 'current' })
      .first())
  )
    await db('employee_assignments').insert({
      company_id: subject.company_id,
      employment_id: employment.id,
      branch_id: subject.branch_id,
      department_id: subject.department_id,
      designation_id: subject.designation_id,
      effective_start: '2026-01-01',
      reason: 'Phase 12 verifier fixture',
      created_by: subject.user_id,
    });
  return {
    employment_id: employment.id,
    company_id: subject.company_id,
    user_id: user.id,
    branch_id: subject.branch_id,
    department_id: subject.department_id,
    designation_id: subject.designation_id,
  };
}

async function ensureCompanyBEmploymentFixture(db, company, createdBy) {
  const code = `P12-FOREIGN-${company.id}`;
  const ensureReference = async (table, suffix) => {
    let row = await db(table).where({ company_id: company.id, code }).first();
    if (!row) {
      const [id] = await db(table).insert({
        company_id: company.id,
        code,
        name: `Phase 12 ${suffix}`,
        created_by: createdBy,
        updated_by: createdBy,
      });
      row = await db(table).where({ id }).first();
    }
    return row;
  };
  const branch = await ensureReference('branches', 'Foreign Branch');
  const department = await ensureReference('departments', 'Foreign Department');
  const designation = await ensureReference('designations', 'Foreign Designation');
  const email = `p12-foreign-employee-${company.id}@example.test`;
  await db('users')
    .insert({ email, password_hash: 'phase-12-verifier-non-login-value', status: 'active' })
    .onConflict('email')
    .ignore();
  const user = await db('users').where({ email }).first();
  let employee = await db('employees').where({ company_id: company.id, user_id: user.id }).first();
  if (!employee) {
    const [id] = await db('employees').insert({
      company_id: company.id,
      user_id: user.id,
      first_name: 'Phase 12',
      last_name: 'Foreign Employee',
      display_name: 'Phase 12 Foreign Employee',
      record_status: 'active',
      created_by: createdBy,
      updated_by: createdBy,
    });
    employee = await db('employees').where({ id }).first();
  }
  let employment = await db('employments')
    .where({ company_id: company.id, employee_code: code })
    .first();
  if (!employment) {
    const [id] = await db('employments').insert({
      company_id: company.id,
      employee_id: employee.id,
      employee_code: code,
      employment_type: 'permanent',
      joining_date: '2026-01-01',
      record_status: 'active',
      created_by: createdBy,
      updated_by: createdBy,
    });
    employment = await db('employments').where({ id }).first();
  }
  if (
    !(await db('employment_status_history')
      .where({ employment_id: employment.id, history_status: 'current' })
      .first())
  )
    await db('employment_status_history').insert({
      company_id: company.id,
      employment_id: employment.id,
      status: 'confirmed',
      effective_start: '2026-01-01',
      reason: 'Phase 12 verifier fixture',
      created_by: createdBy,
    });
  if (
    !(await db('employee_assignments')
      .where({ employment_id: employment.id, history_status: 'current' })
      .first())
  )
    await db('employee_assignments').insert({
      company_id: company.id,
      employment_id: employment.id,
      branch_id: branch.id,
      department_id: department.id,
      designation_id: designation.id,
      effective_start: '2026-01-01',
      reason: 'Phase 12 verifier fixture',
      created_by: createdBy,
    });
  return {
    ...employment,
    employment_id: employment.id,
    user_id: user.id,
    branch_id: branch.id,
    department_id: department.id,
    designation_id: designation.id,
  };
}

async function ensureCompanyBReferenceFixtures(db, company, employment, createdBy) {
  let competency = await db('performance_competency_versions')
    .where({ company_id: company.id })
    .first();
  if (!competency) {
    let parent = await db('performance_competencies')
      .where({ company_id: company.id, code: `P12-COMP-${company.id}` })
      .first();
    if (!parent) {
      const [id] = await db('performance_competencies').insert({
        company_id: company.id,
        code: `P12-COMP-${company.id}`,
        name: 'Phase 12 Foreign Competency',
        created_by: createdBy,
        updated_by: createdBy,
      });
      parent = await db('performance_competencies').where({ id }).first();
    }
    const [id] = await db('performance_competency_versions').insert({
      company_id: company.id,
      performance_competency_id: parent.id,
      version_number: 1,
      effective_start: '2026-01-01',
      description: 'Phase 12 foreign-company isolation fixture',
      reason: 'Phase 12 verifier fixture',
      created_by: createdBy,
      updated_by: createdBy,
    });
    competency = await db('performance_competency_versions').where({ id }).first();
  }
  let courseVersion = await db('training_course_versions')
    .where({ company_id: company.id })
    .first();
  if (!courseVersion) {
    let course = await db('training_courses')
      .where({ company_id: company.id, code: `P12-COURSE-${company.id}` })
      .first();
    if (!course) {
      const [id] = await db('training_courses').insert({
        company_id: company.id,
        code: `P12-COURSE-${company.id}`,
        name: 'Phase 12 Foreign Course',
        created_by: createdBy,
        updated_by: createdBy,
      });
      course = await db('training_courses').where({ id }).first();
    }
    const [id] = await db('training_course_versions').insert({
      company_id: company.id,
      training_course_id: course.id,
      version_number: 1,
      effective_start: '2026-01-01',
      description: 'Phase 12 foreign-company isolation fixture',
      delivery_mode: 'virtual',
      scoring_enabled: false,
      reason: 'Phase 12 verifier fixture',
      created_by: createdBy,
      updated_by: createdBy,
    });
    courseVersion = await db('training_course_versions').where({ id }).first();
  }
  let completionVersion = await db('training_completion_versions')
    .where({ company_id: company.id })
    .first();
  if (!completionVersion) {
    const [sessionId] = await db('training_sessions').insert({
      company_id: company.id,
      code: `P12-SESSION-${company.id}`,
      training_course_version_id: courseVersion.id,
      status: 'completed',
      created_by: createdBy,
      updated_by: createdBy,
    });
    const [sessionVersionId] = await db('training_session_versions').insert({
      company_id: company.id,
      training_session_id: sessionId,
      version_number: 1,
      title_snapshot: 'Phase 12 Foreign Session',
      course_code_snapshot: `P12-COURSE-${company.id}`,
      delivery_mode_snapshot: 'virtual',
      starts_at_utc: '2026-07-01 03:00:00',
      ends_at_utc: '2026-07-01 04:00:00',
      timezone_snapshot: company.timezone,
      enrollment_opens_on: '2026-06-01',
      enrollment_closes_on: '2026-06-30',
      capacity: 1,
      virtual_reference: 'phase-12-verifier',
      scoring_enabled_snapshot: false,
      reason: 'Phase 12 verifier fixture',
      created_by: createdBy,
      updated_by: createdBy,
    });
    const [enrollmentId] = await db('training_enrollments').insert({
      company_id: company.id,
      training_session_id: sessionId,
      employment_id: employment.id,
      source: 'hr_assignment',
      status: 'enrolled',
      created_by: createdBy,
      updated_by: createdBy,
    });
    await db('training_enrollment_versions').insert({
      company_id: company.id,
      training_enrollment_id: enrollmentId,
      version_number: 1,
      training_session_version_id_snapshot: sessionVersionId,
      employee_id_snapshot: employment.employee_id,
      employee_code_snapshot: employment.employee_code,
      employee_name_snapshot: 'Phase 12 Foreign Employee',
      employment_status_snapshot: 'confirmed',
      branch_id_snapshot: employment.branch_id,
      department_id_snapshot: employment.department_id,
      reason: 'Phase 12 verifier fixture',
      created_by: createdBy,
      updated_by: createdBy,
    });
    const [recordId] = await db('training_completion_records').insert({
      company_id: company.id,
      training_enrollment_id: enrollmentId,
      created_by: createdBy,
      updated_by: createdBy,
    });
    const [id] = await db('training_completion_versions').insert({
      company_id: company.id,
      training_completion_record_id: recordId,
      version_number: 1,
      outcome: 'completed',
      completion_date: '2026-07-01',
      reason: 'Phase 12 verifier fixture',
      idempotency_key: `p12-foreign-completion-${company.id}`,
      created_by: createdBy,
      updated_by: createdBy,
    });
    completionVersion = await db('training_completion_versions').where({ id }).first();
  }
  return { competency, courseVersion, completionVersion };
}

async function fixtures(db) {
  const employments = await db('employments as employment')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .join('employee_assignments as assignment', function () {
      this.on('assignment.employment_id', 'employment.id').andOnVal(
        'assignment.history_status',
        'current',
      );
    })
    .leftJoin(
      'employments as manager_employment',
      'manager_employment.id',
      'assignment.manager_employment_id',
    )
    .leftJoin('employees as manager', 'manager.id', 'manager_employment.employee_id')
    .where({ 'employment.record_status': 'active', 'employee.record_status': 'active' })
    .whereNull('employment.employment_end_date')
    .select(
      'employment.id as employment_id',
      'employment.company_id',
      'employee.user_id',
      'assignment.id as assignment_id',
      'assignment.branch_id',
      'assignment.department_id',
      'assignment.designation_id',
      'assignment.manager_employment_id',
      'manager.user_id as manager_user_id',
    );
  const subject = employments.find((row) => row.user_id && row.manager_user_id);
  assert.ok(subject, 'Phase 12 behavioral verification requires a linked employee and manager.');
  const managers = employments.filter(
    (row) =>
      Number(row.company_id) === Number(subject.company_id) &&
      row.user_id &&
      Number(row.employment_id) !== Number(subject.employment_id),
  );
  const managerA = await ensureManagerFixture(db, subject, 'a', subject.manager_employment_id);
  if (Number(subject.manager_employment_id) !== Number(managerA.employment_id)) {
    await db('employee_assignments')
      .where({ id: subject.assignment_id })
      .update({ manager_employment_id: managerA.employment_id });
    subject.manager_employment_id = managerA.employment_id;
    subject.manager_user_id = managerA.user_id;
  }
  const managerBCandidate = managers.find(
    (row) => Number(row.employment_id) !== Number(managerA.employment_id),
  );
  const managerB = await ensureManagerFixture(db, subject, 'b', managerBCandidate?.employment_id);
  const companies = await db('companies').where({ status: 'active' }).orderBy('id');
  assert.ok(companies.length >= 2, 'Run the guarded multi-company fixtures before Phase 12.');
  const secondCompany = companies.find((row) => Number(row.id) !== Number(subject.company_id));
  const foreignEmployment = await ensureCompanyBEmploymentFixture(
    db,
    secondCompany,
    subject.user_id,
  );
  const competency = await db('performance_competency_versions')
    .where({ company_id: subject.company_id })
    .first();
  const trainingVersion = await db('training_course_versions')
    .where({ company_id: subject.company_id })
    .first();
  const foreignReferences = await ensureCompanyBReferenceFixtures(
    db,
    secondCompany,
    foreignEmployment,
    subject.user_id,
  );
  const foreignCompetency = foreignReferences.competency;
  const foreignTrainingVersion = foreignReferences.courseVersion;
  const foreignCompletionVersion = foreignReferences.completionVersion;
  assert.ok(
    competency &&
      foreignCompetency &&
      trainingVersion &&
      foreignTrainingVersion &&
      foreignCompletionVersion,
  );
  for (const email of [
    'p12-hr@example.test',
    'p12-sensitive@example.test',
    'p12-unauthorized@example.test',
  ])
    await db('users')
      .insert({ email, password_hash: 'phase-12-verifier-non-login-value', status: 'active' })
      .onConflict('email')
      .ignore();
  const users = await db('users').whereIn('email', [
    'p12-hr@example.test',
    'p12-sensitive@example.test',
    'p12-unauthorized@example.test',
  ]);
  return {
    company: companies.find((row) => Number(row.id) === Number(subject.company_id)),
    secondCompany,
    foreignEmployment,
    subject,
    managerA,
    managerB,
    competency,
    foreignCompetency,
    trainingVersion,
    foreignTrainingVersion,
    foreignCompletionVersion,
    employee: { userId: subject.user_id },
    managerActorA: { userId: managerA.user_id },
    managerActorB: { userId: managerB.user_id },
    hr: { userId: users.find((row) => row.email === 'p12-hr@example.test').id },
    sensitive: { userId: users.find((row) => row.email === 'p12-sensitive@example.test').id },
    unauthorized: { userId: users.find((row) => row.email === 'p12-unauthorized@example.test').id },
  };
}

function services(db, fixture, auditWriter) {
  const snapshotReader = createCareerSnapshotReader(db);
  const authorizationService = {
    requirePermission: async (actor, permission) => {
      if (
        actor.userId === fixture.sensitive.userId &&
        ['career_sensitive.view', 'succession_sensitive.view'].includes(permission)
      )
        return context(actor, permission, fixture.company.id);
      throw Object.assign(new Error('denied'), { statusCode: 403 });
    },
  };
  const careerRepository = createCareerRepository(db);
  const successionRepository = createSuccessionRepository(db);
  return {
    careerRepository,
    successionRepository,
    career: createCareerService({
      database: db,
      repository: careerRepository,
      snapshotReader,
      authorizationService,
      ...(auditWriter ? { auditWriter } : {}),
    }),
    succession: createSuccessionService({
      database: db,
      repository: successionRepository,
      snapshotReader,
      authorizationService,
      ...(auditWriter ? { auditWriter } : {}),
    }),
  };
}

const planInput = (fixture, suffix, overrides = {}) => ({
  companyId: fixture.company.id,
  employmentId: fixture.subject.employment_id,
  careerPathVersionId: null,
  targetDesignationId: fixture.subject.designation_id,
  careerDirection: `sensitive-direction-${suffix}`,
  employeeNarrative: `sensitive-narrative-${suffix}`,
  planStart: '2026-08-01',
  planEnd: '2027-07-31',
  goals: [
    {
      title: `Goal ${suffix}`,
      description: `Sensitive goal ${suffix}`,
      targetDate: '2027-06-30',
      competencyVersionIds: [fixture.competency.id],
    },
  ],
  actions: [
    {
      actionType: 'training',
      description: `Development ${suffix}`,
      targetDate: '2027-05-31',
      responsibleParty: 'employee',
      trainingCourseVersionId: fixture.trainingVersion.id,
    },
  ],
  reason: `verification-${suffix}`,
  idempotencyKey: key(`career-create-${suffix}`),
  ...overrides,
});

async function createCareerPlan(service, fixture, suffix, overrides) {
  return service.createPlan(
    fixture.employee,
    context(fixture.employee, 'career_plan.create', fixture.company.id, 'own'),
    planInput(fixture, suffix, overrides),
    metadata(),
  );
}

async function careerAuthorityLifecycle(db, fixture, career, pass) {
  const first = await createCareerPlan(career, fixture, 'manager-a');
  const submitKey = key('career-submit');
  const submitted = await career.act(
    fixture.employee,
    context(fixture.employee, 'career_plan.submit', fixture.company.id, 'own'),
    first.id,
    'submit',
    { workflowVersion: 1, reason: 'submit', idempotencyKey: submitKey },
    'career_plan.submit',
    metadata(),
  );
  const replay = await career.act(
    fixture.employee,
    context(fixture.employee, 'career_plan.submit', fixture.company.id, 'own'),
    first.id,
    'submit',
    { workflowVersion: 1, reason: 'submit', idempotencyKey: submitKey },
    'career_plan.submit',
    metadata(),
  );
  assert.equal(replay.replayed, true);
  assert.equal(await count(db, 'career_plan_state_events', { career_plan_id: first.id }), 1);
  const decisionsBeforeDenials = await count(db, 'career_plan_decisions', {
    career_plan_id: first.id,
  });
  await expectCode(
    () =>
      career.act(
        fixture.employee,
        context(fixture.employee, 'career_plan.approve', fixture.company.id, 'own'),
        first.id,
        'approve',
        {
          workflowVersion: submitted.workflow_version,
          reason: 'self',
          idempotencyKey: key('self'),
        },
        'career_plan.approve',
        metadata(),
      ),
    403,
  );
  const before = await db('career_plans').where({ id: first.id }).first();
  await expectCode(
    () =>
      career.act(
        fixture.managerActorB,
        context(fixture.managerActorB, 'career_plan.approve', fixture.company.id, 'direct_reports'),
        first.id,
        'approve',
        {
          workflowVersion: submitted.workflow_version,
          reason: 'wrong manager',
          idempotencyKey: key('wrong-manager'),
        },
        'career_plan.approve',
        metadata(),
      ),
    404,
  );
  assert.deepEqual(await db('career_plans').where({ id: first.id }).first(), before);
  await expectCode(
    () =>
      career.act(
        fixture.hr,
        context(fixture.hr, 'career_plan.approve', fixture.company.id),
        first.id,
        'approve',
        {
          workflowVersion: submitted.workflow_version,
          reason: 'fallback must not override an available manager',
          idempotencyKey: key('improper-fallback'),
        },
        'career_plan.approve',
        metadata(),
      ),
    404,
  );
  assert.equal(
    await count(db, 'career_plan_decisions', { career_plan_id: first.id }),
    decisionsBeforeDenials,
  );
  assert.equal(
    await count(db, 'audit_events', {
      record_type: 'career',
      record_id: first.id,
      actor_user_id: fixture.employee.userId,
      action_code: 'career_plan.active',
      outcome: 'success',
    }),
    0,
  );
  const approved = await career.act(
    fixture.managerActorA,
    context(fixture.managerActorA, 'career_plan.approve', fixture.company.id, 'direct_reports'),
    first.id,
    'approve',
    {
      workflowVersion: submitted.workflow_version,
      reason: 'approved',
      idempotencyKey: key('approve-a'),
    },
    'career_plan.approve',
    metadata(),
  );
  assert.equal(approved.status, 'active');
  const originalSnapshot = await db('career_plan_versions')
    .where({ career_plan_id: first.id, version_number: 1 })
    .first();
  assert.equal(
    Number(originalSnapshot.manager_user_id_snapshot),
    Number(fixture.managerActorA.userId),
  );
  pass('manager authority snapshot and self-decision fail closed');

  const assignmentBefore = await db('employee_assignments')
    .where({ id: fixture.subject.assignment_id })
    .first();
  await db('employee_assignments')
    .where({ id: fixture.subject.assignment_id })
    .update({ manager_employment_id: fixture.managerB.employment_id });
  try {
    assert.equal(
      Number(
        (
          await db('career_plan_versions')
            .where({ career_plan_id: first.id, version_number: 1 })
            .first()
        ).manager_user_id_snapshot,
      ),
      Number(fixture.managerActorA.userId),
    );
    const reassignmentKey = key('career-reassign');
    const reassigned = await career.reassign(
      fixture.hr,
      context(fixture.hr, 'career_plan.reassign_manager', fixture.company.id),
      first.id,
      {
        managerEmploymentId: fixture.managerB.employment_id,
        workflowVersion: approved.workflow_version,
        reason: 'authorized historical authority reassignment',
        idempotencyKey: reassignmentKey,
      },
      metadata(),
    );
    assert.equal(reassigned.replayed, false);
    assert.equal(
      (
        await career.reassign(
          fixture.hr,
          context(fixture.hr, 'career_plan.reassign_manager', fixture.company.id),
          first.id,
          {
            managerEmploymentId: fixture.managerB.employment_id,
            workflowVersion: approved.workflow_version,
            reason: 'authorized historical authority reassignment',
            idempotencyKey: reassignmentKey,
          },
          metadata(),
        )
      ).replayed,
      true,
    );
    await expectCode(
      () =>
        career.reassign(
          fixture.hr,
          context(fixture.hr, 'career_plan.reassign_manager', fixture.company.id),
          first.id,
          {
            managerEmploymentId: fixture.managerA.employment_id,
            workflowVersion: approved.workflow_version,
            reason: 'different meaning',
            idempotencyKey: reassignmentKey,
          },
          metadata(),
        ),
      'IDEMPOTENCY_CONFLICT',
    );
    const versions = await db('career_plan_versions')
      .where({ career_plan_id: first.id })
      .orderBy('version_number');
    assert.equal(
      Number(versions[0].manager_user_id_snapshot),
      Number(fixture.managerActorA.userId),
    );
    assert.equal(
      Number(versions.at(-1).manager_user_id_snapshot),
      Number(fixture.managerActorB.userId),
    );
    const latestPlan = await db('career_plans').where({ id: first.id }).first();
    await career.act(
      fixture.hr,
      context(fixture.hr, 'career_plan.cancel', fixture.company.id),
      first.id,
      'cancel',
      {
        workflowVersion: latestPlan.workflow_version,
        reason: 'finish authority scenario',
        idempotencyKey: key('authority-cancel'),
      },
      'career_plan.cancel',
      metadata(),
    );
  } finally {
    await db('employee_assignments')
      .where({ id: fixture.subject.assignment_id })
      .update({ manager_employment_id: assignmentBefore.manager_employment_id });
  }
  pass('manager reassignment is explicit, versioned, reasoned, and idempotent');
}

async function auditRollback(db, fixture, pass) {
  const failing = services(db, fixture, async () => {
    throw new Error('P12_CONTROLLED_AUDIT_FAILURE');
  }).career;
  const beforePaths = await count(db, 'career_paths', { company_id: fixture.company.id });
  await assert.rejects(
    () =>
      failing.createPath(
        fixture.hr,
        context(fixture.hr, 'career_path.create', fixture.company.id),
        {
          companyId: fixture.company.id,
          code: `ROLLBACK-${randomUUID().slice(0, 8)}`,
          name: 'Rollback path',
          effectiveStart: '2026-08-01',
          description: 'rollback verification',
          steps: [{ designationId: fixture.subject.designation_id, competencies: [] }],
          reason: 'controlled audit rollback',
          idempotencyKey: key('audit-failure'),
        },
        metadata(),
      ),
    /P12_CONTROLLED_AUDIT_FAILURE/,
  );
  assert.equal(await count(db, 'career_paths', { company_id: fixture.company.id }), beforePaths);
  pass('transaction rolls back business and history state on audit failure');
}

async function hrFallback(db, fixture, career, pass) {
  const assignment = await db('employee_assignments')
    .where({ id: fixture.subject.assignment_id })
    .first();
  await db('employee_assignments')
    .where({ id: fixture.subject.assignment_id })
    .update({ manager_employment_id: null });
  try {
    const created = await createCareerPlan(career, fixture, 'hr-fallback');
    const submitted = await career.act(
      fixture.employee,
      context(fixture.employee, 'career_plan.submit', fixture.company.id, 'own'),
      created.id,
      'submit',
      { workflowVersion: 1, reason: 'fallback submit', idempotencyKey: key('fallback-submit') },
      'career_plan.submit',
      metadata(),
    );
    await expectCode(
      () =>
        career.act(
          fixture.managerActorA,
          context(
            fixture.managerActorA,
            'career_plan.approve',
            fixture.company.id,
            'direct_reports',
          ),
          created.id,
          'approve',
          {
            workflowVersion: submitted.workflow_version,
            reason: 'not fallback actor',
            idempotencyKey: key('fallback-manager'),
          },
          'career_plan.approve',
          metadata(),
        ),
      404,
    );
    await expectCode(
      () =>
        career.act(
          fixture.unauthorized,
          context(fixture.unauthorized, 'career_plan.view', fixture.company.id),
          created.id,
          'approve',
          {
            workflowVersion: submitted.workflow_version,
            reason: 'wrong permission',
            idempotencyKey: key('fallback-unauthorized'),
          },
          'career_plan.approve',
          metadata(),
        ),
      403,
    );
    const approved = await career.act(
      fixture.hr,
      context(fixture.hr, 'career_plan.approve', fixture.company.id),
      created.id,
      'approve',
      {
        workflowVersion: submitted.workflow_version,
        reason: 'explicit HR fallback',
        idempotencyKey: key('fallback-hr'),
      },
      'career_plan.approve',
      metadata(),
    );
    assert.equal(approved.status, 'active');
    assert.equal(
      await count(db, 'career_plan_decisions', {
        career_plan_id: created.id,
        actor_user_id: fixture.hr.userId,
      }),
      1,
    );
    const audit = await db('audit_events')
      .where({ action_code: 'career_plan.active', record_id: created.id })
      .first();
    assert.ok(audit);
    await career.act(
      fixture.hr,
      context(fixture.hr, 'career_plan.cancel', fixture.company.id),
      created.id,
      'cancel',
      {
        workflowVersion: approved.workflow_version,
        reason: 'finish fallback scenario',
        idempotencyKey: key('fallback-cancel'),
      },
      'career_plan.cancel',
      metadata(),
    );
  } finally {
    await db('employee_assignments')
      .where({ id: fixture.subject.assignment_id })
      .update({ manager_employment_id: assignment.manager_employment_id });
  }
  pass('HR fallback requires missing manager, exact permission, scope, history, and audit');
}

async function sensitiveAndScopes(db, fixture, career, succession, pass) {
  const plan = await db('career_plans').where({ company_id: fixture.company.id }).first();
  const own = await career.get(
    fixture.employee,
    context(fixture.employee, 'career_plan.view_own', fixture.company.id, 'own'),
    plan.id,
    'career_plan.view_own',
    metadata(),
  );
  assert.ok(Object.hasOwn(own, 'employee_narrative'));
  const manager = await career.get(
    fixture.managerActorB,
    context(fixture.managerActorB, 'career_plan.view_team', fixture.company.id, 'direct_reports'),
    plan.id,
    'career_plan.view_team',
    metadata(),
  );
  assert.equal(Object.hasOwn(manager, 'employee_narrative'), false);
  const sensitive = await career.get(
    fixture.sensitive,
    context(fixture.sensitive, 'career_plan.view', fixture.company.id),
    plan.id,
    'career_plan.view',
    metadata(),
  );
  assert.ok(Object.hasOwn(sensitive, 'employee_narrative'));
  const history = await career.history(
    fixture.unauthorized,
    context(fixture.unauthorized, 'career_plan.view', fixture.company.id),
    plan.id,
    'career_plan.view',
    metadata(),
  );
  assert.equal(Object.hasOwn(history.versions[0], 'employee_narrative'), false);
  const auditText = JSON.stringify(
    await db('audit_events').where({ record_type: 'career', record_id: plan.id }),
  );
  assert.equal(auditText.includes('sensitive-narrative'), false);
  await expectCode(
    () =>
      succession.list(
        fixture.employee,
        context(fixture.employee, 'career_plan.view_own', fixture.company.id, 'own'),
        { companyId: fixture.company.id, page: 1, pageSize: 25 },
        'succession_nomination.view',
        metadata(),
      ),
    403,
  );
  await expectCode(
    () =>
      succession.export(
        fixture.employee,
        context(fixture.employee, 'career_plan.view_own', fixture.company.id, 'own'),
        { companyId: fixture.company.id, page: 1, pageSize: 25 },
        metadata(),
      ),
    403,
  );
  pass('sensitive fields are omitted and employee succession access fails closed');
}

async function crossCompanyReferences(db, fixture, career, succession, pass) {
  const foreignPath = planInput(fixture, 'foreign-reference', {
    goals: [
      {
        title: 'Foreign competency',
        description: 'must fail',
        targetDate: '2027-01-01',
        competencyVersionIds: [fixture.foreignCompetency.id],
      },
    ],
  });
  await assert.rejects(() =>
    career.createPlan(
      fixture.employee,
      context(fixture.employee, 'career_plan.create', fixture.company.id, 'own'),
      foreignPath,
      metadata(),
    ),
  );
  const evidencePlan = await createCareerPlan(career, fixture, 'foreign-completion');
  const actionVersion = await db('career_development_action_versions as version')
    .join(
      'career_development_actions as action',
      'action.id',
      'version.career_development_action_id',
    )
    .where({ 'action.career_plan_id': evidencePlan.id, 'version.history_status': 'current' })
    .first('version.id');
  await assert.rejects(() =>
    career.addEvidence(
      fixture.employee,
      context(fixture.employee, 'career_plan.update_progress', fixture.company.id, 'own'),
      evidencePlan.id,
      {
        actionVersionId: actionVersion.id,
        referenceType: 'training_completion_version',
        trainingCompletionVersionId: fixture.foreignCompletionVersion.id,
        externalReference: null,
        reason: 'foreign completion must fail',
        idempotencyKey: key('foreign-completion'),
      },
      metadata(),
    ),
  );
  await career.act(
    fixture.employee,
    context(fixture.employee, 'career_plan.withdraw', fixture.company.id, 'own'),
    evidencePlan.id,
    'withdraw',
    {
      workflowVersion: 1,
      reason: 'finish foreign completion scenario',
      idempotencyKey: key('foreign-completion-withdraw'),
    },
    'career_plan.withdraw',
    metadata(),
  );

  const foreignPosition = await succession.createPosition(
    fixture.hr,
    context(fixture.hr, 'critical_position.create', fixture.secondCompany.id),
    {
      companyId: fixture.secondCompany.id,
      code: `FOREIGN-${randomUUID().slice(0, 8)}`,
      name: 'Company B critical position',
      designationId: fixture.foreignEmployment.designation_id,
      branchId: fixture.foreignEmployment.branch_id,
      departmentId: fixture.foreignEmployment.department_id,
      criticality: 'high',
      description: 'Company B sensitive description',
      effectiveStart: '2026-01-01',
      competencies: [
        {
          performanceCompetencyVersionId: fixture.foreignCompetency.id,
          requiredProficiency: 'advanced',
        },
      ],
      reason: 'company B isolation fixture',
      idempotencyKey: key('company-b-position'),
    },
    metadata(),
  );
  const foreignPositionVersion = await db('critical_position_versions')
    .where({ critical_position_id: foreignPosition.id })
    .first();
  const foreignPlan = await succession.createPlan(
    fixture.hr,
    context(fixture.hr, 'succession_plan.create', fixture.secondCompany.id),
    {
      companyId: fixture.secondCompany.id,
      criticalPositionVersionId: foreignPositionVersion.id,
      anchorDate: '2026-08-01',
      planningHorizonDate: '2027-08-01',
      incumbentEmploymentId: null,
      riskRationale: 'Company B sensitive risk',
      reason: 'company B isolation fixture',
      idempotencyKey: key('company-b-plan'),
    },
    metadata(),
  );
  await succession.planAction(
    fixture.hr,
    context(fixture.hr, 'succession_plan.activate', fixture.secondCompany.id),
    foreignPlan.id,
    'activate',
    {
      workflowVersion: 1,
      reason: 'activate company B plan',
      idempotencyKey: key('company-b-plan-activate'),
    },
    'succession_plan.activate',
    metadata(),
  );
  for (const operation of [
    () =>
      succession.getPosition(
        context(fixture.hr, 'critical_position.view', fixture.company.id),
        foreignPosition.id,
        'critical_position.view',
      ),
    () =>
      succession.getPlan(
        context(fixture.hr, 'succession_plan.view', fixture.company.id),
        foreignPlan.id,
        'succession_plan.view',
      ),
    () =>
      succession.planHistory(
        context(fixture.hr, 'succession_plan.view', fixture.company.id),
        foreignPlan.id,
        'succession_plan.view',
      ),
    () =>
      succession.planAction(
        fixture.hr,
        context(fixture.hr, 'succession_plan.close', fixture.company.id),
        foreignPlan.id,
        'close',
        {
          workflowVersion: 2,
          reason: 'cross-company mutation',
          idempotencyKey: key('cross-company-close'),
        },
        'succession_plan.close',
        metadata(),
      ),
    () =>
      succession.export(
        fixture.hr,
        context(fixture.hr, 'succession.export', fixture.company.id),
        { companyId: fixture.secondCompany.id, page: 1, pageSize: 25 },
        metadata(),
      ),
  ])
    await expectCode(operation, 404);
  await assert.rejects(() =>
    succession.createNomination(
      fixture.hr,
      context(fixture.hr, 'succession_nomination.create', fixture.secondCompany.id),
      {
        companyId: fixture.secondCompany.id,
        successionPlanId: foreignPlan.id,
        employmentId: fixture.subject.employment_id,
        managerReadinessRecommendation: 'ready_now',
        readinessTargetDate: null,
        strengths: 'foreign employment',
        developmentNeeds: 'foreign employment',
        nominationRationale: 'must fail',
        competencyGapNarrative: null,
        reason: 'cross-company employment rejection',
        idempotencyKey: key('foreign-employment-nomination'),
      },
      metadata(),
    ),
  );
  await assert.rejects(() =>
    career.createPlan(
      fixture.employee,
      context(fixture.employee, 'career_plan.create', fixture.company.id, 'own'),
      planInput(fixture, 'foreign-training', {
        actions: [
          {
            actionType: 'training',
            description: 'foreign training',
            targetDate: '2027-01-01',
            responsibleParty: 'employee',
            trainingCourseVersionId: fixture.foreignTrainingVersion.id,
          },
        ],
      }),
      metadata(),
    ),
  );
  await expectCode(
    () =>
      succession.listPlans(context(fixture.hr, 'succession_plan.view', fixture.company.id), {
        companyId: fixture.secondCompany.id,
        page: 1,
        pageSize: 25,
      }),
    404,
  );
  pass('cross-company references and reads fail closed');
}

async function sourceBoundary(db, work, pass) {
  const sources = {
    employees: await db('employees').select('*').orderBy('id'),
    employments: await db('employments').select('*').orderBy('id'),
    assignments: await db('employee_assignments').select('*').orderBy('id'),
    competencyVersions: await db('performance_competency_versions').select('*').orderBy('id'),
    courseVersions: await db('training_course_versions').select('*').orderBy('id'),
    completionVersions: await db('training_completion_versions').select('*').orderBy('id'),
  };
  await work();
  assert.deepEqual(await db('employees').select('*').orderBy('id'), sources.employees);
  assert.deepEqual(await db('employments').select('*').orderBy('id'), sources.employments);
  assert.deepEqual(await db('employee_assignments').select('*').orderBy('id'), sources.assignments);
  assert.deepEqual(
    await db('performance_competency_versions').select('*').orderBy('id'),
    sources.competencyVersions,
  );
  assert.deepEqual(
    await db('training_course_versions').select('*').orderBy('id'),
    sources.courseVersions,
  );
  assert.deepEqual(
    await db('training_completion_versions').select('*').orderBy('id'),
    sources.completionVersions,
  );
  pass('Phase 12 operations do not write cross-domain source rows');
}

async function concurrency(db, fixture, career, pass) {
  const inputA = planInput(fixture, 'concurrent-a');
  const inputB = planInput(fixture, 'concurrent-b');
  const results = await Promise.allSettled([
    career.createPlan(
      fixture.employee,
      context(fixture.employee, 'career_plan.create', fixture.company.id, 'own'),
      inputA,
      metadata(),
    ),
    career.createPlan(
      fixture.employee,
      context(fixture.employee, 'career_plan.create', fixture.company.id, 'own'),
      inputB,
      metadata(),
    ),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(
    await count(db, 'career_plans', {
      company_id: fixture.company.id,
      employment_id: fixture.subject.employment_id,
      active_slot: 1,
    }),
    1,
  );
  pass('concurrent active career-plan creation permits one winner');

  const winner = results.find((result) => result.status === 'fulfilled').value;
  const submitted = await career.act(
    fixture.employee,
    context(fixture.employee, 'career_plan.submit', fixture.company.id, 'own'),
    winner.id,
    'submit',
    { workflowVersion: 1, reason: 'progress setup', idempotencyKey: key('progress-submit') },
    'career_plan.submit',
    metadata(),
  );
  await career.act(
    fixture.managerActorA,
    context(fixture.managerActorA, 'career_plan.approve', fixture.company.id, 'direct_reports'),
    winner.id,
    'approve',
    {
      workflowVersion: submitted.workflow_version,
      reason: 'progress setup approval',
      idempotencyKey: key('progress-approve'),
    },
    'career_plan.approve',
    metadata(),
  );
  const goal = await db('career_plan_goals').where({ career_plan_id: winner.id }).first();
  const progressInput = {
    kind: 'goal',
    itemId: goal.id,
    status: 'in_progress',
    comment: 'concurrent progress',
    completionDate: null,
    version: goal.version,
  };
  const progressResults = await Promise.allSettled([
    career.progress(
      fixture.employee,
      context(fixture.employee, 'career_plan.update_progress', fixture.company.id, 'own'),
      winner.id,
      { ...progressInput, reason: 'progress A', idempotencyKey: key('progress-a') },
      metadata(),
    ),
    career.progress(
      fixture.employee,
      context(fixture.employee, 'career_plan.update_progress', fixture.company.id, 'own'),
      winner.id,
      { ...progressInput, reason: 'progress B', idempotencyKey: key('progress-b') },
      metadata(),
    ),
  ]);
  assert.equal(progressResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(progressResults.filter((result) => result.status === 'rejected').length, 1);
  const refreshedGoal = await db('career_plan_goals').where({ id: goal.id }).first();
  const retried = await career.progress(
    fixture.employee,
    context(fixture.employee, 'career_plan.update_progress', fixture.company.id, 'own'),
    winner.id,
    {
      ...progressInput,
      status: 'completed',
      version: refreshedGoal.version,
      reason: 'current-version retry',
      idempotencyKey: key('progress-retry'),
    },
    metadata(),
  );
  assert.equal(retried.replayed, false);
  assert.equal(await count(db, 'career_plan_goal_versions', { career_plan_goal_id: goal.id }), 3);
  pass('concurrent progress detects stale version and preserves append-only history');
}

async function successionLifecycle(db, fixture, succession, pass) {
  const position = await succession.createPosition(
    fixture.hr,
    context(fixture.hr, 'critical_position.create', fixture.company.id),
    {
      companyId: fixture.company.id,
      code: `P12-${randomUUID().slice(0, 8)}`,
      name: 'Phase 12 critical position',
      designationId: fixture.subject.designation_id,
      branchId: fixture.subject.branch_id,
      departmentId: fixture.subject.department_id,
      criticality: 'critical',
      description: 'Sensitive critical-position rationale',
      effectiveStart: '2026-01-01',
      competencies: [
        {
          performanceCompetencyVersionId: fixture.competency.id,
          requiredProficiency: 'advanced',
        },
      ],
      reason: 'succession verification',
      idempotencyKey: key('position-create'),
    },
    metadata(),
  );
  const positionRow = await db('critical_positions').where({ id: position.id }).first();
  const version = await db('critical_position_versions')
    .where({ critical_position_id: position.id })
    .first();
  const plan = await succession.createPlan(
    fixture.hr,
    context(fixture.hr, 'succession_plan.create', fixture.company.id),
    {
      companyId: fixture.company.id,
      criticalPositionVersionId: version.id,
      anchorDate: '2026-08-01',
      planningHorizonDate: '2027-08-01',
      incumbentEmploymentId: fixture.subject.employment_id,
      riskRationale: 'Sensitive succession risk',
      reason: 'succession plan verification',
      idempotencyKey: key('succession-plan-create'),
    },
    metadata(),
  );
  const activationKey = key('succession-activate');
  const active = await succession.planAction(
    fixture.hr,
    context(fixture.hr, 'succession_plan.activate', fixture.company.id),
    plan.id,
    'activate',
    { workflowVersion: 1, reason: 'activate', idempotencyKey: activationKey },
    'succession_plan.activate',
    metadata(),
  );
  assert.equal(
    (
      await succession.planAction(
        fixture.hr,
        context(fixture.hr, 'succession_plan.activate', fixture.company.id),
        plan.id,
        'activate',
        { workflowVersion: 1, reason: 'activate', idempotencyKey: activationKey },
        'succession_plan.activate',
        metadata(),
      )
    ).replayed,
    true,
  );
  await expectCode(
    () =>
      succession.planAction(
        fixture.hr,
        context(fixture.hr, 'succession_plan.activate', fixture.company.id),
        plan.id,
        'activate',
        { workflowVersion: 1, reason: 'different', idempotencyKey: activationKey },
        'succession_plan.activate',
        metadata(),
      ),
    'IDEMPOTENCY_CONFLICT',
  );
  const nominationInput = (label) => ({
    companyId: fixture.company.id,
    successionPlanId: plan.id,
    employmentId: fixture.subject.employment_id,
    managerReadinessRecommendation: 'ready_within_1_year',
    readinessTargetDate: '2027-08-01',
    strengths: `Sensitive strengths ${label}`,
    developmentNeeds: `Sensitive development ${label}`,
    nominationRationale: `Sensitive rationale ${label}`,
    competencyGapNarrative: `Sensitive gap ${label}`,
    reason: `nomination ${label}`,
    idempotencyKey: key(`nomination-${label}`),
  });
  const nomination = await succession.createNomination(
    fixture.managerActorA,
    context(
      fixture.managerActorA,
      'succession_nomination.create',
      fixture.company.id,
      'direct_reports',
    ),
    nominationInput('main'),
    metadata(),
  );
  const submitKey = key('nomination-submit');
  const submitted = await succession.nominationAction(
    fixture.managerActorA,
    context(
      fixture.managerActorA,
      'succession_nomination.submit',
      fixture.company.id,
      'direct_reports',
    ),
    nomination.id,
    'submit',
    { workflowVersion: 1, reason: 'submit nomination', idempotencyKey: submitKey },
    'succession_nomination.submit',
    metadata(),
  );
  assert.equal(
    (
      await succession.nominationAction(
        fixture.managerActorA,
        context(
          fixture.managerActorA,
          'succession_nomination.submit',
          fixture.company.id,
          'direct_reports',
        ),
        nomination.id,
        'submit',
        { workflowVersion: 1, reason: 'submit nomination', idempotencyKey: submitKey },
        'succession_nomination.submit',
        metadata(),
      )
    ).replayed,
    true,
  );
  const recommended = await succession.nominationAction(
    fixture.managerActorA,
    context(
      fixture.managerActorA,
      'succession_nomination.recommend',
      fixture.company.id,
      'direct_reports',
    ),
    nomination.id,
    'recommend',
    {
      workflowVersion: submitted.workflow_version,
      reason: 'manager recommendation',
      idempotencyKey: key('nomination-recommend'),
    },
    'succession_nomination.recommend',
    metadata(),
  );
  await expectCode(
    () =>
      succession.nominationAction(
        fixture.managerActorA,
        context(
          fixture.managerActorA,
          'succession_nomination.confirm',
          fixture.company.id,
          'direct_reports',
        ),
        nomination.id,
        'confirm',
        {
          workflowVersion: recommended.workflow_version,
          reason: 'self maker checker',
          idempotencyKey: key('nomination-self-confirm'),
        },
        'succession_nomination.confirm',
        metadata(),
      ),
    403,
  );
  const confirmed = await succession.nominationAction(
    fixture.hr,
    context(fixture.hr, 'succession_nomination.confirm', fixture.company.id),
    nomination.id,
    'confirm',
    {
      workflowVersion: recommended.workflow_version,
      reason: 'HR confirmation',
      idempotencyKey: key('nomination-confirm'),
    },
    'succession_nomination.confirm',
    metadata(),
  );
  const readinessKey = key('readiness-hr');
  const readiness = await succession.readiness(
    fixture.hr,
    context(fixture.hr, 'succession_nomination.update_readiness', fixture.company.id),
    nomination.id,
    {
      workflowVersion: confirmed.workflow_version,
      version: confirmed.version,
      readiness: 'ready_now',
      reason: 'mandatory HR readiness revision reason',
      idempotencyKey: readinessKey,
    },
    'succession_nomination.update_readiness',
    metadata(),
  );
  assert.equal(readiness.replayed, false);
  assert.equal(
    (
      await succession.readiness(
        fixture.hr,
        context(fixture.hr, 'succession_nomination.update_readiness', fixture.company.id),
        nomination.id,
        {
          workflowVersion: confirmed.workflow_version,
          version: confirmed.version,
          readiness: 'ready_now',
          reason: 'mandatory HR readiness revision reason',
          idempotencyKey: readinessKey,
        },
        'succession_nomination.update_readiness',
        metadata(),
      )
    ).replayed,
    true,
  );
  assert.ok(
    (
      await db('successor_nomination_readiness_events').where({
        successor_nomination_id: nomination.id,
      })
    ).length >= 2,
  );
  assert.equal(
    Number(
      (
        await db('successor_nomination_versions')
          .where({ successor_nomination_id: nomination.id, version_number: 1 })
          .first()
      ).manager_user_id_snapshot,
    ),
    Number(fixture.managerActorA.userId),
  );
  const removed = await succession.nominationAction(
    fixture.hr,
    context(fixture.hr, 'succession_nomination.remove', fixture.company.id),
    nomination.id,
    'remove',
    {
      workflowVersion: confirmed.workflow_version,
      reason: 'finish nomination',
      idempotencyKey: key('nomination-remove'),
    },
    'succession_nomination.remove',
    metadata(),
  );
  assert.equal(removed.status, 'removed');
  const contenders = await Promise.allSettled([
    succession.createNomination(
      fixture.managerActorA,
      context(
        fixture.managerActorA,
        'succession_nomination.create',
        fixture.company.id,
        'direct_reports',
      ),
      nominationInput('concurrent-a'),
      metadata(),
    ),
    succession.createNomination(
      fixture.managerActorA,
      context(
        fixture.managerActorA,
        'succession_nomination.create',
        fixture.company.id,
        'direct_reports',
      ),
      nominationInput('concurrent-b'),
      metadata(),
    ),
  ]);
  assert.equal(contenders.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(contenders.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(
    await count(db, 'successor_nominations', {
      succession_plan_id: plan.id,
      employment_id: fixture.subject.employment_id,
      active_slot: 1,
    }),
    1,
  );
  const candidateCode = (
    await db('employments').where({ id: fixture.subject.employment_id }).first()
  ).employee_code;
  for (const exportContext of [
    context(fixture.managerActorA, 'succession.export', fixture.company.id, 'direct_reports'),
    context(fixture.hr, 'succession.export', fixture.company.id, 'department', {
      department_id: fixture.subject.department_id,
    }),
    context(fixture.hr, 'succession.export', fixture.company.id, 'branch', {
      branch_id: fixture.subject.branch_id,
    }),
    context(fixture.hr, 'succession.export', fixture.company.id),
    context(fixture.hr, 'succession.export', null, 'all'),
  ]) {
    const csv = await succession.export(
      exportContext.actor,
      exportContext,
      { companyId: fixture.company.id, page: 1, pageSize: 25 },
      metadata(),
    );
    assert.ok(csv.includes(candidateCode));
    assert.equal(csv.includes('Sensitive strengths'), false);
  }
  const restrictedCsv = await succession.export(
    fixture.hr,
    context(fixture.hr, 'succession.export', fixture.company.id, 'restricted'),
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.equal(restrictedCsv.trim().split('\n').length, 1);
  await expectCode(
    () =>
      succession.export(
        fixture.unauthorized,
        context(fixture.unauthorized, 'succession_nomination.view', fixture.company.id),
        { companyId: fixture.company.id, page: 1, pageSize: 25 },
        metadata(),
      ),
    403,
  );
  const closed = await succession.planAction(
    fixture.hr,
    context(fixture.hr, 'succession_plan.close', fixture.company.id),
    plan.id,
    'close',
    {
      workflowVersion: active.workflow_version,
      reason: 'close succession plan',
      idempotencyKey: key('succession-close'),
    },
    'succession_plan.close',
    metadata(),
  );
  assert.equal(closed.status, 'closed');
  assert.equal(positionRow.current_version_number, 1);
  pass(
    'succession lifecycle, maker-checker, readiness history, idempotency, and duplicate concurrency',
  );
}

async function careerLifecycleAndExports(db, fixture, career, pass) {
  const active = await db('career_plans')
    .where({
      company_id: fixture.company.id,
      employment_id: fixture.subject.employment_id,
      active_slot: 1,
    })
    .first();
  const completed = await career.act(
    fixture.hr,
    context(fixture.hr, 'career_plan.complete', fixture.company.id),
    active.id,
    'complete',
    {
      workflowVersion: active.workflow_version,
      reason: 'complete active plan',
      idempotencyKey: key('career-complete'),
    },
    'career_plan.complete',
    metadata(),
  );
  assert.equal(completed.status, 'completed');
  await expectCode(
    () =>
      career.act(
        fixture.hr,
        context(fixture.hr, 'career_plan.complete', fixture.company.id),
        active.id,
        'complete',
        {
          workflowVersion: completed.workflow_version,
          reason: 'invalid repeat',
          idempotencyKey: key('career-invalid-complete'),
        },
        'career_plan.complete',
        metadata(),
      ),
    'INVALID_WORKFLOW_STATE',
  );
  const withdrawnDraft = await createCareerPlan(career, fixture, 'withdraw');
  const withdrawn = await career.act(
    fixture.employee,
    context(fixture.employee, 'career_plan.withdraw', fixture.company.id, 'own'),
    withdrawnDraft.id,
    'withdraw',
    { workflowVersion: 1, reason: 'withdraw draft', idempotencyKey: key('career-withdraw') },
    'career_plan.withdraw',
    metadata(),
  );
  assert.equal(withdrawn.status, 'withdrawn');
  const returnedDraft = await createCareerPlan(career, fixture, 'returned');
  const submitted = await career.act(
    fixture.employee,
    context(fixture.employee, 'career_plan.submit', fixture.company.id, 'own'),
    returnedDraft.id,
    'submit',
    {
      workflowVersion: 1,
      reason: 'submit returned scenario',
      idempotencyKey: key('return-submit'),
    },
    'career_plan.submit',
    metadata(),
  );
  const returned = await career.act(
    fixture.managerActorA,
    context(fixture.managerActorA, 'career_plan.return', fixture.company.id, 'direct_reports'),
    returnedDraft.id,
    'return',
    {
      workflowVersion: submitted.workflow_version,
      reason: 'return for revision',
      idempotencyKey: key('career-return'),
    },
    'career_plan.return',
    metadata(),
  );
  const update = planInput(fixture, 'returned-update', {
    version: returned.version,
    idempotencyKey: key('career-update'),
  });
  delete update.companyId;
  delete update.employmentId;
  await career.updatePlan(
    fixture.employee,
    context(fixture.employee, 'career_plan.update_draft', fixture.company.id, 'own'),
    returnedDraft.id,
    update,
    metadata(),
  );
  const current = await db('career_plans').where({ id: returnedDraft.id }).first();
  const resubmitted = await career.act(
    fixture.employee,
    context(fixture.employee, 'career_plan.submit', fixture.company.id, 'own'),
    returnedDraft.id,
    'submit',
    {
      workflowVersion: current.workflow_version,
      reason: 'resubmit revised plan',
      idempotencyKey: key('career-resubmit'),
    },
    'career_plan.submit',
    metadata(),
  );
  const approved = await career.act(
    fixture.managerActorA,
    context(fixture.managerActorA, 'career_plan.approve', fixture.company.id, 'direct_reports'),
    returnedDraft.id,
    'approve',
    {
      workflowVersion: resubmitted.workflow_version,
      reason: 'approve revised plan',
      idempotencyKey: key('career-reapprove'),
    },
    'career_plan.approve',
    metadata(),
  );
  assert.equal(approved.status, 'active');
  const otherPlan = await career.createPlan(
    fixture.hr,
    context(fixture.hr, 'career_plan.create', fixture.company.id),
    planInput(fixture, 'scope-other', { employmentId: fixture.managerB.employment_id }),
    metadata(),
  );
  await career.act(
    fixture.hr,
    context(fixture.hr, 'career_plan.withdraw', fixture.company.id),
    otherPlan.id,
    'withdraw',
    {
      workflowVersion: 1,
      reason: 'scope fixture terminal state',
      idempotencyKey: key('scope-other-withdraw'),
    },
    'career_plan.withdraw',
    metadata(),
  );
  const subjectCode = (await db('employments').where({ id: fixture.subject.employment_id }).first())
    .employee_code;
  const otherCode = (await db('employments').where({ id: fixture.managerB.employment_id }).first())
    .employee_code;
  const ownCsv = await career.export(
    fixture.employee,
    context(fixture.employee, 'career_plan.export', fixture.company.id, 'own'),
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.ok(ownCsv.includes('employee_code'));
  assert.ok(ownCsv.includes(subjectCode));
  assert.equal(ownCsv.includes(otherCode), false);
  assert.equal(ownCsv.includes('sensitive-narrative'), false);
  const directCsv = await career.export(
    fixture.managerActorA,
    context(fixture.managerActorA, 'career_plan.export', fixture.company.id, 'direct_reports'),
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.ok(directCsv.includes(subjectCode));
  const branchCsv = await career.export(
    fixture.hr,
    context(fixture.hr, 'career_plan.export', fixture.company.id, 'branch', {
      branch_id: fixture.subject.branch_id,
    }),
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.ok(branchCsv.includes('employee_code'));
  const departmentCsv = await career.export(
    fixture.hr,
    context(fixture.hr, 'career_plan.export', fixture.company.id, 'department', {
      department_id: fixture.subject.department_id,
    }),
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.ok(departmentCsv.includes(subjectCode));
  const companyCsv = await career.export(
    fixture.hr,
    context(fixture.hr, 'career_plan.export', fixture.company.id),
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.ok(companyCsv.includes(subjectCode));
  assert.ok(companyCsv.includes(otherCode));
  const allCsv = await career.export(
    fixture.hr,
    context(fixture.hr, 'career_plan.export', null, 'all'),
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.equal(allCsv, companyCsv);
  const restrictedCsv = await career.export(
    fixture.hr,
    context(fixture.hr, 'career_plan.export', fixture.company.id, 'restricted'),
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.equal(restrictedCsv.trim().split('\n').length, 1);
  const sensitiveExportContext = createAccessContext({
    actor: fixture.sensitive,
    permission: 'career_plan.export',
    grants: [{ scope_type: 'company', company_id: fixture.company.id }],
  });
  const sensitiveCsv = await career.export(
    fixture.sensitive,
    sensitiveExportContext,
    { companyId: fixture.company.id, page: 1, pageSize: 25 },
    metadata(),
  );
  assert.equal(sensitiveCsv.includes('sensitive-narrative'), false);
  await expectCode(
    () =>
      career.export(
        fixture.unauthorized,
        context(fixture.unauthorized, 'career_plan.view', fixture.company.id),
        { companyId: fixture.company.id, page: 1, pageSize: 25 },
        metadata(),
      ),
    403,
  );
  const exportAudit = await db('audit_events')
    .where({ action_code: 'career_plan.export', actor_user_id: fixture.hr.userId })
    .first();
  assert.ok(exportAudit);
  assert.equal(JSON.stringify(exportAudit).includes('sensitive-narrative'), false);
  pass('career lifecycle matrix and scoped non-sensitive CSV export');
}

async function versionImmutability(db, fixture, career, succession, pass) {
  const path = await career.createPath(
    fixture.hr,
    context(fixture.hr, 'career_path.create', fixture.company.id),
    {
      companyId: fixture.company.id,
      code: `PATH-${randomUUID().slice(0, 8)}`,
      name: 'Immutable path',
      effectiveStart: '2026-01-01',
      description: 'Original path meaning',
      steps: [
        {
          designationId: fixture.subject.designation_id,
          minimumTimeMonths: 1,
          competencies: [
            {
              performanceCompetencyVersionId: fixture.competency.id,
              requiredProficiency: 'basic',
            },
          ],
        },
      ],
      reason: 'create original path',
      idempotencyKey: key('immutable-path-create'),
    },
    metadata(),
  );
  const original = await db('career_path_versions').where({ career_path_id: path.id }).first();
  const originalMapping = await db('career_path_step_competencies as mapping')
    .join('career_path_steps as step', 'step.id', 'mapping.career_path_step_id')
    .where({ 'step.career_path_version_id': original.id })
    .first('mapping.*');
  await career.versionPath(
    fixture.hr,
    context(fixture.hr, 'career_path.version_create', fixture.company.id),
    path.id,
    {
      name: 'Immutable path revised',
      effectiveStart: '2027-01-01',
      description: 'New path meaning',
      steps: [
        { designationId: fixture.subject.designation_id, minimumTimeMonths: 2, competencies: [] },
      ],
      reason: 'append-only path revision',
      version: 1,
      idempotencyKey: key('immutable-path-version'),
    },
    metadata(),
  );
  const originalAfter = await db('career_path_versions').where({ id: original.id }).first();
  assert.equal(originalAfter.description, 'Original path meaning');
  assert.equal(
    Number(
      (await db('career_path_step_competencies').where({ id: originalMapping.id }).first())
        .performance_competency_version_id,
    ),
    Number(fixture.competency.id),
  );
  const position = await db('critical_positions').where({ company_id: fixture.company.id }).first();
  const positionVersion = await db('critical_position_versions')
    .where({ critical_position_id: position.id })
    .first();
  await succession.versionPosition(
    fixture.hr,
    context(fixture.hr, 'critical_position.version_create', fixture.company.id),
    position.id,
    {
      name: 'Revised critical position',
      designationId: fixture.subject.designation_id,
      branchId: fixture.subject.branch_id,
      departmentId: fixture.subject.department_id,
      criticality: 'high',
      description: 'Revised meaning',
      effectiveStart: '2027-01-01',
      competencies: [],
      reason: 'append-only position revision',
      version: position.version,
      idempotencyKey: key('immutable-position-version'),
    },
    metadata(),
  );
  assert.equal(
    (await db('critical_position_versions').where({ id: positionVersion.id }).first()).description,
    'Sensitive critical-position rationale',
  );
  pass('career path and critical-position historical versions and mappings remain immutable');
}

async function httpAuthorizationAndLogCapture(db, fixture, career, succession, pass) {
  const capturedLogs = [];
  const logger = {
    warn: (value, message) => capturedLogs.push({ level: 'warn', value, message }),
    error: (value, message) => capturedLogs.push({ level: 'error', value, message }),
  };
  const authorizationService = {
    requirePermission: async (actor, permission) => {
      if (
        Number(actor.userId) === Number(fixture.employee.userId) &&
        (permission.startsWith('succession') || permission.startsWith('critical_position'))
      )
        throw new ApplicationError({
          code: 'FORBIDDEN',
          message: 'You are not authorized to perform this action.',
          statusCode: 403,
        });
      return context(actor, permission, fixture.company.id);
    },
  };
  const authenticate = (request, _response, next) => {
    const actorId = Number(request.get('x-phase-12-actor'));
    if (!actorId) {
      next(
        new ApplicationError({
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required.',
          statusCode: 401,
        }),
      );
      return;
    }
    request.actor = { userId: actorId };
    next();
  };
  const app = express();
  app.use(requestContext);
  app.use(express.json());
  app.use(
    '/career',
    createCareerRouter({
      authenticate,
      authorizationService,
      careerController: createCareerController(career),
    }),
  );
  app.use(
    '/succession',
    createSuccessionRouter({
      authenticate,
      authorizationService,
      successionController: createSuccessionController(succession),
    }),
  );
  app.use(errorHandler(logger));
  const server = await new Promise((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  try {
    const { port } = server.address();
    const request = (path, actor = fixture.employee) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { 'x-phase-12-actor': String(actor.userId) },
      });
    const nomination = await db('successor_nominations').orderBy('id', 'desc').first();
    const position = await db('critical_positions').orderBy('id', 'desc').first();
    for (const path of [
      `/succession/plans?companyId=${fixture.company.id}&page=1&pageSize=25`,
      `/succession/nominations?companyId=${fixture.company.id}&page=1&pageSize=25`,
      `/succession/nominations/${nomination.id}`,
      `/succession/nominations/${nomination.id}/history`,
      `/succession/critical-positions/${position.id}`,
      `/succession/export.csv?companyId=${fixture.company.id}&page=1&pageSize=25`,
    ]) {
      const response = await request(path);
      assert.equal(response.status, 403);
      const payload = await response.text();
      assert.equal(payload.includes('Sensitive strengths'), false);
      assert.equal(payload.includes('Sensitive rationale'), false);
    }
    const guessed = await request('/succession/nominations/999999999', fixture.hr);
    assert.equal(guessed.status, 404);
    const unauthorizedCareerExport = await request(
      `/career/export.csv?companyId=${fixture.company.id}&page=1&pageSize=25`,
      fixture.employee,
    );
    assert.equal(unauthorizedCareerExport.status, 200);
    assert.equal((await unauthorizedCareerExport.text()).includes('sensitive-narrative'), false);
    const logText = JSON.stringify(capturedLogs);
    for (const marker of [
      'Sensitive strengths',
      'Sensitive rationale',
      'sensitive-narrative',
      'Sensitive succession risk',
    ])
      assert.equal(logText.includes(marker), false);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  pass(
    'HTTP permission middleware, protected 404, employee succession invisibility, and log redaction',
  );
}

async function nominationReassignmentAndReadinessConcurrency(db, fixture, succession, pass) {
  const plan = await db('succession_plans')
    .where({ company_id: fixture.company.id, status: 'closed' })
    .orderBy('id', 'desc')
    .first();
  assert.ok(plan);
  const nomination = await db('successor_nominations')
    .where({ succession_plan_id: plan.id, active_slot: 1 })
    .first();
  assert.ok(nomination);
  const original = await db('successor_nomination_versions')
    .where({ successor_nomination_id: nomination.id, version_number: 1 })
    .first();
  assert.equal(Number(original.manager_user_id_snapshot), Number(fixture.managerActorA.userId));
  await expectCode(
    () =>
      succession.reassign(
        fixture.unauthorized,
        context(fixture.unauthorized, 'succession_nomination.view', fixture.company.id),
        nomination.id,
        {
          managerEmploymentId: fixture.managerB.employment_id,
          workflowVersion: nomination.workflow_version,
          reason: 'unauthorized',
          idempotencyKey: key('denied-nomination-reassign'),
        },
        metadata(),
      ),
    403,
  );
  const reassignmentKey = key('nomination-reassign');
  const reassignmentInput = {
    managerEmploymentId: fixture.managerB.employment_id,
    workflowVersion: nomination.workflow_version,
    reason: 'approved authority correction',
    idempotencyKey: reassignmentKey,
  };
  const reassigned = await succession.reassign(
    fixture.hr,
    context(fixture.hr, 'succession_nomination.reassign_manager', fixture.company.id),
    nomination.id,
    reassignmentInput,
    metadata(),
  );
  assert.equal(reassigned.replayed, false);
  assert.equal(
    (
      await succession.reassign(
        fixture.hr,
        context(fixture.hr, 'succession_nomination.reassign_manager', fixture.company.id),
        nomination.id,
        reassignmentInput,
        metadata(),
      )
    ).replayed,
    true,
  );
  await expectCode(
    () =>
      succession.reassign(
        fixture.hr,
        context(fixture.hr, 'succession_nomination.reassign_manager', fixture.company.id),
        nomination.id,
        { ...reassignmentInput, reason: 'different meaning' },
        metadata(),
      ),
    'IDEMPOTENCY_CONFLICT',
  );
  await expectCode(
    () =>
      succession.reassign(
        fixture.hr,
        context(fixture.hr, 'succession_nomination.reassign_manager', fixture.company.id),
        nomination.id,
        {
          ...reassignmentInput,
          idempotencyKey: key('stale-nomination-reassign'),
        },
        metadata(),
      ),
    'STALE_WORKFLOW_VERSION',
  );
  const current = await db('successor_nominations').where({ id: nomination.id }).first();
  const currentSnapshot = await db('successor_nomination_versions')
    .where({
      successor_nomination_id: nomination.id,
      version_number: current.current_version_number,
    })
    .first();
  assert.equal(
    Number(currentSnapshot.manager_user_id_snapshot),
    Number(fixture.managerActorB.userId),
  );
  assert.equal(
    Number(
      (await db('successor_nomination_versions').where({ id: original.id }).first())
        .manager_user_id_snapshot,
    ),
    Number(fixture.managerActorA.userId),
  );
  const history = await succession.history(
    fixture.sensitive,
    context(fixture.sensitive, 'succession_nomination.view', fixture.company.id),
    nomination.id,
    'succession_nomination.view',
    metadata(),
  );
  assert.equal(history.reassignments.length, 1);
  assert.equal(
    await count(db, 'audit_events', {
      action_code: 'succession_nomination.reassign_manager',
      record_id: nomination.id,
    }),
    1,
  );
  const submitted = await succession.nominationAction(
    fixture.hr,
    context(fixture.hr, 'succession_nomination.submit', fixture.company.id),
    nomination.id,
    'submit',
    {
      workflowVersion: current.workflow_version,
      reason: 'submit after reassignment',
      idempotencyKey: key('reassigned-submit'),
    },
    'succession_nomination.submit',
    metadata(),
  );
  await expectCode(
    () =>
      succession.nominationAction(
        fixture.managerActorA,
        context(
          fixture.managerActorA,
          'succession_nomination.recommend',
          fixture.company.id,
          'direct_reports',
        ),
        nomination.id,
        'recommend',
        {
          workflowVersion: submitted.workflow_version,
          reason: 'old manager',
          idempotencyKey: key('old-manager-recommend'),
        },
        'succession_nomination.recommend',
        metadata(),
      ),
    404,
  );
  const recommended = await succession.nominationAction(
    fixture.managerActorB,
    context(
      fixture.managerActorB,
      'succession_nomination.recommend',
      fixture.company.id,
      'direct_reports',
    ),
    nomination.id,
    'recommend',
    {
      workflowVersion: submitted.workflow_version,
      reason: 'new manager',
      idempotencyKey: key('new-manager-recommend'),
    },
    'succession_nomination.recommend',
    metadata(),
  );
  assert.equal(recommended.status, 'manager_recommended');
  const before = await db('successor_nominations').where({ id: nomination.id }).first();
  const base = {
    workflowVersion: before.workflow_version,
    version: before.version,
    readiness: 'ready_now',
    reason: 'concurrent readiness verification',
  };
  const results = await Promise.allSettled([
    succession.readiness(
      fixture.hr,
      context(fixture.hr, 'succession_nomination.update_readiness', fixture.company.id),
      nomination.id,
      { ...base, idempotencyKey: key('readiness-concurrent-a') },
      'succession_nomination.update_readiness',
      metadata(),
    ),
    succession.readiness(
      fixture.hr,
      context(fixture.hr, 'succession_nomination.update_readiness', fixture.company.id),
      nomination.id,
      { ...base, readiness: 'ready_within_2_years', idempotencyKey: key('readiness-concurrent-b') },
      'succession_nomination.update_readiness',
      metadata(),
    ),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'STALE_VERSION');
  const refreshed = await db('successor_nominations').where({ id: nomination.id }).first();
  await succession.readiness(
    fixture.hr,
    context(fixture.hr, 'succession_nomination.update_readiness', fixture.company.id),
    nomination.id,
    {
      ...base,
      version: refreshed.version,
      readiness: 'development_required',
      idempotencyKey: key('readiness-current-retry'),
    },
    'succession_nomination.update_readiness',
    metadata(),
  );
  assert.equal(
    await count(db, 'successor_nomination_readiness_events', {
      successor_nomination_id: nomination.id,
    }),
    3,
  );
  pass('nomination reassignment authority/history and concurrent readiness version protection');
}

async function successionNegativeLifecycle(db, fixture, succession, pass) {
  const positionVersion = await db('critical_position_versions')
    .where({ company_id: fixture.company.id })
    .orderBy('id', 'desc')
    .first();
  assert.ok(positionVersion);
  const createPlan = (label) =>
    succession.createPlan(
      fixture.hr,
      context(fixture.hr, 'succession_plan.create', fixture.company.id),
      {
        companyId: fixture.company.id,
        criticalPositionVersionId: positionVersion.id,
        anchorDate: '2026-08-01',
        planningHorizonDate: '2027-08-01',
        incumbentEmploymentId: fixture.subject.employment_id,
        riskRationale: `risk-${label}`,
        reason: label,
        idempotencyKey: key(`plan-${label}`),
      },
      metadata(),
    );
  const planAction = (id, action, workflowVersion, idempotencyKey, reason = action) =>
    succession.planAction(
      fixture.hr,
      context(fixture.hr, `succession_plan.${action}`, fixture.company.id),
      id,
      action,
      { workflowVersion, reason, idempotencyKey },
      `succession_plan.${action}`,
      metadata(),
    );
  const cancelledPlan = await createPlan('cancel-matrix');
  const maskedPlan = await succession.getPlan(
    context(fixture.hr, 'succession_plan.view', fixture.company.id),
    cancelledPlan.id,
    'succession_plan.view',
    fixture.hr,
    metadata(),
  );
  assert.equal(Object.hasOwn(maskedPlan, 'risk_rationale'), false);
  const visiblePlan = await succession.getPlan(
    context(fixture.sensitive, 'succession_plan.view', fixture.company.id),
    cancelledPlan.id,
    'succession_plan.view',
    fixture.sensitive,
    metadata(),
  );
  assert.ok(Object.hasOwn(visiblePlan, 'risk_rationale'));
  const maskedHistory = await succession.planHistory(
    context(fixture.hr, 'succession_plan.view', fixture.company.id),
    cancelledPlan.id,
    'succession_plan.view',
    fixture.hr,
    metadata(),
  );
  assert.equal(Object.hasOwn(maskedHistory.versions[0], 'risk_rationale'), false);
  const cancelKey = key('plan-cancel');
  const cancelled = await planAction(cancelledPlan.id, 'cancel', 1, cancelKey);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal((await planAction(cancelledPlan.id, 'cancel', 1, cancelKey)).replayed, true);
  await expectCode(
    () => planAction(cancelledPlan.id, 'cancel', 1, cancelKey, 'different meaning'),
    'IDEMPOTENCY_CONFLICT',
  );
  await expectCode(
    () =>
      planAction(
        cancelledPlan.id,
        'activate',
        cancelled.workflow_version,
        key('activate-cancelled'),
      ),
    'INVALID_WORKFLOW_STATE',
  );
  assert.equal(
    (await db('succession_plans').where({ id: cancelledPlan.id }).first()).status,
    'cancelled',
  );
  assert.equal(
    await count(db, 'succession_plan_state_events', { succession_plan_id: cancelledPlan.id }),
    1,
  );

  const createNomination = async (label) => {
    const plan = await createPlan(label);
    await planAction(plan.id, 'activate', 1, key(`activate-${label}`));
    const nomination = await succession.createNomination(
      fixture.managerActorA,
      context(
        fixture.managerActorA,
        'succession_nomination.create',
        fixture.company.id,
        'direct_reports',
      ),
      {
        companyId: fixture.company.id,
        successionPlanId: plan.id,
        employmentId: fixture.subject.employment_id,
        managerReadinessRecommendation: 'ready_within_1_year',
        readinessTargetDate: '2027-08-01',
        strengths: 'sensitive strengths',
        developmentNeeds: 'sensitive development',
        nominationRationale: 'sensitive rationale',
        reason: label,
        idempotencyKey: key(`nomination-${label}`),
      },
      metadata(),
    );
    return nomination;
  };
  const nominationAction = (actor, id, action, workflowVersion, idempotencyKey, reason = action) =>
    succession.nominationAction(
      actor,
      context(
        actor,
        `succession_nomination.${action}`,
        fixture.company.id,
        actor.userId === fixture.hr.userId ? 'company' : 'direct_reports',
      ),
      id,
      action,
      { workflowVersion, reason, idempotencyKey },
      `succession_nomination.${action}`,
      metadata(),
    );
  const managerRejected = await createNomination('manager-rejection');
  const managerSubmitted = await nominationAction(
    fixture.managerActorA,
    managerRejected.id,
    'submit',
    1,
    key('manager-rejection-submit'),
  );
  const managerRejectKey = key('manager-rejection-decision');
  const managerDecision = await nominationAction(
    fixture.managerActorA,
    managerRejected.id,
    'reject',
    managerSubmitted.workflow_version,
    managerRejectKey,
  );
  assert.equal(managerDecision.status, 'manager_rejected');
  assert.equal(
    (
      await nominationAction(
        fixture.managerActorA,
        managerRejected.id,
        'reject',
        managerSubmitted.workflow_version,
        managerRejectKey,
      )
    ).replayed,
    true,
  );
  await expectCode(
    () =>
      nominationAction(
        fixture.hr,
        managerRejected.id,
        'confirm',
        managerDecision.workflow_version,
        key('confirm-rejected'),
      ),
    'INVALID_WORKFLOW_STATE',
  );

  const hrRejected = await createNomination('hr-rejection');
  const hrSubmitted = await nominationAction(
    fixture.managerActorA,
    hrRejected.id,
    'submit',
    1,
    key('hr-rejection-submit'),
  );
  const hrRecommended = await nominationAction(
    fixture.managerActorA,
    hrRejected.id,
    'recommend',
    hrSubmitted.workflow_version,
    key('hr-rejection-recommend'),
  );
  const hrDecision = await nominationAction(
    fixture.hr,
    hrRejected.id,
    'reject',
    hrRecommended.workflow_version,
    key('hr-rejection-decision'),
  );
  assert.equal(hrDecision.status, 'hr_rejected');
  await expectCode(
    () =>
      nominationAction(
        fixture.hr,
        hrRejected.id,
        'remove',
        hrDecision.workflow_version,
        key('remove-rejected'),
      ),
    'INVALID_WORKFLOW_STATE',
  );

  const withdrawn = await createNomination('withdrawal');
  const withdrawal = await nominationAction(
    fixture.managerActorA,
    withdrawn.id,
    'withdraw',
    1,
    key('withdraw-nomination'),
  );
  assert.equal(withdrawal.status, 'withdrawn');
  await expectCode(
    () =>
      nominationAction(
        fixture.managerActorA,
        withdrawn.id,
        'submit',
        withdrawal.workflow_version,
        key('submit-withdrawn'),
      ),
    'INVALID_WORKFLOW_STATE',
  );
  for (const id of [managerRejected.id, hrRejected.id, withdrawn.id]) {
    assert.equal(
      await count(db, 'successor_nomination_state_events', { successor_nomination_id: id }),
      id === managerRejected.id ? 2 : id === hrRejected.id ? 3 : 1,
    );
  }
  pass('succession cancellation, rejection stages, withdrawal, and terminal-state protection');
}

export async function runPhase12BehavioralScenarios(db, pass) {
  await resetPhase12(db);
  const fixture = await fixtures(db);
  const { career, succession } = services(db, fixture);
  await auditRollback(db, fixture, pass);
  await careerAuthorityLifecycle(db, fixture, career, pass);
  await hrFallback(db, fixture, career, pass);
  await sensitiveAndScopes(db, fixture, career, succession, pass);
  await crossCompanyReferences(db, fixture, career, succession, pass);
  await sourceBoundary(
    db,
    async () => {
      const current = await db('career_plans')
        .where({ company_id: fixture.company.id, active_slot: 1 })
        .first();
      if (current)
        await career.act(
          fixture.hr,
          context(fixture.hr, 'career_plan.cancel', fixture.company.id),
          current.id,
          'cancel',
          {
            workflowVersion: current.workflow_version,
            reason: 'boundary verification cleanup',
            idempotencyKey: key('boundary-cancel'),
          },
          'career_plan.cancel',
          metadata(),
        );
    },
    pass,
  );
  await concurrency(db, fixture, career, pass);
  await successionLifecycle(db, fixture, succession, pass);
  await careerLifecycleAndExports(db, fixture, career, pass);
  await versionImmutability(db, fixture, career, succession, pass);
  await nominationReassignmentAndReadinessConcurrency(db, fixture, succession, pass);
  await successionNegativeLifecycle(db, fixture, succession, pass);
  await httpAuthorizationAndLogCapture(db, fixture, career, succession, pass);
}
