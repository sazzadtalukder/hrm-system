import { assertAccessContext } from '../authorization/accessContext.js';

function scoped(query, context, permission, alias = 'asset') {
  assertAccessContext(context, permission);
  if (context.grants.some((grant) => grant.scope_type === 'all')) return query;
  return query.where((outer) => {
    let used = false;
    for (const grant of context.grants) {
      if (!['company', 'branch', 'department', 'own'].includes(grant.scope_type)) continue;
      used = true;
      outer.orWhere((inner) => {
        inner.where(`${alias}.company_id`, grant.company_id);
        if (grant.scope_type === 'branch')
          inner.where('assignment_snapshot.branch_id', grant.branch_id);
        if (grant.scope_type === 'department')
          inner.where('assignment_snapshot.department_id', grant.department_id);
        if (grant.scope_type === 'own') inner.where('employee.user_id', context.actor.userId);
      });
    }
    if (!used) outer.whereRaw('1=0');
  });
}

export function createAssetRepository(db) {
  const base = (trx = db) =>
    trx('assets as asset')
      .leftJoin('asset_assignments as custody', function () {
        this.on('custody.asset_id', 'asset.id').andOnVal('custody.status', 'active');
      })
      .leftJoin('employments as employment', 'employment.id', 'custody.employment_id')
      .leftJoin('employees as employee', 'employee.id', 'employment.employee_id')
      .leftJoin('employee_assignments as assignment_snapshot', function () {
        this.on('assignment_snapshot.employment_id', 'employment.id').andOnVal(
          'assignment_snapshot.history_status',
          'current',
        );
      })
      .select(
        'asset.*',
        'custody.id as active_assignment_id',
        'custody.employment_id',
        'employment.employee_code',
        'employee.display_name as employee_name',
      );
  return {
    companyAllowed: (context, companyId) =>
      context.grants.some(
        (grant) => grant.scope_type === 'all' || Number(grant.company_id) === Number(companyId),
      ),
    list: (context, input, permission) =>
      scoped(
        base().modify((query) => {
          query.where('asset.company_id', input.companyId);
          if (input.status) query.where('asset.status', input.status);
        }),
        context,
        permission,
      )
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .orderBy('asset.id', 'desc'),
    get: (context, id, permission, trx = db) =>
      scoped(base(trx).where('asset.id', id), context, permission).first(),
    lock: (id, trx) => trx('assets').where({ id }).forUpdate().first(),
    history: (id) => db('asset_events').where({ asset_id: id }).orderBy('id'),
  };
}
