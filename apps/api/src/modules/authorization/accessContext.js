import { AuthorizationError } from '../../common/errors/ApplicationError.js';

export function createAccessContext({ actor, permission, grants }) {
  if (!actor || !permission || !Array.isArray(grants)) {
    throw new AuthorizationError('A valid server authorization context is required.');
  }
  return Object.freeze({
    actor: Object.freeze({ ...actor }),
    permission,
    grants: Object.freeze(grants),
  });
}

export function assertAccessContext(accessContext, permission) {
  if (!accessContext || accessContext.permission !== permission || !accessContext.actor) {
    throw new AuthorizationError('A valid server authorization context is required.');
  }
}

export function scopeMatches(grant, record) {
  if (grant.scope_type === 'all') return true;
  if (grant.company_id != null && Number(grant.company_id) !== Number(record.companyId))
    return false;
  if (grant.scope_type === 'company') return true;
  if (grant.scope_type === 'own') return Number(record.ownerUserId) === Number(record.actorUserId);
  if (grant.scope_type === 'branch') return Number(grant.branch_id) === Number(record.branchId);
  if (grant.scope_type === 'department')
    return Number(grant.department_id) === Number(record.departmentId);
  if (grant.scope_type === 'direct_reports') return record.isDirectReport === true;
  return false;
}

export function intersectSensitiveAccess(baseContext, sensitiveContext, record) {
  assertAccessContext(baseContext, baseContext.permission);
  assertAccessContext(sensitiveContext, sensitiveContext.permission);
  const evaluatedRecord = { ...record, actorUserId: baseContext.actor.userId };
  return (
    baseContext.grants.some((grant) => scopeMatches(grant, evaluatedRecord)) &&
    sensitiveContext.grants.some((grant) => scopeMatches(grant, evaluatedRecord))
  );
}
