import { assertAccessContext } from '../authorization/accessContext.js';
export function createRecruitmentRepository(db) {
  const allowed = (context, companyId) =>
    context.grants.some(
      (g) => g.scope_type === 'all' || Number(g.company_id) === Number(companyId),
    );
  const organizationAllowed = (context, companyId, branchId, departmentId) =>
    context.grants.some(
      (grant) =>
        grant.scope_type === 'all' ||
        (Number(grant.company_id) === Number(companyId) &&
          (grant.scope_type === 'company' ||
            (grant.scope_type === 'branch' && Number(grant.branch_id) === Number(branchId)) ||
            (grant.scope_type === 'department' &&
              Number(grant.department_id) === Number(departmentId)))),
    );
  const scoped = (q, context, permission, table, resourceTable = table) => {
    assertAccessContext(context, permission);
    if (context.grants.some((g) => g.scope_type === 'all')) return q;
    const companies = [
      ...new Set(
        context.grants
          .filter((g) => g.scope_type === 'company')
          .map((g) => g.company_id)
          .filter(Boolean),
      ),
    ];
    const branches = context.grants
      .filter((grant) => grant.scope_type === 'branch')
      .map((grant) => grant.branch_id)
      .filter(Boolean);
    const departments = context.grants
      .filter((grant) => grant.scope_type === 'department')
      .map((grant) => grant.department_id)
      .filter(Boolean);
    const organizationFilter = (builder, branchColumn, departmentColumn) => {
      if (branches.length) builder.whereIn(branchColumn, branches);
      if (departments.length) {
        const method = branches.length ? 'orWhereIn' : 'whereIn';
        builder[method](departmentColumn, departments);
      }
    };
    return q.where((scope) => {
      if (companies.length) scope.whereIn(`${table}.company_id`, companies);
      const addOrganizationScope = (callback) => {
        const method = companies.length ? 'orWhere' : 'where';
        scope[method](callback);
      };
      if (!branches.length && !departments.length) return;
      if (resourceTable === 'job_requisitions') {
        addOrganizationScope(function () {
          organizationFilter(this, `${table}.branch_id`, `${table}.department_id`);
        });
      } else if (resourceTable === 'manpower_plans') {
        const method = companies.length ? 'orWhereExists' : 'whereExists';
        scope[method](function () {
          this.select(db.raw('1'))
            .from('manpower_plan_lines as scoped_line')
            .whereRaw(`scoped_line.manpower_plan_id = ${table}.id`)
            .where(function () {
              organizationFilter(this, 'scoped_line.branch_id', 'scoped_line.department_id');
            });
        });
      } else if (resourceTable === 'job_postings') {
        const method = companies.length ? 'orWhereExists' : 'whereExists';
        scope[method](function () {
          this.select(db.raw('1'))
            .from('job_requisitions as scoped_requisition')
            .whereRaw(`scoped_requisition.id = ${table}.job_requisition_id`)
            .where(function () {
              organizationFilter(
                this,
                'scoped_requisition.branch_id',
                'scoped_requisition.department_id',
              );
            });
        });
      } else if (resourceTable === 'candidate_applications') {
        const method = companies.length ? 'orWhereExists' : 'whereExists';
        scope[method](function () {
          this.select(db.raw('1'))
            .from('job_requisitions as scoped_requisition')
            .whereRaw(`scoped_requisition.id = ${table}.job_requisition_id`)
            .where(function () {
              organizationFilter(
                this,
                'scoped_requisition.branch_id',
                'scoped_requisition.department_id',
              );
            });
        });
      } else if (resourceTable === 'recruitment_candidates') {
        const method = companies.length ? 'orWhereExists' : 'whereExists';
        scope[method](function () {
          this.select(db.raw('1'))
            .from('candidate_applications as scoped_application')
            .join(
              'job_requisitions as scoped_requisition',
              'scoped_requisition.id',
              'scoped_application.job_requisition_id',
            )
            .whereRaw(`scoped_application.candidate_id = ${table}.id`)
            .where(function () {
              organizationFilter(
                this,
                'scoped_requisition.branch_id',
                'scoped_requisition.department_id',
              );
            });
        });
      } else if (
        ['recruitment_interviews', 'recruitment_assessments', 'recruitment_offers'].includes(
          resourceTable,
        )
      ) {
        const method = companies.length ? 'orWhereExists' : 'whereExists';
        scope[method](function () {
          this.select(db.raw('1'))
            .from('candidate_applications as scoped_application')
            .join(
              'job_requisitions as scoped_requisition',
              'scoped_requisition.id',
              'scoped_application.job_requisition_id',
            )
            .whereRaw(`scoped_application.id = ${table}.candidate_application_id`)
            .where(function () {
              organizationFilter(
                this,
                'scoped_requisition.branch_id',
                'scoped_requisition.department_id',
              );
            });
        });
      } else {
        scope.whereRaw('1 = 0');
      }
    });
  };
  return {
    allowed,
    organizationAllowed,
    scoped,
    async recordAllowed(context, permission, table, id, trx = db) {
      return Boolean(
        await scoped(
          trx(`${table} as record`).where('record.id', id),
          context,
          permission,
          'record',
          table,
        ).first('record.id'),
      );
    },
    lock: (table, id, trx) => trx(table).where({ id }).forUpdate().first(),
    history: (table, key, id) => db(table).where(key, id).orderBy('id'),
  };
}
