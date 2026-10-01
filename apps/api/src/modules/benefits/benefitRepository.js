import { assertAccessContext } from '../authorization/accessContext.js';

function scoped(query, context, alias = 'assignment', employeeAlias = 'employee') {
  if (context.grants.some((g) => g.scope_type === 'all')) return query;
  return query.where((scope) => {
    let applied = false;
    for (const grant of context.grants) {
      if (grant.scope_type === 'company') {
        scope.orWhere(`${alias}.company_id`, grant.company_id);
        applied = true;
      } else if (grant.scope_type === 'branch') {
        scope.orWhere(`${alias}.branch_id`, grant.branch_id);
        applied = true;
      } else if (grant.scope_type === 'department') {
        scope.orWhere(`${alias}.department_id`, grant.department_id);
        applied = true;
      } else if (grant.scope_type === 'own') {
        scope.orWhere(`${employeeAlias}.user_id`, context.actor.userId);
        applied = true;
      } else if (grant.scope_type === 'direct_reports') {
        scope.orWhereExists(function () {
          this.select(query.client.raw('1'))
            .from('employees as manager_employee')
            .join(
              'employments as manager_employment',
              'manager_employment.employee_id',
              'manager_employee.id',
            )
            .whereRaw(`manager_employment.id = ${alias}.manager_employment_id`)
            .where('manager_employee.user_id', context.actor.userId);
        });
        applied = true;
      }
    }
    if (!applied) scope.whereRaw('1=0');
  });
}

