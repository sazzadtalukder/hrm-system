import { assertAccessContext } from '../authorization/accessContext.js';

function applyScope(query, context, permission) {
  assertAccessContext(context, permission);
  if (context.grants.some((g) => g.scope_type === 'all')) return query;
  return query.where((scope) => {
    let applied = false;
    for (const grant of context.grants) {
      if (grant.scope_type === 'company') {
        scope.orWhere('claim.company_id', grant.company_id);
        applied = true;
      } else if (grant.scope_type === 'branch') {
        scope.orWhere('version.branch_id_snapshot', grant.branch_id);
        applied = true;
      } else if (grant.scope_type === 'department') {
        scope.orWhere('version.department_id_snapshot', grant.department_id);
        applied = true;
      } else if (grant.scope_type === 'own') {
        scope.orWhere('employee.user_id', context.actor.userId);
        applied = true;
      } else if (grant.scope_type === 'direct_reports') {
        scope.orWhere('version.manager_user_id_snapshot', context.actor.userId);
        applied = true;
      }
    }
    if (!applied) scope.whereRaw('1=0');
  });
}

export function createClaimRepository(database) {
  const base = (trx = database) =>
    trx('expense_claims as claim')
      .join('expense_claim_versions as version', function () {
        this.on('version.expense_claim_id', 'claim.id').andOn(
          'version.version_number',
          'claim.current_version_number',
        );
      })
      .join('employments as employment', 'employment.id', 'claim.employment_id')
      .join('employees as employee', 'employee.id', 'employment.employee_id')
      .select(
        'claim.*',
        'version.title',
        'version.business_purpose',
        'version.currency_code',
        'version.total_amount',
        'version.submission_anchor_date',
        'version.manager_user_id_snapshot',
        'version.manager_employment_id_snapshot',
        'version.branch_id_snapshot',
        'version.department_id_snapshot',
        'employment.employee_code',
        'employee.display_name',
      );
  return {
    companyAllowed: (context, companyId) =>
      context.grants.some(
        (g) => g.scope_type === 'all' || Number(g.company_id) === Number(companyId),
      ),
    company: (id, trx = database) => trx('companies').where({ id }).first(),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    lockEmployment: (id, trx) => trx('employments').where({ id }).forUpdate().first(),
    employmentContext: (id, date, trx = database) =>
      trx('employments as employment')
        .join('employees as employee', 'employee.id', 'employment.employee_id')
        .join('employment_status_history as status', function () {
          this.on('status.employment_id', 'employment.id')
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
        .join('employee_assignments as assignment', function () {
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
        .leftJoin(
          'employments as manager_employment',
          'manager_employment.id',
          'assignment.manager_employment_id',
        )
        .leftJoin(
          'employees as manager_employee',
          'manager_employee.id',
          'manager_employment.employee_id',
        )
        .where('employment.id', id)
        .first(
          'employment.*',
          'employee.user_id',
          'status.status as employment_status',
          'assignment.branch_id',
          'assignment.department_id',
          'assignment.manager_employment_id',
          'manager_employee.user_id as manager_user_id',
        ),
    lockCategory: (id, trx) => trx('claim_categories').where({ id }).forUpdate().first(),
    category: (id, trx = database) => trx('claim_categories').where({ id }).first(),
    categoryVersions: (id, trx = database) =>
      trx('claim_category_versions')
        .where({ claim_category_id: id })
        .orderBy('version_number', 'desc'),
    categoryVersion: (id, date, trx = database) =>
      trx('claim_category_versions')
        .where({ claim_category_id: id, history_status: 'current' })
        .where('effective_start', '<=', date)
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', date))
        .orderBy('effective_start', 'desc')
        .first(),
    categoryOverlap: (id, start, end, trx) =>
      trx('claim_category_versions')
        .where({ claim_category_id: id, history_status: 'current' })
        .where('effective_start', '<=', end ?? '9999-12-31')
        .where((q) => q.whereNull('effective_end').orWhere('effective_end', '>=', start))
        .first(),
    listCategories(context, input) {
      assertAccessContext(context, 'claim_category.view');
      return context.grants.some(
        (g) => g.scope_type === 'all' || Number(g.company_id) === Number(input.companyId),
      )
        ? database('claim_categories as category')
            .leftJoin('claim_category_versions as version', function () {
              this.on('version.claim_category_id', 'category.id').andOnVal(
                'version.history_status',
                'current',
              );
            })
            .where('category.company_id', input.companyId)
            .select(
              'category.*',
              'version.receipt_required',
              'version.maximum_item_amount',
              'version.currency_code',
              'version.sensitive_classification',
            )
            .limit(input.pageSize)
            .offset((input.page - 1) * input.pageSize)
        : [];
    },
    nextCategoryVersion: async (id, trx) =>
      Number(
        (
          await trx('claim_category_versions')
            .where({ claim_category_id: id })
            .max({ n: 'version_number' })
            .first()
        ).n ?? 0,
      ) + 1,
    lockClaim: (id, trx) => trx('expense_claims').where({ id }).forUpdate().first(),
    claimScoped: async (id, context, permission, trx = database) =>
      applyScope(base(trx).where('claim.id', id), context, permission).first(),
    listClaims: (context, input, permission) =>
      applyScope(
        base().modify((q) => {
          if (input.companyId) q.where('claim.company_id', input.companyId);
          if (input.status) q.where('claim.status', input.status);
        }),
        context,
        permission,
      )
        .orderBy('claim.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
    currentVersion: (id, trx = database) =>
      trx('expense_claim_versions')
        .where({ expense_claim_id: id })
        .orderBy('version_number', 'desc')
        .first(),
    items: (versionId, trx = database) =>
      trx('expense_claim_items').where({ expense_claim_version_id: versionId }).orderBy('id'),
    evidence: (itemIds, trx = database) =>
      itemIds.length ? trx('expense_claim_evidence').whereIn('expense_claim_item_id', itemIds) : [],
    pendingAttempt: (id, type, trx) =>
      trx('expense_claim_approval_attempts')
        .where({ expense_claim_id: id, step_type: type, status: 'pending' })
        .orderBy('attempt_number', 'desc')
        .forUpdate()
        .first(),
    history: async (id, trx = database) => ({
      versions: await trx('expense_claim_versions')
        .where({ expense_claim_id: id })
        .orderBy('version_number'),
      states: await trx('expense_claim_state_events')
        .where({ expense_claim_id: id })
        .orderBy('workflow_version'),
      attempts: await trx('expense_claim_approval_attempts')
        .where({ expense_claim_id: id })
        .orderBy('id'),
      decisions: await trx('expense_claim_approval_decisions')
        .where({ expense_claim_id: id })
        .orderBy('id'),
      payment: await trx('expense_claim_payments').where({ expense_claim_id: id }).first(),
    }),
  };
}
