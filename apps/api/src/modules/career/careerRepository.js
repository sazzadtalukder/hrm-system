import { assertAccessContext } from '../authorization/accessContext.js';
function scoped(q, c, p) {
  assertAccessContext(c, p);
  if (c.grants.some((g) => g.scope_type === 'all')) return q;
  return q.where((s) => {
    let used = false;
    for (const g of c.grants) {
      if (!['company', 'branch', 'department', 'own', 'direct_reports'].includes(g.scope_type))
        continue;
      used = true;
      s.orWhere((x) => {
        if (g.company_id != null) x.where('plan.company_id', g.company_id);
        if (g.scope_type === 'branch') x.where('snapshot.branch_id_snapshot', g.branch_id);
        else if (g.scope_type === 'department')
          x.where('snapshot.department_id_snapshot', g.department_id);
        else if (g.scope_type === 'own') x.where('employee.user_id', c.actor.userId);
        else if (g.scope_type === 'direct_reports')
          x.where('snapshot.manager_user_id_snapshot', c.actor.userId);
      });
    }
    if (!used) s.whereRaw('1=0');
  });
}
export function createCareerRepository(db) {
  const base = (trx = db) =>
    trx('career_plans as plan')
      .join('career_plan_versions as snapshot', function () {
        this.on('snapshot.career_plan_id', 'plan.id').andOn(
          'snapshot.version_number',
          'plan.current_version_number',
        );
      })
      .join('employments as employment', 'employment.id', 'plan.employment_id')
      .join('employees as employee', 'employee.id', 'employment.employee_id')
      .select(
        'plan.*',
        'snapshot.employee_code_snapshot',
        'snapshot.employee_name_snapshot',
        'snapshot.manager_employment_id_snapshot',
        'snapshot.manager_user_id_snapshot',
        'snapshot.branch_id_snapshot',
        'snapshot.department_id_snapshot',
        'snapshot.designation_id_snapshot',
        'snapshot.career_path_version_id',
        'snapshot.target_designation_id',
        'snapshot.career_direction',
        'snapshot.employee_narrative',
        'snapshot.plan_start',
        'snapshot.plan_end',
        'employee.user_id',
      );
  return {
    companyAllowed: (c, id) =>
      c.grants.some((g) => g.scope_type === 'all' || Number(g.company_id) === Number(id)),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    lockPlan: (id, trx) => trx('career_plans').where({ id }).forUpdate().first(),
    pathScoped: (id, c, p, trx = db) => {
      assertAccessContext(c, p);
      const q = trx('career_paths as path').where('path.id', id).select('path.*');
      if (c.grants.some((g) => g.scope_type === 'all')) return q.first();
      const companies = c.grants
        .filter((g) => ['company', 'branch', 'department'].includes(g.scope_type))
        .map((g) => g.company_id);
      return (
        companies.length ? q.whereIn('path.company_id', companies) : q.whereRaw('1=0')
      ).first();
    },
    scoped: (id, c, p, trx = db) => scoped(base(trx).where('plan.id', id), c, p).first(),
    list: (c, p, input) =>
      scoped(
        base().modify((q) => {
          if (input.companyId) q.where('plan.company_id', input.companyId);
          if (input.status) q.where('plan.status', input.status);
        }),
        c,
        p,
      )
        .orderBy('plan.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
    history: async (id, trx = db) => {
      const goals = await trx('career_plan_goals as g')
        .join('career_plan_goal_versions as v', 'v.career_plan_goal_id', 'g.id')
        .where('g.career_plan_id', id)
        .select('v.*')
        .orderBy(['g.id', 'v.version_number']);
      const mappings = goals.length
        ? await trx('career_plan_goal_competencies')
            .whereIn(
              'career_plan_goal_version_id',
              goals.map((goal) => goal.id),
            )
            .select('career_plan_goal_version_id', 'performance_competency_version_id')
        : [];
      return {
        versions: await trx('career_plan_versions')
          .where({ career_plan_id: id })
          .orderBy('version_number'),
        states: await trx('career_plan_state_events')
          .where({ career_plan_id: id })
          .orderBy('workflow_version'),
        decisions: await trx('career_plan_decisions').where({ career_plan_id: id }).orderBy('id'),
        reassignments: await trx('career_plan_manager_reassignments')
          .where({ career_plan_id: id })
          .orderBy('id'),
        goals: goals.map((goal) => ({
          ...goal,
          competency_version_ids: mappings
            .filter((mapping) => Number(mapping.career_plan_goal_version_id) === Number(goal.id))
            .map((mapping) => mapping.performance_competency_version_id),
        })),
        actions: await trx('career_development_actions as a')
          .join('career_development_action_versions as v', 'v.career_development_action_id', 'a.id')
          .where('a.career_plan_id', id)
          .select('v.*')
          .orderBy(['a.id', 'v.version_number']),
        evidenceReferences: await trx('career_development_action_evidence_references as evidence')
          .join(
            'career_development_action_versions as version',
            'version.id',
            'evidence.career_development_action_version_id',
          )
          .join(
            'career_development_actions as action',
            'action.id',
            'version.career_development_action_id',
          )
          .where('action.career_plan_id', id)
          .select('evidence.*')
          .orderBy('evidence.id'),
      };
    },
  };
}
