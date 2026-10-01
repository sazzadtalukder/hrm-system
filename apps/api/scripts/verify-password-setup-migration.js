import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { assertConfiguredTarget } from './databaseTargetGuard.js';

const env = loadEnv();
assertConfiguredTarget(env);
const db = createDatabase(env);
const countValue = (row) => Number(row.count ?? row.COUNT ?? Object.values(row)[0]);

try {
  const columns = await db('information_schema.columns')
    .where({ table_schema: 'hrm_test', table_name: 'user_password_setup_tokens' })
    .select('column_name', 'is_nullable');
  const names = new Set(columns.map((column) => column.column_name ?? column.COLUMN_NAME));
  for (const name of [
    'id',
    'user_id',
    'company_id',
    'purpose',
    'token_hash',
    'status',
    'active_slot',
    'expires_at',
    'consumed_at',
    'revoked_at',
    'issued_by',
    'revoked_by',
    'revoke_reason',
  ]) {
    assert(names.has(name), `Missing password setup column: ${name}`);
  }

  const userColumns = await db('information_schema.columns')
    .where({ table_schema: 'hrm_test', table_name: 'users' })
    .whereIn('column_name', ['provisioning_status', 'administratively_deactivated_at']);
  assert.equal(userColumns.length, 2, 'Password setup user columns are incomplete.');

  const migration = await db('knex_migrations')
    .where({ name: '202609260001_identity_password_setup.js' })
    .first();
  assert(migration, 'Password setup migration is not recorded as applied.');

  const tokenCount = countValue(
    await db('user_password_setup_tokens').count({ count: '*' }).first(),
  );
  assert.equal(
    tokenCount,
    0,
    'The migration must not generate password setup tokens automatically.',
  );

  const existingUsers = countValue(await db('users').count({ count: '*' }).first());
  assert(existingUsers > 0, 'Existing users were not preserved.');
  const inactiveUsers = countValue(
    await db('users').where({ status: 'inactive' }).count({ count: '*' }).first(),
  );
  const recoverableUser = await db('users')
    .where({ email: 'newtestuser@gmail.com' })
    .first('id', 'status', 'provisioning_status', 'administratively_deactivated_at');
  if (recoverableUser) {
    assert.equal(recoverableUser.status, 'inactive');
    assert.equal(recoverableUser.provisioning_status, 'pending_setup');
    assert.equal(
      recoverableUser.administratively_deactivated_at,
      null,
      'The recoverable user was incorrectly classified as administratively deactivated.',
    );
  }

  const activeCredential = await db('users')
    .where({ status: 'active', provisioning_status: 'ready' })
    .whereNotNull('password_hash')
    .first('id');
  assert(activeCredential, 'No existing active authentication credential remains.');

  console.log(
    JSON.stringify({
      migration: 'applied',
      schema: 'valid',
      existingUsers,
      inactiveUsers,
      automaticallyGeneratedTokens: tokenCount,
      recoverableUserPresent: Boolean(recoverableUser),
      activeAuthenticationCredentialPreserved: true,
    }),
  );
} finally {
  await db.destroy();
}
