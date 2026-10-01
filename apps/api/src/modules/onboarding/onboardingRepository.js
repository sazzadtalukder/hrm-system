import { assertAccessContext } from '../authorization/accessContext.js';
export function createOnboardingRepository(_db) {
  const allowed = (c, companyId) =>
    c.grants.some((g) => g.scope_type === 'all' || Number(g.company_id) === Number(companyId));
  const scoped = (q, c, p, table = 'record') => {
    assertAccessContext(c, p);
    if (c.grants.some((g) => g.scope_type === 'all')) return q;
    return q.where((outer) => {
      let used = false;
      for (const grant of c.grants) {
        if (grant.scope_type === 'company') {
          used = true;
          outer.orWhere(`${table}.company_id`, grant.company_id);
        }
        if (grant.scope_type === 'own' && table === 'record') {
          used = true;
          outer.orWhere((inner) =>
            inner
              .where(`${table}.company_id`, grant.company_id)
              .whereExists((employee) =>
                employee
                  .select(1)
                  .from('employees as employee')
                  .whereRaw(`employee.id = ${table}.employee_id`)
                  .where('employee.user_id', c.actor.userId),
              ),
          );
        }
      }
      if (!used) outer.whereRaw('1=0');
    });
  };
  return {
    allowed,
    scoped,
    lock: (table, id, trx) => trx(table).where({ id }).forUpdate().first(),
  };
}
