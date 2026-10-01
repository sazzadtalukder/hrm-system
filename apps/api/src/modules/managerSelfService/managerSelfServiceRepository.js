import { assertAccessContext } from '../authorization/accessContext.js';

export function createManagerSelfServiceRepository(db) {
  return {
    async dashboard(context, companyId) {
      assertAccessContext(context, 'manager_self_service.view');
      const allowed = context.grants.some(
        (grant) => grant.scope_type === 'all' || Number(grant.company_id) === Number(companyId),
      );
      if (!allowed) return null;
      const employments = await db('employee_assignments as assignment')
        .join('employments as employment', 'employment.id', 'assignment.employment_id')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .join(
          'employments as manager_employment',
          'manager_employment.id',
          'assignment.manager_employment_id',
        )
        .join('employees as manager', 'manager.id', 'manager_employment.employee_id')
        .join('branches as branch', 'branch.id', 'assignment.branch_id')
        .join('departments as department', 'department.id', 'assignment.department_id')
        .where({
          'employment.company_id': companyId,
          'assignment.history_status': 'current',
          'employee.record_status': 'active',
          'employment.record_status': 'active',
          'manager.user_id': context.actor.userId,
        })
        .whereNull('assignment.effective_end')
        .select(
          'employment.id as employmentId',
          'employment.employee_code as employeeCode',
          'employee.display_name as employeeName',
          'assignment.branch_id as branchId',
          'branch.name as branchName',
          'assignment.department_id as departmentId',
          'department.name as departmentName',
        );
      const ids = employments.map((row) => row.employmentId);
      const count = async (table, column, statuses) => {
        if (!ids.length) return 0;
        const query = db(table).whereIn(column, ids);
        if (statuses) query.whereIn('status', statuses);
        const row = await query.count({ total: '*' }).first();
        return Number(row.total);
      };
      return {
        directReports: employments,
        pending: {
          leave: await count('leave_requests', 'employment_id', ['submitted']),
          claims: await count('expense_claims', 'employment_id', ['submitted']),
          loans: await count('loan_applications', 'employment_id', ['submitted']),
          training: await count('training_enrollments', 'employment_id', ['submitted']),
          performance: await count('performance_reviews', 'employment_id', [
            'goals_submitted',
            'self_review_submitted',
          ]),
          career: await count('career_plans', 'employment_id', ['submitted']),
        },
      };
    },
  };
}
