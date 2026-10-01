import { assertAccessContext } from '../authorization/accessContext.js';
function scoped(q, c, p) {
  assertAccessContext(c, p);
  if (c.grants.some((g) => g.scope_type === 'all')) return q;
  return q.where((s) => {
    let used = false;
    for (const g of c.grants) {
      if (g.scope_type === 'company') {
        s.orWhere('review.company_id', g.company_id);
        used = true;
      } else if (g.scope_type === 'branch') {
        s.orWhere('snapshot.branch_id_snapshot', g.branch_id);
        used = true;
      } else if (g.scope_type === 'department') {
        s.orWhere('snapshot.department_id_snapshot', g.department_id);
        used = true;
      } else if (g.scope_type === 'own') {
        s.orWhere('employee.user_id', c.actor.userId);
        used = true;
      } else if (g.scope_type === 'direct_reports') {
        s.orWhere('snapshot.manager_user_id_snapshot', c.actor.userId);
        used = true;
      }
    }
    if (!used) s.whereRaw('1=0');
  });
}
export function createPerformanceRepository(db) {
  const base = (trx = db) =>
    trx('performance_reviews as review')
      .join('performance_review_versions as snapshot', function () {
        this.on('snapshot.performance_review_id', 'review.id').andOn(
          'snapshot.version_number',
          'review.current_review_version',
        );
      })
      .join('employments as employment', 'employment.id', 'review.employment_id')
      .join('employees as employee', 'employee.id', 'employment.employee_id')
      .join('performance_cycles as cycle', 'cycle.id', 'review.performance_cycle_id')
      .select(
        'review.*',
        'snapshot.employee_code_snapshot',
        'snapshot.employee_name_snapshot',
        'snapshot.manager_user_id_snapshot',
        'snapshot.branch_id_snapshot',
        'snapshot.department_id_snapshot',
        'snapshot.rating_scale_id_snapshot',
        'snapshot.anchor_date',
        'cycle.name as cycle_name',
        'cycle.review_period_start',
        'cycle.review_period_end',
        'cycle.acknowledgment_due_date',
        'employee.user_id',
      );
  return {
    companyAllowed: (c, id) =>
      c.grants.some((g) => g.scope_type === 'all' || Number(g.company_id) === Number(id)),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    lockCycle: (id, trx) => trx('performance_cycles').where({ id }).forUpdate().first(),
    lockReview: (id, trx) => trx('performance_reviews').where({ id }).forUpdate().first(),
    reviewScoped: (id, c, p, trx = db) => scoped(base(trx).where('review.id', id), c, p).first(),
    list: (c, input, p) =>
      scoped(
        base().modify((q) => {
          if (input.companyId) q.where('review.company_id', input.companyId);
          if (input.status) q.where('review.status', input.status);
        }),
        c,
        p,
      )
        .orderBy('review.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
    history: async (id, trx = db) => ({
      versions: await trx('performance_review_versions')
        .where({ performance_review_id: id })
        .orderBy('version_number'),
      states: await trx('performance_review_state_events')
        .where({ performance_review_id: id })
        .orderBy('workflow_version'),
      goals: await trx('performance_goals').where({ performance_review_id: id }),
      assessments: await trx('performance_assessments').where({ performance_review_id: id }),
      acknowledgments: await trx('performance_review_acknowledgments').where({
        performance_review_id: id,
      }),
    }),
  };
}
