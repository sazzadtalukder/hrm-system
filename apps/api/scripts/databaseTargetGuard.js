import assert from 'node:assert/strict';

export const HRM_TEST_TARGET = Object.freeze({
  host: '127.0.0.1',
  port: 3307,
  database: 'hrm_test',
  isolation: 'READ-COMMITTED',
  mysqlMajor: 8,
});

export function buildGuardedEnvironment(source = process.env) {
  return {
    ...source,
    NODE_ENV: 'test',
    DB_HOST: HRM_TEST_TARGET.host,
    DB_PORT: String(HRM_TEST_TARGET.port),
    DB_NAME: HRM_TEST_TARGET.database,
  };
}

export function assertConfiguredTarget(env) {
  assert.equal(env.DB_HOST, HRM_TEST_TARGET.host, 'Database host is not the guarded target.');
  assert.equal(
    Number(env.DB_PORT),
    HRM_TEST_TARGET.port,
    'Database port is not the guarded target.',
  );
  assert.equal(env.DB_NAME, HRM_TEST_TARGET.database, 'Database name is not the guarded target.');
}

export function assertServerIdentity(identity) {
  assert.equal(identity.host, HRM_TEST_TARGET.host, 'Connected host is not the guarded target.');
  assert.equal(
    Number(identity.port),
    HRM_TEST_TARGET.port,
    'Connected port is not the guarded target.',
  );
  assert.equal(identity.database, HRM_TEST_TARGET.database, 'Connected database is not hrm_test.');
  assert.equal(
    Number(String(identity.version).split('.')[0]),
    HRM_TEST_TARGET.mysqlMajor,
    'MySQL major version is not 8.',
  );
  assert.equal(
    String(identity.isolation).toUpperCase(),
    HRM_TEST_TARGET.isolation,
    'Transaction isolation is not READ-COMMITTED.',
  );
}

export function assertNativeExitCode(exitCode, commandName) {
  assert.equal(exitCode, 0, `${commandName} failed with exit code ${exitCode}.`);
}
