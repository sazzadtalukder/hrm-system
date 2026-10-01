export function systemAdministratorAllScopeAssignment({
  userId,
  roleId,
  assignedBy,
  effectiveStart,
}) {
  return {
    user_id: userId,
    role_id: roleId,
    company_id: null,
    scope_type: 'all',
    scope_key: 'all',
    branch_id: null,
    department_id: null,
    effective_start: effectiveStart,
    assigned_by: assignedBy,
  };
}
