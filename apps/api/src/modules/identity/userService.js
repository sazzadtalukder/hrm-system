import { randomBytes } from 'node:crypto';
import { ConflictError, ValidationError } from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { hashPassword } from './password.js';

export function createUserService({ database, identityRepository, userRepository }) {
  function canManageCompany(accessContext, companyId) {
    return accessContext.grants.some(
      (grant) =>
        grant.scope_type === 'all' ||
        (Number(grant.company_id) === Number(companyId) && grant.scope_type === 'company'),
    );
  }

  async function assertCanManageUser(userId, accessContext, permission, trx) {
    const [assignedCompanies, creationCompanies] = await Promise.all([
      userRepository.listAssignedCompanyIds(userId, accessContext, permission, trx),
      userRepository.listCreationCompanyIds(userId, accessContext, permission, trx),
    ]);
    const companies = [...assignedCompanies, ...creationCompanies];
    if (
      companies.length === 0 ||
      !companies.some(({ company_id: id }) => canManageCompany(accessContext, id))
    ) {
      throw new ValidationError('The user is outside your authorization authority.');
    }
  }

  return {
    async listUsers({ accessContext, input }) {
      const hasAllScope = accessContext.grants.some((grant) => grant.scope_type === 'all');
      if (!input.companyId && !hasAllScope) {
        return { items: [], pagination: { page: input.page, pageSize: input.pageSize, total: 0 } };
      }
      if (input.companyId && !canManageCompany(accessContext, input.companyId)) {
        return { items: [], pagination: { page: input.page, pageSize: input.pageSize, total: 0 } };
      }
      const [items, total] = await Promise.all([
        userRepository.list(
          {
            companyId: input.companyId,
            search: input.search,
            limit: input.pageSize,
            offset: (input.page - 1) * input.pageSize,
          },
          accessContext,
          database,
        ),
        userRepository.count(input, accessContext, database),
      ]);
      return {
        items: items.map((item) => ({
          ...item,
          role_codes: item.role_codes ? item.role_codes.split(',') : [],
        })),
        pagination: { page: input.page, pageSize: input.pageSize, total },
      };
    },
    async getUser({ accessContext, userId }) {
      const user = await userRepository.findById(userId, accessContext, database);
      if (!user) throw new ValidationError('The user does not exist.');
      await assertCanManageUser(userId, accessContext, 'user.view', database);
      return user;
    },
    async updateUser({ actor, accessContext, userId, email, reason, requestContext }) {
      return withTransaction(database, async (trx) => {
        const user = await userRepository.lock(userId, accessContext, 'user.update', trx);
        if (!user) throw new ValidationError('The user does not exist.');
        await assertCanManageUser(user.id, accessContext, 'user.update', trx);
        try {
          await userRepository.update(
            user.id,
            { email: email.trim().toLowerCase(), auth_version: user.auth_version + 1 },
            accessContext,
            'user.update',
            trx,
          );
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'EMAIL_ALREADY_EXISTS',
              'A user with this email already exists.',
            );
          throw error;
        }
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: user.id,
          actionCode: 'user.update',
          outcome: 'success',
          recordType: 'user',
          recordId: user.id,
          permissionCode: 'user.update',
          reason,
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
        });
        return { id: user.id };
      });
    },
    async createUser({ actor, accessContext, email, companyId, requestContext }) {
      if (!canManageCompany(accessContext, companyId)) {
        throw new ValidationError('The requested company is outside your authorization authority.');
      }
      return withTransaction(database, async (trx) => {
        let id;
        try {
          id = await userRepository.create(
            {
              email: email.trim().toLowerCase(),
              password_hash: await hashPassword(randomBytes(48).toString('base64url')),
              status: 'inactive',
              provisioning_status: 'pending_setup',
            },
            accessContext,
            trx,
          );
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'EMAIL_ALREADY_EXISTS',
              'A user with this email already exists.',
            );
          throw error;
        }
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: id,
          companyId,
          actionCode: 'user.create',
          outcome: 'success',
          recordType: 'user',
          recordId: id,
          permissionCode: 'user.create',
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
        });
        return { id, status: 'inactive' };
      });
    },
    async setStatus({ actor, accessContext, userId, status, reason, requestContext }) {
      const permission = status === 'active' ? 'user.activate' : 'user.deactivate';
      await withTransaction(database, async (trx) => {
        const user = await userRepository.lock(userId, accessContext, permission, trx);
        if (!user) throw new ValidationError('The user does not exist.');
        await assertCanManageUser(user.id, accessContext, permission, trx);
        if (user.id === actor.userId && status !== 'active') {
          throw new ConflictError(
            'SELF_DEACTIVATION_FORBIDDEN',
            'You cannot deactivate your own account.',
          );
        }
        const nextStatus =
          status === 'active' && user.provisioning_status === 'pending_setup' ? 'inactive' : status;
        await userRepository.update(
          user.id,
          {
            status: nextStatus,
            administratively_deactivated_at: status === 'active' ? null : trx.fn.now(),
            auth_version: user.auth_version + 1,
          },
          accessContext,
          permission,
          trx,
        );
        if (status !== 'active') {
          await identityRepository.revokeUserSessions(user.id, 'user_deactivated', trx);
          await identityRepository.revokeUserActiveTokens(user.id, trx);
        }
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: user.id,
          actionCode: `user.${status === 'active' ? 'activate' : 'deactivate'}`,
          outcome: 'success',
          recordType: 'user',
          recordId: user.id,
          permissionCode: permission,
          reason,
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
        });
      });
    },
    async revokeSessions({ actor, accessContext, userId, reason, requestContext }) {
      await withTransaction(database, async (trx) => {
        const user = await userRepository.lock(userId, accessContext, 'user.revoke_session', trx);
        if (!user) throw new ValidationError('The user does not exist.');
        await assertCanManageUser(user.id, accessContext, 'user.revoke_session', trx);
        await identityRepository.revokeUserSessions(user.id, reason, trx);
        await identityRepository.revokeUserActiveTokens(user.id, trx);
        await insertAuditEvent(trx, {
          actorUserId: actor.userId,
          subjectUserId: user.id,
          actionCode: 'user.revoke_session',
          outcome: 'success',
          recordType: 'user',
          recordId: user.id,
          permissionCode: 'user.revoke_session',
          reason,
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
        });
      });
    },
  };
}
