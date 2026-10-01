export function createCareerSnapshotReader(db) {
  return {
    employment(trx, id, anchor, companyId) {
      return (trx ?? db)('employments as e')
        .join('employees as employee', 'employee.id', 'e.employee_id')
        .join('employment_status_history as status', function () {
          this.on('status.employment_id', 'e.id')
            .andOnVal('status.history_status', 'current')
            .andOn('status.effective_start', '<=', (trx ?? db).raw('?', [anchor]))
            .andOn(function () {
              this.onNull('status.effective_end').orOn(
                'status.effective_end',
                '>=',
                (trx ?? db).raw('?', [anchor]),
              );
            });
        })
        .join('employee_assignments as a', function () {
          this.on('a.employment_id', 'e.id')
            .andOnVal('a.history_status', 'current')
            .andOn('a.effective_start', '<=', (trx ?? db).raw('?', [anchor]))
            .andOn(function () {
              this.onNull('a.effective_end').orOn(
                'a.effective_end',
                '>=',
                (trx ?? db).raw('?', [anchor]),
              );
            });
        })
        .leftJoin('employments as me', 'me.id', 'a.manager_employment_id')
        .leftJoin('employees as manager', 'manager.id', 'me.employee_id')
        .where({
          'e.id': id,
          'e.company_id': companyId,
          'e.record_status': 'active',
          'employee.record_status': 'active',
        })
        .where((q) =>
          q.whereNull('e.employment_end_date').orWhere('e.employment_end_date', '>=', anchor),
        )
        .first(
          'e.id as employment_id',
          'e.employee_id',
          'e.employee_code',
          'e.employment_end_date',
          'employee.display_name',
          'employee.user_id',
          'status.status as employment_status',
          'a.branch_id',
          'a.department_id',
          'a.designation_id',
          'a.grade_id',
          'a.manager_employment_id',
          'manager.user_id as manager_user_id',
        );
    },
    competencyVersions(trx, companyId, ids) {
      return ids.length
        ? (trx ?? db)('performance_competency_versions')
            .where({ company_id: companyId })
            .whereIn('id', ids)
        : [];
    },
    courseVersion(trx, companyId, id) {
      return id
        ? (trx ?? db)('training_course_versions').where({ company_id: companyId, id }).first()
        : null;
    },
    completionVersion(trx, companyId, id) {
      return id
        ? (trx ?? db)('training_completion_versions').where({ company_id: companyId, id }).first()
        : null;
    },
  };
}
