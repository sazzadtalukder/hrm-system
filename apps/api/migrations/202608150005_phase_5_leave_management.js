function actorAudit(table) {
  table.bigInteger('created_by').unsigned().nullable().references('id').inTable('users');
  table.bigInteger('updated_by').unsigned().nullable().references('id').inTable('users');
  table.timestamps(true, true);
  table.integer('version').unsigned().notNullable().defaultTo(1);
}

export async function up(knex) {
  await knex.schema.createTable('leave_types', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    table.enum('category', ['paid', 'unpaid', 'other']).notNullable();
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.boolean('is_sensitive').notNullable().defaultTo(false);
    table.timestamp('deactivated_at').nullable();
    table.bigInteger('deactivated_by').unsigned().nullable().references('id').inTable('users');
    table.string('deactivation_reason', 500).nullable();
    actorAudit(table);
    table.unique(['company_id', 'code'], { indexName: 'uq_leave_type_company_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_type_id_company' });
    table.index(['company_id', 'status', 'name'], 'ix_leave_type_company_status');
  });
  await knex.schema.createTable('leave_type_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_type_id').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.enum('unit', ['full_day', 'half_day']).notNullable();
    table.decimal('minimum_increment', 4, 2).notNullable();
    table.boolean('counts_rest_days').notNullable().defaultTo(false);
    table.boolean('counts_holidays').notNullable().defaultTo(false);
    table.boolean('requires_reason').notNullable().defaultTo(true);
    table.boolean('requires_approval').notNullable().defaultTo(true);
    table.boolean('allow_negative_balance').notNullable().defaultTo(false);
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_leave_type_version_id').unsigned().nullable();
    table.timestamp('superseded_at').nullable();
    table.bigInteger('superseded_by').unsigned().nullable().references('id').inTable('users');
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_leave_type_version_period',
    );
    table.check('minimum_increment IN (0.50, 1.00)', [], 'ck_leave_type_increment');
    table.index(
      ['leave_type_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_leave_type_version_effective',
    );
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_type_version_company' });
    table
      .foreign(['leave_type_id', 'company_id'], 'fk_leave_type_version_company')
      .references(['id', 'company_id'])
      .inTable('leave_types');
    table
      .foreign('supersedes_leave_type_version_id', 'fk_leave_type_version_supersedes')
      .references('id')
      .inTable('leave_type_versions');
  });
  await knex.schema.createTable('leave_policies', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.timestamp('deactivated_at').nullable();
    table.bigInteger('deactivated_by').unsigned().nullable().references('id').inTable('users');
    table.string('deactivation_reason', 500).nullable();
    actorAudit(table);
    table.unique(['company_id', 'code'], { indexName: 'uq_leave_policy_company_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_policy_id_company' });
    table.index(['company_id', 'status', 'name'], 'ix_leave_policy_company_status');
  });
  await knex.schema.createTable('leave_policy_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_policy_id').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.integer('leave_year_start_month').unsigned().notNullable().defaultTo(1);
    table.integer('leave_year_start_day').unsigned().notNullable().defaultTo(1);
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_leave_policy_version_id').unsigned().nullable();
    table.timestamp('superseded_at').nullable();
    table.bigInteger('superseded_by').unsigned().nullable().references('id').inTable('users');
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_leave_policy_version_period',
    );
    table.check('leave_year_start_month BETWEEN 1 AND 12', [], 'ck_leave_year_month');
    table.check('leave_year_start_day BETWEEN 1 AND 31', [], 'ck_leave_year_day');
    table.index(
      ['leave_policy_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_leave_policy_version_effective',
    );
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_policy_version_company' });
    table
      .foreign(['leave_policy_id', 'company_id'], 'fk_leave_policy_version_company')
      .references(['id', 'company_id'])
      .inTable('leave_policies');
    table
      .foreign('supersedes_leave_policy_version_id', 'fk_leave_policy_version_supersedes')
      .references('id')
      .inTable('leave_policy_versions');
  });
  await knex.schema.createTable('leave_policy_type_configs', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_policy_version_id').unsigned().notNullable();
    table.bigInteger('leave_type_version_id').unsigned().notNullable();
    table.decimal('entitlement_units', 8, 2).notNullable();
    table.integer('minimum_service_days').unsigned().notNullable().defaultTo(0);
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.check('entitlement_units >= 0', [], 'ck_leave_entitlement_nonnegative');
    table.unique(['leave_policy_version_id', 'leave_type_version_id'], {
      indexName: 'uq_leave_policy_type_config',
    });
    table
      .foreign(['leave_policy_version_id', 'company_id'], 'fk_leave_policy_config_policy_company')
      .references(['id', 'company_id'])
      .inTable('leave_policy_versions');
    table
      .foreign(['leave_type_version_id', 'company_id'], 'fk_leave_policy_config_type_company')
      .references(['id', 'company_id'])
      .inTable('leave_type_versions');
  });
  await knex.schema.createTable('employee_leave_policy_assignments', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.bigInteger('leave_policy_id').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_assignment_id').unsigned().nullable();
    table.timestamp('superseded_at').nullable();
    table.bigInteger('superseded_by').unsigned().nullable().references('id').inTable('users');
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_employee_leave_policy_period',
    );
    table.index(
      ['employment_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_employee_leave_policy_effective',
    );
    table
      .foreign(['employment_id', 'company_id'], 'fk_employee_leave_policy_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign(['leave_policy_id', 'company_id'], 'fk_employee_leave_policy_company')
      .references(['id', 'company_id'])
      .inTable('leave_policies');
    table
      .foreign('supersedes_assignment_id', 'fk_employee_leave_policy_supersedes')
      .references('id')
      .inTable('employee_leave_policy_assignments');
  });
  await knex.schema.createTable('leave_balance_accounts', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.bigInteger('leave_type_id').unsigned().notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.enum('status', ['open', 'closed']).notNullable().defaultTo('open');
    actorAudit(table);
    table.check('period_end >= period_start', [], 'ck_leave_balance_period');
    table.unique(['company_id', 'employment_id', 'leave_type_id', 'period_start', 'period_end'], {
      indexName: 'uq_leave_balance_account_period',
    });
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_balance_account_company' });
    table.index(
      ['employment_id', 'status', 'period_start', 'period_end'],
      'ix_leave_balance_employment_period',
    );
    table
      .foreign(['employment_id', 'company_id'], 'fk_leave_balance_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign(['leave_type_id', 'company_id'], 'fk_leave_balance_type_company')
      .references(['id', 'company_id'])
      .inTable('leave_types');
  });
  await knex.schema.createTable('leave_requests', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.bigInteger('leave_type_id').unsigned().notNullable();
    table.integer('current_request_version').unsigned().notNullable().defaultTo(1);
    table
      .enum('status', [
        'draft',
        'submitted',
        'approved',
        'rejected',
        'withdrawn',
        'cancellation_requested',
        'cancelled',
        'cancellation_rejected',
      ])
      .notNullable()
      .defaultTo('draft');
    table.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    table.timestamp('submitted_at').nullable();
    table.timestamp('approved_at').nullable();
    table.timestamp('rejected_at').nullable();
    table.timestamp('cancelled_at').nullable();
    actorAudit(table);
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_request_company' });
    table.index(['company_id', 'employment_id', 'status'], 'ix_leave_request_employment_status');
    table.index(['company_id', 'status', 'created_at'], 'ix_leave_request_company_status');
    table
      .foreign(['employment_id', 'company_id'], 'fk_leave_request_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign(['leave_type_id', 'company_id'], 'fk_leave_request_type_company')
      .references(['id', 'company_id'])
      .inTable('leave_types');
  });
  await knex.schema.createTable('leave_request_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_request_id').unsigned().notNullable();
    table.integer('version_number').unsigned().notNullable();
    table.bigInteger('leave_type_version_id').unsigned().notNullable();
    table.bigInteger('leave_policy_version_id').unsigned().notNullable();
    table.date('date_from').notNullable();
    table.date('date_to').notNullable();
    table.decimal('requested_units', 8, 2).notNullable();
    table.text('reason').notNullable();
    table.json('assignment_snapshot').notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.check('date_to >= date_from', [], 'ck_leave_request_version_dates');
    table.check('requested_units > 0', [], 'ck_leave_request_units');
    table.unique(['leave_request_id', 'version_number'], { indexName: 'uq_leave_request_version' });
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_request_version_company' });
    table.index(['company_id', 'date_from', 'date_to'], 'ix_leave_request_version_dates');
    table
      .foreign(['leave_request_id', 'company_id'], 'fk_leave_request_version_company')
      .references(['id', 'company_id'])
      .inTable('leave_requests');
    table
      .foreign(['leave_type_version_id', 'company_id'], 'fk_leave_request_type_version_company')
      .references(['id', 'company_id'])
      .inTable('leave_type_versions');
    table
      .foreign(['leave_policy_version_id', 'company_id'], 'fk_leave_request_policy_version_company')
      .references(['id', 'company_id'])
      .inTable('leave_policy_versions');
  });
  await knex.schema.createTable('leave_request_days', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_request_id').unsigned().notNullable();
    table.bigInteger('leave_request_version_id').unsigned().notNullable();
    table.bigInteger('leave_type_version_id').unsigned().notNullable();
    table.bigInteger('leave_policy_version_id').unsigned().notNullable();
    table.date('leave_date').notNullable();
    table.enum('day_part', ['full_day', 'first_half', 'second_half']).notNullable();
    table.decimal('units', 3, 2).notNullable();
    table.boolean('is_working_day').notNullable();
    table.bigInteger('holiday_id').unsigned().nullable();
    table.bigInteger('work_calendar_id').unsigned().notNullable();
    table.string('calculation_reason', 100).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.check(
      "units = 0.00 OR (day_part = 'full_day' AND units = 1.00) OR (day_part IN ('first_half','second_half') AND units = 0.50)",
      [],
      'ck_leave_request_day_units',
    );
    table.unique(['leave_request_version_id', 'leave_date', 'day_part'], {
      indexName: 'uq_leave_request_day_part',
    });
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_request_day_company' });
    table.index(['company_id', 'leave_date', 'leave_request_id'], 'ix_leave_request_day_date');
    table
      .foreign(['leave_request_id', 'company_id'], 'fk_leave_request_day_request_company')
      .references(['id', 'company_id'])
      .inTable('leave_requests');
    table
      .foreign(['leave_request_version_id', 'company_id'], 'fk_leave_request_day_version_company')
      .references(['id', 'company_id'])
      .inTable('leave_request_versions');
    table
      .foreign(['leave_type_version_id', 'company_id'], 'fk_leave_request_day_type_company')
      .references(['id', 'company_id'])
      .inTable('leave_type_versions');
    table
      .foreign(['leave_policy_version_id', 'company_id'], 'fk_leave_request_day_policy_company')
      .references(['id', 'company_id'])
      .inTable('leave_policy_versions');
    table
      .foreign(['work_calendar_id', 'company_id'], 'fk_leave_request_day_calendar_company')
      .references(['id', 'company_id'])
      .inTable('work_calendars');
    table.foreign('holiday_id').references('id').inTable('holidays');
  });
  await knex.schema.createTable('leave_balance_ledger_entries', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_balance_account_id').unsigned().notNullable();
    table
      .enum('entry_type', [
        'opening',
        'entitlement',
        'reservation',
        'reservation_release',
        'consumption',
        'adjustment',
        'reversal',
      ])
      .notNullable();
    table.decimal('units', 8, 2).notNullable();
    table.date('effective_date').notNullable();
    table.enum('source_type', ['policy', 'leave_request', 'manual']).notNullable();
    table.bigInteger('source_id').unsigned().nullable();
    table.string('idempotency_key', 150).notNullable();
    table.bigInteger('reversal_of_entry_id').unsigned().nullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.check('units <> 0', [], 'ck_leave_ledger_nonzero');
    table.unique(['company_id', 'idempotency_key'], { indexName: 'uq_leave_ledger_idempotency' });
    table.unique(['reversal_of_entry_id'], { indexName: 'uq_leave_ledger_single_reversal' });
    table.index(
      ['leave_balance_account_id', 'effective_date', 'id'],
      'ix_leave_ledger_account_date',
    );
    table
      .foreign(['leave_balance_account_id', 'company_id'], 'fk_leave_ledger_account_company')
      .references(['id', 'company_id'])
      .inTable('leave_balance_accounts');
    table.foreign('reversal_of_entry_id').references('id').inTable('leave_balance_ledger_entries');
  });
  await knex.schema.createTable('leave_approval_attempts', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_request_id').unsigned().notNullable();
    table.integer('request_version_number').unsigned().notNullable();
    table.enum('decision_kind', ['request', 'cancellation']).notNullable();
    table.integer('attempt_number').unsigned().notNullable();
    table
      .bigInteger('assigned_approver_user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users');
    table.bigInteger('assigned_manager_employment_id').unsigned().nullable();
    table
      .enum('status', ['pending', 'approved', 'rejected', 'cancelled'])
      .notNullable()
      .defaultTo('pending');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.unique(['leave_request_id', 'decision_kind', 'attempt_number'], {
      indexName: 'uq_leave_approval_attempt',
    });
    table.unique(['id', 'company_id'], { indexName: 'uq_leave_approval_attempt_company' });
    table.index(
      ['assigned_approver_user_id', 'status', 'created_at'],
      'ix_leave_approval_assignee',
    );
    table
      .foreign(['leave_request_id', 'company_id'], 'fk_leave_approval_request_company')
      .references(['id', 'company_id'])
      .inTable('leave_requests');
    table
      .foreign(
        ['assigned_manager_employment_id', 'company_id'],
        'fk_leave_approval_manager_company',
      )
      .references(['id', 'company_id'])
      .inTable('employments');
  });
  await knex.schema.createTable('leave_approval_decisions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_approval_attempt_id').unsigned().notNullable();
    table.bigInteger('approver_user_id').unsigned().notNullable().references('id').inTable('users');
    table.enum('decision', ['approved', 'rejected']).notNullable();
    table.string('reason', 500).notNullable();
    table.integer('expected_workflow_version').unsigned().notNullable();
    table.integer('expected_request_version').unsigned().notNullable();
    table.string('idempotency_key', 150).notNullable();
    table.timestamp('decided_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['leave_approval_attempt_id'], {
      indexName: 'uq_leave_approval_terminal_decision',
    });
    table.unique(['company_id', 'idempotency_key'], { indexName: 'uq_leave_decision_idempotency' });
    table
      .foreign(['leave_approval_attempt_id', 'company_id'], 'fk_leave_decision_attempt_company')
      .references(['id', 'company_id'])
      .inTable('leave_approval_attempts');
  });
  await knex.schema.createTable('leave_workflow_state_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_request_id').unsigned().notNullable();
    table.string('from_state', 40).nullable();
    table.string('to_state', 40).notNullable();
    table.integer('workflow_version').unsigned().notNullable();
    table.bigInteger('actor_user_id').unsigned().notNullable().references('id').inTable('users');
    table.string('reason', 500).nullable();
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['leave_request_id', 'workflow_version'], {
      indexName: 'uq_leave_workflow_version',
    });
    table
      .foreign(['leave_request_id', 'company_id'], 'fk_leave_workflow_request_company')
      .references(['id', 'company_id'])
      .inTable('leave_requests');
  });
  await knex.schema.createTable('leave_attendance_reconciliation_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('leave_request_day_id').unsigned().notNullable();
    table.bigInteger('attendance_record_id').unsigned().nullable();
    table.enum('event_type', ['required', 'resolved']).notNullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('actor_user_id').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.index(['leave_request_day_id', 'occurred_at'], 'ix_leave_reconciliation_day');
    table
      .foreign(['leave_request_day_id', 'company_id'], 'fk_leave_reconciliation_day_company')
      .references(['id', 'company_id'])
      .inTable('leave_request_days');
    table
      .foreign(['attendance_record_id', 'company_id'], 'fk_leave_reconciliation_record_company')
      .references(['id', 'company_id'])
      .inTable('attendance_records');
  });

  await knex.raw(
    "ALTER TABLE attendance_records MODIFY status ENUM('present','absent','incomplete','rest_day','holiday','on_leave','configuration_exception') NOT NULL",
  );
  await knex.raw(
    "ALTER TABLE attendance_record_versions MODIFY status ENUM('present','absent','incomplete','rest_day','holiday','on_leave','configuration_exception') NOT NULL",
  );
  await knex.schema.alterTable('attendance_record_versions', (table) => {
    table.bigInteger('leave_request_day_id').unsigned().nullable();
    table.index(['leave_request_day_id', 'company_id'], 'ix_attendance_version_leave_day_company');
    table
      .foreign(['leave_request_day_id', 'company_id'], 'fk_attendance_version_leave_day_company')
      .references(['id', 'company_id'])
      .inTable('leave_request_days');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('attendance_record_versions', (table) => {
    table.dropForeign(['leave_request_day_id'], 'fk_attendance_version_leave_day_company');
    table.dropIndex(
      ['leave_request_day_id', 'company_id'],
      'ix_attendance_version_leave_day_company',
    );
    table.dropColumn('leave_request_day_id');
  });
  await knex.raw(
    "ALTER TABLE attendance_record_versions MODIFY status ENUM('present','absent','incomplete','rest_day','holiday','configuration_exception') NOT NULL",
  );
  await knex.raw(
    "ALTER TABLE attendance_records MODIFY status ENUM('present','absent','incomplete','rest_day','holiday','configuration_exception') NOT NULL",
  );
  for (const table of [
    'leave_attendance_reconciliation_events',
    'leave_workflow_state_events',
    'leave_approval_decisions',
    'leave_approval_attempts',
    'leave_balance_ledger_entries',
    'leave_request_days',
    'leave_request_versions',
    'leave_requests',
    'leave_balance_accounts',
    'employee_leave_policy_assignments',
    'leave_policy_type_configs',
    'leave_policy_versions',
    'leave_policies',
    'leave_type_versions',
    'leave_types',
  ])
    await knex.schema.dropTableIfExists(table);
}
