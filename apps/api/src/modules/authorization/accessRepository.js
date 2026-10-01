import { assertAccessContext } from './accessContext.js';

function assertAdministrationContext(accessContext) {
  if (!['role.assign', 'role.revoke', 'user.assign_role'].includes(accessContext?.permission)) {
    assertAccessContext(accessContext, 'role.assign');
  }
}

export function createAccessRepository() {
  return {
    listRoles(accessContext, trx) {
      assertAccessContext(accessContext, 'role.view');
      return trx('roles as role')
        .leftJoin('role_permissions as mapping', 'mapping.role_id', 'role.id')
        .leftJoin('permissions as permission', 'permission.id', 'mapping.permission_id')
        .where('role.status', 'active')
        .select(
          'role.id',
          'role.code',
          'role.name',
          'role.description',
          'role.is_system',
          'role.is_privileged',
          trx.raw('GROUP_CONCAT(permission.code ORDER BY permission.code) as permission_codes'),
        )
        .groupBy(
          'role.id',
          'role.code',
          'role.name',
          'role.description',
          'role.is_system',
          'role.is_privileged',
        )
        .orderBy('role.name');
    },
    listDirectGrantPermissions(accessContext, trx) {
      assertAdministrationContext(accessContext);
      return trx('permissions')
        .where({ status: 'active', allow_direct_grant: true })
        .select('id', 'code', 'resource', 'action', 'is_sensitive', 'requires_audit')
        .orderBy('code');
    },
    listRoleAssignments(userId, accessContext, trx) {
      assertAccessContext(accessContext, 'role.view_assignment_history');
      return trx('role_assignments as assignment')
        .join('roles as role', 'role.id', 'assignment.role_id')
        .where('assignment.user_id', userId)
        .select('assignment.*', 'role.code as role_code', 'role.name as role_name')
        .orderBy('assignment.id', 'desc');
    },
    listPermissionGrants(userId, accessContext, trx) {
      assertAdministrationContext(accessContext);
      return trx('user_permission_grants as grant')
        .join('permissions as permission', 'permission.id', 'grant.permission_id')
        .where('grant.user_id', userId)
        .select('grant.*', 'permission.code as permission_code')
        .orderBy('grant.id', 'desc');
    },
    async lockUserForAssignment(userId, accessContext, trx) {
      assertAdministrationContext(accessContext);
      return trx('users').where({ id: userId }).forUpdate().first();
    },
    findRoleByCode(code, accessContext, trx) {
      assertAccessContext(accessContext, 'role.assign');
      return trx('roles').where({ code, status: 'active' }).first();
    },
    async createRoleAssignment(values, accessContext, trx) {
      assertAccessContext(accessContext, 'role.assign');
      const [id] = await trx('role_assignments').insert(values);
      return id;
    },
    findOverlappingRoleAssignment(values, accessContext, trx) {
      assertAccessContext(accessContext, 'role.assign');
      const query = trx('role_assignments')
        .where({
          user_id: values.user_id,
          role_id: values.role_id,
          scope_key: values.scope_key,
        })
        .whereNot('status', 'revoked')
        .where((builder) =>
          builder.whereNull('effective_end').orWhere('effective_end', '>=', values.effective_start),
        );
      if (values.effective_end) query.where('effective_start', '<=', values.effective_end);
      return query.first();
    },
    lockRoleAssignment(id, accessContext, trx) {
      assertAccessContext(accessContext, 'role.revoke');
      return trx('role_assignments').where({ id }).forUpdate().first();
    },
    revokeRoleAssignment(id, values, accessContext, trx) {
      assertAccessContext(accessContext, 'role.revoke');
      return trx('role_assignments').where({ id }).update(values);
    },
    findPermissionByCode(code, accessContext, trx) {
      assertAdministrationContext(accessContext);
      return trx('permissions').where({ code, status: 'active' }).first();
    },
    async createPermissionGrant(values, accessContext, trx) {
      assertAdministrationContext(accessContext);
      const [id] = await trx('user_permission_grants').insert(values);
      return id;
    },
    findOverlappingPermissionGrant(values, accessContext, trx) {
      assertAdministrationContext(accessContext);
      const query = trx('user_permission_grants')
        .where({
          user_id: values.user_id,
          permission_id: values.permission_id,
          scope_key: values.scope_key,
        })
        .whereNot('status', 'revoked')
        .where((builder) =>
          builder.whereNull('effective_end').orWhere('effective_end', '>=', values.effective_start),
        );
      if (values.effective_end) query.where('effective_start', '<=', values.effective_end);
      return query.first();
    },
    lockPermissionGrant(id, accessContext, trx) {
      assertAdministrationContext(accessContext);
      return trx('user_permission_grants').where({ id }).forUpdate().first();
    },
    revokePermissionGrant(id, values, accessContext, trx) {
      assertAdministrationContext(accessContext);
      return trx('user_permission_grants').where({ id }).update(values);
    },
  };
}
