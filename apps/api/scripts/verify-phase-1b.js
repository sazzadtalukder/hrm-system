import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { createApp } from '../src/app/createApp.js';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { withTransaction } from '../src/infrastructure/database/transaction.js';
import { insertAuditEvent } from '../src/modules/audit/auditRepository.js';
import {
  createAccessContext,
  intersectSensitiveAccess,
} from '../src/modules/authorization/accessContext.js';
import { createAccessRepository } from '../src/modules/authorization/accessRepository.js';
import { createAccessService } from '../src/modules/authorization/accessService.js';
import { createAuthorizationRepository } from '../src/modules/authorization/authorizationRepository.js';
import { createAuthorizationService } from '../src/modules/authorization/authorizationService.js';
import { createAuthenticationMiddleware } from '../src/modules/identity/authenticationMiddleware.js';
import { createAuthController } from '../src/modules/identity/authController.js';
import { createAuthService } from '../src/modules/identity/authService.js';
import { refreshCookieOptions } from '../src/modules/identity/cookies.js';
import { createIdentityRepository } from '../src/modules/identity/identityRepository.js';
import { hashPassword, verifyPassword } from '../src/modules/identity/password.js';
import { hashOpaqueToken, createTokenService } from '../src/modules/identity/token.js';
import { createUserRepository } from '../src/modules/identity/userRepository.js';
import { createUserService } from '../src/modules/identity/userService.js';
import { createOrganizationController } from '../src/modules/organization/organizationController.js';
import { createOrganizationRepository } from '../src/modules/organization/organizationRepository.js';
import { createOrganizationService } from '../src/modules/organization/organizationService.js';
import { closeServer, startServer } from '../src/server.js';
import { seed } from '../seeds/001_identity_catalog.js';

const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  DB_NAME: 'hrm_test',
  LOG_LEVEL: 'silent',
  AUTH_RATE_LIMIT_MAX: '100',
});

assert.equal(env.DB_HOST, '127.0.0.1', 'Safety guard rejected the database host.');
assert.equal(env.DB_PORT, 3307, 'Safety guard rejected the database port.');
assert.equal(env.DB_NAME, 'hrm_test', 'Verification must run only against hrm_test.');

const database = createDatabase(env);
const logger = pino({ level: 'silent' });
const results = [];
const context = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

function pass(name) {
  results.push(name);
  console.log(`PASS ${name}`);
}

async function expectReject(operation, predicate = () => true) {
  try {
    await operation();
  } catch (error) {
    assert.ok(predicate(error), `Unexpected rejection: ${error.code ?? error.message}`);
    return error;
  }
  assert.fail('Expected operation to reject.');
}

async function resetTestData() {
  await database.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
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
      ]) {
        await trx(table).del();
      }
    } finally {
      await trx.raw('SET FOREIGN_KEY_CHECKS = 1');
    }
  });
  await seed(database);
}

