import { createHash, randomUUID } from 'node:crypto';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { hashPassword, verifyPassword } from './password.js';
import { createRefreshToken, hashOpaqueToken } from './token.js';

function expiresAt(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

function sourceHash(value) {
  return value ? createHash('sha256').update(value).digest('hex') : null;
}

function auditContext(requestContext) {
  return {
    requestId: requestContext?.requestId,
    correlationId: requestContext?.correlationId,
  };
}

export function createAuthService({ database, env, identityRepository, tokenService }) {
  const dummyHash = hashPassword(randomUUID());
  async function issueTokens(user, sessionId, refreshToken) {
    return {
      accessToken: await tokenService.issueAccessToken({
        userId: user.id,
        sessionId,
        authVersion: user.auth_version,
      }),
      refreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  return {
    async login({ email, password, ip, userAgent, requestContext }) {
      const normalizedEmail = email.trim().toLowerCase();
      const user = await identityRepository.findUserByEmail(normalizedEmail);
      const now = new Date();
      const valid = await verifyPassword(user?.password_hash ?? (await dummyHash), password).catch(
        () => false,
      );
      if (
        !user ||
        user.status === 'inactive' ||
        user.provisioning_status === 'pending_setup' ||
        (user.locked_until && new Date(user.locked_until) > now) ||
        !valid
      ) {
        await withTransaction(database, async (trx) => {
          if (user) {
            const lockedUser = await identityRepository.lockUser(user.id, trx);
            const failedCount = Number(lockedUser.failed_login_count) + 1;
            const shouldLock = failedCount >= env.LOGIN_MAX_ATTEMPTS;
            await identityRepository.updateUser(
              user.id,
              {
                failed_login_count: shouldLock ? 0 : failedCount,
                locked_until: shouldLock
                  ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000)
                  : lockedUser.locked_until,
              },
              trx,
            );
          }
          await insertAuditEvent(trx, {
            subjectUserId: user?.id,
            actionCode: 'auth.login',
            outcome: 'failure',
            reason: 'invalid_credentials',
            ...auditContext(requestContext),
          });
        });
        throw new AuthenticationError('Invalid email or password.');
      }

      return withTransaction(database, async (trx) => {
        const lockedUser = await identityRepository.lockUser(user.id, trx);
        if (
          !lockedUser ||
          lockedUser.status !== 'active' ||
          lockedUser.provisioning_status === 'pending_setup'
        )
          throw new AuthenticationError();
        const sessionId = await identityRepository.createSession(
          {
            user_id: user.id,
            family_id: randomUUID(),
            expires_at: expiresAt(env.REFRESH_TOKEN_TTL_SECONDS),
            client_ip_hash: sourceHash(ip),
            user_agent_hash: sourceHash(userAgent),
          },
          trx,
        );
        const refreshToken = createRefreshToken();
        await identityRepository.createRefreshToken(
          {
            auth_session_id: sessionId,
            token_hash: hashOpaqueToken(refreshToken),
            expires_at: expiresAt(env.REFRESH_TOKEN_TTL_SECONDS),
          },
          trx,
        );
        await identityRepository.updateUser(
          user.id,
          { failed_login_count: 0, locked_until: null, last_login_at: trx.fn.now() },
          trx,
        );
        await insertAuditEvent(trx, {
          actorUserId: user.id,
          subjectUserId: user.id,
          actionCode: 'auth.login',
          outcome: 'success',
          recordType: 'auth_session',
          recordId: sessionId,
          ...auditContext(requestContext),
        });
        return issueTokens(lockedUser, sessionId, refreshToken);
      });
    },

    async refresh({ rawToken, requestContext }) {
      if (!rawToken) throw new AuthenticationError();
      const result = await withTransaction(database, async (trx) => {
        const token = await identityRepository.findRefreshTokenForUpdate(
          hashOpaqueToken(rawToken),
          trx,
        );
        if (!token) throw new AuthenticationError();
        const session = await identityRepository.lockSession(token.auth_session_id, trx);
        const now = new Date();
        const compromised = token.status !== 'active' || token.rotated_at || token.revoked_at;
        if (compromised) {
          await identityRepository.updateRefreshToken(
            token.id,
            { status: 'reused', reuse_detected_at: trx.fn.now() },
            trx,
          );
          await identityRepository.updateSession(
            session.id,
            { revoked_at: trx.fn.now(), revoke_reason: 'refresh_token_reuse' },
            trx,
          );
          await identityRepository.revokeActiveTokens(session.id, trx);
          await insertAuditEvent(trx, {
            actorUserId: session.user_id,
            subjectUserId: session.user_id,
            actionCode: 'auth.refresh_reuse',
            outcome: 'failure',
            recordType: 'auth_session',
            recordId: session.id,
            ...auditContext(requestContext),
          });
          return { compromised: true };
        }
        if (
          session.revoked_at ||
          new Date(session.expires_at) <= now ||
          new Date(token.expires_at) <= now
        ) {
          throw new AuthenticationError('The session is no longer valid.');
        }
        const user = await identityRepository.lockUser(session.user_id, trx);
        if (!user || user.status !== 'active') throw new AuthenticationError();
        const nextToken = createRefreshToken();
        const childId = await identityRepository.createRefreshToken(
          {
            auth_session_id: session.id,
            token_hash: hashOpaqueToken(nextToken),
            parent_token_id: token.id,
            expires_at: session.expires_at,
          },
          trx,
        );
        await identityRepository.updateRefreshToken(
          token.id,
          { status: 'rotated', rotated_at: trx.fn.now(), replaced_by_token_id: childId },
          trx,
        );
        await identityRepository.updateSession(session.id, { last_used_at: trx.fn.now() }, trx);
        return issueTokens(user, session.id, nextToken);
      });
      if (result.compromised) throw new AuthenticationError('The session is no longer valid.');
      return result;
    },

    async revokeSession({ rawToken, reason = 'logout', requestContext }) {
      if (!rawToken) return;
      await withTransaction(database, async (trx) => {
        const token = await identityRepository.findRefreshTokenForUpdate(
          hashOpaqueToken(rawToken),
          trx,
        );
        if (!token) return;
        const session = await identityRepository.lockSession(token.auth_session_id, trx);
        if (!session.revoked_at) {
          await identityRepository.updateSession(
            session.id,
            { revoked_at: trx.fn.now(), revoke_reason: reason },
            trx,
          );
          await identityRepository.revokeActiveTokens(session.id, trx);
          await insertAuditEvent(trx, {
            actorUserId: session.user_id,
            subjectUserId: session.user_id,
            actionCode: 'auth.logout',
            outcome: 'success',
            recordType: 'auth_session',
            recordId: session.id,
            ...auditContext(requestContext),
          });
        }
      });
    },

    async revokeAll({ userId, requestContext }) {
      await withTransaction(database, async (trx) => {
        await identityRepository.lockUser(userId, trx);
        await identityRepository.revokeUserSessions(userId, 'logout_all', trx);
        const sessions = await trx('auth_sessions').where({ user_id: userId }).select('id');
        for (const session of sessions)
          await identityRepository.revokeActiveTokens(session.id, trx);
        await insertAuditEvent(trx, {
          actorUserId: userId,
          subjectUserId: userId,
          actionCode: 'auth.logout_all',
          outcome: 'success',
          ...auditContext(requestContext),
        });
      });
    },

    async changePassword({ userId, currentPassword, newPassword, requestContext }) {
      if (newPassword.length < env.PASSWORD_MIN_LENGTH) {
        throw new ValidationError(
          `Password must contain at least ${env.PASSWORD_MIN_LENGTH} characters.`,
        );
      }
      await withTransaction(database, async (trx) => {
        const user = await identityRepository.lockUser(userId, trx);
        if (!(await verifyPassword(user.password_hash, currentPassword))) {
          throw new AuthenticationError('The current password is incorrect.');
        }
        if (await verifyPassword(user.password_hash, newPassword)) {
          throw new ConflictError('PASSWORD_UNCHANGED', 'The new password must be different.');
        }
        await identityRepository.updateUser(
          user.id,
          { password_hash: await hashPassword(newPassword), auth_version: user.auth_version + 1 },
          trx,
        );
        await identityRepository.revokeUserSessions(user.id, 'password_changed', trx);
        await identityRepository.revokeUserActiveTokens(user.id, trx);
        await insertAuditEvent(trx, {
          actorUserId: user.id,
          subjectUserId: user.id,
          actionCode: 'auth.password_change',
          outcome: 'success',
          ...auditContext(requestContext),
        });
      });
    },
  };
}
