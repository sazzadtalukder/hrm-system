export async function validateOrganizationScopes(database) {
  const problems = [];
  for (const table of ['role_assignments', 'user_permission_grants']) {
    const invalidShape = await database(table)
      .where((builder) =>
        builder
          .where((query) =>
            query
              .where('scope_type', 'all')
              .where((values) =>
                values
                  .whereNotNull('company_id')
                  .orWhereNotNull('branch_id')
                  .orWhereNotNull('department_id'),
              ),
          )
          .orWhere((query) => query.whereNot('scope_type', 'all').whereNull('company_id'))
          .orWhere((query) => query.where('scope_type', 'branch').whereNull('branch_id'))
          .orWhere((query) => query.where('scope_type', 'department').whereNull('department_id'))
          .orWhere((query) => query.whereNotIn('scope_type', ['branch']).whereNotNull('branch_id'))
          .orWhere((query) =>
            query.whereNotIn('scope_type', ['department']).whereNotNull('department_id'),
          ),
      )
      .count({ count: '*' })
      .first();
    if (Number(invalidShape.count)) problems.push(`${table} contains invalid scope shapes.`);

    const missingCompanies = await database(`${table} as scoped`)
      .leftJoin('companies as company', 'company.id', 'scoped.company_id')
      .whereNotNull('scoped.company_id')
      .whereNull('company.id')
      .count({ count: '*' })
      .first();
    if (Number(missingCompanies.count)) problems.push(`${table} contains unknown companies.`);

    const mismatchedBranches = await database(`${table} as scoped`)
      .join('branches as branch', 'branch.id', 'scoped.branch_id')
      .whereRaw('branch.company_id <> scoped.company_id')
      .count({ count: '*' })
      .first();
    if (Number(mismatchedBranches.count))
      problems.push(`${table} contains cross-company branches.`);

    const mismatchedDepartments = await database(`${table} as scoped`)
      .join('departments as department', 'department.id', 'scoped.department_id')
      .whereRaw('department.company_id <> scoped.company_id')
      .count({ count: '*' })
      .first();
    if (Number(mismatchedDepartments.count))
      problems.push(`${table} contains cross-company departments.`);
  }

  const missingAuditCompanies = await database('audit_events as audit')
    .leftJoin('companies as company', 'company.id', 'audit.company_id')
    .whereNotNull('audit.company_id')
    .whereNull('company.id')
    .count({ count: '*' })
    .first();
  if (Number(missingAuditCompanies.count))
    problems.push('audit_events contains unknown companies.');

  if (problems.length)
    throw new Error(`Organization scope reconciliation failed: ${problems.join(' ')}`);
  return { valid: true };
}
