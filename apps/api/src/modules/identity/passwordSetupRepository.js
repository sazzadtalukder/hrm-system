export function createPasswordSetupRepository(database) {
  return {
    lockUser(userId, trx) {
      return trx('users').where({ id: userId }).forUpdate().first();
    },
    findUser(userId, trx = database) {
      return trx('users').where({ id: userId }).first();
    },
    updateUser(userId, changes, trx) {
      return trx('users')
        .where({ id: userId })
        .update({ ...changes, updated_at: trx.fn.now() });
    },
    async belongsToCompany(userId, companyId, trx = database) {
      const assigned = await trx('role_assignments')
        .where({ user_id: userId, company_id: companyId })
        .first('id');
      if (assigned) return true;
      return Boolean(
        await trx('audit_events')
          .where({
            subject_user_id: userId,
            company_id: companyId,
            action_code: 'user.create',
            outcome: 'success',
          })
          .first('id'),
      );
    },
    revokeActive(userId, reason, revokedBy, trx) {
      return trx('user_password_setup_tokens').where({ user_id: userId, status: 'active' }).update({
        status: 'revoked',
        active_slot: null,
        revoked_at: trx.fn.now(),
        revoked_by: revokedBy,
        revoke_reason: reason,
        updated_at: trx.fn.now(),
      });
    },
    async create(values, trx) {
      const [id] = await trx('user_password_setup_tokens').insert(values);
      return id;
    },
    lockByHash(tokenHash, trx) {
      return trx('user_password_setup_tokens').where({ token_hash: tokenHash }).forUpdate().first();
    },
    findByHash(tokenHash, trx = database) {
      return trx('user_password_setup_tokens').where({ token_hash: tokenHash }).first();
    },
    consume(id, trx) {
      return trx('user_password_setup_tokens').where({ id, status: 'active' }).update({
        status: 'consumed',
        active_slot: null,
        consumed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    },
    latestForUser(userId, companyId, trx = database) {
      return trx('user_password_setup_tokens')
        .where({ user_id: userId, company_id: companyId })
        .select('id', 'purpose', 'status', 'expires_at', 'consumed_at', 'revoked_at', 'created_at')
        .orderBy('id', 'desc')
        .first();
    },
  };
}
