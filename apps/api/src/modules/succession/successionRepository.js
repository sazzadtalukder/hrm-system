import { assertAccessContext } from '../authorization/accessContext.js';
function scoped(q, c, p) {
  assertAccessContext(c, p);
  if (c.grants.some((g) => g.scope_type === 'all')) return q;
  return q.where((s) => {
    let used = false;
    for (const g of c.grants) {
      if (!['company', 'branch', 'department', 'direct_reports'].includes(g.scope_type)) continue;
      used = true;
      s.orWhere((x) => {
        if (g.company_id != null) x.where('nomination.company_id', g.company_id);
        if (g.scope_type === 'branch') x.where('snapshot.branch_id_snapshot', g.branch_id);
        else if (g.scope_type === 'department')
          x.where('snapshot.department_id_snapshot', g.department_id);
        else if (g.scope_type === 'direct_reports')
          x.where('snapshot.manager_user_id_snapshot', c.actor.userId);
      });
    }
    if (!used) s.whereRaw('1=0');
  });
}
export function createSuccessionRepository(db) {
  const base = (trx = db) =>
    trx('successor_nominations as nomination')
      .join('successor_nomination_versions as snapshot', function () {
        this.on('snapshot.successor_nomination_id', 'nomination.id').andOn(
          'snapshot.version_number',
          'nomination.current_version_number',
        );
      })
      .join('succession_plans as plan', 'plan.id', 'nomination.succession_plan_id')
      .select(
        'nomination.*',
        'snapshot.employee_code_snapshot',
        'snapshot.employee_name_snapshot',
        'snapshot.manager_employment_id_snapshot',
        'snapshot.manager_user_id_snapshot',
        'snapshot.branch_id_snapshot',
        'snapshot.department_id_snapshot',
        'snapshot.designation_id_snapshot',
        'snapshot.manager_readiness_recommendation',
        'snapshot.confirmed_readiness',
        'snapshot.strengths',
        'snapshot.development_needs',
        'snapshot.nomination_rationale',
        'snapshot.competency_gap_narrative',
      );
  return {
    companyAllowed: (c, id) =>
      c.grants.some((g) => g.scope_type === 'all' || Number(g.company_id) === Number(id)),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    lockPlan: (id, trx) => trx('succession_plans').where({ id }).forUpdate().first(),
    lockNomination: (id, trx) => trx('successor_nominations').where({ id }).forUpdate().first(),
    positionScoped: (id, c, p, trx = db) => {
      assertAccessContext(c, p);
      const q = trx('critical_positions as position')
        .join('critical_position_versions as snapshot', function () {
          this.on('snapshot.critical_position_id', 'position.id').andOn(
            'snapshot.version_number',
            'position.current_version_number',
          );
        })
        .where('position.id', id)
        .select(
          'position.*',
          'snapshot.id as current_version_id',
          'snapshot.designation_id',
          'snapshot.branch_id',
          'snapshot.department_id',
          'snapshot.criticality',
          'snapshot.description',
          'snapshot.effective_start',
          'snapshot.effective_end',
        );
      if (c.grants.some((g) => g.scope_type === 'all')) return q.first();
      return q
        .where((outer) => {
          let used = false;
          for (const g of c.grants) {
            if (!['company', 'branch', 'department'].includes(g.scope_type)) continue;
            used = true;
            outer.orWhere((inner) => {
              inner.where('position.company_id', g.company_id);
              if (g.scope_type === 'branch') inner.where('snapshot.branch_id', g.branch_id);
              if (g.scope_type === 'department')
                inner.where('snapshot.department_id', g.department_id);
            });
          }
          if (!used) outer.whereRaw('1=0');
        })
        .first();
    },
    planScoped: (id, c, p, trx = db) => {
      assertAccessContext(c, p);
      const q = trx('succession_plans as plan')
        .join('succession_plan_versions as snapshot', function () {
          this.on('snapshot.succession_plan_id', 'plan.id').andOn(
            'snapshot.version_number',
            'plan.current_version_number',
          );
        })
        .where('plan.id', id)
        .select(
          'plan.*',
          'snapshot.id as current_version_id',
          'snapshot.critical_position_code_snapshot',
          'snapshot.critical_position_name_snapshot',
          'snapshot.designation_id_snapshot',
          'snapshot.branch_id_snapshot',
          'snapshot.department_id_snapshot',
          'snapshot.incumbent_employment_id_snapshot',
          'snapshot.incumbent_employee_code_snapshot',
          'snapshot.incumbent_employee_name_snapshot',
          'snapshot.planning_horizon_date',
          'snapshot.risk_rationale',
        );
      if (c.grants.some((g) => g.scope_type === 'all')) return q.first();
      return q
        .where((outer) => {
          let used = false;
          for (const g of c.grants) {
            if (!['company', 'branch', 'department'].includes(g.scope_type)) continue;
            used = true;
            outer.orWhere((inner) => {
              inner.where('plan.company_id', g.company_id);
              if (g.scope_type === 'branch')
                inner.where('snapshot.branch_id_snapshot', g.branch_id);
              if (g.scope_type === 'department')
                inner.where('snapshot.department_id_snapshot', g.department_id);
            });
          }
          if (!used) outer.whereRaw('1=0');
        })
        .first();
    },
    scoped: (id, c, p, trx = db) => scoped(base(trx).where('nomination.id', id), c, p).first(),
    list: (c, p, input) =>
      scoped(
        base().modify((q) => {
          if (input.companyId) q.where('nomination.company_id', input.companyId);
          if (input.status) q.where('nomination.status', input.status);
        }),
        c,
        p,
      )
        .orderBy('nomination.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
    history: async (id, trx = db) => ({
      versions: await trx('successor_nomination_versions')
        .where({ successor_nomination_id: id })
        .orderBy('version_number'),
      decisions: await trx('successor_nomination_decisions')
        .where({ successor_nomination_id: id })
        .orderBy('id'),
      readiness: await trx('successor_nomination_readiness_events')
        .where({ successor_nomination_id: id })
        .orderBy('id'),
      reassignments: await trx('successor_nomination_manager_reassignments')
        .where({ successor_nomination_id: id })
        .orderBy('id'),
    }),
  };
}
