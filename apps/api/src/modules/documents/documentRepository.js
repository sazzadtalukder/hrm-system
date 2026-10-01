import { assertAccessContext } from '../authorization/accessContext.js';
function scoped(query, context, permission) {
  assertAccessContext(context, permission);
  if (context.grants.some((grant) => grant.scope_type === 'all')) return query;
  return query.where((outer) => {
    let used = false;
    for (const grant of context.grants) {
      if (!['company', 'branch', 'department', 'own'].includes(grant.scope_type)) continue;
      used = true;
      outer.orWhere((inner) => {
        inner.where('document.company_id', grant.company_id);
        if (grant.scope_type === 'branch')
          inner.where((q) =>
            q.where('document.audience', 'company').orWhere('document.branch_id', grant.branch_id),
          );
        if (grant.scope_type === 'department')
          inner.where((q) =>
            q
              .where('document.audience', 'company')
              .orWhere('document.department_id', grant.department_id),
          );
        if (grant.scope_type === 'own')
          inner.where((q) =>
            q
              .whereIn('document.audience', ['company'])
              .orWhere('employee.user_id', context.actor.userId),
          );
      });
    }
    if (!used) outer.whereRaw('1=0');
  });
}
export function createDocumentRepository(db) {
  const base = (trx = db) =>
    trx('documents as document')
      .join('document_types as type', 'type.id', 'document.document_type_id')
      .join('document_versions as version', function () {
        this.on('version.document_id', 'document.id').andOn(
          'version.version_number',
          'document.current_version_number',
        );
      })
      .leftJoin('employments as employment', 'employment.id', 'document.employment_id')
      .leftJoin('employees as employee', 'employee.id', 'employment.employee_id')
      .select(
        'document.*',
        'type.name as document_type_name',
        'type.is_sensitive',
        'type.acknowledgment_required',
        'version.id as current_version_id',
        'version.reference_type',
        'version.reference_value',
        'version.file_name',
        'version.mime_type',
        'version.checksum_sha256',
        'version.effective_on',
        'version.expires_on',
      );
  return {
    companyAllowed: (context, companyId) =>
      context.grants.some(
        (grant) => grant.scope_type === 'all' || Number(grant.company_id) === Number(companyId),
      ),
    list: (context, input, permission) =>
      scoped(
        base()
          .where('document.company_id', input.companyId)
          .modify((q) => {
            if (input.status) q.where('document.status', input.status);
            if (permission === 'document.view_own') q.where('document.status', 'published');
          }),
        context,
        permission,
      )
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .orderBy('document.id', 'desc'),
    get: (context, id, permission, trx = db) =>
      scoped(
        base(trx)
          .where('document.id', id)
          .modify((query) => {
            if (permission === 'document.view_own') query.where('document.status', 'published');
          }),
        context,
        permission,
      ).first(),
    lock: (id, trx) => trx('documents').where({ id }).forUpdate().first(),
    history: async (id) => ({
      versions: await db('document_versions').where({ document_id: id }).orderBy('version_number'),
      states: await db('document_state_events')
        .where({ document_id: id })
        .orderBy('workflow_version'),
    }),
  };
}
