import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { createApp } from '../src/app/createApp.js';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { createAuthorizationRepository } from '../src/modules/authorization/authorizationRepository.js';
import { createAuthorizationService } from '../src/modules/authorization/authorizationService.js';
import { createAuthenticationMiddleware } from '../src/modules/identity/authenticationMiddleware.js';
import { createAuthController } from '../src/modules/identity/authController.js';
import { createAuthService } from '../src/modules/identity/authService.js';
import { createIdentityRepository } from '../src/modules/identity/identityRepository.js';
import { hashPassword } from '../src/modules/identity/password.js';
import { createTokenService } from '../src/modules/identity/token.js';
import { createOrganizationController } from '../src/modules/organization/organizationController.js';
import { createOrganizationRepository } from '../src/modules/organization/organizationRepository.js';
import { createOrganizationService } from '../src/modules/organization/organizationService.js';
import { validateOrganizationScopes } from '../src/modules/organization/reconciliation.js';
import { closeServer, startServer } from '../src/server.js';
import { seed } from '../seeds/001_identity_catalog.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.equal(env.DB_HOST, '127.0.0.1');
assert.equal(env.DB_PORT, 3307);
assert.equal(env.DB_NAME, 'hrm_test');
const database = createDatabase(env);
const today = new Date().toISOString().slice(0, 10);
const requestContext = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const passed = [];
function pass(name) {
  passed.push(name);
  console.log(`PASS ${name}`);
}
async function rejects(operation, code) {
  try {
    await operation();
  } catch (error) {
    if (code) assert.equal(error.code, code);
    return error;
  }
  assert.fail('Expected rejection.');
}

async function reset() {
  const [[identity]] = await database.raw(
    'SELECT VERSION() AS version, DATABASE() AS database_name, @@port AS port',
  );
  assert.equal(identity.version, '8.0.46');
  assert.equal(identity.database_name, 'hrm_test');
  assert.equal(Number(identity.port), 3307);
  await database.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const table of [
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
      ])
        await trx(table).del();
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS=1');
    }
  });
  await seed(database);
}

