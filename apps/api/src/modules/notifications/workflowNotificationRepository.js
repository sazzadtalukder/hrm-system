const today = (database) => database.raw('CURRENT_DATE');

const uniqueIds = (values) =>
  [...new Set(values.filter(Boolean).map((value) => Number(value)))].filter(Number.isFinite);

export async function createWorkflowNotification(
  database,
  {
    companyId,
    userId,
    type,
    title,
    message,
    referenceType,
    referenceId,
    idempotencyKey,
    actorUserId,
  },
) {
  if (!userId || Number(userId) === Number(actorUserId)) return null;

  const user = await database('users').where({ id: userId, status: 'active' }).first('id');
  if (!user) return null;
  const membership = await database('role_assignments')
    .where({ user_id: userId, status: 'active' })
    .where('effective_start', '<=', today(database))
    .where((period) =>
      period.whereNull('effective_end').orWhere('effective_end', '>=', today(database)),
    )
    .where((scope) => scope.where('scope_type', 'all').orWhere('company_id', companyId))
    .first('id');
  if (!membership) return null;
  const preference = await database('notification_preferences')
    .where({ company_id: companyId, user_id: userId })
    .first('in_app_enabled');
  if (preference && !preference.in_app_enabled) return null;

  try {
    const [id] = await database('notifications').insert({
      company_id: companyId,
      user_id: userId,
      notification_type: type,
      title,
      message,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      idempotency_key: idempotencyKey,
      created_by: actorUserId ?? null,
      updated_by: actorUserId ?? null,
    });
    return id;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return null;
    throw error;
  }
}

export async function notifyUsers(database, notification, userIds) {
  const ids = uniqueIds(userIds);
  return Promise.all(
    ids.map((userId) =>
      createWorkflowNotification(database, {
        ...notification,
        userId,
        idempotencyKey: `${notification.idempotencyKey}:user:${userId}`,
      }),
    ),
  );
}

export async function notifyEmploymentUser(database, notification, employmentId) {
  if (!employmentId) return null;
  const row = await database('employments as employment')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .where({ 'employment.id': employmentId, 'employment.company_id': notification.companyId })
    .first('employee.user_id');
  return createWorkflowNotification(database, { ...notification, userId: row?.user_id });
}

export async function notifyPermissionHolders(
  database,
  notification,
  permissionCode,
  { branchId = null, departmentId = null } = {},
) {
  const scope = (query, alias) =>
    query.andWhere((allowed) =>
      allowed.where(`${alias}.scope_type`, 'all').orWhere((company) =>
        company.where(`${alias}.company_id`, notification.companyId).andWhere((scoped) =>
          scoped
            .where(`${alias}.scope_type`, 'company')
            .orWhere((branch) =>
              branchId
                ? branch
                    .where(`${alias}.scope_type`, 'branch')
                    .where(`${alias}.branch_id`, branchId)
                : branch.whereRaw('1 = 0'),
            )
            .orWhere((department) =>
              departmentId
                ? department
                    .where(`${alias}.scope_type`, 'department')
                    .where(`${alias}.department_id`, departmentId)
                : department.whereRaw('1 = 0'),
            ),
        ),
      ),
    );

  let roleQuery = database('role_assignments as assignment')
    .join('role_permissions as role_permission', 'role_permission.role_id', 'assignment.role_id')
    .join('permissions as permission', 'permission.id', 'role_permission.permission_id')
    .where('permission.code', permissionCode)
    .where('permission.status', 'active')
    .where('assignment.status', 'active')
    .where('assignment.effective_start', '<=', today(database))
    .where((period) =>
      period
        .whereNull('assignment.effective_end')
        .orWhere('assignment.effective_end', '>=', today(database)),
    )
    .select('assignment.user_id');
  roleQuery = scope(roleQuery, 'assignment');

  let grantQuery = database('user_permission_grants as grant')
    .join('permissions as permission', 'permission.id', 'grant.permission_id')
    .where('permission.code', permissionCode)
    .where('permission.status', 'active')
    .where('grant.status', 'active')
    .where('grant.effective_start', '<=', today(database))
    .where((period) =>
      period.whereNull('grant.effective_end').orWhere('grant.effective_end', '>=', today(database)),
    )
    .select('grant.user_id');
  grantQuery = scope(grantQuery, 'grant');

  const [roleRows, grantRows] = await Promise.all([roleQuery, grantQuery]);
  return notifyUsers(
    database,
    {
      ...notification,
      idempotencyKey: `${notification.idempotencyKey}:permission:${permissionCode}`,
    },
    [...roleRows, ...grantRows].map((row) => row.user_id),
  );
}
