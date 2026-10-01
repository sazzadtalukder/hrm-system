import { ConflictError, ValidationError } from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';

function normalizeScope(input) {
  const { scopeType, companyId, branchId, departmentId } = input;
  if (scopeType === 'all')
    return { scopeKey: 'all', companyId: null, branchId: null, departmentId: null };
  if (!companyId) throw new ValidationError('A company is required for this scope.');
  if (scopeType === 'branch') {
    if (!branchId) throw new ValidationError('A branch is required for branch scope.');
    return { scopeKey: `branch:${branchId}`, companyId, branchId, departmentId: null };
  }
  if (scopeType === 'department') {
    if (!departmentId) throw new ValidationError('A department is required for department scope.');
    return { scopeKey: `department:${departmentId}`, companyId, branchId: null, departmentId };
  }
  if (scopeType === 'company')
    return { scopeKey: `company:${companyId}`, companyId, branchId: null, departmentId: null };
  if (scopeType === 'own' || scopeType === 'direct_reports') {
    return { scopeKey: `${scopeType}:${companyId}`, companyId, branchId: null, departmentId: null };
  }
  throw new ValidationError('The authorization scope is invalid.');
}

function actorCanAdministerScope(accessContext, target) {
  return accessContext.grants.some((grant) => {
    if (grant.scope_type === 'all') return true;
    if (Number(grant.company_id) !== Number(target.companyId)) return false;
    if (grant.scope_type === 'company') return true;
    if (grant.scope_type === 'branch') {
      return target.scopeType === 'branch' && Number(grant.branch_id) === Number(target.branchId);
    }
    if (grant.scope_type === 'department') {
      return (
        target.scopeType === 'department' &&
        Number(grant.department_id) === Number(target.departmentId)
      );
    }
    return false;
  });
}

