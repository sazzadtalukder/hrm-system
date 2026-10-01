import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.deepEqual([env.DB_HOST, env.DB_PORT, env.DB_NAME], ['127.0.0.1', 3307, 'hrm_test']);
const db = createDatabase(env),
  passed = [];
const pass = (name) => {
  passed.push(name);
  console.log(`PASS ${name}`);
};
const tables = [
  'employee_exits',
  'employee_exit_versions',
  'employee_exit_state_events',
  'employee_exit_clearances',
  'final_settlements',
  'final_settlement_versions',
  'final_settlement_items',
  'final_settlement_state_events',
  'final_settlement_payments',
  'notifications',
  'notification_preferences',
  'audit_review_events',
];
try {
  const [[identity]] = await db.raw(
    'SELECT VERSION() version,DATABASE() database_name,@@port port,@@transaction_isolation isolation_level',
  );
  assert.match(identity.version, /^8\./);
  assert.deepEqual(
    [identity.database_name, Number(identity.port), identity.isolation_level],
    ['hrm_test', 3307, 'READ-COMMITTED'],
  );
  pass('guarded database identity');
  const existing = await db('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', tables)
    .pluck('table_name');
  assert.equal(existing.length, tables.length);
  pass('Phase 16-20 schema');
  const required = [
    'exit.view',
    'exit.submit',
    'exit.manager_approve',
    'exit.approve',
    'exit.complete',
    'final_settlement.view',
    'final_settlement.approve',
    'final_settlement.record_payment',
    'report.workforce',
    'notification.view_own',
    'notification.create',
    'audit.view',
    'audit.review',
    'security_session.view',
  ];
  const permissions = await db('permissions').whereIn('code', required).pluck('code');
  assert.equal(permissions.length, required.length);
  pass('permission catalog');
  const paymentGrant = await db('role_permissions as rp')
    .join('roles as r', 'r.id', 'rp.role_id')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where({ 'r.code': 'finance_payment_officer', 'p.code': 'final_settlement.record_payment' })
    .first('rp.role_id');
  assert.ok(paymentGrant);
  pass('separate payment authority');
  const financeApproval = await db('role_permissions as rp')
    .join('roles as r', 'r.id', 'rp.role_id')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where({ 'r.code': 'finance_approver', 'p.code': 'final_settlement.approve' })
    .first('rp.role_id');
  assert.ok(financeApproval);
  pass('finance approval authority');
  const employeeForbidden = await db('role_permissions as rp')
    .join('roles as r', 'r.id', 'rp.role_id')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where({ 'r.code': 'employee' })
    .whereIn('p.code', [
      'exit.approve',
      'exit.complete',
      'final_settlement.approve',
      'final_settlement.record_payment',
      'audit.view',
    ])
    .count({ total: '*' })
    .first();
  assert.equal(Number(employeeForbidden.total), 0);
  pass('employee least privilege');
  const performanceManagerPermissions = [
    'performance_review.view_team',
    'performance_goal.approve',
    'performance_goal.return',
    'performance_manager_assessment.submit',
  ];
  const performanceGrants = await db('role_permissions as grant')
    .join('roles as role', 'role.id', 'grant.role_id')
    .join('permissions as permission', 'permission.id', 'grant.permission_id')
    .whereIn('role.code', ['manager', 'finance_approver'])
    .whereIn('permission.code', performanceManagerPermissions)
    .select('role.code as role', 'permission.code as permission');
  assert.equal(
    performanceGrants.filter((grant) => grant.role === 'manager').length,
    performanceManagerPermissions.length,
  );
  assert.equal(performanceGrants.filter((grant) => grant.role === 'finance_approver').length, 0);
  pass('performance manager grants and Finance least privilege');
  const settlementColumnRows = await db('information_schema.columns')
    .where({ table_schema: 'hrm_test', table_name: 'final_settlements' })
    .select('column_name');
  const settlementColumns = settlementColumnRows.map((row) => row.column_name ?? row.COLUMN_NAME);
  for (const column of [
    'total_earnings',
    'total_deductions',
    'net_amount',
    'workflow_version',
    'idempotency_key',
  ])
    assert.ok(settlementColumns.includes(column));
  pass('exact-money and workflow schema');
  const uniqueIndexes = await db('information_schema.statistics')
    .where({ table_schema: 'hrm_test' })
    .whereIn('index_name', [
      'uq_exit_active_employment',
      'uq_exit_idempotency',
      'uq_settlement_exit',
      'uq_settlement_payment',
      'uq_notification_idempotency',
      'uq_audit_review_idempotency',
    ])
    .distinct('index_name');
  assert.equal(uniqueIndexes.length, 6);
  pass('concurrency and idempotency indexes');
  const reportSource = await readFile(
    new URL('../src/modules/reports/reportRoutes.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(reportSource, /\.insert\(|\.update\(|\.del\(/);
  pass('reports are read only');
  const sensitiveAuditColumnRows = await db('information_schema.columns')
    .where({ table_schema: 'hrm_test', table_name: 'audit_events' })
    .whereIn('column_name', ['password', 'token', 'message'])
    .select('column_name');
  const sensitiveAuditColumns = sensitiveAuditColumnRows.map(
    (row) => row.column_name ?? row.COLUMN_NAME,
  );
  assert.deepEqual(sensitiveAuditColumns, []);
  pass('audit schema excludes secrets and narratives');
  const migrations = await db('knex_migrations')
    .whereIn('name', [
      '202609240001_phase_16_exit_management.js',
      '202609240002_phase_17_final_settlement.js',
      '202609240003_phase_19_notifications.js',
      '202609240004_phase_20_security_audit_hardening.js',
    ])
    .pluck('name');
  assert.equal(migrations.length, 4);
  pass('Phase 16-20 migrations applied');
  console.log(`SUMMARY ${passed.length}/12 Phase 16-20 verification groups passed`);
} finally {
  await db.destroy();
}