export function createBenefitRepository(database) {
  return {
    companyAllowed: (context, companyId) =>
      context.grants.some(
        (g) => g.scope_type === 'all' || Number(g.company_id) === Number(companyId),
      ),
    companyWide: (context, companyId) =>
      context.grants.some(
        (g) =>
          g.scope_type === 'all' ||
          (g.scope_type === 'company' && Number(g.company_id) === Number(companyId)),
      ),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    getCompany: (id, trx = database) => trx('companies').where({ id }).first(),
    lockPlan: (id, trx) => trx('benefit_plans').where({ id }).forUpdate().first(),
    getPlan: (id, trx = database) => trx('benefit_plans').where({ id }).first(),
    getPlanScoped(id, context, trx = database) {
      assertAccessContext(context, 'benefit_plan.view');
      let query = trx('benefit_plans').where({ id });
      if (!context.grants.some((grant) => grant.scope_type === 'all'))
        query.whereIn(
          'company_id',
          context.grants.map((grant) => grant.company_id).filter(Boolean),
        );
      return query.first();
    },
    listPlans(context, input) {
      assertAccessContext(context, 'benefit_plan.view');
      if (!this.companyAllowed(context, input.companyId)) return [];
      const asOfDate = input.asOfDate;
      const q = database('benefit_plans as plan')
        .leftJoin('benefit_plan_versions as current_terms', function () {
          this.on('current_terms.benefit_plan_id', 'plan.id')
            .andOnVal('current_terms.history_status', 'current')
            .andOn(
              'current_terms.effective_start',
              '<=',
              asOfDate ? database.raw('?', [asOfDate]) : database.fn.now(),
            )
            .andOn(function () {
              this.onNull('current_terms.effective_end').orOn(
                'current_terms.effective_end',
                '>=',
                asOfDate ? database.raw('?', [asOfDate]) : database.fn.now(),
              );
            });
        })
        .where('plan.company_id', input.companyId)
        .select('plan.*', 'current_terms.sensitive_classification');
      if (input.status) q.where('plan.record_status', input.status);
      return q
        .orderBy('plan.name')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    createPlan: async (values, trx) => (await trx('benefit_plans').insert(values))[0],
    updatePlan: (id, version, values, trx) =>
      trx('benefit_plans')
        .where({ id, version })
        .update({ ...values, version: version + 1, updated_at: trx.fn.now() }),
    nextPlanVersion: async (id, trx) =>
      Number(
        (
          await trx('benefit_plan_versions')
            .where({ benefit_plan_id: id })
            .max({ n: 'version_number' })
            .first()
        ).n ?? 0,
      ) + 1,
    planVersionOverlap: (id, start, end, trx) =>
      trx('benefit_plan_versions')
        .where({ benefit_plan_id: id, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', start))
        .first(),
    createPlanVersion: async (values, trx) =>
      (await trx('benefit_plan_versions').insert(values))[0],
    effectivePlanVersion: (id, date, trx = database) =>
      trx('benefit_plan_versions')
        .where({ benefit_plan_id: id, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .orderBy('effective_start', 'desc')
        .first(),
    listPlanVersions: (id, trx = database) =>
      trx('benefit_plan_versions').where({ benefit_plan_id: id }).orderBy('version_number', 'desc'),
    lockEmployment: (id, trx) => trx('employments').where({ id }).forUpdate().first(),
    getEmployment: (id, trx = database) =>
      trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .where('employment.id', id)
        .select('employment.*', 'employee.user_id', 'employee.display_name')
        .first(),
    getEmploymentScoped(id, date, context, permission, trx = database) {
      assertAccessContext(context, permission);
      const query = trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .leftJoin('employee_assignments as assignment', function () {
          this.on('assignment.employment_id', 'employment.id')
            .andOnVal('assignment.history_status', 'current')
            .andOn('assignment.effective_start', '<=', trx.raw('?', [date]))
            .andOn(function () {
              this.onNull('assignment.effective_end').orOn(
                'assignment.effective_end',
                '>=',
                trx.raw('?', [date]),
              );
            });
        })
        .where('employment.id', id)
        .select('employment.*', 'employee.user_id', 'employee.display_name');
      return scoped(query, context).first();
    },
    getOwnCompany: (userId, trx = database) =>
      trx('employees as employee')
        .join('employments as employment', 'employment.employee_id', 'employee.id')
        .where({ 'employee.user_id': userId, 'employment.record_status': 'active' })
        .first('employment.company_id'),
    assignmentAt: (employmentId, date, trx = database) =>
      trx('employee_assignments')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    statusAt: (employmentId, date, trx = database) =>
      trx('employment_status_history')
        .where({ employment_id: employmentId, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    enrollmentOverlap: (employmentId, planId, start, end, trx) =>
      trx('benefit_enrollments as enrollment')
        .join(
          'benefit_enrollment_versions as version',
          'version.benefit_enrollment_id',
          'enrollment.id',
        )
        .where({
          'enrollment.employment_id': employmentId,
          'enrollment.benefit_plan_id': planId,
          'version.history_status': 'current',
        })
        .whereNot('enrollment.status', 'cancelled')
        .where('version.effective_start', '<=', end ?? '9999-12-31')
        .where((q) =>
          q.whereNull('version.effective_end').orWhere('version.effective_end', '>=', start),
        )
        .first(),
    createEnrollment: async (values, trx) => (await trx('benefit_enrollments').insert(values))[0],
    createEnrollmentVersion: async (values, trx) =>
      (await trx('benefit_enrollment_versions').insert(values))[0],
    createState: (values, trx) => trx('benefit_enrollment_state_events').insert(values),
    lockEnrollment: (id, trx) => trx('benefit_enrollments').where({ id }).forUpdate().first(),
    updateEnrollment: (id, workflowVersion, values, trx) =>
      trx('benefit_enrollments')
        .where({ id, workflow_version: workflowVersion })
        .update({
          ...values,
          workflow_version: workflowVersion + 1,
          version: trx.raw('version + 1'),
          updated_at: trx.fn.now(),
        }),
    getEnrollment(id, context, permission = 'benefit_enrollment.view', trx = database) {
      assertAccessContext(context, permission);
      let q = trx('benefit_enrollments as enrollment')
        .join('benefit_enrollment_versions as version', function () {
          this.on('version.benefit_enrollment_id', 'enrollment.id').andOn(
            'version.version_number',
            'enrollment.current_version_number',
          );
        })
        .join('benefit_plans as plan', 'plan.id', 'enrollment.benefit_plan_id')
        .join('benefit_plan_versions as plan_version', function () {
          this.on('plan_version.id', 'version.benefit_plan_version_id').andOn(
            'plan_version.company_id',
            'enrollment.company_id',
          );
        })
        .join('employments as employment', 'employment.id', 'enrollment.employment_id')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .leftJoin('employee_assignments as assignment', function () {
          this.on('assignment.employment_id', 'employment.id')
            .andOnVal('assignment.history_status', 'current')
            .andOn('assignment.effective_start', '<=', 'version.effective_start')
            .andOn(function () {
              this.onNull('assignment.effective_end').orOn(
                'assignment.effective_end',
                '>=',
                'version.effective_start',
              );
            });
        })
        .where('enrollment.id', id)
        .select(
          'enrollment.*',
          'version.effective_start',
          'version.effective_end',
          'version.employer_contribution_amount_snapshot',
          'version.employee_contribution_amount_snapshot',
          'version.currency_code',
          'version.enrollment_reason',
          'plan.code as plan_code',
          'plan.name as plan_name',
          'employee.display_name',
          'employment.employee_code',
          'employee.user_id as owner_user_id',
          'assignment.branch_id',
          'assignment.department_id',
        );
      q.select('version.benefit_plan_version_id');
      if (permission === 'benefit_enrollment.view_own')
        q.where('plan_version.employee_visible', true);
      return scoped(q, context).first();
    },
    listEnrollments(context, input, permission = 'benefit_enrollment.view') {
      assertAccessContext(context, permission);
      let q = database('benefit_enrollments as enrollment')
        .join('benefit_enrollment_versions as version', function () {
          this.on('version.benefit_enrollment_id', 'enrollment.id').andOn(
            'version.version_number',
            'enrollment.current_version_number',
          );
        })
        .join('benefit_plans as plan', 'plan.id', 'enrollment.benefit_plan_id')
        .join('benefit_plan_versions as plan_version', function () {
          this.on('plan_version.id', 'version.benefit_plan_version_id').andOn(
            'plan_version.company_id',
            'enrollment.company_id',
          );
        })
        .join('employments as employment', 'employment.id', 'enrollment.employment_id')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .leftJoin('employee_assignments as assignment', function () {
          this.on('assignment.employment_id', 'employment.id')
            .andOnVal('assignment.history_status', 'current')
            .andOn('assignment.effective_start', '<=', 'version.effective_start')
            .andOn(function () {
              this.onNull('assignment.effective_end').orOn(
                'assignment.effective_end',
                '>=',
                'version.effective_start',
              );
            });
        })
        .where('enrollment.company_id', input.companyId)
        .select(
          'enrollment.*',
          'version.effective_start',
          'version.effective_end',
          'version.employer_contribution_amount_snapshot',
          'version.employee_contribution_amount_snapshot',
          'version.currency_code',
          'plan.code as plan_code',
          'plan.name as plan_name',
          'employee.display_name',
          'employment.employee_code',
          'employee.user_id as owner_user_id',
          'assignment.branch_id',
          'assignment.department_id',
        );
      if (input.status) q.where('enrollment.status', input.status);
      if (input.asOfDate)
        q.where('version.effective_start', '<=', input.asOfDate).where((dates) =>
          dates
            .whereNull('version.effective_end')
            .orWhere('version.effective_end', '>=', input.asOfDate),
        );
      if (permission === 'benefit_enrollment.view_own')
        q.where('plan_version.employee_visible', true);
      q.select('version.benefit_plan_version_id');
      return scoped(q, context)
        .orderBy('version.effective_start', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
    },
    currentEnrollmentVersion: (id, trx = database) =>
      trx('benefit_enrollments as enrollment')
        .join('benefit_enrollment_versions as version', function () {
          this.on('version.benefit_enrollment_id', 'enrollment.id').andOn(
            'version.version_number',
            'enrollment.current_version_number',
          );
        })
        .where('enrollment.id', id)
        .select('version.*')
        .first(),
    nextEnrollmentVersion: async (id, trx) =>
      Number(
        (
          await trx('benefit_enrollment_versions')
            .where({ benefit_enrollment_id: id })
            .max({ n: 'version_number' })
            .first()
        ).n ?? 0,
      ) + 1,
    history: async (id, trx = database) => ({
      versions: await trx('benefit_enrollment_versions')
        .where({ benefit_enrollment_id: id })
        .orderBy('version_number', 'desc'),
      states: await trx('benefit_enrollment_state_events')
        .where({ benefit_enrollment_id: id })
        .orderBy('workflow_version', 'desc'),
    }),
  };
}
