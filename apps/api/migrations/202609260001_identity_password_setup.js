export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table
      .enum('provisioning_status', ['pending_setup', 'ready'])
      .notNullable()
      .defaultTo('ready')
      .after('status');
    table.timestamp('administratively_deactivated_at', { useTz: false }).nullable();
  });

  await knex('users')
    .where({ status: 'inactive' })
    .whereExists(
      knex('audit_events as event')
        .select(1)
        .whereColumn('event.subject_user_id', 'users.id')
        .whereIn('event.action_code', ['user.create', 'user.reset_authentication']),
    )
    .update({ provisioning_status: 'pending_setup' });
  await knex('users')
    .where({ status: 'inactive' })
    .whereExists(
      knex('audit_events as event')
        .select(1)
        .whereColumn('event.subject_user_id', 'users.id')
        .where('event.action_code', 'user.deactivate'),
    )
    .update({ administratively_deactivated_at: knex.fn.now() });

  await knex.schema.createTable('user_password_setup_tokens', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable().references('id').inTable('users');
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.enum('purpose', ['initial_setup', 'authentication_reset']).notNullable();
    table.string('token_hash', 64).notNullable().unique();
    table.enum('status', ['active', 'consumed', 'revoked']).notNullable().defaultTo('active');
    table.boolean('active_slot').nullable().defaultTo(true);
    table.timestamp('expires_at', { useTz: false }).notNullable();
    table.timestamp('consumed_at', { useTz: false }).nullable();
    table.timestamp('revoked_at', { useTz: false }).nullable();
    table.bigInteger('issued_by').unsigned().notNullable().references('id').inTable('users');
    table.bigInteger('revoked_by').unsigned().nullable().references('id').inTable('users');
    table.string('revoke_reason', 500).nullable();
    table.timestamps(true, true);
    table.unique(['user_id', 'purpose', 'active_slot'], {
      indexName: 'uq_user_password_setup_active',
    });
    table.index(['user_id', 'status', 'expires_at'], 'ix_user_password_setup_user');
    table.index(['company_id', 'status', 'expires_at'], 'ix_user_password_setup_company');
    table.check(
      "(status = 'active' AND active_slot = 1 AND consumed_at IS NULL AND revoked_at IS NULL) OR (status = 'consumed' AND active_slot IS NULL AND consumed_at IS NOT NULL) OR (status = 'revoked' AND active_slot IS NULL AND revoked_at IS NOT NULL)",
      [],
      'ck_user_password_setup_state',
    );
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('user_password_setup_tokens');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('administratively_deactivated_at');
    table.dropColumn('provisioning_status');
  });
}
