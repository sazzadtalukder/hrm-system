export function createIdentityRepository(database) {
  return {
    findUserByEmail(email, trx = database) {
      return trx('users').where({ email }).first();
    },
    findUserById(id, trx = database) {
      return trx('users').where({ id }).first();
    },
    async lockUser(id, trx) {
      return trx('users').where({ id }).forUpdate().first();
    },
    updateUser(id, changes, trx = database) {
      return trx('users')
        .where({ id })
        .update({ ...changes, updated_at: trx.fn.now() });
    },
    async createSession(values, trx) {
      const [id] = await trx('auth_sessions').insert(values);
      return id;
    },
    async createRefreshToken(values, trx) {
      const [id] = await trx('auth_refresh_tokens').insert(values);
      return id;
    },
    findRefreshTokenForUpdate(tokenHash, trx) {
      return trx('auth_refresh_tokens as token')
        .join('auth_sessions as session', 'session.id', 'token.auth_session_id')
        .select(
          'token.*',
          'session.user_id',
          'session.revoked_at as session_revoked_at',
          'session.expires_at as session_expires_at',
        )
        .where('token.token_hash', tokenHash)
        .forUpdate()
        .first();
    },
    lockSession(id, trx) {
      return trx('auth_sessions').where({ id }).forUpdate().first();
    },
    updateRefreshToken(id, changes, trx) {
      return trx('auth_refresh_tokens').where({ id }).update(changes);
    },
    updateSession(id, changes, trx) {
      return trx('auth_sessions').where({ id }).update(changes);
    },
    revokeActiveTokens(sessionId, trx) {
      return trx('auth_refresh_tokens')
        .where({ auth_session_id: sessionId, status: 'active' })
        .update({ status: 'revoked', revoked_at: trx.fn.now() });
    },
    revokeUserSessions(userId, reason, trx) {
      return trx('auth_sessions')
        .where({ user_id: userId })
        .whereNull('revoked_at')
        .update({ revoked_at: trx.fn.now(), revoke_reason: reason });
    },
    revokeUserActiveTokens(userId, trx) {
      return trx('auth_refresh_tokens')
        .whereIn('auth_session_id', trx('auth_sessions').where({ user_id: userId }).select('id'))
        .where({ status: 'active' })
        .update({ status: 'revoked', revoked_at: trx.fn.now() });
    },
    findSessionWithUser(sessionId, trx = database) {
      return trx('auth_sessions as session')
        .join('users as user', 'user.id', 'session.user_id')
        .select(
          'session.id as session_id',
          'session.user_id',
          'session.expires_at',
          'session.revoked_at',
          'user.email',
          'user.status as user_status',
          'user.auth_version',
        )
        .where('session.id', sessionId)
        .first();
    },
  };
}
