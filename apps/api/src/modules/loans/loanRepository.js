import { assertAccessContext } from '../authorization/accessContext.js';
function scoped(q, context, permission) {
  assertAccessContext(context, permission);
  if (context.grants.some((g) => g.scope_type === 'all')) return q;
  return q.where((s) => {
    let used = false;
    for (const g of context.grants) {
      if (g.scope_type === 'company') {
        s.orWhere('application.company_id', g.company_id);
        used = true;
      } else if (g.scope_type === 'branch') {
        s.orWhere('version.branch_id_snapshot', g.branch_id);
        used = true;
      } else if (g.scope_type === 'department') {
        s.orWhere('version.department_id_snapshot', g.department_id);
        used = true;
      } else if (g.scope_type === 'own') {
        s.orWhere('employee.user_id', context.actor.userId);
        used = true;
      } else if (g.scope_type === 'direct_reports') {
        s.orWhere('version.manager_user_id_snapshot', context.actor.userId);
        used = true;
      }
    }
    if (!used) s.whereRaw('1=0');
  });
}
export function createLoanRepository(db) {
  const base = (trx = db) =>
    trx('loan_applications as application')
      .join('loan_application_versions as version', function () {
        this.on('version.loan_application_id', 'application.id').andOn(
          'version.version_number',
          'application.current_version_number',
        );
      })
      .join('employments as employment', 'employment.id', 'application.employment_id')
      .join('employees as employee', 'employee.id', 'employment.employee_id')
      .join('loan_facility_types as type', 'type.id', 'application.loan_facility_type_id')
      .select(
        'application.*',
        'version.requested_principal',
        'version.requested_term_months',
        'version.currency_code',
        'version.purpose',
        'version.submission_anchor_date',
        'version.manager_user_id_snapshot',
        'version.branch_id_snapshot',
        'version.department_id_snapshot',
        'version.loan_facility_type_version_id',
        'type.name as facility_name',
        'type.facility_kind',
        'employment.employee_code',
        'employee.display_name',
      );
  return {
    companyAllowed: (c, id) =>
      c.grants.some((g) => g.scope_type === 'all' || Number(g.company_id) === Number(id)),
    company: (id, trx = db) => trx('companies').where({ id }).first(),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    lockEmployment: (id, trx) => trx('employments').where({ id }).forUpdate().first(),
    employmentContext: (id, date, trx = db) =>
      trx('employments as e')
        .join('employees as employee', 'employee.id', 'e.employee_id')
        .join('employment_status_history as status', function () {
          this.on('status.employment_id', 'e.id')
            .andOnVal('status.history_status', 'current')
            .andOn('status.effective_start', '<=', trx.raw('?', [date]))
            .andOn(function () {
              this.onNull('status.effective_end').orOn(
                'status.effective_end',
                '>=',
                trx.raw('?', [date]),
              );
            });
        })
        .join('employee_assignments as a', function () {
          this.on('a.employment_id', 'e.id')
            .andOnVal('a.history_status', 'current')
            .andOn('a.effective_start', '<=', trx.raw('?', [date]))
            .andOn(function () {
              this.onNull('a.effective_end').orOn('a.effective_end', '>=', trx.raw('?', [date]));
            });
        })
        .leftJoin('employments as me', 'me.id', 'a.manager_employment_id')
        .leftJoin('employees as manager', 'manager.id', 'me.employee_id')
        .where('e.id', id)
        .first(
          'e.*',
          'employee.user_id',
          'status.status as employment_status',
          'a.branch_id',
          'a.department_id',
          'a.manager_employment_id',
          'manager.user_id as manager_user_id',
        ),
    lockType: (id, trx) => trx('loan_facility_types').where({ id }).forUpdate().first(),
    type: (id, trx = db) => trx('loan_facility_types').where({ id }).first(),
    typeVersions: (id, trx = db) =>
      trx('loan_facility_type_versions')
        .where({ loan_facility_type_id: id })
        .orderBy('version_number', 'desc'),
    effectiveType: (id, date, trx = db) =>
      trx('loan_facility_type_versions')
        .where({ loan_facility_type_id: id, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .first(),
    typeOverlap: (id, start, end, trx) =>
      trx('loan_facility_type_versions')
        .where({ loan_facility_type_id: id, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', start))
        .first(),
    nextTypeVersion: async (id, trx) =>
      Number(
        (
          await trx('loan_facility_type_versions')
            .where({ loan_facility_type_id: id })
            .max({ n: 'version_number' })
            .first()
        ).n ?? 0,
      ) + 1,
    listTypes: (context, input) => {
      assertAccessContext(context, 'loan_type.view');
      return context.grants.some(
        (g) => g.scope_type === 'all' || Number(g.company_id) === Number(input.companyId),
      )
        ? db('loan_facility_types as type')
            .leftJoin('loan_facility_type_versions as version', function () {
              this.on('version.loan_facility_type_id', 'type.id').andOnVal(
                'version.history_status',
                'current',
              );
            })
            .where('type.company_id', input.companyId)
            .select(
              'type.*',
              'version.minimum_principal',
              'version.maximum_principal',
              'version.minimum_term_months',
              'version.maximum_term_months',
              'version.installment_due_day',
              'version.currency_code',
            )
            .limit(input.pageSize)
            .offset((input.page - 1) * input.pageSize)
        : [];
    },
    lockApplication: (id, trx) => trx('loan_applications').where({ id }).forUpdate().first(),
    applicationScoped: (id, c, p, trx = db) =>
      scoped(base(trx).where('application.id', id), c, p).first(),
    list: (c, input, p) =>
      scoped(
        base().modify((q) => {
          if (input.companyId) q.where('application.company_id', input.companyId);
          if (input.status) q.where('application.status', input.status);
        }),
        c,
        p,
      )
        .orderBy('application.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
    currentVersion: (id, trx = db) =>
      trx('loan_application_versions')
        .where({ loan_application_id: id })
        .orderBy('version_number', 'desc')
        .first(),
    pendingAttempt: (id, type, trx) =>
      trx('loan_approval_attempts')
        .where({ loan_application_id: id, step_type: type, status: 'pending' })
        .forUpdate()
        .first(),
    lockAccount: (id, trx) => trx('loan_accounts').where({ id }).forUpdate().first(),
    accountScoped: (id, c, p, trx = db) => {
      assertAccessContext(c, p);
      let q = trx('loan_accounts as account')
        .join('loan_applications as application', 'application.id', 'account.loan_application_id')
        .join('loan_application_versions as version', function () {
          this.on('version.loan_application_id', 'application.id').andOn(
            'version.version_number',
            'application.current_version_number',
          );
        })
        .join('employments as employment', 'employment.id', 'account.employment_id')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .where('account.id', id)
        .select(
          'account.*',
          'application.created_by as claimant_user_id',
          'version.manager_user_id_snapshot',
          'version.branch_id_snapshot',
          'version.department_id_snapshot',
          'employee.user_id',
        );
      return scoped(q, c, p).first();
    },
    history: async (id, trx = db) => ({
      versions: await trx('loan_application_versions')
        .where({ loan_application_id: id })
        .orderBy('version_number'),
      states: await trx('loan_state_events')
        .where({ loan_application_id: id })
        .orderBy('workflow_version'),
      attempts: await trx('loan_approval_attempts')
        .where({ loan_application_id: id })
        .orderBy('id'),
      decisions: await trx('loan_approval_decisions')
        .where({ loan_application_id: id })
        .orderBy('id'),
      account: await trx('loan_accounts').where({ loan_application_id: id }).first(),
    }),
  };
}
