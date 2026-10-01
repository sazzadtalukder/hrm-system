import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import {
  assertConfiguredTarget,
  assertServerIdentity,
  buildGuardedEnvironment,
  HRM_TEST_TARGET,
} from './databaseTargetGuard.js';

const migrationName = '202608280002_phase_12_idempotency_schema_repair.js';
const expected = [
  ['career_paths', false, 'uq_career_path_create_key'],
  ['career_path_versions', true, 'uq_career_path_version_key'],
  ['career_plans', false, 'uq_career_plan_create_key'],
  ['career_plan_versions', true, 'uq_career_plan_version_key'],
  ['career_plan_goal_versions', true, 'uq_career_goal_progress_key'],
  ['career_development_action_versions', true, 'uq_career_action_progress_key'],
  ['career_development_action_evidence_references', false, 'uq_career_evidence_key'],
  ['critical_positions', false, 'uq_critical_position_create_key'],
  ['critical_position_versions', true, 'uq_critical_position_version_key'],
  ['succession_plans', false, 'uq_succession_plan_create_key'],
  ['successor_nominations', false, 'uq_nomination_create_key'],
];

const guardedProcessEnv = buildGuardedEnvironment(process.env);
const env = loadEnv(guardedProcessEnv);
assertConfiguredTarget(env);
const db = createDatabase(env);
try {
  const [[identity]] = await db.raw(
    'SELECT VERSION() version, DATABASE() database_name, @@port port, @@transaction_isolation isolation',
  );
  assertServerIdentity({
    host: env.DB_HOST,
    port: identity.port,
    database: identity.database_name,
    version: identity.version,
    isolation: identity.isolation,
  });

  for (const [tableName, nullable, indexName] of expected) {
    const columnResult = await db('information_schema.columns')
      .whereRaw('table_schema = database()')
      .where({ table_name: tableName, column_name: 'idempotency_key' })
      .first('is_nullable', 'data_type', 'character_maximum_length');
    const column = columnResult && {
      isNullable: columnResult.is_nullable ?? columnResult.IS_NULLABLE,
      dataType: columnResult.data_type ?? columnResult.DATA_TYPE,
      maximumLength: columnResult.character_maximum_length ?? columnResult.CHARACTER_MAXIMUM_LENGTH,
    };
    assert.ok(column, `${tableName}.idempotency_key is missing.`);
    assert.equal(column.isNullable, nullable ? 'YES' : 'NO', `${tableName} nullability differs.`);
    assert.equal(String(column.dataType).toLowerCase(), 'varchar', `${tableName} type differs.`);
    assert.equal(Number(column.maximumLength), 100, `${tableName} length differs.`);

    const indexRows = await db('information_schema.statistics')
      .whereRaw('table_schema = database()')
      .where({ table_name: tableName, index_name: indexName })
      .select('column_name', 'seq_in_index', 'non_unique')
      .orderBy('seq_in_index');
    assert.deepEqual(
      indexRows.map((row) => row.column_name ?? row.COLUMN_NAME),
      ['company_id', 'idempotency_key'],
      `${tableName}.${indexName} has different columns.`,
    );
    assert.ok(
      indexRows.every((row) => Number(row.non_unique ?? row.NON_UNIQUE) === 0),
      `${tableName}.${indexName} is not unique.`,
    );
  }

  const migration = await db('knex_migrations').where({ name: migrationName }).first('id');
  assert.ok(migration, `${migrationName} is not recorded as applied.`);
  console.log(
    `PASS Phase 12 repair status on ${HRM_TEST_TARGET.host}:${HRM_TEST_TARGET.port}/${HRM_TEST_TARGET.database}: 11 columns, 11 unique indexes, migration applied.`,
  );
} finally {
  await db.destroy();
}
