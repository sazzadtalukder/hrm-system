export async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.string('email', 320).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.enum('status', ['active', 'inactive', 'locked']).notNullable().defaultTo('active');
    table.integer('auth_version').unsigned().notNullable().defaultTo(1);
    table.integer('failed_login_count').unsigned().notNullable().defaultTo(0);
    table.timestamp('locked_until', { useTz: false }).nullable();
    table.timestamp('last_login_at', { useTz: false }).nullable();
    table.timestamps(true, true);
    table.index(['status']);
  });

  await knex.schema.createTable('roles', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.string('code', 100).notNullable().unique();
    table.string('name', 150).notNullable();
    table.text('description').nullable();
    table.boolean('is_system').notNullable().defaultTo(true);
    table.boolean('is_privileged').notNullable().defaultTo(false);
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('permissions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.string('code', 150).notNullable().unique();
    table.string('resource', 100).notNullable();
    table.string('action', 100).notNullable();
    table.boolean('is_sensitive').notNullable().defaultTo(false);
    table.boolean('allow_direct_grant').notNullable().defaultTo(false);
    table.boolean('requires_audit').notNullable().defaultTo(false);
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.timestamps(true, true);
    table.unique(['resource', 'action']);
  });

  await knex.schema.createTable('role_permissions', (table) => {
    table.bigInteger('role_id').unsigned().notNullable().references('id').inTable('roles');
    table
      .bigInteger('permission_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('permissions');
    table.bigInteger('created_by').unsigned().nullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.primary(['role_id', 'permission_id']);
    table.index(['permission_id', 'role_id']);
  });

  await knex.schema.createTable('role_assignments', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable().references('id').inTable('users');
    table.bigInteger('role_id').unsigned().notNullable().references('id').inTable('roles');
    table.bigInteger('company_id').unsigned().nullable();
    table
      .enum('scope_type', ['own', 'direct_reports', 'department', 'branch', 'company', 'all'])
      .notNullable();
    table.string('scope_key', 150).notNullable();
    table.bigInteger('branch_id').unsigned().nullable();
    table.bigInteger('department_id').unsigned().nullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.enum('status', ['active', 'revoked', 'expired']).notNullable().defaultTo('active');
    table.bigInteger('assigned_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('revoked_at', { useTz: false }).nullable();
    table.bigInteger('revoked_by').unsigned().nullable().references('id').inTable('users');
    table.string('revoke_reason', 500).nullable();
    table.timestamps(true, true);
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_role_assignment_period',
    );
    table.unique(['user_id', 'role_id', 'scope_key', 'effective_start'], {
      indexName: 'uq_role_assignment',
    });
    table.index(
      ['user_id', 'status', 'effective_start', 'effective_end'],
      'ix_role_assignment_effective',
    );
    table.index(['user_id', 'company_id', 'scope_type', 'status'], 'ix_role_assignment_scope');
  });

  await knex.schema.createTable('user_permission_grants', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable().references('id').inTable('users');
    table
      .bigInteger('permission_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('permissions');
    table.bigInteger('company_id').unsigned().nullable();
    table
      .enum('scope_type', ['own', 'direct_reports', 'department', 'branch', 'company', 'all'])
      .notNullable();
    table.string('scope_key', 150).notNullable();
    table.bigInteger('branch_id').unsigned().nullable();
    table.bigInteger('department_id').unsigned().nullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.enum('status', ['active', 'revoked', 'expired']).notNullable().defaultTo('active');
    table.string('reason', 500).notNullable();
    table.bigInteger('granted_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('revoked_at', { useTz: false }).nullable();
    table.bigInteger('revoked_by').unsigned().nullable().references('id').inTable('users');
    table.string('revoke_reason', 500).nullable();
    table.timestamps(true, true);
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_permission_grant_period',
    );
    table.unique(['user_id', 'permission_id', 'scope_key', 'effective_start'], {
      indexName: 'uq_permission_grant',
    });
    table.index(
      ['user_id', 'permission_id', 'status', 'effective_start', 'effective_end'],
      'ix_permission_grant_effective',
    );
  });

  await knex.schema.createTable('auth_sessions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable().references('id').inTable('users');
    table.string('family_id', 36).notNullable().unique();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: false }).notNullable();
    table.timestamp('last_used_at', { useTz: false }).nullable();
    table.timestamp('revoked_at', { useTz: false }).nullable();
    table.string('revoke_reason', 500).nullable();
    table.string('client_ip_hash', 64).nullable();
    table.string('user_agent_hash', 64).nullable();
    table.index(['user_id', 'revoked_at', 'expires_at']);
  });

  await knex.schema.createTable('auth_refresh_tokens', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table
      .bigInteger('auth_session_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('auth_sessions');
    table.string('token_hash', 64).notNullable().unique();
    table
      .bigInteger('parent_token_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('auth_refresh_tokens');
    table.timestamp('issued_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: false }).notNullable();
    table.timestamp('rotated_at', { useTz: false }).nullable();
    table
      .bigInteger('replaced_by_token_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('auth_refresh_tokens');
    table.timestamp('revoked_at', { useTz: false }).nullable();
    table.timestamp('reuse_detected_at', { useTz: false }).nullable();
    table
      .enum('status', ['active', 'rotated', 'revoked', 'expired', 'reused'])
      .notNullable()
      .defaultTo('active');
    table.unique(['parent_token_id'], { indexName: 'uq_refresh_token_child' });
    table.index(['auth_session_id', 'status', 'expires_at']);
  });

  await knex.schema.createTable('audit_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('actor_user_id').unsigned().nullable().references('id').inTable('users');
    table.bigInteger('subject_user_id').unsigned().nullable().references('id').inTable('users');
    table.bigInteger('company_id').unsigned().nullable();
    table.string('action_code', 150).notNullable();
    table.string('outcome', 30).notNullable();
    table.string('record_type', 100).nullable();
    table.string('record_id', 100).nullable();
    table.string('permission_code', 150).nullable();
    table.string('scope_type', 30).nullable();
    table.string('request_id', 36).nullable();
    table.string('correlation_id', 128).nullable();
    table.string('reason', 500).nullable();
    table.json('metadata').nullable();
    table.timestamp('occurred_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.index(['actor_user_id', 'occurred_at']);
    table.index(['subject_user_id', 'occurred_at']);
    table.index(['action_code', 'occurred_at']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('audit_events');
  await knex.schema.dropTableIfExists('auth_refresh_tokens');
  await knex.schema.dropTableIfExists('auth_sessions');
  await knex.schema.dropTableIfExists('user_permission_grants');
  await knex.schema.dropTableIfExists('role_assignments');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
  await knex.schema.dropTableIfExists('users');
}