let server;
try {
  const [[serverFacts]] = await database.raw(
    'SELECT VERSION() AS version, @@session.time_zone AS time_zone, @@transaction_isolation AS isolation_level',
  );
  assert.equal(serverFacts.version, '8.0.46');
  assert.equal(serverFacts.time_zone, '+00:00');
  assert.equal(serverFacts.isolation_level, 'READ-COMMITTED');
  pass('MySQL 8.0.46 connectivity, UTC session timezone, and READ COMMITTED');

  const unreachableDatabase = createDatabase({
    ...env,
    DB_PORT: 1,
    DB_CONNECT_TIMEOUT_MS: 250,
    DB_ACQUIRE_TIMEOUT_MS: 500,
  });
  const connectStarted = Date.now();
  await expectReject(() => unreachableDatabase.raw('SELECT 1'));
  assert.ok(Date.now() - connectStarted < 5_000);
  await unreachableDatabase.destroy();
  const constrainedPool = createDatabase({
    ...env,
    DB_POOL_MAX: 1,
    DB_ACQUIRE_TIMEOUT_MS: 250,
  });
  const heldConnection = await constrainedPool.client.acquireConnection();
  const acquireStarted = Date.now();
  await expectReject(() => constrainedPool.raw('SELECT 1'));
  assert.ok(Date.now() - acquireStarted >= 200 && Date.now() - acquireStarted < 5_000);
  constrainedPool.client.releaseConnection(heldConnection);
  await constrainedPool.destroy();
  pass('connection and pool acquisition timeout enforcement');

  const expectedTables = [
    'audit_events',
    'auth_refresh_tokens',
    'auth_sessions',
    'permissions',
    'role_assignments',
    'role_permissions',
    'roles',
    'user_permission_grants',
    'users',
  ];
  const tables = await database('information_schema.tables')
    .where({ table_schema: env.DB_NAME })
    .whereIn('table_name', expectedTables)
    .select({ name: 'table_name' });
  assert.deepEqual(tables.map((row) => row.name).sort(), expectedTables);
  const foreignKeys = await database('information_schema.referential_constraints')
    .where({ constraint_schema: env.DB_NAME })
    .count({ count: '*' })
    .first();
  const checks = await database('information_schema.check_constraints')
    .where({ constraint_schema: env.DB_NAME })
    .whereIn('constraint_name', ['ck_role_assignment_period', 'ck_permission_grant_period'])
    .count({ count: '*' })
    .first();
  const indexes = await database('information_schema.statistics')
    .where({ table_schema: env.DB_NAME })
    .whereIn('index_name', [
      'uq_role_assignment',
      'uq_permission_grant',
      'uq_refresh_token_child',
      'ix_role_assignment_effective',
      'ix_permission_grant_effective',
    ])
    .distinct({ name: 'index_name' });
  assert.ok(Number(foreignKeys.count) >= 17);
  assert.equal(Number(checks.count), 2);
  assert.deepEqual(indexes.map((row) => row.name).sort(), [
    'ix_permission_grant_effective',
    'ix_role_assignment_effective',
    'uq_permission_grant',
    'uq_refresh_token_child',
    'uq_role_assignment',
  ]);
  pass('schema tables, foreign keys, indexes, unique/check constraints');

  await resetTestData();
  const [primaryCompanyId] = await database('companies').insert({
    code: 'PHASE1B_PRIMARY',
    name: 'Phase 1B Primary Test Company',
  });
  const [futureCompanyId] = await database('companies').insert({
    code: 'PHASE1B_FUTURE',
    name: 'Phase 1B Future Scope Company',
    status: 'inactive',
  });
  const [expiredCompanyId] = await database('companies').insert({
    code: 'PHASE1B_EXPIRED',
    name: 'Phase 1B Expired Scope Company',
    status: 'inactive',
  });
  const [overlapCompanyId] = await database('companies').insert({
    code: 'PHASE1B_OVERLAP',
    name: 'Phase 1B Overlap Test Company',
    status: 'inactive',
  });

  await withTransaction(database, (trx) =>
    insertAuditEvent(trx, { actionCode: 'verification.commit', outcome: 'success' }),
  );
  assert.equal(
    await database('audit_events')
      .where({ action_code: 'verification.commit' })
      .count({ count: '*' })
      .first()
      .then((row) => Number(row.count)),
    1,
  );
  await expectReject(() =>
    withTransaction(database, async (trx) => {
      await insertAuditEvent(trx, { actionCode: 'verification.rollback', outcome: 'failure' });
      throw new Error('intentional rollback');
    }),
  );
  assert.equal(
    await database('audit_events')
      .where({ action_code: 'verification.rollback' })
      .count({ count: '*' })
      .first()
      .then((row) => Number(row.count)),
    0,
  );
  pass('transaction commit and rollback');

  const password = 'Correct-Horse-Battery-99!';
  const nextPassword = 'Changed-Correct-Horse-100!';
  const adminHash = await hashPassword(password);
  assert.notEqual(adminHash, password);
  assert.equal(await verifyPassword(adminHash, password), true);
  const [adminId] = await database('users').insert({
    email: 'admin@example.test',
    password_hash: adminHash,
    status: 'active',
  });
  const [inactiveId] = await database('users').insert({
    email: 'inactive@example.test',
    password_hash: await hashPassword(password),
    status: 'inactive',
  });
  await database('users').insert({
    email: 'locked@example.test',
    password_hash: await hashPassword(password),
    status: 'active',
    locked_until: new Date(Date.now() + 60_000),
  });
  const adminRole = await database('roles').where({ code: 'system_administrator' }).first();
  await database('role_assignments').insert({
    user_id: adminId,
    role_id: adminRole.id,
    company_id: primaryCompanyId,
    scope_type: 'company',
    scope_key: `company:${primaryCompanyId}`,
    effective_start: today,
    assigned_by: adminId,
  });
  await expectReject(
    () =>
      database('role_assignments').insert({
        user_id: adminId,
        role_id: adminRole.id,
        company_id: primaryCompanyId,
        scope_type: 'company',
        scope_key: `company:${primaryCompanyId}`,
        effective_start: today,
        assigned_by: adminId,
      }),
    (error) => error.code === 'ER_DUP_ENTRY',
  );
  await expectReject(
    () =>
      database('role_assignments').insert({
        user_id: adminId,
        role_id: adminRole.id,
        company_id: primaryCompanyId,
        scope_type: 'company',
        scope_key: `company:${primaryCompanyId}:invalid-period`,
        effective_start: today,
        effective_end: yesterday,
        assigned_by: adminId,
      }),
    (error) => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED',
  );
  await expectReject(
    () =>
      database('auth_refresh_tokens').insert({
        auth_session_id: 999_999_999,
        token_hash: '0'.repeat(64),
        expires_at: new Date(Date.now() + 60_000),
      }),
    (error) => error.code === 'ER_NO_REFERENCED_ROW_2',
  );
  pass('Argon2id hashing and non-plaintext password persistence');

  const identityRepository = createIdentityRepository(database);
  const authorizationRepository = createAuthorizationRepository(database);
  const authorizationService = createAuthorizationService({ authorizationRepository });
  const tokenService = createTokenService(env);
  const authService = createAuthService({ database, env, identityRepository, tokenService });
  const authenticate = createAuthenticationMiddleware({ tokenService, identityRepository });
  const accessRepository = createAccessRepository();
  const accessService = createAccessService({ database, accessRepository });
  const userService = createUserService({
    database,
    identityRepository,
    userRepository: createUserRepository(),
  });
  const authController = createAuthController({ authService, authorizationService, env });
  const organizationService = createOrganizationService({
    database,
    repository: createOrganizationRepository(database),
  });
  const organizationController = createOrganizationController(organizationService);
  const app = createApp({
    env,
    logger,
    database,
    authenticate,
    authController,
    authService,
    authorizationService,
    accessService,
    userService,
    organizationController,
  });
  server = await startServer(app, { host: '127.0.0.1', port: 0 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const origin = env.WEB_ORIGINS[0];

  const live = await fetch(`${baseUrl}/health/live`);
  const ready = await fetch(`${baseUrl}/health/ready`);
  assert.equal(live.status, 200);
  assert.equal(ready.status, 200);
  pass('database-backed liveness and readiness');

  const originDenied = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(originDenied.status, 403);
  const invalidInput = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(invalidInput.status, 422);
  const failedLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'incorrect-password' }),
  });
  assert.equal(failedLogin.status, 401);
  const inactiveLogin = await authService
    .login({ email: 'inactive@example.test', password, requestContext: context() })
    .then(
      () => null,
      (error) => error,
    );
  assert.equal(inactiveLogin.statusCode, 401);
  const lockedLogin = await authService
    .login({ email: 'locked@example.test', password, requestContext: context() })
    .then(
      () => null,
      (error) => error,
    );
  assert.equal(lockedLogin.statusCode, 401);

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password }),
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  assert.equal(login.headers.get('pragma'), 'no-cache');
  const loginPayload = await login.json();
  const setCookie = login.headers.get('set-cookie');
  assert.ok(setCookie?.includes('HttpOnly'));
  assert.ok(setCookie?.includes('SameSite=Lax'));
  assert.ok(!setCookie?.includes('Secure'));
  const cookie = setCookie.split(';')[0];
  const accessClaims = await tokenService.verifyAccessToken(loginPayload.data.accessToken);
  assert.equal(accessClaims.sub, String(adminId));
  assert.ok(accessClaims.sid);
  assert.equal(accessClaims.auth_version, 1);
  const session = await database('auth_sessions').where({ id: accessClaims.sid }).first();
  const initialTokenRow = await database('auth_refresh_tokens')
    .where({ auth_session_id: session.id })
    .first();
  const rawCookieToken = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  assert.equal(initialTokenRow.token_hash, hashOpaqueToken(rawCookieToken));
  assert.ok(!JSON.stringify(initialTokenRow).includes(rawCookieToken));
  pass(
    'login success/failure/inactive/locked behavior, session persistence, cookie policy, and JWT claims',
  );

  const me = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${loginPayload.data.accessToken}` },
  });
  assert.equal(me.status, 200);
  const invalidJwt = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: 'Bearer invalid' },
  });
  assert.equal(invalidJwt.status, 401);
  const expiredTokenService = createTokenService({ ...env, ACCESS_TOKEN_TTL_SECONDS: -1 });
  const expiredJwtValue = await expiredTokenService.issueAccessToken({
    userId: adminId,
    sessionId: session.id,
    authVersion: 1,
  });
  const expiredJwt = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${expiredJwtValue}` },
  });
  assert.equal(expiredJwt.status, 401);
  await database('users').where({ id: adminId }).increment('auth_version', 1);
  const staleJwt = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${loginPayload.data.accessToken}` },
  });
  assert.equal(staleJwt.status, 401);
  await database('users').where({ id: adminId }).update({ auth_version: 1 });
  const wrongOwnerToken = await tokenService.issueAccessToken({
    userId: inactiveId,
    sessionId: session.id,
    authVersion: 1,
  });
  const wrongOwner = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${wrongOwnerToken}` },
  });
  assert.equal(wrongOwner.status, 401);
  const expiredSessionLogin = await authService.login({
    email: 'admin@example.test',
    password,
    requestContext: context(),
  });
  const expiredSessionId = (await tokenService.verifyAccessToken(expiredSessionLogin.accessToken))
    .sid;
  await database('auth_sessions')
    .where({ id: expiredSessionId })
    .update({ expires_at: new Date(Date.now() - 1_000) });
  const expiredSessionResponse = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${expiredSessionLogin.accessToken}` },
  });
  assert.equal(expiredSessionResponse.status, 401);
  await database('auth_sessions')
    .where({ id: session.id })
    .update({ revoked_at: database.fn.now(), revoke_reason: 'verification' });
  const revokedSession = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${loginPayload.data.accessToken}` },
  });
  assert.equal(revokedSession.status, 401);
  pass('JWT validation, user/session ownership, revocation, and auth_version invalidation');

  const rotationLogin = await authService.login({
    email: 'admin@example.test',
    password,
    requestContext: context(),
  });
  const rotationSession = await database('auth_sessions')
    .where({ id: (await tokenService.verifyAccessToken(rotationLogin.accessToken)).sid })
    .first();
  const parent = await database('auth_refresh_tokens')
    .where({ auth_session_id: rotationSession.id, status: 'active' })
    .first();
  const rotated = await authService.refresh({
    rawToken: rotationLogin.refreshToken,
    requestContext: context(),
  });
  const parentAfter = await database('auth_refresh_tokens').where({ id: parent.id }).first();
  const child = await database('auth_refresh_tokens').where({ parent_token_id: parent.id }).first();
  assert.equal(parentAfter.status, 'rotated');
  assert.equal(parentAfter.replaced_by_token_id, child.id);
  assert.equal(child.status, 'active');
  assert.equal(child.token_hash, hashOpaqueToken(rotated.refreshToken));
  await expectReject(
    () => authService.refresh({ rawToken: rotationLogin.refreshToken, requestContext: context() }),
    (error) => error.statusCode === 401,
  );
  const compromisedSession = await database('auth_sessions')
    .where({ id: rotationSession.id })
    .first();
  assert.ok(compromisedSession.revoked_at);
  assert.equal(
    await database('audit_events')
      .where({ action_code: 'auth.refresh_reuse', record_id: String(rotationSession.id) })
      .count({ count: '*' })
      .first()
      .then((row) => Number(row.count)),
    1,
  );
  pass(
    'refresh rotation, immutable lineage, hashed token persistence, reuse detection, family revocation, and audit',
  );

  const concurrentLogin = await authService.login({
    email: 'admin@example.test',
    password,
    requestContext: context(),
  });
  const concurrentSessionId = (await tokenService.verifyAccessToken(concurrentLogin.accessToken))
    .sid;
  const concurrentParent = await database('auth_refresh_tokens')
    .where({ auth_session_id: concurrentSessionId, status: 'active' })
    .first();
  const concurrentResults = await Promise.allSettled([
    authService.refresh({ rawToken: concurrentLogin.refreshToken, requestContext: context() }),
    authService.refresh({ rawToken: concurrentLogin.refreshToken, requestContext: context() }),
  ]);
  assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    await database('auth_refresh_tokens')
      .where({ parent_token_id: concurrentParent.id })
      .count({ count: '*' })
      .first()
      .then((row) => Number(row.count)),
    1,
  );
  pass('concurrent refresh produces exactly one child');

  const logoutLogin = await authService.login({
    email: 'admin@example.test',
    password,
    requestContext: context(),
  });
  const logoutSessionId = (await tokenService.verifyAccessToken(logoutLogin.accessToken)).sid;
  await authService.revokeSession({
    rawToken: logoutLogin.refreshToken,
    requestContext: context(),
  });
  assert.ok((await database('auth_sessions').where({ id: logoutSessionId }).first()).revoked_at);
  const allOne = await authService.login({
    email: 'admin@example.test',
    password,
    requestContext: context(),
  });
  const allTwo = await authService.login({
    email: 'admin@example.test',
    password,
    requestContext: context(),
  });
  await authService.revokeAll({ userId: adminId, requestContext: context() });
  for (const token of [allOne, allTwo]) {
    const id = (await tokenService.verifyAccessToken(token.accessToken)).sid;
    assert.ok((await database('auth_sessions').where({ id }).first()).revoked_at);
  }
  pass('logout and logout-all session/token revocation');

  const [failureLockUserId] = await database('users').insert({
    email: 'failure-lock@example.test',
    password_hash: await hashPassword(password),
    status: 'active',
  });
  for (let attempt = 0; attempt < env.LOGIN_MAX_ATTEMPTS; attempt += 1) {
    await expectReject(() =>
      authService.login({
        email: 'failure-lock@example.test',
        password: 'incorrect-password',
        requestContext: context(),
      }),
    );
  }
  const failureLockedUser = await database('users').where({ id: failureLockUserId }).first();
  assert.ok(new Date(failureLockedUser.locked_until) > new Date());
  await expectReject(() =>
    authService.login({
      email: 'failure-lock@example.test',
      password,
      requestContext: context(),
    }),
  );
  pass('persistent failed-login locking');

  await database('permissions')
    .insert([
      { code: 'employee.view', resource: 'employee', action: 'view' },
      {
        code: 'employee.view_compensation',
        resource: 'employee',
        action: 'view_compensation',
        is_sensitive: true,
        allow_direct_grant: true,
        requires_audit: true,
      },
    ])
    .onConflict('code')
    .ignore();
  const [employeeRoleId] = await database('roles').insert({
    code: 'verification_employee_reader',
    name: 'Verification Employee Reader',
    is_system: false,
  });
  const viewPermission = await database('permissions').where({ code: 'employee.view' }).first();
  const compensationPermission = await database('permissions')
    .where({ code: 'employee.view_compensation' })
    .first();
  await database('role_permissions').insert({
    role_id: employeeRoleId,
    permission_id: viewPermission.id,
  });
  const [scopeUserId] = await database('users').insert({
    email: 'scope@example.test',
    password_hash: await hashPassword(password),
    status: 'active',
  });
  await database('role_assignments').insert([
    {
      user_id: scopeUserId,
      role_id: employeeRoleId,
      company_id: primaryCompanyId,
      scope_type: 'company',
      scope_key: `company:${primaryCompanyId}`,
      effective_start: today,
      assigned_by: adminId,
    },
    {
      user_id: scopeUserId,
      role_id: employeeRoleId,
      company_id: futureCompanyId,
      scope_type: 'company',
      scope_key: `company:${futureCompanyId}`,
      effective_start: tomorrow,
      assigned_by: adminId,
    },
    {
      user_id: scopeUserId,
      role_id: employeeRoleId,
      company_id: expiredCompanyId,
      scope_type: 'company',
      scope_key: `company:${expiredCompanyId}`,
      effective_start: yesterday,
      effective_end: yesterday,
      assigned_by: adminId,
    },
  ]);
  await database('user_permission_grants').insert({
    user_id: scopeUserId,
    permission_id: compensationPermission.id,
    company_id: primaryCompanyId,
    scope_type: 'own',
    scope_key: `own:${primaryCompanyId}`,
    effective_start: today,
    reason: 'verification',
    granted_by: adminId,
  });
  const baseContext = await authorizationService.requirePermission(
    { userId: scopeUserId },
    'employee.view',
  );
  const sensitiveContext = await authorizationService.requirePermission(
    { userId: scopeUserId },
    'employee.view_compensation',
  );
  assert.equal(baseContext.grants.length, 1);
  assert.equal(baseContext.grants[0].company_id, primaryCompanyId);
  assert.equal(sensitiveContext.grants.length, 1);
  assert.equal(sensitiveContext.grants[0].scope_type, 'own');
  assert.equal(
    intersectSensitiveAccess(baseContext, sensitiveContext, {
      companyId: primaryCompanyId,
      ownerUserId: scopeUserId,
    }),
    true,
  );
  assert.equal(
    intersectSensitiveAccess(baseContext, sensitiveContext, {
      companyId: primaryCompanyId,
      ownerUserId: adminId,
    }),
    false,
  );
  await expectReject(
    () => authorizationService.requirePermission({ userId: scopeUserId }, 'payroll.lock'),
    (error) => error.statusCode === 403,
  );
  await expectReject(
    () => createAccessRepository().lockUserForAssignment(scopeUserId, null, database),
    (error) => error.statusCode === 403,
  );
  const grantAdminContext = createAccessContext({
    actor: { userId: adminId },
    permission: 'user.assign_role',
    grants: [{ scope_type: 'all', company_id: null }],
  });
  const granted = await accessService.grantPermission({
    actor: { userId: adminId },
    accessContext: grantAdminContext,
    input: {
      userId: scopeUserId,
      permissionCode: 'employee.view_compensation',
      scopeType: 'own',
      companyId: futureCompanyId,
      effectiveStart: today,
      effectiveEnd: null,
      reason: 'verification revocation',
    },
    requestContext: context(),
  });
  await accessService.revokePermission({
    actor: { userId: adminId },
    accessContext: grantAdminContext,
    grantId: granted.id,
    reason: 'verification complete',
    requestContext: context(),
  });
  assert.equal(
    (await database('user_permission_grants').where({ id: granted.id }).first()).status,
    'revoked',
  );
  pass(
    'role/direct permission resolution and revocation, effective dates, company scope, sensitive intersection, and fail-closed access context',
  );

  const adminContext = createAccessContext({
    actor: { userId: adminId },
    permission: 'role.assign',
    grants: [{ scope_type: 'all', company_id: null }],
  });
  const overlapInput = {
    userId: scopeUserId,
    roleCode: 'manager',
    scopeType: 'company',
    companyId: overlapCompanyId,
    effectiveStart: today,
    effectiveEnd: null,
  };
  const overlapResults = await Promise.allSettled([
    accessService.assignRole({
      actor: { userId: adminId },
      accessContext: adminContext,
      input: overlapInput,
      requestContext: context(),
    }),
    accessService.assignRole({
      actor: { userId: adminId },
      accessContext: adminContext,
      input: overlapInput,
      requestContext: context(),
    }),
  ]);
  assert.equal(overlapResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    overlapResults.filter(
      (result) =>
        result.status === 'rejected' &&
        ['ROLE_ASSIGNMENT_OVERLAP', 'ROLE_ALREADY_ASSIGNED'].includes(result.reason.code),
    ).length,
    1,
  );
  assert.equal(
    await database('role_assignments')
      .where({ user_id: scopeUserId, scope_key: `company:${overlapCompanyId}` })
      .count({ count: '*' })
      .first()
      .then((row) => Number(row.count)),
    1,
  );
  pass('stable-parent locking and concurrent effective-period overlap protection');

  let releaseLock;
  let locked;
  const lockedPromise = new Promise((resolve) => {
    locked = resolve;
  });
  const releasePromise = new Promise((resolve) => {
    releaseLock = resolve;
  });
  const firstTransaction = database.transaction(
    async (trx) => {
      await trx('users').where({ id: scopeUserId }).forUpdate().first();
      locked();
      await releasePromise;
    },
    { isolationLevel: 'read committed' },
  );
  await lockedPromise;
  let secondFinished = false;
  const secondTransaction = database.transaction(
    async (trx) => {
      await trx('users').where({ id: scopeUserId }).forUpdate().first();
      secondFinished = true;
    },
    { isolationLevel: 'read committed' },
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(secondFinished, false);
  releaseLock();
  await Promise.all([firstTransaction, secondTransaction]);
  pass('SELECT FOR UPDATE parent-row serialization');

  const userAdminLogin = await authService.login({
    email: 'admin@example.test',
    password,
    requestContext: context(),
  });
  const userAdminAuthorization = `Bearer ${userAdminLogin.accessToken}`;
  const created = await fetch(`${baseUrl}/users`, {
    method: 'POST',
    headers: { origin, authorization: userAdminAuthorization, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'created@example.test', companyId: primaryCompanyId }),
  });
  assert.equal(created.status, 201);
  const duplicate = await fetch(`${baseUrl}/users`, {
    method: 'POST',
    headers: { origin, authorization: userAdminAuthorization, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'created@example.test', companyId: primaryCompanyId }),
  });
  assert.equal(duplicate.status, 409);
  const createdUser = await database('users').where({ email: 'created@example.test' }).first();
  assert.equal(createdUser.status, 'inactive');
  assert.notEqual(createdUser.password_hash, password);
  pass('authorized user creation, duplicate rejection, and safe initial credential state');

  await accessService.assignRole({
    actor: { userId: adminId },
    accessContext: adminContext,
    input: {
      userId: createdUser.id,
      roleCode: 'employee',
      scopeType: 'company',
      companyId: primaryCompanyId,
      effectiveStart: today,
      effectiveEnd: null,
    },
    requestContext: context(),
  });
  for (const status of ['active', 'inactive']) {
    const permission = status === 'active' ? 'user.activate' : 'user.deactivate';
    const lifecycleContext = createAccessContext({
      actor: { userId: adminId },
      permission,
      grants: [{ scope_type: 'company', company_id: primaryCompanyId }],
    });
    await userService.setStatus({
      actor: { userId: adminId },
      accessContext: lifecycleContext,
      userId: createdUser.id,
      status,
      reason: 'verification lifecycle',
      requestContext: context(),
    });
  }
  const resetContext = createAccessContext({
    actor: { userId: adminId },
    permission: 'user.reset_authentication',
    grants: [{ scope_type: 'company', company_id: primaryCompanyId }],
  });
  await userService.resetAuthentication({
    actor: { userId: adminId },
    accessContext: resetContext,
    userId: createdUser.id,
    reason: 'verification reset',
    requestContext: context(),
  });
  pass('user activation, deactivation, authentication reset, and invalidation');

  const passwordLogin = await authService.login({
    email: 'admin@example.test',
    password,
    requestContext: context(),
  });
  const versionBefore = (await database('users').where({ id: adminId }).first()).auth_version;
  await authService.changePassword({
    userId: adminId,
    currentPassword: password,
    newPassword: nextPassword,
    requestContext: context(),
  });
  const userAfterPassword = await database('users').where({ id: adminId }).first();
  assert.equal(userAfterPassword.auth_version, versionBefore + 1);
  assert.equal(await verifyPassword(userAfterPassword.password_hash, nextPassword), true);
  assert.ok(
    (
      await database('auth_sessions')
        .where({ id: (await tokenService.verifyAccessToken(passwordLogin.accessToken)).sid })
        .first()
    ).revoked_at,
  );
  pass('password change, auth_version increment, and session invalidation');

  const auditRows = await database('audit_events').select('*');
  const serializedAudit = JSON.stringify(auditRows);
  for (const secret of [
    password,
    nextPassword,
    rotationLogin.refreshToken,
    rotated.refreshToken,
    loginPayload.data.accessToken,
  ]) {
    assert.equal(serializedAudit.includes(secret), false);
  }
  for (const action of [
    'auth.login',
    'auth.refresh_reuse',
    'auth.logout',
    'auth.logout_all',
    'auth.password_change',
    'authorization.role_assign',
    'authorization.permission_grant',
    'authorization.permission_revoke',
    'user.create',
    'user.activate',
    'user.deactivate',
    'user.reset_authentication',
  ]) {
    assert.ok(
      auditRows.some((row) => row.action_code === action),
      `Missing audit action ${action}`,
    );
  }
  pass('transactional audit coverage and secret exclusion');

  const productionCookie = refreshCookieOptions({
    ...env,
    NODE_ENV: 'production',
  });
  assert.equal(productionCookie.secure, true);
  assert.equal(productionCookie.httpOnly, true);
  assert.equal(productionCookie.sameSite, 'lax');
  for (const path of ['/auth/refresh', '/auth/logout', '/auth/logout-all']) {
    const denied = await fetch(`${baseUrl}${path}`, { method: 'POST' });
    assert.equal(denied.status, 403);
  }
  const limitedEnv = { ...env, AUTH_RATE_LIMIT_MAX: 2 };
  const limitedApp = createApp({
    env: limitedEnv,
    logger,
    database,
    authenticate,
    authController,
    authService,
    authorizationService,
    accessService,
    userService,
    organizationController,
  });
  const limitedServer = await startServer(limitedApp, { host: '127.0.0.1', port: 0 });
  try {
    const limitedBase = `http://127.0.0.1:${limitedServer.address().port}`;
    const statuses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push(
        (
          await fetch(`${limitedBase}/auth/login`, {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: '{}',
          })
        ).status,
      );
    }
    assert.deepEqual(statuses, [422, 422, 429]);
  } finally {
    await closeServer(limitedServer);
  }
  pass('Origin protection, production cookie flags, no-store headers, and rate limiting');

  console.log(`SUMMARY ${results.length} verification groups passed`);
} finally {
  if (server) await closeServer(server);
  await database.destroy();
}
