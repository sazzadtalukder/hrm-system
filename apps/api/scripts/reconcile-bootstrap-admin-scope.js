import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { withTransaction } from '../src/infrastructure/database/transaction.js';
import { systemAdministratorAllScopeAssignment } from './bootstrap-admin-scope.js';

const email = process.env.RECONCILE_SYSTEM_ADMIN_EMAIL?.trim().toLowerCase();
const confirmation = process.env.RECONCILE_SYSTEM_ADMIN_CONFIRM;
if (!email || confirmation !== `PROMOTE:${email}:ALL`) {
  throw new Error(
    'Set RECONCILE_SYSTEM_ADMIN_EMAIL and RECONCILE_SYSTEM_ADMIN_CONFIRM=PROMOTE:<email>:ALL exactly.',
  );
}

const env = loadEnv();
process.stdout.write(`Target: ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}\n`);
const database = createDatabase(env);
try {
  const result = await withTransaction(database, async (trx) => {
    const user = await trx('users').where({ email }).forUpdate().first('id', 'auth_version');
    if (!user) throw new Error('The requested administrator account does not exist.');
    const role = await trx('roles').where({ code: 'system_administrator' }).first('id');
    if (!role) throw new Error('The managed System Administrator role does not exist.');

    const assignments = await trx('role_assignments')
      .where({ user_id: user.id, role_id: role.id, status: 'active' })
      .forUpdate();
    const existingAll = assignments.find(
      (assignment) => assignment.scope_type === 'all' && assignment.scope_key === 'all',
    );
    if (existingAll) return { assignmentId: existingAll.id, replayed: true };

    const bootstrapEvents = await trx('audit_events')
      .where({
        subject_user_id: user.id,
        action_code: 'authorization.bootstrap_admin',
        record_type: 'role_assignment',
      })
      .select('record_id');
    const bootstrapAssignmentIds = new Set(bootstrapEvents.map(({ record_id: id }) => String(id)));
    const companyAssignments = assignments.filter(
      (assignment) =>
        assignment.scope_type === 'company' && bootstrapAssignmentIds.has(String(assignment.id)),
    );
    if (companyAssignments.length === 0) {
      throw new Error('No active company-scoped bootstrap System Administrator assignment exists.');
    }

    const assignment = systemAdministratorAllScopeAssignment({
      userId: user.id,
      roleId: role.id,
      assignedBy: user.id,
      effectiveStart: new Date().toISOString().slice(0, 10),
    });
    const [assignmentId] = await trx('role_assignments').insert(assignment);
    const previousAssignmentIds = companyAssignments.map(({ id }) => id);
    await trx('role_assignments').whereIn('id', previousAssignmentIds).update({
      status: 'revoked',
      revoked_at: trx.fn.now(),
      revoked_by: user.id,
      revoke_reason: 'Reconciled legacy bootstrap administrator to all scope.',
    });
    await trx('users')
      .where({ id: user.id })
      .update({ auth_version: user.auth_version + 1, updated_at: trx.fn.now() });
    await trx('audit_events').insert({
      actor_user_id: user.id,
      subject_user_id: user.id,
      company_id: null,
      action_code: 'authorization.bootstrap_admin_scope_reconcile',
      outcome: 'success',
      record_type: 'role_assignment',
      record_id: String(assignmentId),
      permission_code: 'role.assign',
      scope_type: 'all',
      reason: 'Explicit legacy bootstrap administrator scope reconciliation.',
      metadata: JSON.stringify({ previousAssignmentIds, newAssignmentId: assignmentId }),
    });
    return { assignmentId, replayed: false };
  });
  process.stdout.write(
    result.replayed
      ? `System Administrator already has all scope (assignment ${result.assignmentId}).\n`
      : `System Administrator reconciled to all scope (assignment ${result.assignmentId}).\n`,
  );
} finally {
  await database.destroy();
}
