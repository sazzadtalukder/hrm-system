import { assertAccessContext } from '../authorization/accessContext.js';

export function createUserRepository() {
  function restrictToCompany(query, companyId) {
    if (!companyId) return query;
    return query.where((builder) =>
      builder
        .whereExists((assigned) =>
          assigned
            .select(1)
            .from('role_assignments as scoped_assignment')
            .whereColumn('scoped_assignment.user_id', 'user.id')
            .where('scoped_assignment.company_id', companyId),
        )
        .orWhereExists((created) =>
          created
            .select(1)
            .from('audit_events as creation_event')
            .whereColumn('creation_event.subject_user_id', 'user.id')
            .where({
              'creation_event.company_id': companyId,
              'creation_event.action_code': 'user.create',
              'creation_event.outcome': 'success',
            }),
        ),
    );
  }

  return {
    list({ companyId, search, limit, offset }, accessContext, trx) {
      assertAccessContext(accessContext, 'user.view');
      const query = trx('users as user')
        .leftJoin('role_assignments as assignment', function () {
          this.on('assignment.user_id', 'user.id').andOnVal('assignment.status', 'active');
          if (companyId) this.andOnVal('assignment.company_id', companyId);
        })
        .leftJoin('roles as role', 'role.id', 'assignment.role_id')
        .select(
          'user.id',
          'user.email',
          'user.status',
          'user.provisioning_status',
          'user.administratively_deactivated_at',
          'user.created_at',
          'user.updated_at',
          trx.raw('GROUP_CONCAT(DISTINCT role.code ORDER BY role.code) as role_codes'),
        )
        .groupBy(
          'user.id',
          'user.email',
          'user.status',
          'user.provisioning_status',
          'user.administratively_deactivated_at',
          'user.created_at',
          'user.updated_at',
        )
        .orderBy('user.email')
        .limit(limit)
        .offset(offset);
      restrictToCompany(query, companyId);
      if (search) query.whereRaw('LOWER(??) LIKE ?', ['user.email', `%${search.toLowerCase()}%`]);
      return query;
    },
    async count({ companyId, search }, accessContext, trx) {
      assertAccessContext(accessContext, 'user.view');
      const query = trx('users as user').leftJoin(
        'role_assignments as assignment',
        'assignment.user_id',
        'user.id',
      );
      restrictToCompany(query, companyId);
      if (search) query.whereRaw('LOWER(??) LIKE ?', ['user.email', `%${search.toLowerCase()}%`]);
      const row = await query.countDistinct({ total: 'user.id' }).first();
      return Number(row.total);
    },
    findById(id, accessContext, trx) {
      assertAccessContext(accessContext, 'user.view');
      return trx('users')
        .where({ id })
        .first(
          'id',
          'email',
          'status',
          'provisioning_status',
          'administratively_deactivated_at',
          'created_at',
          'updated_at',
        );
    },
    async create(values, accessContext, trx) {
      assertAccessContext(accessContext, 'user.create');
      const [id] = await trx('users').insert(values);
      return id;
    },
    lock(id, accessContext, permission, trx) {
      assertAccessContext(accessContext, permission);
      return trx('users').where({ id }).forUpdate().first();
    },
    update(id, values, accessContext, permission, trx) {
      assertAccessContext(accessContext, permission);
      return trx('users')
        .where({ id })
        .update({ ...values, updated_at: trx.fn.now() });
    },
    listAssignedCompanyIds(id, accessContext, permission, trx) {
      assertAccessContext(accessContext, permission);
      return trx('role_assignments')
        .where({ user_id: id, status: 'active' })
        .whereNotNull('company_id')
        .distinct('company_id');
    },
    listCreationCompanyIds(id, accessContext, permission, trx) {
      assertAccessContext(accessContext, permission);
      return trx('audit_events')
        .where({ subject_user_id: id, action_code: 'user.create', outcome: 'success' })
        .whereNotNull('company_id')
        .distinct('company_id');
    },
  };
}
