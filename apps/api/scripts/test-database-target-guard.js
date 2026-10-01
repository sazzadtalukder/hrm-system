import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertConfiguredTarget,
  assertNativeExitCode,
  assertServerIdentity,
  buildGuardedEnvironment,
} from './databaseTargetGuard.js';

const expectFailure = (fn, label) => assert.throws(fn, undefined, label);
const validEnvironment = { DB_HOST: '127.0.0.1', DB_PORT: 3307, DB_NAME: 'hrm_test' };
const validIdentity = {
  host: '127.0.0.1',
  port: 3307,
  database: 'hrm_test',
  version: '8.0.46',
  isolation: 'READ-COMMITTED',
};

assertConfiguredTarget(validEnvironment);
assertServerIdentity(validIdentity);
expectFailure(() => assertConfiguredTarget({ ...validEnvironment, DB_HOST: 'localhost' }), 'host');
expectFailure(() => assertConfiguredTarget({ ...validEnvironment, DB_PORT: 3306 }), 'port');
expectFailure(
  () => assertConfiguredTarget({ ...validEnvironment, DB_NAME: 'hrm_dev' }),
  'database',
);
expectFailure(
  () => assertServerIdentity({ ...validIdentity, isolation: 'REPEATABLE-READ' }),
  'isolation',
);
expectFailure(() => assertServerIdentity({ ...validIdentity, version: '10.4.32' }), 'version');
expectFailure(() => assertNativeExitCode(1, 'native command'), 'native command');

const guarded = buildGuardedEnvironment({
  DB_HOST: 'unsafe-host',
  DB_PORT: '3306',
  DB_NAME: 'hrm_dev',
  DB_PASSWORD: 'preserved-secret',
});
assert.deepEqual(
  [guarded.DB_HOST, guarded.DB_PORT, guarded.DB_NAME],
  ['127.0.0.1', '3307', 'hrm_test'],
);
assert.equal(guarded.DB_PASSWORD, 'preserved-secret');
const powershell = await readFile(new URL('./guarded-phase-12-cycle.ps1', import.meta.url), 'utf8');
assert.match(powershell, /Set-StrictMode -Version Latest/);
assert.match(powershell, /\$ErrorActionPreference = "Stop"/);
assert.match(powershell, /if \(\$LASTEXITCODE -ne 0\)/);
assert.doesNotMatch(powershell, /;\s*(npm|npx|node|Invoke-GuardedAction)/);
console.log('PASS guarded database target static tests');
