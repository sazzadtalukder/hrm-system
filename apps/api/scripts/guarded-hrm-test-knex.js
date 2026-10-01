import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import {
  assertConfiguredTarget,
  assertNativeExitCode,
  assertServerIdentity,
  buildGuardedEnvironment,
  HRM_TEST_TARGET,
} from './databaseTargetGuard.js';

const allowed = new Map([
  ['verify-phase-12', { executable: process.execPath, args: ['scripts/verify-phase-12.js'] }],
  ['verify-phase-13-15', { executable: process.execPath, args: ['scripts/verify-phase-13-15.js'] }],
  ['verify-phase-16-20', { executable: process.execPath, args: ['scripts/verify-phase-16-20.js'] }],
  ['verify-phase-3', { executable: process.execPath, args: ['scripts/verify-phase-3.js'] }],
  ['bootstrap-admin', { executable: process.execPath, args: ['scripts/bootstrap-admin.js'] }],
  [
    'verify-password-setup-migration',
    { executable: process.execPath, args: ['scripts/verify-password-setup-migration.js'] },
  ],
  [
    'verify-regression-1-12',
    { executable: process.execPath, args: ['scripts/verify-regression-1-12.js'] },
  ],
  [
    'phase-12-repair-status',
    { executable: process.execPath, args: ['scripts/phase-12-repair-status.js'] },
  ],
  ['migrate', { knex: ['migrate:latest'] }],
  ['status', { knex: ['migrate:list'] }],
  ['seed', { knex: ['seed:run'] }],
  ['phase-12-down', { knex: ['migrate:down', '202608280001_phase_12_career_succession.js'] }],
  ['phase-12-up', { knex: ['migrate:up', '202608280001_phase_12_career_succession.js'] }],
  [
    'phase-12-repair-up',
    { knex: ['migrate:up', '202608280002_phase_12_idempotency_schema_repair.js'] },
  ],
  [
    'phase-21-cleanup-failed',
    { executable: process.execPath, args: ['scripts/cleanup-failed-phase-21-migration.js'] },
  ],
  [
    'phase-22-cleanup-failed',
    { executable: process.execPath, args: ['scripts/cleanup-failed-phase-22-migration.js'] },
  ],
]);
const action = process.argv[2];
if (!allowed.has(action)) throw new Error('Unsupported guarded database action.');

const guardedProcessEnv = buildGuardedEnvironment(process.env);
const env = loadEnv(guardedProcessEnv);
assertConfiguredTarget(env);
const db = createDatabase(env);
try {
  const [[row]] = await db.raw(
    'SELECT VERSION() version, DATABASE() database_name, @@port port, @@transaction_isolation isolation',
  );
  assertServerIdentity({
    host: env.DB_HOST,
    port: row.port,
    database: row.database_name,
    version: row.version,
    isolation: row.isolation,
  });
} finally {
  await db.destroy();
}

const command = allowed.get(action);
const knexCli = fileURLToPath(new URL('../../../node_modules/knex/bin/cli.js', import.meta.url));
const executable = command.executable ?? process.execPath;
const args = command.args ?? [knexCli, '--knexfile', 'knexfile.js', ...command.knex];
const result = spawnSync(executable, args, {
  cwd: new URL('..', import.meta.url),
  env: guardedProcessEnv,
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
assertNativeExitCode(result.status, `guarded ${action}`);
console.log(
  `Guarded action completed: ${action} on ${HRM_TEST_TARGET.host}:${HRM_TEST_TARGET.port}/${HRM_TEST_TARGET.database}`,
);