export function createAccessService({ database, accessRepository }) {
  return {
    async listRoles({ accessContext }) {
      const rows = await accessRepository.listRoles(accessContext, database);
      return rows.map((role) => ({
        ...role,
        permission_codes: role.permission_codes ? role.permission_codes.split(',') : [],
      }));
    },
    listDirectGrantPermissions({ accessContext }) {
      return accessRepository.listDirectGrantPermissions(accessContext, database);
    },
    async listRoleAssignments({ accessContext, userId }) {
      const rows = await accessRepository.listRoleAssignments(userId, accessContext, database);
      return rows.filter((row) =>
        actorCanAdministerScope(accessContext, {
          scopeType: row.scope_type,
          companyId: row.company_id,
          branchId: row.branch_id,
          departmentId: row.department_id,
        }),
      );
    },
    async listPermissionGrants({ accessContext, userId }) {
      const rows = await accessRepository.listPermissionGrants(userId, accessContext, database);
      return rows.filter((row) =>
        actorCanAdministerScope(accessContext, {
          scopeType: row.scope_type,
          companyId: row.company_id,
          branchId: row.branch_id,
          departmentId: row.department_id,
        }),
      );
    },
    async assignRole({ actor, accessContext, input, requestContext }) {
      const scope = normalizeScope(input);
      if (!actorCanAdministerScope(accessContext, { ...input, ...scope })) {
        throw new ValidationError('The requested scope is outside your authorization authority.');
      }
      return withTransaction(database, async (trx) => {
        const user = await accessRepository.lockUserForAssignment(input.userId, accessContext, trx);
        if (!user) throw new ValidationError('The target user does not exist.');
        const role = await accessRepository.findRoleByCode(input.roleCode, accessContext, trx);
        if (!role) throw new ValidationError('The role does not exist.');
        const assignmentValues = {
          user_id: user.id,
          role_id: role.id,
          company_id: scope.companyId,
          scope_type: input.scopeType,
          scope_key: scope.scopeKey,
          branch_id: scope.branchId,
          department_id: scope.departmentId,
          effective_start: input.effectiveStart,
          effective_end: input.effectiveEnd ?? null,
          assigned_by: actor.userId,
        };
        if (
          await accessRepository.findOverlappingRoleAssignment(assignmentValues, accessContext, trx)
        ) {
          throw new ConflictError(
            'ROLE_ASSIGNMENT_OVERLAP',
            'This role scope overlaps an existing assignment.',
          );
        }
        let id;
        try {
          id = await accessRepository.createRoleAssignment(assignmentValues, accessContext, trx);
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'ROLE_ALREADY_ASSIGNED',
              'This role scope is already assigned.',
            );
          throw error;
        }
        await trx('users')
          .where({ id: user.id })
          .update({ auth_version: user.auth_version + 1, updated_at: trx.fn.now() });
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: user.id,
          companyId: scope.companyId,
          actionCode: 'authorization.role_assign',
          outcome: 'success',
          recordType: 'role_assignment',
          recordId: id,
          permissionCode: 'role.assign',
          scopeType: input.scopeType,
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
          metadata: { roleCode: role.code, scopeKey: scope.scopeKey },
        });
        return { id };
      });
    },
    async grantPermission({ actor, accessContext, input, requestContext }) {
      const scope = normalizeScope(input);
      if (!actorCanAdministerScope(accessContext, { ...input, ...scope })) {
        throw new ValidationError('The requested scope is outside your authorization authority.');
      }
      return withTransaction(database, async (trx) => {
        const user = await accessRepository.lockUserForAssignment(input.userId, accessContext, trx);
        if (!user) throw new ValidationError('The target user does not exist.');
        const permission = await accessRepository.findPermissionByCode(
          input.permissionCode,
          accessContext,
          trx,
        );
        if (!permission || !permission.is_sensitive || !permission.allow_direct_grant) {
          throw new ValidationError('This permission is not approved for direct grants.');
        }
        const grantValues = {
          user_id: user.id,
          permission_id: permission.id,
          company_id: scope.companyId,
          scope_type: input.scopeType,
          scope_key: scope.scopeKey,
          branch_id: scope.branchId,
          department_id: scope.departmentId,
          effective_start: input.effectiveStart,
          effective_end: input.effectiveEnd ?? null,
          reason: input.reason,
          granted_by: actor.userId,
        };
        if (
          await accessRepository.findOverlappingPermissionGrant(grantValues, accessContext, trx)
        ) {
          throw new ConflictError(
            'PERMISSION_GRANT_OVERLAP',
            'This permission scope overlaps an existing grant.',
          );
        }
        let id;
        try {
          id = await accessRepository.createPermissionGrant(grantValues, accessContext, trx);
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') {
            throw new ConflictError(
              'PERMISSION_ALREADY_GRANTED',
              'This permission scope is already granted.',
            );
          }
          throw error;
        }
        await trx('users')
          .where({ id: user.id })
          .update({ auth_version: user.auth_version + 1, updated_at: trx.fn.now() });
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: user.id,
          companyId: scope.companyId,
          actionCode: 'authorization.permission_grant',
          outcome: 'success',
          recordType: 'user_permission_grant',
          recordId: id,
          permissionCode: input.permissionCode,
          scopeType: input.scopeType,
          reason: input.reason,
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
        });
        return { id };
      });
    },
    async revokePermission({ actor, accessContext, grantId, reason, requestContext }) {
      await withTransaction(database, async (trx) => {
        const grant = await accessRepository.lockPermissionGrant(grantId, accessContext, trx);
        if (!grant || grant.status !== 'active') {
          throw new ConflictError(
            'PERMISSION_GRANT_INACTIVE',
            'The permission grant is not active.',
          );
        }
        if (
          !actorCanAdministerScope(accessContext, {
            scopeType: grant.scope_type,
            companyId: grant.company_id,
            branchId: grant.branch_id,
            departmentId: grant.department_id,
          })
        ) {
          throw new ValidationError(
            'The permission grant is outside your authorization authority.',
          );
        }
        const user = await trx('users').where({ id: grant.user_id }).forUpdate().first();
        await accessRepository.revokePermissionGrant(
          grant.id,
          {
            status: 'revoked',
            revoked_at: trx.fn.now(),
            revoked_by: actor.userId,
            revoke_reason: reason,
          },
          accessContext,
          trx,
        );
        await trx('users')
          .where({ id: user.id })
          .update({ auth_version: user.auth_version + 1, updated_at: trx.fn.now() });
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: user.id,
          companyId: grant.company_id,
          actionCode: 'authorization.permission_revoke',
          outcome: 'success',
          recordType: 'user_permission_grant',
          recordId: grant.id,
          permissionCode: 'user.assign_role',
          scopeType: grant.scope_type,
          reason,
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
        });
      });
    },
    async revokeRole({ actor, accessContext, assignmentId, reason, requestContext }) {
      await withTransaction(database, async (trx) => {
        const assignment = await accessRepository.lockRoleAssignment(
          assignmentId,
          accessContext,
          trx,
        );
        if (!assignment || assignment.status !== 'active')
          throw new ConflictError('ROLE_ASSIGNMENT_INACTIVE', 'The role assignment is not active.');
        if (
          !actorCanAdministerScope(accessContext, {
            scopeType: assignment.scope_type,
            companyId: assignment.company_id,
            branchId: assignment.branch_id,
            departmentId: assignment.department_id,
          })
        ) {
          throw new ValidationError('The role assignment is outside your authorization authority.');
        }
        const user = await trx('users').where({ id: assignment.user_id }).forUpdate().first();
        await accessRepository.revokeRoleAssignment(
          assignment.id,
          {
            status: 'revoked',
            revoked_at: trx.fn.now(),
            revoked_by: actor.userId,
            revoke_reason: reason,
          },
          accessContext,
          trx,
        );
        await trx('users')
          .where({ id: user.id })
          .update({ auth_version: user.auth_version + 1, updated_at: trx.fn.now() });
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: user.id,
          companyId: assignment.company_id,
          actionCode: 'authorization.role_revoke',
          outcome: 'success',
          recordType: 'role_assignment',
          recordId: assignment.id,
          permissionCode: 'role.revoke',
          scopeType: assignment.scope_type,
          reason,
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
        });
      });
    },
  };
}