let server;
try {
  await reset();
  const expectedTables = [
    'companies',
    'branches',
    'departments',
    'designations',
    'grades',
    'cost_centers',
    'work_calendars',
    'work_calendar_days',
    'holidays',
  ];
  const found = await database('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', expectedTables)
    .select({ name: 'table_name' });
  assert.deepEqual(found.map(({ name }) => name).sort(), expectedTables.sort());
  const constraintNames = [
    'fk_role_assignments_company',
    'fk_role_assignments_branch_company',
    'fk_role_assignments_department_company',
    'fk_user_permission_grants_company',
    'fk_user_permission_grants_branch_company',
    'fk_user_permission_grants_department_company',
    'fk_audit_events_company',
  ];
  const constraints = await database('information_schema.referential_constraints')
    .where({ constraint_schema: 'hrm_test' })
    .whereIn('constraint_name', constraintNames)
    .select({ name: 'constraint_name' });
  assert.deepEqual(constraints.map(({ name }) => name).sort(), constraintNames.sort());
  pass('organization schema and Phase 1B ownership foreign keys');

  const [companyId] = await database('companies').insert({
    code: 'PHASE2_PRIMARY',
    name: 'Phase 2 Primary Test Company',
    country_code: 'BD',
    currency_code: 'BDT',
    timezone: 'Asia/Dhaka',
    locale: 'en-BD',
  });
  const [otherCompanyId] = await database('companies').insert({
    code: 'PHASE2_SECONDARY',
    name: 'Phase 2 Secondary Test Company',
    status: 'inactive',
  });
  assert.notEqual(companyId, otherCompanyId);
  pass('dynamic multi-company-compatible fixtures');

  const password = 'Phase2-Verification-Password-99!';
  const [adminId] = await database('users').insert({
    email: 'phase2-admin@example.test',
    password_hash: await hashPassword(password),
    status: 'active',
  });
  const role = await database('roles').where({ code: 'system_administrator' }).first();
  await database('role_assignments').insert({
    user_id: adminId,
    role_id: role.id,
    company_id: companyId,
    scope_type: 'company',
    scope_key: `company:${companyId}`,
    effective_start: today,
    assigned_by: adminId,
  });
  await validateOrganizationScopes(database);
  await rejects(
    () =>
      database('role_assignments').insert({
        user_id: adminId,
        role_id: role.id,
        company_id: companyId,
        scope_type: 'all',
        scope_key: 'invalid',
        effective_start: today,
        assigned_by: adminId,
      }),
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
  pass('scope reconciliation and scope-shape enforcement');

  const repository = createOrganizationRepository(database);
  const service = createOrganizationService({ database, repository });
  const actor = { userId: adminId };
  const contextFor = (permission, scopeCompanyId = companyId) =>
    createAccessContext({
      actor,
      permission,
      grants: [{ scope_type: 'company', company_id: scopeCompanyId }],
    });

  const branch = await service.create(
    'branch',
    actor,
    contextFor('branch.create'),
    { companyId, code: 'DHK', name: 'Dhaka Branch', description: null, city: 'Dhaka' },
    requestContext(),
  );
  await rejects(
    () =>
      service.create(
        'branch',
        actor,
        contextFor('branch.create'),
        { companyId, code: 'DHK', name: 'Duplicate' },
        requestContext(),
      ),
    'DUPLICATE_RECORD',
  );
  await rejects(
    () =>
      service.create(
        'branch',
        actor,
        contextFor('branch.create'),
        { companyId: otherCompanyId, code: 'NOPE', name: 'Forbidden' },
        requestContext(),
      ),
    'NOT_FOUND',
  );
  const branchList = await service.list('branch', contextFor('branch.view'), {
    companyId,
    page: 1,
    pageSize: 20,
    sort: 'name',
    direction: 'asc',
  });
  assert.equal(branchList.items.length, 1);
  assert.equal(branchList.pagination.total, 1);
  const hiddenList = await service.list('branch', contextFor('branch.view'), {
    companyId: otherCompanyId,
    page: 1,
    pageSize: 20,
    sort: 'name',
    direction: 'asc',
  });
  assert.equal(hiddenList.items.length, 0);
  await rejects(() =>
    repository.listBranches(null, {
      companyId,
      page: 1,
      pageSize: 20,
      sort: 'name',
      direction: 'asc',
    }),
  );
  pass('branch lifecycle, duplicates, protected queries, counts, and company isolation');

  const parent = await service.create(
    'department',
    actor,
    contextFor('department.create'),
    { companyId, code: 'ROOT', name: 'Root Department' },
    requestContext(),
  );
  const child = await service.create(
    'department',
    actor,
    contextFor('department.create'),
    { companyId, code: 'CHILD', name: 'Child Department', parentDepartmentId: parent.id },
    requestContext(),
  );
  const parentRow = await repository.getDepartment(parent.id, contextFor('department.view'));
  await rejects(
    () =>
      service.update(
        'department',
        actor,
        contextFor('department.update'),
        parent.id,
        { version: parentRow.version, parentDepartmentId: child.id },
        requestContext(),
      ),
    'DEPARTMENT_CYCLE',
  );
  await rejects(async () => {
    const [otherDepartmentId] = await database('departments').insert({
      company_id: otherCompanyId,
      code: 'OTHER_ROOT',
      name: 'Other Company Root',
      status: 'active',
    });
    return database('departments').insert({
      company_id: companyId,
      parent_department_id: otherDepartmentId,
      code: 'CROSS',
      name: 'Cross',
      status: 'active',
    });
  });
  await rejects(
    () =>
      service.setStatus(
        'department',
        actor,
        contextFor('department.deactivate'),
        parent.id,
        'inactive',
        { version: parentRow.version, reason: 'Must be rejected' },
        requestContext(),
      ),
    'ACTIVE_DEPENDENCIES',
  );
  pass('department hierarchy and cycle protection');

  for (const [resource, code, name] of [
    ['designation', 'ENG', 'Engineer'],
    ['grade', 'G1', 'Grade One'],
    ['cost_center', 'CC1', 'Cost Center One'],
  ]) {
    const created = await service.create(
      resource,
      actor,
      contextFor(`${resource}.create`),
      { companyId, code, name, rank: resource === 'grade' ? 1 : null },
      requestContext(),
    );
    assert.ok(created.id);
  }
  pass('designation, grade, and cost-center masters');

  const calendar = await service.create(
    'work_calendar',
    actor,
    contextFor('work_calendar.create'),
    { companyId, code: 'STANDARD', name: 'Standard Calendar', timezone: 'Asia/Dhaka' },
    requestContext(),
  );
  await service.replaceCalendarDays(
    actor,
    contextFor('work_calendar.update'),
    calendar.id,
    {
      version: 1,
      days: Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        isWorkingDay: index < 5,
        startTime: index < 5 ? '09:00' : null,
        endTime: index < 5 ? '17:00' : null,
        breakMinutes: index < 5 ? 60 : 0,
      })),
    },
    requestContext(),
  );
  assert.equal(
    (await repository.getCalendarDays(calendar.id, contextFor('work_calendar.view'))).length,
    7,
  );
  const holiday = await service.create(
    'holiday',
    actor,
    contextFor('holiday.create'),
    {
      companyId,
      holidayDate: '2026-12-16',
      name: 'Victory Day',
      branchId: branch.id,
      workCalendarId: calendar.id,
    },
    requestContext(),
  );
  await service.cancelHoliday(
    actor,
    contextFor('holiday.cancel'),
    holiday.id,
    { version: 1, reason: 'Verification cancellation' },
    requestContext(),
  );
  assert.equal(
    (await repository.getHoliday(holiday.id, contextFor('holiday.view'))).status,
    'cancelled',
  );
  pass('work-calendar replacement and holiday cancellation');

  const branchRow = await repository.getBranch(branch.id, contextFor('branch.view'));
  await service.update(
    'branch',
    actor,
    contextFor('branch.update'),
    branch.id,
    { version: branchRow.version, name: 'Dhaka Main Branch' },
    requestContext(),
  );
  await rejects(
    () =>
      service.update(
        'branch',
        actor,
        contextFor('branch.update'),
        branch.id,
        { version: branchRow.version, name: 'Stale Update' },
        requestContext(),
      ),
    'STALE_VERSION',
  );
  const currentBranch = await repository.getBranch(branch.id, contextFor('branch.view'));
  await service.setStatus(
    'branch',
    actor,
    contextFor('branch.deactivate'),
    branch.id,
    'inactive',
    { version: currentBranch.version, reason: 'Verification' },
    requestContext(),
  );
  pass('optimistic concurrency and non-destructive deactivation');

  const authorizationRepository = createAuthorizationRepository(database);
  const authorizationService = createAuthorizationService({ authorizationRepository });
  const identityRepository = createIdentityRepository(database);
  const tokenService = createTokenService(env);
  const authService = createAuthService({ database, env, identityRepository, tokenService });
  const authenticate = createAuthenticationMiddleware({ tokenService, identityRepository });
  const organizationController = createOrganizationController(service);
  const app = createApp({
    env,
    logger: pino({ level: 'silent' }),
    database,
    authenticate,
    authController: createAuthController({ authService, authorizationService, env }),
    authService,
    authorizationService,
    accessService: {},
    userService: {},
    organizationController,
  });
  server = await startServer(app, { host: '127.0.0.1', port: 0 });
  const login = await authService.login({
    email: 'phase2-admin@example.test',
    password,
    requestContext: requestContext(),
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/organization/companies`, {
    headers: { authorization: `Bearer ${login.accessToken}` },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(
    payload.data.items.map(({ id }) => id),
    [companyId],
  );
  pass('authenticated API and permission-scoped company projection');

  const audits = await database('audit_events').whereIn('action_code', [
    'branch.create',
    'department.create',
    'designation.create',
    'grade.create',
    'cost_center.create',
    'work_calendar.create',
    'work_calendar.days_update',
    'holiday.create',
    'holiday.cancel',
    'branch.update',
    'branch.deactivate',
  ]);
  assert.ok(audits.length >= 11);
  assert.ok(
    audits.every(({ company_id: auditCompany }) => Number(auditCompany) === Number(companyId)),
  );
  pass('transactional company-scoped audit events');

  console.log(`SUMMARY ${passed.length} Phase 2 verification groups passed`);
} finally {
  if (server) await closeServer(server);
  await database.destroy();
}
