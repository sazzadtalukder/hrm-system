import { createHash, randomBytes } from 'node:crypto';
import { ApplicationError, ValidationError } from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { hashPassword } from './password.js';

const INITIAL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const invalidToken = () =>
  new ApplicationError({
    code: 'INVALID_PASSWORD_SETUP_TOKEN',
    message: 'The password setup link is invalid or has expired.',
    statusCode: 400,
  });
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const allowsCompany = (context, companyId) =>
  context.grants.some(
    (grant) =>
      grant.scope_type === 'all' ||
      (grant.scope_type === 'company' && Number(grant.company_id) === Number(companyId)),
  );

export function createPasswordSetupService({ database, env, repository, identityRepository }) {
  async function assertAdministrativeAccess(userId, companyId, accessContext, trx) {
    if (
      !allowsCompany(accessContext, companyId) ||
      !(await repository.belongsToCompany(userId, companyId, trx))
    ) {
      throw new ValidationError('The user is outside your authorization authority.');
    }
  }

  async function issue({
    actor,
    accessContext,
    userId,
    companyId,
    purpose,
    reason,
    requestContext,
  }) {
    return withTransaction(database, async (trx) => {
      await assertAdministrativeAccess(userId, companyId, accessContext, trx);
      const user = await repository.lockUser(userId, trx);
      if (!user) throw new ValidationError('The user does not exist.');
      if (user.administratively_deactivated_at) {
        throw new ValidationError('Reactivate the user before issuing password setup.');
      }
      if (purpose === 'initial_setup' && user.provisioning_status !== 'pending_setup') {
        throw new ValidationError('Initial password setup is not required for this user.');
      }
      if (
        purpose === 'authentication_reset' &&
        (user.status !== 'active' || user.provisioning_status !== 'ready')
      ) {
        throw new ValidationError('Authentication reset requires an active provisioned user.');
      }

      const rawToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(
        Date.now() + (purpose === 'initial_setup' ? INITIAL_TTL_MS : RESET_TTL_MS),
      );
      await repository.revokeActive(user.id, 'replaced_by_new_password_setup', actor.userId, trx);
      if (purpose === 'authentication_reset') {
        await repository.updateUser(
          user.id,
          {
            password_hash: await hashPassword(randomBytes(48).toString('base64url')),
            status: 'inactive',
            provisioning_status: 'pending_setup',
            auth_version: user.auth_version + 1,
            failed_login_count: 0,
            locked_until: null,
          },
          trx,
        );
        await identityRepository.revokeUserSessions(user.id, 'authentication_reset', trx);
        await identityRepository.revokeUserActiveTokens(user.id, trx);
      }
      const id = await repository.create(
        {
          user_id: user.id,
          company_id: companyId,
          purpose,
          token_hash: tokenHash(rawToken),
          status: 'active',
          active_slot: true,
          expires_at: expiresAt,
          issued_by: actor.userId,
        },
        trx,
      );
      await insertAuditEvent(trx, {
        actorUserId: actor.userId,
        subjectUserId: user.id,
        companyId,
        actionCode:
          purpose === 'initial_setup'
            ? 'user.password_setup_invitation_issue'
            : 'user.reset_authentication',
        outcome: 'success',
        recordType: 'user_password_setup_token',
        recordId: id,
        permissionCode: 'user.reset_authentication',
        reason,
        requestId: requestContext.requestId,
        correlationId: requestContext.correlationId,
        metadata: { purpose, expiresAt: expiresAt.toISOString() },
      });
      return {
        status: 'pending_delivery',
        purpose,
        expiresAt,
        ...(env.NODE_ENV === 'production' ? {} : { manualSetupToken: rawToken }),
      };
    });
  }

  return {
    issueInvitation(input) {
      return issue({ ...input, purpose: 'initial_setup' });
    },
    resetAuthentication(input) {
      return issue({ ...input, purpose: 'authentication_reset' });
    },
    async status({ accessContext, userId, companyId }) {
      await assertAdministrativeAccess(userId, companyId, accessContext, database);
      const [user, token] = await Promise.all([
        repository.findUser(userId),
        repository.latestForUser(userId, companyId),
      ]);
      return {
        provisioningStatus: user.provisioning_status,
        administrativelyDeactivated: Boolean(user.administratively_deactivated_at),
        token: token
          ? {
              purpose: token.purpose,
              status:
                token.status === 'active' && new Date(token.expires_at) <= new Date()
                  ? 'expired'
                  : token.status,
              expiresAt: token.expires_at,
              createdAt: token.created_at,
            }
          : null,
      };
    },
    async validate(rawToken) {
      if (!rawToken) return { valid: false };
      const token = await repository.findByHash(tokenHash(rawToken));
      const valid =
        token?.status === 'active' && token.active_slot && new Date(token.expires_at) > new Date();
      return valid
        ? {
            valid: true,
            expiresAt: token.expires_at,
            passwordMinLength: env.PASSWORD_MIN_LENGTH,
          }
        : { valid: false };
    },
    async complete({ rawToken, newPassword, requestContext }) {
      if (newPassword.length < env.PASSWORD_MIN_LENGTH) {
        throw new ValidationError(
          `Password must contain at least ${env.PASSWORD_MIN_LENGTH} characters.`,
        );
      }
      await withTransaction(database, async (trx) => {
        const token = rawToken ? await repository.lockByHash(tokenHash(rawToken), trx) : null;
        if (
          !token ||
          token.status !== 'active' ||
          !token.active_slot ||
          new Date(token.expires_at) <= new Date()
        )
          throw invalidToken();
        const user = await repository.lockUser(token.user_id, trx);
        if (
          !user ||
          user.administratively_deactivated_at ||
          user.provisioning_status !== 'pending_setup'
        )
          throw invalidToken();
        const consumed = await repository.consume(token.id, trx);
        if (consumed !== 1) throw invalidToken();
        await repository.revokeActive(user.id, 'password_setup_completed', null, trx);
        await repository.updateUser(
          user.id,
          {
            password_hash: await hashPassword(newPassword),
            status: 'active',
            provisioning_status: 'ready',
            auth_version: user.auth_version + 1,
            failed_login_count: 0,
            locked_until: null,
          },
          trx,
        );
        await identityRepository.revokeUserSessions(user.id, 'password_setup_completed', trx);
        await identityRepository.revokeUserActiveTokens(user.id, trx);
        await insertAuditEvent(trx, {
          subjectUserId: user.id,
          companyId: token.company_id,
          actionCode: 'auth.password_setup_complete',
          outcome: 'success',
          recordType: 'user_password_setup_token',
          recordId: token.id,
          requestId: requestContext.requestId,
          correlationId: requestContext.correlationId,
          metadata: { purpose: token.purpose },
        });
      });
      return { completed: true };
    },
  };
}
