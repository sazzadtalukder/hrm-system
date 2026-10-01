import { assertAccessContext } from '../authorization/accessContext.js';
function scoped(q, c, permission) {
  assertAccessContext(c, permission);
  if (c.grants.some((g) => g.scope_type === 'all')) return q;
  return q.where((s) => {
    let used = false;
    for (const g of c.grants) {
      if (!['company', 'branch', 'department', 'own', 'direct_reports'].includes(g.scope_type))
        continue;
      s.orWhere((grantQuery) => {
        if (g.company_id != null) grantQuery.where('enrollment.company_id', g.company_id);
        if (g.scope_type === 'branch') grantQuery.where('snapshot.branch_id_snapshot', g.branch_id);
        else if (g.scope_type === 'department')
          grantQuery.where('snapshot.department_id_snapshot', g.department_id);
        else if (g.scope_type === 'own') grantQuery.where('employee.user_id', c.actor.userId);
        else if (g.scope_type === 'direct_reports')
          grantQuery.where('snapshot.manager_user_id_snapshot', c.actor.userId);
      });
      used = true;
    }
    if (!used) s.whereRaw('1=0');
  });
}
export function createTrainingRepository(db) {
  const base = (trx = db) =>
    trx('training_enrollments as enrollment')
      .join('training_enrollment_versions as snapshot', function () {
        this.on('snapshot.training_enrollment_id', 'enrollment.id').andOn(
          'snapshot.version_number',
          'enrollment.current_version_number',
        );
      })
      .join('training_sessions as session', 'session.id', 'enrollment.training_session_id')
      .join('training_session_versions as session_version', function () {
        this.on('session_version.training_session_id', 'session.id').andOn(
          'session_version.version_number',
          'session.current_version_number',
        );
      })
      .join('employments as employment', 'employment.id', 'enrollment.employment_id')
      .join('employees as employee', 'employee.id', 'employment.employee_id')
      .select(
        'enrollment.*',
        'snapshot.employee_code_snapshot',
        'snapshot.employee_name_snapshot',
        'snapshot.manager_user_id_snapshot',
        'snapshot.manager_employment_id_snapshot',
        'snapshot.branch_id_snapshot',
        'snapshot.department_id_snapshot',
        'snapshot.request_narrative',
        'session.code as session_code',
        'session.status as session_status',
        'session_version.title_snapshot',
        'session_version.starts_at_utc',
        'session_version.ends_at_utc',
        'employee.user_id',
      );
  return {
    companyAllowed: (c, id) =>
      c.grants.some((g) => g.scope_type === 'all' || Number(g.company_id) === Number(id)),
    lockCompany: (id, trx) => trx('companies').where({ id }).forUpdate().first(),
    lockCourse: (id, trx) => trx('training_courses').where({ id }).forUpdate().first(),
    lockProvider: (id, trx) => trx('training_providers').where({ id }).forUpdate().first(),
    lockSession: (id, trx) => trx('training_sessions').where({ id }).forUpdate().first(),
    lockEnrollment: (id, trx) => trx('training_enrollments').where({ id }).forUpdate().first(),
    enrollmentScoped: (id, c, p, trx = db) =>
      scoped(base(trx).where('enrollment.id', id), c, p).first(),
    listEnrollments: (c, p, input) =>
      scoped(
        base().modify((q) => {
          if (input.companyId) q.where('enrollment.company_id', input.companyId);
          if (input.status) q.where('enrollment.status', input.status);
        }),
        c,
        p,
      )
        .orderBy('enrollment.id', 'desc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
    history: async (id, trx = db) => ({
      versions: await trx('training_enrollment_versions')
        .where({ training_enrollment_id: id })
        .orderBy('version_number'),
      states: await trx('training_enrollment_state_events')
        .where({ training_enrollment_id: id })
        .orderBy('workflow_version'),
      decisions: await trx('training_enrollment_decisions')
        .where({ training_enrollment_id: id })
        .orderBy('id'),
      reassignments: await trx('training_manager_reassignments')
        .where({ training_enrollment_id: id })
        .orderBy('id'),
      participation: await trx('training_participation_records as r')
        .join('training_participation_versions as v', 'v.training_participation_record_id', 'r.id')
        .where('r.training_enrollment_id', id)
        .select('v.*')
        .orderBy('v.version_number'),
      completion: await trx('training_completion_records as r')
        .join('training_completion_versions as v', 'v.training_completion_record_id', 'r.id')
        .where('r.training_enrollment_id', id)
        .select('v.*')
        .orderBy('v.version_number'),
      evidence: await trx('training_completion_records as r')
        .join(
          'training_evidence_references as evidence',
          'evidence.training_completion_record_id',
          'r.id',
        )
        .where('r.training_enrollment_id', id)
        .select('evidence.*')
        .orderBy('evidence.id'),
    }),
  };
}
