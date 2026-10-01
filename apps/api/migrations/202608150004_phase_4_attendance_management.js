function actorAudit(table) {
  table.bigInteger('created_by').unsigned().nullable().references('id').inTable('users');
  table.bigInteger('updated_by').unsigned().nullable().references('id').inTable('users');
  table.timestamps(true, true);
  table.integer('version').unsigned().notNullable().defaultTo(1);
}

export async function up(knex) {
  await knex.schema.createTable('attendance_shifts', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.timestamp('deactivated_at', { useTz: false }).nullable();
    table.bigInteger('deactivated_by').unsigned().nullable().references('id').inTable('users');
    table.string('deactivation_reason', 500).nullable();
    actorAudit(table);
    table.unique(['company_id', 'code'], { indexName: 'uq_attendance_shift_company_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_attendance_shift_id_company' });
    table.index(['company_id', 'status', 'name'], 'ix_attendance_shift_company_status');
  });

  await knex.schema.createTable('attendance_shift_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('attendance_shift_id').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.string('timezone', 100).notNullable();
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.boolean('crosses_midnight').notNullable().defaultTo(false);
    table.integer('unpaid_break_minutes').unsigned().notNullable().defaultTo(0);
    table.integer('grace_in_minutes').unsigned().notNullable().defaultTo(0);
    table.integer('grace_out_minutes').unsigned().notNullable().defaultTo(0);
    table.integer('check_in_window_before_minutes').unsigned().notNullable();
    table.integer('check_out_window_after_minutes').unsigned().notNullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_shift_version_id').unsigned().nullable();
    table.timestamp('superseded_at', { useTz: false }).nullable();
    table.bigInteger('superseded_by').unsigned().nullable().references('id').inTable('users');
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_shift_version_period',
    );
    table.check(
      '(crosses_midnight = 1 AND start_time >= end_time) OR (crosses_midnight = 0 AND start_time < end_time)',
      [],
      'ck_shift_version_times',
    );
    table.check('unpaid_break_minutes < 1440', [], 'ck_shift_version_break');
    table.index(
      ['attendance_shift_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_shift_version_effective',
    );
    table
      .foreign(['attendance_shift_id', 'company_id'], 'fk_shift_version_shift_company')
      .references(['id', 'company_id'])
      .inTable('attendance_shifts');
    table
      .foreign('supersedes_shift_version_id', 'fk_shift_version_supersedes')
      .references('id')
      .inTable('attendance_shift_versions');
  });

  await knex.schema.createTable('employee_shift_assignments', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.bigInteger('attendance_shift_id').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_shift_assignment_id').unsigned().nullable();
    table.timestamp('superseded_at', { useTz: false }).nullable();
    table.bigInteger('superseded_by').unsigned().nullable().references('id').inTable('users');
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_employee_shift_period',
    );
    table.index(
      ['employment_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_employee_shift_effective',
    );
    table
      .foreign(['employment_id', 'company_id'], 'fk_employee_shift_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign(['attendance_shift_id', 'company_id'], 'fk_employee_shift_shift_company')
      .references(['id', 'company_id'])
      .inTable('attendance_shifts');
    table
      .foreign('supersedes_shift_assignment_id', 'fk_employee_shift_supersedes')
      .references('id')
      .inTable('employee_shift_assignments');
  });

  await knex.schema.createTable('attendance_import_batches', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.enum('format', ['csv', 'json']).notNullable();
    table.string('source_type', 50).notNullable();
    table.string('source_reference', 150).nullable();
    table.string('idempotency_key', 100).notNullable();
    table.string('content_hash', 64).notNullable();
    table
      .enum('status', ['received', 'processing', 'completed', 'partially_failed', 'failed'])
      .notNullable();
    table.integer('total_rows').unsigned().notNullable();
    table.integer('successful_rows').unsigned().notNullable().defaultTo(0);
    table.integer('failed_rows').unsigned().notNullable().defaultTo(0);
    table.string('error_summary', 500).nullable();
    table.timestamp('started_at', { useTz: false }).nullable();
    table.timestamp('completed_at', { useTz: false }).nullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.unique(['company_id', 'idempotency_key'], {
      indexName: 'uq_attendance_import_idempotency',
    });
    table.index(['company_id', 'status', 'created_at'], 'ix_attendance_import_company_status');
  });

  await knex.schema.createTable('attendance_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table
      .bigInteger('import_batch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('attendance_import_batches');
    table.enum('event_type', ['check_in', 'check_out']).notNullable();
    table.timestamp('occurred_at_utc', { useTz: false }).notNullable();
    table.date('business_date').notNullable();
    table.enum('source_type', ['manual', 'import']).notNullable();
    table.string('source_event_key', 150).nullable();
    table.string('duplicate_fingerprint', 64).notNullable();
    table.string('manual_reason', 500).nullable();
    table.json('source_metadata').nullable();
    table.timestamp('received_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.bigInteger('created_by').unsigned().nullable().references('id').inTable('users');
    table.index(
      ['company_id', 'employment_id', 'business_date', 'occurred_at_utc'],
      'ix_attendance_event_employment_time',
    );
    table.index(
      ['company_id', 'source_type', 'source_event_key'],
      'ix_attendance_event_source_key',
    );
    table.index(['company_id', 'duplicate_fingerprint'], 'ix_attendance_event_fingerprint');
    table
      .foreign(['employment_id', 'company_id'], 'fk_attendance_event_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
  });

  await knex.schema.createTable('attendance_event_dispositions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table
      .bigInteger('attendance_event_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('attendance_events');
    table
      .enum('disposition', [
        'accepted',
        'ignored',
        'duplicate',
        'invalid',
        'superseded',
        'review_required',
      ])
      .notNullable();
    table.string('reason', 500).notNullable();
    table
      .bigInteger('related_event_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('attendance_events');
    table.bigInteger('created_by').unsigned().nullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.index(['attendance_event_id', 'created_at'], 'ix_attendance_disposition_event');
    table.index(['company_id', 'disposition', 'created_at'], 'ix_attendance_disposition_company');
  });

  await knex.schema.createTable('attendance_import_row_results', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table
      .bigInteger('import_batch_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('attendance_import_batches');
    table.integer('row_number').unsigned().notNullable();
    table.string('employee_code', 50).nullable();
    table.enum('status', ['created', 'duplicate', 'review_required', 'invalid']).notNullable();
    table.string('error_code', 100).nullable();
    table
      .bigInteger('attendance_event_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('attendance_events');
    table
      .bigInteger('related_event_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('attendance_events');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.unique(['import_batch_id', 'row_number'], { indexName: 'uq_attendance_import_row' });
  });

  await knex.schema.createTable('attendance_records', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.date('attendance_date').notNullable();
    table.integer('current_version_number').unsigned().notNullable().defaultTo(0);
    table
      .enum('status', [
        'present',
        'absent',
        'incomplete',
        'rest_day',
        'holiday',
        'configuration_exception',
      ])
      .notNullable();
    table.enum('exception_status', ['none', 'review_required']).notNullable().defaultTo('none');
    table.timestamp('locked_at', { useTz: false }).nullable();
    table.bigInteger('locked_by').unsigned().nullable().references('id').inTable('users');
    table.string('lock_reason', 500).nullable();
    actorAudit(table);
    table.unique(['company_id', 'employment_id', 'attendance_date'], {
      indexName: 'uq_attendance_record_day',
    });
    table.unique(['id', 'company_id'], { indexName: 'uq_attendance_record_id_company' });
    table.index(['company_id', 'attendance_date', 'status'], 'ix_attendance_record_company_date');
    table.index(['employment_id', 'attendance_date'], 'ix_attendance_record_employment_date');
    table
      .foreign(['employment_id', 'company_id'], 'fk_attendance_record_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
  });

  await knex.schema.createTable('attendance_correction_requests', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('attendance_record_id').unsigned().notNullable();
    table
      .bigInteger('requester_user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users');
    table.timestamp('requested_check_in_utc', { useTz: false }).nullable();
    table.timestamp('requested_check_out_utc', { useTz: false }).nullable();
    table.string('reason', 500).notNullable();
    table
      .enum('status', ['draft', 'submitted', 'approved', 'rejected', 'cancelled'])
      .notNullable()
      .defaultTo('draft');
    table.integer('record_version_at_submission').unsigned().nullable();
    table.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    actorAudit(table);
    table.unique(['id', 'company_id'], { indexName: 'uq_attendance_correction_id_company' });
    table.index(['company_id', 'status', 'created_at'], 'ix_attendance_correction_company_status');
    table
      .foreign(['attendance_record_id', 'company_id'], 'fk_attendance_correction_record_company')
      .references(['id', 'company_id'])
      .inTable('attendance_records');
  });

  await knex.schema.createTable('attendance_record_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('attendance_record_id').unsigned().notNullable();
    table.integer('version_number').unsigned().notNullable();
    table
      .bigInteger('attendance_shift_version_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('attendance_shift_versions');
    table
      .bigInteger('correction_request_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('attendance_correction_requests');
    table.enum('calculation_source', ['system', 'correction']).notNullable();
    table.timestamp('first_check_in_utc', { useTz: false }).nullable();
    table.timestamp('last_check_out_utc', { useTz: false }).nullable();
    table.timestamp('scheduled_start_utc', { useTz: false }).nullable();
    table.timestamp('scheduled_end_utc', { useTz: false }).nullable();
    table.string('schedule_timezone', 100).nullable();
    table.integer('unpaid_break_minutes').unsigned().notNullable().defaultTo(0);
    table.integer('worked_minutes').unsigned().notNullable().defaultTo(0);
    table.integer('late_minutes').unsigned().notNullable().defaultTo(0);
    table.integer('early_departure_minutes').unsigned().notNullable().defaultTo(0);
    table.string('status', 50).notNullable();
    table.string('exception_code', 100).nullable();
    table.date('resolved_business_date').notNullable();
    table.json('source_event_ids').notNullable();
    table.json('calculation_inputs').notNullable();
    table.bigInteger('calculated_by').unsigned().nullable().references('id').inTable('users');
    table.timestamp('calculated_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.unique(['attendance_record_id', 'version_number'], {
      indexName: 'uq_attendance_record_version',
    });
    table
      .foreign(['attendance_record_id', 'company_id'], 'fk_attendance_version_record_company')
      .references(['id', 'company_id'])
      .inTable('attendance_records');
  });

  await knex.schema.createTable('attendance_correction_decisions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('correction_request_id').unsigned().notNullable();
    table.integer('attempt_number').unsigned().notNullable();
    table.bigInteger('approver_user_id').unsigned().notNullable().references('id').inTable('users');
    table.enum('decision', ['approved', 'rejected']).notNullable();
    table.string('reason', 500).notNullable();
    table.integer('expected_workflow_version').unsigned().notNullable();
    table.string('idempotency_key', 100).notNullable();
    table.timestamp('decided_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.unique(['correction_request_id', 'attempt_number'], {
      indexName: 'uq_attendance_correction_terminal_attempt',
    });
    table.unique(['correction_request_id', 'idempotency_key'], {
      indexName: 'uq_attendance_correction_decision_idempotency',
    });
    table
      .foreign(['correction_request_id', 'company_id'], 'fk_attendance_decision_correction_company')
      .references(['id', 'company_id'])
      .inTable('attendance_correction_requests');
  });

  await knex.schema.createTable('attendance_workflow_state_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('correction_request_id').unsigned().notNullable();
    table.string('from_state', 30).nullable();
    table.string('to_state', 30).notNullable();
    table.integer('workflow_version').unsigned().notNullable();
    table.bigInteger('actor_user_id').unsigned().notNullable().references('id').inTable('users');
    table.string('reason', 500).nullable();
    table.timestamp('occurred_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.unique(['correction_request_id', 'workflow_version'], {
      indexName: 'uq_attendance_workflow_version',
    });
    table
      .foreign(['correction_request_id', 'company_id'], 'fk_attendance_workflow_correction_company')
      .references(['id', 'company_id'])
      .inTable('attendance_correction_requests');
  });

  await knex.schema.createTable('attendance_lock_periods', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.bigInteger('branch_id').unsigned().nullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.enum('status', ['locked', 'reversed']).notNullable().defaultTo('locked');
    table.string('reason', 500).notNullable();
    table.bigInteger('locked_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('locked_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.string('reversal_reason', 500).nullable();
    table.bigInteger('reversed_by').unsigned().nullable().references('id').inTable('users');
    table.timestamp('reversed_at', { useTz: false }).nullable();
    table.integer('version').unsigned().notNullable().defaultTo(1);
    table.index(
      ['company_id', 'branch_id', 'status', 'period_start', 'period_end'],
      'ix_attendance_lock_scope_period',
    );
    table
      .foreign(['branch_id', 'company_id'], 'fk_attendance_lock_branch_company')
      .references(['id', 'company_id'])
      .inTable('branches');
    table.check('period_end >= period_start', [], 'ck_attendance_lock_period');
  });
}

export async function down(knex) {
  for (const table of [
    'attendance_lock_periods',
    'attendance_workflow_state_events',
    'attendance_correction_decisions',
    'attendance_record_versions',
    'attendance_correction_requests',
    'attendance_records',
    'attendance_import_row_results',
    'attendance_event_dispositions',
    'attendance_events',
    'attendance_import_batches',
    'employee_shift_assignments',
    'attendance_shift_versions',
    'attendance_shifts',
  ])
    await knex.schema.dropTableIfExists(table);
}
