import { AuthorizationError } from '../../common/errors/ApplicationError.js';
import { createAccessContext } from './accessContext.js';

export function createAuthorizationService({ authorizationRepository }) {
  return {
    async requirePermission(actor, permission) {
      const grants = await authorizationRepository.resolveGrants(actor.userId, permission);
      if (grants.length === 0) throw new AuthorizationError();
      return createAccessContext({ actor, permission, grants });
    },
    async listPermissionCodes(userId) {
      const rows = await authorizationRepository.listEffectivePermissionCodes(userId);
      return rows.map((row) => row.code);
    },
    async listNavigationScopes(userId) {
      const result = {};
      for (const permission of [
        'attendance.view',
        'leave.view',
        'leave.apply',
        'leave_balance.view',
      ]) {
        const grants = await authorizationRepository.resolveGrants(userId, permission);
        result[permission] = [...new Set(grants.map((grant) => grant.scope_type))];
      }
      return result;
    },
  };
}
