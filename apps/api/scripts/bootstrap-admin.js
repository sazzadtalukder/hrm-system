import { randomBytes } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { withTransaction } from '../src/infrastructure/database/transaction.js';
import { hashPassword } from '../src/modules/identity/password.js';
import { systemAdministratorAllScopeAssignment } from './bootstrap-admin-scope.js';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !password)
  throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required.');

const env = loadEnv();
if (password.length < env.PASSWORD_MIN_LENGTH)
  throw new Error('Bootstrap password does not satisfy the password policy.');
const database = createDatabase(env);
try {
  await withTransaction(database, async (trx) => {
    const existing = await trx('role_assignments as assignment')
      .join('roles as role', 'role.id', 'assignment.role_id')
      .where({ 'role.code': 'system_administrator', 'assignment.status': 'active' })
      .forUpdate()
      .first('assignment.id');
    if (existing) throw new Error('An active System Administrator already exists.');
    const [userId] = await trx('users').insert({
      email,
      password_hash: await hashPassword(password),
    });
    const role = await trx('roles').where({ code: 'system_administrator' }).first('id');
    if (!role) throw new Error('Run the identity catalog seed before bootstrap.');
    const assignment = systemAdministratorAllScopeAssignment({
      userId,
      roleId: role.id,
      assignedBy: userId,
      effectiveStart: new Date().toISOString().slice(0, 10),
    });
    const [assignmentId] = await trx('role_assignments').insert(assignment);
    await trx('audit_events').insert({
      actor_user_id: userId,
      subject_user_id: userId,
      company_id: null,
      action_code: 'authorization.bootstrap_admin',
      outcome: 'success',
      record_type: 'role_assignment',
      record_id: String(assignmentId),
      permission_code: 'role.assign',
      scope_type: 'all',
      metadata: JSON.stringify({ bootstrapId: randomBytes(8).toString('hex') }),
    });
  });
  process.stdout.write('Initial System Administrator created.\n');
} finally {
  await database.destroy();
}
