export async function up(knex) {
  await knex.schema.createTable('payroll_periods', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.date('payment_date').notNullable();
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.integer('version').unsigned().notNullable().defaultTo(1);
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.bigInteger('updated_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamps(true, true);
    table.unique(['company_id', 'code'], { indexName: 'uq_payroll_period_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_payroll_period_company' });
    table.index(['company_id', 'period_start', 'period_end'], 'ix_payroll_period_dates');
    table.check('period_end >= period_start', [], 'ck_payroll_period_dates');
  });

  await knex.schema.createTable('payroll_components', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.enum('component_type', ['earning', 'deduction']).notNullable();
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.integer('version').unsigned().notNullable().defaultTo(1);
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.bigInteger('updated_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamps(true, true);
    table.unique(['company_id', 'code'], { indexName: 'uq_payroll_component_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_payroll_component_company' });
    table.index(['company_id', 'status', 'component_type'], 'ix_payroll_component_list');
  });

  await knex.schema.createTable('payroll_component_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_component_id').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.boolean('show_on_payslip').notNullable().defaultTo(true);
    table.integer('display_order').notNullable().defaultTo(0);
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_version_id').unsigned().nullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['id', 'company_id'], { indexName: 'uq_payroll_component_version_company' });
    table.index(
      ['payroll_component_id', 'effective_start', 'effective_end'],
      'ix_component_version_period',
    );
    table
      .foreign(['payroll_component_id', 'company_id'], 'fk_component_version_company')
      .references(['id', 'company_id'])
      .inTable('payroll_components');
    table.foreign('supersedes_version_id').references('id').inTable('payroll_component_versions');
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_component_version_dates',
    );
  });

  await knex.schema.createTable('employment_compensation_periods', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.decimal('monthly_base_amount', 15, 2).notNullable();
    table.string('currency_code', 3).notNullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_compensation_id').unsigned().nullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['id', 'company_id'], { indexName: 'uq_compensation_company' });
    table.index(['employment_id', 'effective_start', 'effective_end'], 'ix_compensation_period');
    table
      .foreign(['employment_id', 'company_id'], 'fk_compensation_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign('supersedes_compensation_id', 'fk_compensation_supersedes')
      .references('id')
      .inTable('employment_compensation_periods');
    table.check('monthly_base_amount >= 0', [], 'ck_compensation_amount');
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_compensation_dates',
    );
  });

  await knex.schema.createTable('employment_recurring_payroll_components', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.bigInteger('payroll_component_id').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.decimal('amount', 15, 2).notNullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['id', 'company_id'], { indexName: 'uq_recurring_component_company' });
    table.index(
      ['employment_id', 'payroll_component_id', 'effective_start', 'effective_end'],
      'ix_recurring_component_period',
    );
    table
      .foreign(['employment_id', 'company_id'], 'fk_recurring_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign(['payroll_component_id', 'company_id'], 'fk_recurring_component_company')
      .references(['id', 'company_id'])
      .inTable('payroll_components');
    table.check('amount >= 0', [], 'ck_recurring_amount');
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_recurring_dates',
    );
  });

  await knex.schema.createTable('payroll_one_time_inputs', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_period_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.bigInteger('payroll_component_id').unsigned().notNullable();
    table.decimal('amount', 15, 2).notNullable();
    table.enum('status', ['active', 'reversed']).notNullable().defaultTo('active');
    table.bigInteger('reversal_of_input_id').unsigned().nullable();
    table.string('reason', 500).notNullable();
    table.string('idempotency_key', 128).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['company_id', 'idempotency_key'], { indexName: 'uq_payroll_input_idempotency' });
    table.unique(['reversal_of_input_id'], { indexName: 'uq_payroll_input_reversal' });
    table.index(['company_id', 'payroll_period_id', 'employment_id'], 'ix_payroll_input_period');
    table
      .foreign(['payroll_period_id', 'company_id'], 'fk_input_period_company')
      .references(['id', 'company_id'])
      .inTable('payroll_periods');
    table
      .foreign(['employment_id', 'company_id'], 'fk_input_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign(['payroll_component_id', 'company_id'], 'fk_input_component_company')
      .references(['id', 'company_id'])
      .inTable('payroll_components');
    table.foreign('reversal_of_input_id').references('id').inTable('payroll_one_time_inputs');
    table.check('amount >= 0', [], 'ck_payroll_input_amount');
  });

  await knex.schema.createTable('payroll_runs', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_period_id').unsigned().notNullable();
    table.string('code', 60).notNullable();
    table.enum('run_type', ['regular']).notNullable().defaultTo('regular');
    table
      .enum('status', ['draft', 'processing', 'processed', 'submitted', 'approved', 'locked'])
      .notNullable()
      .defaultTo('draft');
    table
      .enum('calculation_status', ['not_started', 'completed', 'partially_failed', 'failed'])
      .notNullable()
      .defaultTo('not_started');
    table.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    table.integer('version').unsigned().notNullable().defaultTo(1);
    table.bigInteger('current_attempt_id').unsigned().nullable();
    table.bigInteger('processed_by').unsigned().nullable().references('id').inTable('users');
    table.bigInteger('submitted_by').unsigned().nullable().references('id').inTable('users');
    table.bigInteger('approved_by').unsigned().nullable().references('id').inTable('users');
    table.bigInteger('locked_by').unsigned().nullable().references('id').inTable('users');
    table.timestamp('submitted_at').nullable();
    table.timestamp('approved_at').nullable();
    table.timestamp('locked_at').nullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamps(true, true);
    table.unique(['company_id', 'code'], { indexName: 'uq_payroll_run_code' });
    table.unique(['company_id', 'payroll_period_id', 'run_type'], {
      indexName: 'uq_regular_run_period',
    });
    table.unique(['id', 'company_id'], { indexName: 'uq_payroll_run_company' });
    table.index(['company_id', 'status', 'payroll_period_id'], 'ix_payroll_run_list');
    table
      .foreign(['payroll_period_id', 'company_id'], 'fk_run_period_company')
      .references(['id', 'company_id'])
      .inTable('payroll_periods');
  });

  await knex.schema.createTable('payroll_run_employees', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_run_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.string('employee_code_snapshot', 50).notNullable();
    table.string('employee_name_snapshot', 200).notNullable();
    table.bigInteger('branch_id_snapshot').unsigned().nullable();
    table.bigInteger('department_id_snapshot').unsigned().nullable();
    table
      .enum('calculation_status', ['pending', 'success', 'failed'])
      .notNullable()
      .defaultTo('pending');
    table.string('failure_code', 100).nullable();
    table.string('failure_message', 500).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['payroll_run_id', 'employment_id'], { indexName: 'uq_run_employee' });
    table.unique(['id', 'company_id'], { indexName: 'uq_run_employee_company' });
    table.index(['company_id', 'employment_id', 'payroll_run_id'], 'ix_run_employee_employment');
    table
      .foreign(['payroll_run_id', 'company_id'], 'fk_run_employee_run_company')
      .references(['id', 'company_id'])
      .inTable('payroll_runs');
    table
      .foreign(['employment_id', 'company_id'], 'fk_run_employee_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
  });

  await knex.schema.createTable('payroll_calculation_attempts', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_run_id').unsigned().notNullable();
    table.integer('attempt_number').unsigned().notNullable();
    table
      .enum('status', ['processing', 'completed', 'partially_failed', 'failed', 'superseded'])
      .notNullable();
    table.string('idempotency_key', 128).notNullable();
    table.integer('employee_count').unsigned().notNullable();
    table.integer('success_count').unsigned().notNullable().defaultTo(0);
    table.integer('failure_count').unsigned().notNullable().defaultTo(0);
    table.bigInteger('requested_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.unique(['payroll_run_id', 'attempt_number'], {
      indexName: 'uq_calculation_attempt_number',
    });
    table.unique(['company_id', 'idempotency_key'], { indexName: 'uq_calculation_attempt_key' });
    table.unique(['id', 'company_id'], { indexName: 'uq_calculation_attempt_company' });
    table
      .foreign(['payroll_run_id', 'company_id'], 'fk_attempt_run_company')
      .references(['id', 'company_id'])
      .inTable('payroll_runs');
  });

  await knex.schema.createTable('payroll_result_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_run_employee_id').unsigned().notNullable();
    table.bigInteger('calculation_attempt_id').unsigned().nullable();
    table.integer('version_number').unsigned().notNullable();
    table.string('currency_code', 3).notNullable();
    table.decimal('monthly_base_amount', 15, 2).notNullable();
    table.decimal('gross_earnings', 15, 2).notNullable();
    table.decimal('total_deductions', 15, 2).notNullable();
    table.decimal('net_pay', 15, 2).notNullable();
    table.enum('state', ['active', 'superseded', 'reversed']).notNullable().defaultTo('active');
    table.bigInteger('supersedes_result_id').unsigned().nullable();
    table.timestamp('calculated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['payroll_run_employee_id', 'version_number'], { indexName: 'uq_result_version' });
    table.unique(['calculation_attempt_id', 'payroll_run_employee_id'], {
      indexName: 'uq_attempt_employee_result',
    });
    table.unique(['id', 'company_id'], { indexName: 'uq_result_company' });
    table
      .foreign(['payroll_run_employee_id', 'company_id'], 'fk_result_run_employee_company')
      .references(['id', 'company_id'])
      .inTable('payroll_run_employees');
    table
      .foreign(['calculation_attempt_id', 'company_id'], 'fk_result_attempt_company')
      .references(['id', 'company_id'])
      .inTable('payroll_calculation_attempts');
    table.foreign('supersedes_result_id').references('id').inTable('payroll_result_versions');
    table.check(
      'monthly_base_amount >= 0 AND gross_earnings >= 0 AND total_deductions >= 0 AND net_pay >= 0',
      [],
      'ck_result_nonnegative',
    );
    table.check('net_pay = gross_earnings - total_deductions', [], 'ck_result_totals');
  });

  await knex.schema.createTable('payroll_attendance_summaries', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_result_version_id').unsigned().notNullable();
    table.integer('present_days').unsigned().notNullable().defaultTo(0);
    table.integer('absent_days').unsigned().notNullable().defaultTo(0);
    table.integer('incomplete_days').unsigned().notNullable().defaultTo(0);
    table.integer('on_leave_days').unsigned().notNullable().defaultTo(0);
    table.integer('rest_days').unsigned().notNullable().defaultTo(0);
    table.integer('holiday_days').unsigned().notNullable().defaultTo(0);
    table.integer('configuration_exception_days').unsigned().notNullable().defaultTo(0);
    table.integer('source_record_count').unsigned().notNullable().defaultTo(0);
    table.unique(['payroll_result_version_id'], { indexName: 'uq_result_attendance_summary' });
    table
      .foreign(['payroll_result_version_id', 'company_id'], 'fk_attendance_summary_result')
      .references(['id', 'company_id'])
      .inTable('payroll_result_versions');
  });

  await knex.schema.createTable('payroll_leave_summaries', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_result_version_id').unsigned().notNullable();
    table.decimal('approved_units', 9, 2).notNullable().defaultTo(0);
    table.unique(['payroll_result_version_id'], { indexName: 'uq_result_leave_summary' });
    table
      .foreign(['payroll_result_version_id', 'company_id'], 'fk_leave_summary_result')
      .references(['id', 'company_id'])
      .inTable('payroll_result_versions');
    table.check('approved_units >= 0', [], 'ck_payroll_leave_summary_units');
  });

  await knex.schema.createTable('payroll_result_items', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_result_version_id').unsigned().notNullable();
    table.bigInteger('payroll_component_id').unsigned().nullable();
    table.string('component_code_snapshot', 50).notNullable();
    table.string('component_name_snapshot', 150).notNullable();
    table.enum('component_type', ['earning', 'deduction']).notNullable();
    table.enum('source_type', ['base_salary', 'recurring', 'one_time', 'adjustment']).notNullable();
    table.decimal('amount', 15, 2).notNullable();
    table.boolean('show_on_payslip').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['payroll_result_version_id', 'component_type'], 'ix_result_item_type');
    table
      .foreign(['payroll_result_version_id', 'company_id'], 'fk_result_item_result_company')
      .references(['id', 'company_id'])
      .inTable('payroll_result_versions');
    table.check('amount >= 0', [], 'ck_result_item_amount');
  });

  await knex.schema.createTable('payroll_control_totals', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('calculation_attempt_id').unsigned().notNullable();
    table.integer('employee_count').unsigned().notNullable();
    table.integer('failure_count').unsigned().notNullable();
    table.decimal('gross_earnings', 17, 2).notNullable();
    table.decimal('total_deductions', 17, 2).notNullable();
    table.decimal('net_pay', 17, 2).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['calculation_attempt_id'], { indexName: 'uq_attempt_control_totals' });
    table
      .foreign(['calculation_attempt_id', 'company_id'], 'fk_control_attempt_company')
      .references(['id', 'company_id'])
      .inTable('payroll_calculation_attempts');
    table.check(
      'gross_earnings >= 0 AND total_deductions >= 0 AND net_pay >= 0',
      [],
      'ck_control_nonnegative',
    );
    table.check('net_pay = gross_earnings - total_deductions', [], 'ck_control_totals');
  });

  await knex.schema.createTable('payroll_state_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_run_id').unsigned().notNullable();
    table.string('from_state', 30).nullable();
    table.string('to_state', 30).notNullable();
    table.integer('workflow_version').unsigned().notNullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['payroll_run_id', 'workflow_version'], { indexName: 'uq_payroll_state_version' });
    table
      .foreign(['payroll_run_id', 'company_id'], 'fk_state_run_company')
      .references(['id', 'company_id'])
      .inTable('payroll_runs');
  });

  await knex.schema.createTable('payroll_approval_attempts', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_run_id').unsigned().notNullable();
    table.integer('attempt_number').unsigned().notNullable();
    table.integer('submitted_workflow_version').unsigned().notNullable();
    table.enum('status', ['pending', 'approved', 'rejected']).notNullable().defaultTo('pending');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.unique(['payroll_run_id', 'attempt_number'], {
      indexName: 'uq_payroll_approval_attempt',
    });
    table.index(['payroll_run_id', 'status'], 'ix_payroll_approval_pending');
    table
      .foreign(['payroll_run_id', 'company_id'], 'fk_approval_attempt_run_company')
      .references(['id', 'company_id'])
      .inTable('payroll_runs');
  });

  await knex.schema.createTable('payroll_approval_decisions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_run_id').unsigned().notNullable();
    table.bigInteger('payroll_approval_attempt_id').unsigned().notNullable();
    table.enum('decision', ['approved', 'rejected']).notNullable();
    table.integer('record_workflow_version').unsigned().notNullable();
    table.string('reason', 500).notNullable();
    table.string('idempotency_key', 128).notNullable();
    table.bigInteger('decided_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('decided_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['company_id', 'idempotency_key'], { indexName: 'uq_payroll_decision_key' });
    table.unique(['payroll_approval_attempt_id'], {
      indexName: 'uq_payroll_attempt_terminal_decision',
    });
    table.index(['payroll_run_id', 'decided_at'], 'ix_payroll_decision_history');
    table
      .foreign(['payroll_run_id', 'company_id'], 'fk_decision_run_company')
      .references(['id', 'company_id'])
      .inTable('payroll_runs');
    table
      .foreign('payroll_approval_attempt_id')
      .references('id')
      .inTable('payroll_approval_attempts');
  });

  await knex.schema.createTable('payroll_result_state_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_result_version_id').unsigned().notNullable();
    table.enum('state', ['active', 'superseded', 'reversed']).notNullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.index(['payroll_result_version_id', 'id'], 'ix_result_state_latest');
    table
      .foreign(['payroll_result_version_id', 'company_id'], 'fk_result_state_result_company')
      .references(['id', 'company_id'])
      .inTable('payroll_result_versions');
  });

  await knex.schema.createTable('payroll_locks', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_run_id').unsigned().notNullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('locked_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('locked_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['payroll_run_id'], { indexName: 'uq_payroll_run_lock' });
    table
      .foreign(['payroll_run_id', 'company_id'], 'fk_lock_run_company')
      .references(['id', 'company_id'])
      .inTable('payroll_runs');
  });

  await knex.schema.createTable('payroll_adjustments', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('original_result_id').unsigned().notNullable();
    table.bigInteger('payroll_component_id').unsigned().notNullable();
    table.enum('component_type', ['earning', 'deduction']).notNullable();
    table.decimal('amount', 15, 2).notNullable();
    table
      .enum('status', ['draft', 'submitted', 'approved', 'rejected', 'applied'])
      .notNullable()
      .defaultTo('draft');
    table.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    table.string('reason', 500).notNullable();
    table.string('idempotency_key', 128).notNullable();
    table.bigInteger('requested_by').unsigned().notNullable().references('id').inTable('users');
    table.bigInteger('decided_by').unsigned().nullable().references('id').inTable('users');
    table
      .bigInteger('corrected_result_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('payroll_result_versions');
    table.timestamps(true, true);
    table.unique(['company_id', 'idempotency_key'], { indexName: 'uq_payroll_adjustment_key' });
    table
      .foreign(['original_result_id', 'company_id'], 'fk_adjustment_result_company')
      .references(['id', 'company_id'])
      .inTable('payroll_result_versions');
    table
      .foreign(['payroll_component_id', 'company_id'], 'fk_adjustment_component_company')
      .references(['id', 'company_id'])
      .inTable('payroll_components');
    table.check('amount > 0', [], 'ck_adjustment_amount');
  });

  await knex.schema.createTable('payroll_reversals', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('original_result_id').unsigned().notNullable();
    table.string('reason', 500).notNullable();
    table.string('idempotency_key', 128).notNullable();
    table.bigInteger('reversed_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('reversed_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['original_result_id'], { indexName: 'uq_payroll_result_reversal' });
    table.unique(['company_id', 'idempotency_key'], { indexName: 'uq_payroll_reversal_key' });
    table
      .foreign(['original_result_id', 'company_id'], 'fk_reversal_result_company')
      .references(['id', 'company_id'])
      .inTable('payroll_result_versions');
  });

  await knex.schema.createTable('payslip_publications', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('payroll_result_version_id').unsigned().notNullable();
    table.enum('status', ['published', 'revoked']).notNullable();
    table.integer('publication_version').unsigned().notNullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['payroll_result_version_id', 'publication_version'], {
      indexName: 'uq_payslip_publication_version',
    });
    table.index(['company_id', 'status', 'occurred_at'], 'ix_payslip_publication_status');
    table
      .foreign(['payroll_result_version_id', 'company_id'], 'fk_publication_result_company')
      .references(['id', 'company_id'])
      .inTable('payroll_result_versions');
  });

  await knex.schema.alterTable('payroll_runs', (table) => {
    table
      .foreign(['current_attempt_id', 'company_id'], 'fk_run_current_attempt_company')
      .references(['id', 'company_id'])
      .inTable('payroll_calculation_attempts');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('payroll_runs', (table) =>
    table.dropForeign(['current_attempt_id', 'company_id'], 'fk_run_current_attempt_company'),
  );
  for (const name of [
    'payslip_publications',
    'payroll_reversals',
    'payroll_adjustments',
    'payroll_locks',
    'payroll_result_state_events',
    'payroll_approval_decisions',
    'payroll_approval_attempts',
    'payroll_state_events',
    'payroll_control_totals',
    'payroll_result_items',
    'payroll_leave_summaries',
    'payroll_attendance_summaries',
    'payroll_result_versions',
    'payroll_calculation_attempts',
    'payroll_run_employees',
    'payroll_runs',
    'payroll_one_time_inputs',
    'employment_recurring_payroll_components',
    'employment_compensation_periods',
    'payroll_component_versions',
    'payroll_components',
    'payroll_periods',
  ])
    await knex.schema.dropTableIfExists(name);
}
