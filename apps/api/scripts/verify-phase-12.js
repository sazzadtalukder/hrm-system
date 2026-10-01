import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { CAREER_LIMITS } from '../src/modules/career/careerConstants.js';
import {
  SUCCESSION_LIMITS,
  READINESS_LEVELS,
} from '../src/modules/succession/successionConstants.js';
import { runPhase12BehavioralScenarios } from './phase12BehavioralScenarios.js';
const GUARDED_DATABASE_TARGET = Object.freeze({
  host: '127.0.0.1',
  port: 3307,
  database: 'hrm_test',
});
const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  DB_HOST: GUARDED_DATABASE_TARGET.host,
  DB_PORT: String(GUARDED_DATABASE_TARGET.port),
  DB_NAME: GUARDED_DATABASE_TARGET.database,
  LOG_LEVEL: 'silent',
});
assert.deepEqual(
  [env.DB_HOST, env.DB_PORT, env.DB_NAME],
  [GUARDED_DATABASE_TARGET.host, GUARDED_DATABASE_TARGET.port, GUARDED_DATABASE_TARGET.database],
);
const db = createDatabase(env),
  passed = [];
const pass = (n) => {
  passed.push(n);
  console.log(`PASS ${n}`);
};
const tables = [
  'career_paths',
  'career_path_versions',
  'career_path_steps',
  'career_path_step_competencies',
  'career_plans',
  'career_plan_versions',
  'career_plan_goals',
  'career_plan_goal_versions',
  'career_plan_goal_competencies',
  'career_development_actions',
  'career_development_action_versions',
  'career_development_action_evidence_references',
  'career_plan_state_events',
  'career_plan_decisions',
  'career_plan_manager_reassignments',
  'critical_positions',
  'critical_position_versions',
  'critical_position_competencies',
  'succession_plans',
  'succession_plan_versions',
  'succession_plan_state_events',
  'successor_nominations',
  'successor_nomination_versions',
  'successor_nomination_state_events',
  'successor_nomination_decisions',
  'successor_nomination_readiness_events',
  'successor_nomination_manager_reassignments',
];
try {
  const [[identity]] = await db.raw(
    'SELECT VERSION() version,DATABASE() db,@@port port,@@transaction_isolation isolation',
  );
  assert.match(identity.version, /^8\./);
  assert.equal(identity.db, 'hrm_test');
  assert.equal(Number(identity.port), 3307);
  assert.equal(identity.isolation, 'READ-COMMITTED');
  pass('guarded MySQL 8 hrm_test execution');
  const count = await db('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', tables)
    .count({ n: '*' })
    .first();
  assert.equal(Number(count.n), tables.length);
  pass('complete Phase 12 schema');
  assert.deepEqual(
    [CAREER_LIMITS.defaultPageSize, CAREER_LIMITS.maximumPageSize, CAREER_LIMITS.maximumExportRows],
    [25, 100, 10000],
  );
  pass('centralized career bounds');
  assert.deepEqual(
    [
      SUCCESSION_LIMITS.defaultPageSize,
      SUCCESSION_LIMITS.maximumPageSize,
      SUCCESSION_LIMITS.maximumExportRows,
    ],
    [25, 100, 10000],
  );
  pass('centralized succession bounds');
  assert.equal(READINESS_LEVELS.length, 4);
  pass('bounded readiness vocabulary');
  const fks = await db('information_schema.referential_constraints')
    .where({ constraint_schema: 'hrm_test' })
    .where((q) =>
      q
        .where('table_name', 'like', 'career%')
        .orWhere('table_name', 'like', 'succession%')
        .orWhere('table_name', 'like', 'successor%')
        .orWhere('table_name', 'like', 'critical%'),
    )
    .select({ tableName: 'table_name', referencedTableName: 'referenced_table_name' });
  assert.ok(fks.length >= 30);
  pass('company-composite ownership constraints');
  const checks = await db('information_schema.table_constraints')
    .where({ constraint_schema: 'hrm_test', constraint_type: 'CHECK' })
    .select({ name: 'constraint_name' });
  assert.ok(checks.some((x) => x.name === 'career_path_versions_chk_1'));
  pass('effective-date database checks');
  const uniqueRows = await db('information_schema.statistics')
    .where({ table_schema: 'hrm_test', non_unique: 0 })
    .whereIn('table_name', ['career_plans', 'successor_nominations'])
    .select({ indexName: 'index_name' });
  assert.ok(uniqueRows.some((x) => x.indexName === 'uq_career_plan_active'));
  assert.ok(uniqueRows.some((x) => x.indexName === 'uq_nomination_active'));
  pass('active duplicate database protection');
  const compFks = fks.filter(
    (x) => String(x.referencedTableName) === 'performance_competency_versions',
  );
  assert.ok(compFks.length >= 3);
  pass('immutable Performance competency-version references');
  const trainingFks = fks.filter((x) =>
    ['training_course_versions', 'training_completion_versions'].includes(x.referencedTableName),
  );
  assert.equal(trainingFks.length, 2);
  pass('immutable Training version references');
  const historyTables = tables.filter((name) =>
    /versions|events|decisions|reassignments/.test(name),
  );
  const historyColumns = (
    await db('information_schema.columns')
      .where({ table_schema: 'hrm_test' })
      .whereIn('table_name', historyTables)
      .select('table_name', 'column_name')
  ).map((row) => ({
    table_name: row.table_name ?? row.TABLE_NAME,
    column_name: row.column_name ?? row.COLUMN_NAME,
  }));
  for (const table of historyTables) {
    const columns = historyColumns.filter((x) => x.table_name === table).map((x) => x.column_name);
    assert.ok(columns.includes('id'));
    assert.ok(columns.includes('company_id'));
    assert.ok(columns.includes('created_at') || columns.includes('occurred_at'));
  }
  assert.ok(
    historyColumns.some(
      (x) => x.table_name === 'career_plan_versions' && x.column_name === 'supersedes_version_id',
    ),
  );
  assert.ok(
    historyColumns.some(
      (x) =>
        x.table_name === 'successor_nomination_versions' &&
        x.column_name === 'supersedes_version_id',
    ),
  );
  pass('append-only version, event, decision, and reassignment structures');
  const permissionCodes = await db('permissions')
    .where((q) =>
      q
        .where('code', 'like', 'career%')
        .orWhere('code', 'like', 'succession%')
        .orWhere('code', 'like', 'critical_position%'),
    )
    .pluck('code');
  assert.ok(
    permissionCodes.includes('career_sensitive.view') &&
      permissionCodes.includes('succession_sensitive.view'),
  );
  pass('explicit career and succession permission catalog');
  const role = await db('roles').where({ code: 'talent_management_administrator' }).first();
  assert.ok(role);
  pass('talent administrator role');
  const grants = await db('role_permissions as rp')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', role.id)
    .pluck('p.code');
  assert.ok(grants.includes('succession_nomination.confirm'));
  pass('approved non-sensitive talent grants');
  assert.ok(
    !grants.includes('career_sensitive.view') && !grants.includes('succession_sensitive.view'),
  );
  pass('no automatic sensitive talent grants');
  const sys = await db('roles').where({ code: 'system_administrator' }).first();
  const sysSensitive = await db('role_permissions as rp')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', sys.id)
    .whereIn('p.code', ['career_sensitive.view', 'succession_sensitive.view'])
    .first();
  assert.equal(sysSensitive, undefined);
  pass('system administrator sensitive exclusion');
  const employeeRole = await db('roles').where({ code: 'employee' }).first();
  const employeeSuccession = await db('role_permissions as rp')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', employeeRole.id)
    .where('p.code', 'like', 'succession%')
    .first();
  assert.equal(employeeSuccession, undefined);
  pass('employee succession invisibility grant enforcement');
  const uniqueIdempotencyIndexes = await db('information_schema.statistics')
    .where({ table_schema: 'hrm_test', non_unique: 0 })
    .where('index_name', 'like', '%key')
    .countDistinct({ n: 'index_name' })
    .first();
  assert.ok(Number(uniqueIdempotencyIndexes.n) >= 10);
  pass('database idempotency conflict protection');
  await runPhase12BehavioralScenarios(db, pass);
  assert.ok(passed.length >= 20);
  console.log(`SUMMARY ${passed.length} Phase 12 verification groups passed`);
} finally {
  await db.destroy();
}
