import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPassword } from './password.js';
import { createPasswordSetupService } from './passwordSetupService.js';

function fixture(nodeEnv = 'test') {
  const audits = [];
  const tokens = [];
  const user = {
    id: 10,
    status: 'inactive',
    provisioning_status: 'pending_setup',
    administratively_deactivated_at: null,
    auth_version: 1,
    password_hash: 'unknown',
  };
  const trx = (table) => ({
    async insert(value) {
      assert.equal(table, 'audit_events');
      audits.push(value);
      return [audits.length];
    },
  });
  trx.fn = { now: () => new Date() };
  const database = { transaction: (operation) => operation(trx) };
  const repository = {
    belongsToCompany: async (_userId, companyId) => companyId === 1,
    lockUser: async () => user,
    findUser: async () => user,
    updateUser: async (_id, changes) => Object.assign(user, changes),
    async revokeActive(_id, reason) {
      for (const token of tokens.filter(({ status }) => status === 'active')) {
        token.status = 'revoked';
        token.active_slot = null;
        token.revoked_at = new Date();
        token.revoke_reason = reason;
      }
    },
    async create(values) {
      tokens.push({ id: tokens.length + 1, ...values });
      return tokens.length;
    },
    lockByHash: async (hash) => tokens.find(({ token_hash: candidate }) => candidate === hash),
    findByHash: async (hash) => tokens.find(({ token_hash: candidate }) => candidate === hash),
    async consume(id) {
      const token = tokens.find(
        (candidate) => candidate.id === id && candidate.status === 'active',
      );
      if (!token) return 0;
      token.status = 'consumed';
      token.active_slot = null;
      token.consumed_at = new Date();
      return 1;
    },
    latestForUser: async () => tokens.at(-1),
  };
  const identityRepository = {
    revokedSessions: 0,
    revokedTokens: 0,
    async revokeUserSessions() {
      this.revokedSessions += 1;
    },
    async revokeUserActiveTokens() {
      this.revokedTokens += 1;
    },
  };
  const service = createPasswordSetupService({
    database,
    env: { NODE_ENV: nodeEnv, PASSWORD_MIN_LENGTH: 12 },
    repository,
    identityRepository,
  });
  const admin = { userId: 1 };
  const accessContext = {
    grants: [{ scope_type: 'company', company_id: 1 }],
  };
  const base = {
    actor: admin,
    accessContext,
    userId: user.id,
    companyId: 1,
    reason: 'Test provisioning',
    requestContext: {},
  };
  return { service, user, tokens, audits, identityRepository, base, accessContext };
}

test('invitation, replacement, expiry, completion, reuse, and authentication reset are secure', async () => {
  const state = fixture();
  const first = await state.service.issueInvitation(state.base);
  assert.ok(first.manualSetupToken);
  assert.equal(state.tokens[0].token_hash.includes(first.manualSetupToken), false);
  assert.equal(new Date(first.expiresAt).getTime() - Date.now() > 23 * 60 * 60 * 1000, true);

  const replacement = await state.service.issueInvitation(state.base);
  assert.equal(state.tokens[0].status, 'revoked');
  assert.equal(state.tokens[1].status, 'active');
  state.tokens[1].expires_at = new Date(Date.now() - 1000);
  assert.deepEqual(await state.service.validate(replacement.manualSetupToken), { valid: false });

  const active = await state.service.issueInvitation(state.base);
  await state.service.complete({
    rawToken: active.manualSetupToken,
    newPassword: 'A-new-private-password-123!',
    requestContext: {},
  });
  assert.equal(state.user.status, 'active');
  assert.equal(state.user.provisioning_status, 'ready');
  assert.equal(await verifyPassword(state.user.password_hash, 'A-new-private-password-123!'), true);
  await assert.rejects(
    state.service.complete({
      rawToken: active.manualSetupToken,
      newPassword: 'Another-private-password-123!',
      requestContext: {},
    }),
    { code: 'INVALID_PASSWORD_SETUP_TOKEN' },
  );

  const reset = await state.service.resetAuthentication(state.base);
  assert.equal(state.user.status, 'inactive');
  assert.equal(state.user.provisioning_status, 'pending_setup');
  assert.equal(
    await verifyPassword(state.user.password_hash, 'A-new-private-password-123!'),
    false,
  );
  assert.equal(state.identityRepository.revokedSessions > 0, true);
  assert.equal(state.identityRepository.revokedTokens > 0, true);
  assert.equal(new Date(reset.expiresAt).getTime() - Date.now() <= 61 * 60 * 1000, true);

  const serializedAudits = JSON.stringify(state.audits);
  assert.equal(serializedAudits.includes(first.manualSetupToken), false);
  assert.equal(serializedAudits.includes(active.manualSetupToken), false);
  assert.equal(serializedAudits.includes('A-new-private-password-123!'), false);
});

test('company scope, administrative deactivation, and production token disclosure fail closed', async () => {
  const state = fixture();
  await assert.rejects(state.service.issueInvitation({ ...state.base, companyId: 2 }), {
    code: 'VALIDATION_FAILED',
  });
  await assert.rejects(
    state.service.issueInvitation({
      ...state.base,
      accessContext: { grants: [] },
    }),
    { code: 'VALIDATION_FAILED' },
  );
  state.user.administratively_deactivated_at = new Date();
  await assert.rejects(state.service.issueInvitation(state.base), {
    code: 'VALIDATION_FAILED',
  });

  state.user.administratively_deactivated_at = null;
  const production = fixture('production');
  const result = await production.service.issueInvitation(production.base);
  assert.equal(Object.hasOwn(result, 'manualSetupToken'), false);
});
