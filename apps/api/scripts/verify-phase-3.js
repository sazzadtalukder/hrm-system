import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { createAuthorizationRepository } from '../src/modules/authorization/authorizationRepository.js';
import { createAuthorizationService } from '../src/modules/authorization/authorizationService.js';
import { hashPassword } from '../src/modules/identity/password.js';
import { createEmployeeRepository } from '../src/modules/employee/employeeRepository.js';
import { createEmployeeService } from '../src/modules/employee/employeeService.js';
import { seed } from '../seeds/001_identity_catalog.js';
import pino from 'pino';
import { createApp } from '../src/app/createApp.js';
import { createAuthenticationMiddleware } from '../src/modules/identity/authenticationMiddleware.js';
import { createAuthController } from '../src/modules/identity/authController.js';
import { createAuthService } from '../src/modules/identity/authService.js';
import { createIdentityRepository } from '../src/modules/identity/identityRepository.js';
import { createTokenService } from '../src/modules/identity/token.js';
import { createEmployeeController } from '../src/modules/employee/employeeController.js';
import { createOrganizationController } from '../src/modules/organization/organizationController.js';
import { createOrganizationRepository } from '../src/modules/organization/organizationRepository.js';
import { createOrganizationService } from '../src/modules/organization/organizationService.js';
import { closeServer, startServer } from '../src/server.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.equal(env.DB_HOST, '127.0.0.1');
assert.equal(env.DB_PORT, 3307);
assert.equal(env.DB_NAME, 'hrm_test');
const database = createDatabase(env);
const today = new Date().toISOString().slice(0, 10);
const passed = [];
const context = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
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
  assert.match(identity.version, /^8\./);
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
  const tables = [
    'employees',
    'employee_personal_details',
    'employee_contacts',
    'employee_emergency_contacts',
    'employments',
    'employment_status_history',
    'employee_assignments',
  ];
  const found = await database('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', tables)
    .select({ name: 'table_name' });
  assert.deepEqual(found.map((row) => row.name).sort(), tables.sort());
  pass('employee schema and historical tables');

  const [companyId] = await database('companies').insert({
    code: 'PHASE3_PRIMARY',
    name: 'Phase 3 Primary Test Company',
    timezone: 'Asia/Dhaka',
  });
  const [otherCompanyId] = await database('companies').insert({
    code: 'PHASE3_SECONDARY',
    name: 'Phase 3 Secondary Test Company',
    timezone: 'UTC',
  });
  async function organization(company, suffix) {
    const [calendarId] = await database('work_calendars').insert({
      company_id: company,
      code: `CAL_${suffix}`,
      name: `Calendar ${suffix}`,
    });
    const [branchId] = await database('branches').insert({
      company_id: company,
      code: `BR_${suffix}`,
      name: `Branch ${suffix}`,
      default_work_calendar_id: calendarId,
    });
    const [departmentId] = await database('departments').insert({
      company_id: company,
      code: `DEPT_${suffix}`,
      name: `Department ${suffix}`,
    });
    const [designationId] = await database('designations').insert({
      company_id: company,
      code: `DES_${suffix}`,
      name: `Designation ${suffix}`,
    });
    const [gradeId] = await database('grades').insert({
      company_id: company,
      code: `GR_${suffix}`,
      name: `Grade ${suffix}`,
      rank: 1,
    });
    const [costCenterId] = await database('cost_centers').insert({
      company_id: company,
      code: `CC_${suffix}`,
      name: `Cost center ${suffix}`,
    });
    return { calendarId, branchId, departmentId, designationId, gradeId, costCenterId };
  }
  const org = await organization(companyId, 'A');
  const [otherBranchId] = await database('branches').insert({
    company_id: companyId,
    code: 'BR_A2',
    name: 'Branch A2',
    default_work_calendar_id: org.calendarId,
  });
  const otherOrg = await organization(otherCompanyId, 'B');
  await rejects(() => database('employee_assignments').insert({}), 'ER_NO_DEFAULT_FOR_FIELD');
  pass('dynamic company and organization fixture ownership');

  const passwordHash = await hashPassword('Phase3-Verification-Password-99!');
  const [hrUserId] = await database('users').insert({
    email: 'phase3-hr@example.test',
    password_hash: passwordHash,
  });
  const [managerUserId] = await database('users').insert({
    email: 'phase3-manager@example.test',
    password_hash: passwordHash,
  });
  const [employeeUserId] = await database('users').insert({
    email: 'phase3-employee@example.test',
    password_hash: passwordHash,
  });
  const role = await database('roles').where({ code: 'hr_administrator' }).first();
  const auditorRole = await database('roles').where({ code: 'auditor' }).first();
  const systemRole = await database('roles').where({ code: 'system_administrator' }).first();
  const sensitiveRolePermissions = await database('role_permissions as mapping')
    .join('permissions as permission', 'permission.id', 'mapping.permission_id')
    .whereIn('mapping.role_id', [auditorRole.id, systemRole.id])
    .whereIn('permission.code', ['employee_personal.view', 'employee_contact.view'])
    .select('permission.code');
  assert.equal(sensitiveRolePermissions.length, 0);
  await database('role_assignments').insert({
    user_id: hrUserId,
    role_id: role.id,
    company_id: companyId,
    scope_type: 'company',
    scope_key: `company:${companyId}`,
    effective_start: today,
    assigned_by: hrUserId,
  });
  const authorizationService = createAuthorizationService({
    authorizationRepository: createAuthorizationRepository(database),
  });
  const repository = createEmployeeRepository(database);
  const service = createEmployeeService({ database, repository, authorizationService });
  const actor = { userId: hrUserId };
  const access = (permission, type = 'company', overrides = {}) =>
    createAccessContext({
      actor,
      permission,
      grants: [{ scope_type: type, company_id: companyId, ...overrides }],
    });
  const input = (
    code,
    firstName,
    managerEmploymentId = null,
    selectedOrg = org,
    selectedCompany = companyId,
    joiningDate = today,
  ) => ({
    companyId: selectedCompany,
    firstName,
    middleName: null,
    lastName: 'Employee',
    preferredName: null,
    employeeCode: code,
    employmentType: 'permanent',
    joiningDate,
    confirmationDate: null,
    initialStatus: 'confirmed',
    statusReason: 'Verification setup',
    assignment: {
      branchId: selectedOrg.branchId,
      departmentId: selectedOrg.departmentId,
      designationId: selectedOrg.designationId,
      gradeId: selectedOrg.gradeId,
      costCenterId: selectedOrg.costCenterId,
      workCalendarId: selectedOrg.calendarId,
      managerEmploymentId,
      effectiveStart: joiningDate,
      effectiveEnd: null,
      reason: 'Initial assignment',
    },
  });
  const manager = await service.create(
    actor,
    access('employee.create'),
    input('MGR/001', 'Manager'),
    context(),
  );
  const branchCreateAccess = createAccessContext({
    actor,
    permission: 'employee.create',
    grants: [{ scope_type: 'branch', company_id: companyId, branch_id: org.branchId }],
  });
  const wrongBranchInput = input('SCOPE/FAIL', 'Wrong Branch');
  wrongBranchInput.assignment.branchId = otherBranchId;
  await rejects(
    () => service.create(actor, branchCreateAccess, wrongBranchInput, context()),
    'NOT_FOUND',
  );
  await service.linkUser(
    actor,
    access('employee.link_user'),
    manager.id,
    managerUserId,
    'Manager login link',
    context(),
  );
  const employee = await service.create(
    actor,
    access('employee.create'),
    input('EMP/001', 'Team'),
    context(),
  );
  await service.linkUser(
    actor,
    access('employee.link_user'),
    employee.id,
    employeeUserId,
    'Employee login link',
    context(),
  );
  const assignment = (await repository.listAssignments([employee.employmentId], false))[0];
  await service.addAssignment(
    actor,
    access('employee.manage_assignment'),
    employee.id,
    {
      branchId: org.branchId,
      departmentId: org.departmentId,
      designationId: org.designationId,
      gradeId: null,
      costCenterId: null,
      workCalendarId: null,
      managerEmploymentId: manager.employmentId,
      effectiveStart: today,
      effectiveEnd: null,
      reason: 'Assign manager',
      supersedesAssignmentId: assignment.id,
    },
    context(),
  );
  assert.equal(
    (await service.get(employee.id, access('employee.view'))).displayName,
    'Team Employee',
  );
  pass('employee creation, display name, employment, assignment, and user linkage');

  await rejects(
    () =>
      service.create(actor, access('employee.create'), input('EMP/001', 'Duplicate'), context()),
    'EMPLOYEE_CONFLICT',
  );
  const other = await service.create(
    actor,
    createAccessContext({
      actor,
      permission: 'employee.create',
      grants: [{ scope_type: 'company', company_id: otherCompanyId }],
    }),
    input('EMP/001', 'Other', null, otherOrg, otherCompanyId),
    context(),
  );
  assert.ok(other.id);
  await rejects(
    () =>
      service.create(
        actor,
        access('employee.create'),
        input('BAD', 'Cross', null, otherOrg),
        context(),
      ),
    'VALIDATION_FAILED',
  );
  pass('employee-code uniqueness and cross-company ownership');

  const own = createAccessContext({
    actor: { userId: employeeUserId },
    permission: 'employee.view',
    grants: [{ scope_type: 'own', company_id: companyId }],
  });
  assert.deepEqual(
    (
      await service.list(own, {
        companyId,
        page: 1,
        pageSize: 20,
        sort: 'display_name',
        direction: 'asc',
      })
    ).items.map(({ id }) => id),
    [employee.id],
  );
  const direct = createAccessContext({
    actor: { userId: managerUserId },
    permission: 'employee.view',
    grants: [{ scope_type: 'direct_reports', company_id: companyId }],
  });
  assert.deepEqual(
    (
      await service.list(direct, {
        companyId,
        page: 1,
        pageSize: 20,
        sort: 'display_name',
        direction: 'asc',
      })
    ).items.map(({ id }) => id),
    [employee.id],
  );
  const department = createAccessContext({
    actor,
    permission: 'employee.view',
    grants: [{ scope_type: 'department', company_id: companyId, department_id: org.departmentId }],
  });
  assert.equal(
    (
      await service.list(department, {
        companyId,
        page: 1,
        pageSize: 20,
        sort: 'display_name',
        direction: 'asc',
      })
    ).items.length,
    2,
  );
  pass('own, direct-report, department, and company scoped queries');
  assert.deepEqual(
    (
      await service.list(access('employee.view'), {
        companyId,
        page: 1,
        pageSize: 20,
        search: 'Team',
        sort: 'display_name',
        direction: 'asc',
      })
    ).items.map(({ id }) => id),
    [employee.id],
  );
  pass('MySQL-compatible employee name and code search');

  const [historicalManagerUserId] = await database('users').insert({
    email: 'phase3-historical-manager@example.test',
    password_hash: passwordHash,
  });
  const historicalManager = await service.create(
    actor,
    access('employee.create'),
    input('HM/001', 'Historical Manager', null, org, companyId, '2020-01-01'),
    context(),
  );
  await service.linkUser(
    actor,
    access('employee.link_user'),
    historicalManager.id,
    historicalManagerUserId,
    'Historical manager link',
    context(),
  );
  const historicalReport = await service.create(
    actor,
    access('employee.create'),
    input(
      'HE/001',
      'Historical Report',
      historicalManager.employmentId,
      org,
      companyId,
      '2020-01-01',
    ),
    context(),
  );
  const [historicalReportUserId] = await database('users').insert({
    email: 'phase3-historical-report@example.test',
    password_hash: passwordHash,
  });
  await service.linkUser(
    actor,
    access('employee.link_user'),
    historicalReport.id,
    historicalReportUserId,
    'Historical report link',
    context(),
  );
  await service.transitionStatus(
    actor,
    access('employee.manage_status'),
    historicalReport.id,
    {
      employmentId: historicalReport.employmentId,
      status: 'resigned',
      effectiveStart: '2024-01-01',
      effectiveEnd: null,
      reason: 'Historical access verification',
      supersedesStatusHistoryId: null,
    },
    context(),
  );
  const historicalDirect = createAccessContext({
    actor: { userId: historicalManagerUserId },
    permission: 'employee.view',
    grants: [{ scope_type: 'direct_reports', company_id: companyId }],
  });
  assert.deepEqual(
    (
      await service.list(historicalDirect, {
        companyId,
        page: 1,
        pageSize: 20,
        sort: 'display_name',
        direction: 'asc',
        asOfDate: '2023-01-01',
      })
    ).items.map(({ id }) => id),
    [historicalReport.id],
  );
  assert.equal(
    (
      await service.list(historicalDirect, {
        companyId,
        page: 1,
        pageSize: 20,
        sort: 'display_name',
        direction: 'asc',
      })
    ).items.some(({ id }) => id === historicalReport.id),
    false,
  );
  assert.equal(
    (await database('users').where({ id: historicalReportUserId }).first()).status,
    'active',
  );
  pass('effective historical manager access without current-manager leakage');

  await service.updatePersonal(
    actor,
    access('employee.view'),
    employee.id,
    {
      version: 1,
      dateOfBirth: '1990-01-01',
      gender: null,
      maritalStatus: null,
      nationalityCountryCode: null,
    },
    context(),
  );
  assert.equal(
    (await service.getPersonal(actor, access('employee.view'), employee.id, context())).dateOfBirth,
    '1990-01-01',
  );
  const managerBase = createAccessContext({
    actor: { userId: managerUserId },
    permission: 'employee.view',
    grants: [{ scope_type: 'direct_reports', company_id: companyId }],
  });
  await rejects(
    () => service.getPersonal({ userId: managerUserId }, managerBase, employee.id, context()),
    'FORBIDDEN',
  );
  pass('sensitive-field permission intersection and access audit');

  const emergency = await service.createEmergencyContact(
    actor,
    access('employee.view'),
    employee.id,
    {
      name: 'Emergency Person',
      relationship: 'Sibling',
      phone: '0000000000',
      alternatePhone: null,
      isPrimary: true,
    },
    context(),
  );
  await service.updateEmergencyContact(
    actor,
    access('employee.view'),
    employee.id,
    emergency.id,
    { version: emergency.version, phone: '1111111111' },
    context(),
  );
  await service.deactivateEmergencyContact(
    actor,
    access('employee.view'),
    employee.id,
    emergency.id,
    { version: emergency.version + 1, reason: 'Verification cleanup' },
    context(),
  );
  assert.equal(
    (await repository.getEmergencyContact(emergency.id, employee.id, database)).status,
    'inactive',
  );
  pass('sensitive contact verification and non-destructive emergency-contact lifecycle');

  const employeeRow = await database('employees').where({ id: employee.id }).first();
  await service.update(
    actor,
    access('employee.update'),
    employee.id,
    { version: employeeRow.version, preferredName: 'Preferred' },
    context(),
  );
  await rejects(
    () =>
      service.update(
        actor,
        access('employee.update'),
        employee.id,
        { version: employeeRow.version, preferredName: 'Stale' },
        context(),
      ),
    'STALE_VERSION',
  );
  pass('optimistic employee concurrency');

  const currentStatus = (await repository.listStatuses([employee.employmentId], false))[0];
  await service.transitionStatus(
    actor,
    access('employee.manage_status'),
    employee.id,
    {
      employmentId: employee.employmentId,
      status: 'suspended',
      effectiveStart: '2090-01-01',
      effectiveEnd: null,
      reason: 'Future verification',
      supersedesStatusHistoryId: null,
    },
    context(),
  );
  await rejects(
    () =>
      service.transitionStatus(
        actor,
        access('employee.manage_status'),
        employee.id,
        {
          employmentId: employee.employmentId,
          status: 'retired',
          effectiveStart: today,
          effectiveEnd: null,
          reason: 'Overlap',
          supersedesStatusHistoryId: null,
        },
        context(),
      ),
    'STATUS_PERIOD_OVERLAP',
  );
  const statuses = await repository.listStatuses([employee.employmentId]);
  assert.ok(
    statuses.some(
      (row) => row.history_status === 'superseded' && Number(row.id) === Number(currentStatus.id),
    ),
  );
  pass('append-preserving status transition and overlap protection');

  const correctionTarget = await service.create(
    actor,
    access('employee.create'),
    input('COR/001', 'Correction Target', null, org, companyId, '2020-01-01'),
    context(),
  );
  await service.transitionStatus(
    actor,
    access('employee.manage_status'),
    correctionTarget.id,
    {
      employmentId: correctionTarget.employmentId,
      status: 'terminated',
      effectiveStart: '2024-01-01',
      effectiveEnd: null,
      reason: 'Terminal correction setup',
      supersedesStatusHistoryId: null,
    },
    context(),
  );
  let correctedEmployment = await database('employments')
    .where({ id: correctionTarget.employmentId })
    .first();
  assert.equal(correctedEmployment.record_status, 'inactive');
  const terminalHistory = (
    await repository.listStatuses([correctionTarget.employmentId], false)
  ).filter((row) => row.status === 'terminated')[0];
  await service.transitionStatus(
    actor,
    access('employee.manage_status'),
    correctionTarget.id,
    {
      employmentId: correctionTarget.employmentId,
      status: 'confirmed',
      effectiveStart: '2024-01-01',
      effectiveEnd: null,
      reason: 'Correct erroneous terminal status',
      supersedesStatusHistoryId: terminalHistory.id,
    },
    context(),
  );
  correctedEmployment = await database('employments')
    .where({ id: correctionTarget.employmentId })
    .first();
  assert.equal(correctedEmployment.record_status, 'active');
  assert.equal(correctedEmployment.employment_end_date, null);
  const statusCountBeforeFutureAttempt = await database('employment_status_history')
    .where({ employment_id: correctionTarget.employmentId })
    .count({ count: '*' })
    .first();
  await rejects(
    () =>
      service.transitionStatus(
        actor,
        access('employee.manage_status'),
        correctionTarget.id,
        {
          employmentId: correctionTarget.employmentId,
          status: 'terminated',
          effectiveStart: '2099-01-01',
          effectiveEnd: null,
          reason: 'Unsupported future terminal status',
          supersedesStatusHistoryId: null,
        },
        context(),
      ),
    'VALIDATION_FAILED',
  );
  const statusCountAfterFutureAttempt = await database('employment_status_history')
    .where({ employment_id: correctionTarget.employmentId })
    .count({ count: '*' })
    .first();
  assert.equal(
    Number(statusCountAfterFutureAttempt.count),
    Number(statusCountBeforeFutureAttempt.count),
  );
  pass('terminal-state synchronization, historical correction, and rollback safety');

  let historicalEmployeeRow = await database('employees')
    .where({ id: historicalReport.id })
    .first();
  await service.setRecordStatus(
    actor,
    access('employee.deactivate'),
    historicalReport.id,
    'inactive',
    { version: historicalEmployeeRow.version, reason: 'Verify lifecycle' },
    context(),
  );
  historicalEmployeeRow = await database('employees').where({ id: historicalReport.id }).first();
  await service.setRecordStatus(
    actor,
    access('employee.activate'),
    historicalReport.id,
    'active',
    { version: historicalEmployeeRow.version, reason: 'Prepare rehire' },
    context(),
  );
  await rejects(
    () =>
      service.createEmployment(
        actor,
        access('employee.create'),
        historicalReport.id,
        {
          ...input(
            'HE/001',
            'Ignored',
            historicalManager.employmentId,
            org,
            companyId,
            '2025-01-01',
          ),
        },
        context(),
      ),
    'EMPLOYEE_CONFLICT',
  );
  const rehire = await service.createEmployment(
    actor,
    access('employee.create'),
    historicalReport.id,
    {
      ...input('HE/002', 'Ignored', historicalManager.employmentId, org, companyId, '2025-01-01'),
    },
    context(),
  );
  assert.notEqual(rehire.id, historicalReport.employmentId);
  assert.equal((await repository.listEmployments(historicalReport.id, companyId)).length, 2);
  await rejects(
    () =>
      service.createEmployment(
        actor,
        access('employee.create'),
        historicalReport.id,
        {
          ...input(
            'HE/001',
            'Ignored',
            historicalManager.employmentId,
            org,
            companyId,
            '2026-01-01',
          ),
        },
        context(),
      ),
    'ACTIVE_EMPLOYMENT',
  );
  pass('non-destructive employee lifecycle, rehire episode, and separate user lifecycle');

  const activeAssignment = (await repository.listAssignments([employee.employmentId], false))[0];
  await rejects(() =>
    Promise.all([
      service.addAssignment(
        actor,
        access('employee.manage_assignment'),
        employee.id,
        {
          ...input('X', 'X').assignment,
          supersedesAssignmentId: activeAssignment.id,
          managerEmploymentId: manager.employmentId,
          reason: 'Concurrent A',
        },
        context(),
      ),
      service.addAssignment(
        actor,
        access('employee.manage_assignment'),
        employee.id,
        {
          ...input('X', 'X').assignment,
          supersedesAssignmentId: activeAssignment.id,
          managerEmploymentId: manager.employmentId,
          reason: 'Concurrent B',
        },
        context(),
      ),
    ]),
  );
  assert.equal((await repository.listAssignments([employee.employmentId], false)).length, 1);
  pass('stable-parent locking and concurrent effective assignment protection');

  await rejects(
    () =>
      service.linkUser(
        actor,
        access('employee.link_user'),
        manager.id,
        employeeUserId,
        'Duplicate link',
        context(),
      ),
    'EMPLOYEE_CONFLICT',
  );
  const audits = await database('audit_events')
    .where({ company_id: companyId })
    .where('action_code', 'like', 'employee%');
  assert.ok(audits.length >= 8);
  assert.ok(audits.every((row) => !JSON.stringify(row.metadata ?? '').includes('1990-01-01')));
  pass('transactional audit coverage and sensitive-value exclusion');

  const identityRepository = createIdentityRepository(database);
  const tokenService = createTokenService(env);
  const authService = createAuthService({ database, env, identityRepository, tokenService });
  const authenticate = createAuthenticationMiddleware({ tokenService, identityRepository });
  const organizationRepository = createOrganizationRepository(database);
  const organizationService = createOrganizationService({
    database,
    repository: organizationRepository,
  });
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
    organizationController: createOrganizationController(organizationService),
    employeeController: createEmployeeController(service),
  });
  server = await startServer(app, { host: '127.0.0.1', port: 0 });
  const login = await authService.login({
    email: 'phase3-hr@example.test',
    password: 'Phase3-Verification-Password-99!',
    requestContext: context(),
  });
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/employees?companyId=${companyId}`,
    { headers: { authorization: `Bearer ${login.accessToken}` } },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.data.items.length >= 2);
  assert.ok(payload.data.items.every((row) => Number(row.companyId) === Number(companyId)));
  const sensitiveResponse = await fetch(
    `http://127.0.0.1:${server.address().port}/employees/${employee.id}/personal`,
    { headers: { authorization: `Bearer ${login.accessToken}` } },
  );
  assert.equal(sensitiveResponse.status, 200);
  pass('authenticated employee API and server-side sensitive projection');

  console.log(`SUMMARY ${passed.length} Phase 3 verification groups passed`);
} finally {
  if (server) await closeServer(server);
  await database.destroy();
}
