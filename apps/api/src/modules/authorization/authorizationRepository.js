export function createAuthorizationRepository(database) {
  return {
    async resolveGrants(userId, permissionCode, trx = database) {
      const today = trx.raw('CURRENT_DATE()');
      const roleGrants = trx('role_assignments as assignment')
        .join('role_permissions as mapping', 'mapping.role_id', 'assignment.role_id')
        .join('permissions as permission', 'permission.id', 'mapping.permission_id')
        .select(
          'permission.code as permission_code',
          'assignment.company_id',
          'assignment.scope_type',
          'assignment.scope_key',
          'assignment.branch_id',
          'assignment.department_id',
          trx.raw("'role' as source_type"),
          'assignment.id as source_id',
        )
        .where('assignment.user_id', userId)
        .where('assignment.status', 'active')
        .where('permission.status', 'active')
        .where('permission.code', permissionCode)
        .where('assignment.effective_start', '<=', today)
        .where((builder) =>
          builder
            .whereNull('assignment.effective_end')
            .orWhere('assignment.effective_end', '>=', today),
        );

      const directGrants = trx('user_permission_grants as grant')
        .join('permissions as permission', 'permission.id', 'grant.permission_id')
        .select(
          'permission.code as permission_code',
          'grant.company_id',
          'grant.scope_type',
          'grant.scope_key',
          'grant.branch_id',
          'grant.department_id',
          trx.raw("'direct' as source_type"),
          'grant.id as source_id',
        )
        .where('grant.user_id', userId)
        .where('grant.status', 'active')
        .where('permission.status', 'active')
        .where('permission.code', permissionCode)
        .where('grant.effective_start', '<=', today)
        .where((builder) =>
          builder.whereNull('grant.effective_end').orWhere('grant.effective_end', '>=', today),
        );

      return roleGrants.unionAll([directGrants]);
    },
    listEffectivePermissionCodes(userId, trx = database) {
      return trx
        .from(
          trx('role_assignments as assignment')
            .join('role_permissions as mapping', 'mapping.role_id', 'assignment.role_id')
            .join('permissions as permission', 'permission.id', 'mapping.permission_id')
            .select('permission.code')
            .where('assignment.user_id', userId)
            .where('assignment.status', 'active')
            .where('permission.status', 'active')
            .where('assignment.effective_start', '<=', trx.fn.now())
            .where((builder) =>
              builder
                .whereNull('assignment.effective_end')
                .orWhere('assignment.effective_end', '>=', trx.fn.now()),
            )
            .union(
              trx('user_permission_grants as grant')
                .join('permissions as permission', 'permission.id', 'grant.permission_id')
                .select('permission.code')
                .where('grant.user_id', userId)
                .where('grant.status', 'active')
                .where('permission.status', 'active')
                .where('grant.effective_start', '<=', trx.fn.now())
                .where((builder) =>
                  builder
                    .whereNull('grant.effective_end')
                    .orWhere('grant.effective_end', '>=', trx.fn.now()),
                ),
            )
            .as('effective_permissions'),
        )
        .distinct('code');
    },
  };
}
