export async function up(knex) {
  await knex.schema.createTable('loan_number_sequences', (t) => {
    t.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    t.integer('sequence_year').unsigned().notNullable();
    t.bigInteger('next_value').unsigned().notNullable().defaultTo(1);
    t.primary(['company_id', 'sequence_year']);
    t.check('next_value > 0', [], 'ck_loan_sequence_positive');
  });
  await knex.schema.createTable('loan_facility_types', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.string('description', 500);
    t.enum('facility_kind', ['loan', 'salary_advance']).notNullable();
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.bigInteger('updated_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['company_id', 'code'], { indexName: 'uq_loan_type_company_code' });
    t.unique(['id', 'company_id'], { indexName: 'uq_loan_type_company' });
    t.foreign('company_id').references('id').inTable('companies');
    t.index(['company_id', 'record_status', 'facility_kind'], 'ix_loan_type_list');
  });
  await knex.schema.createTable('loan_facility_type_versions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_facility_type_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.date('effective_start').notNullable();
    t.date('effective_end');
    t.string('currency_code', 3).notNullable();
    t.decimal('minimum_principal', 19, 2).notNullable();
    t.decimal('maximum_principal', 19, 2).notNullable();
    t.integer('minimum_term_months').unsigned().notNullable();
    t.integer('maximum_term_months').unsigned().notNullable();
    t.integer('installment_due_day').unsigned().notNullable();
    t.integer('minimum_service_days').unsigned();
    t.integer('maximum_active_facilities').unsigned().notNullable();
    t.enum('sensitive_classification', ['standard', 'sensitive'])
      .notNullable()
      .defaultTo('sensitive');
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('reason', 500).notNullable();
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['loan_facility_type_id', 'version_number'], { indexName: 'uq_loan_type_version' });
    t.unique(['id', 'company_id'], { indexName: 'uq_loan_type_version_company' });
    t.foreign(['loan_facility_type_id', 'company_id'], 'fk_loan_type_version_parent')
      .references(['id', 'company_id'])
      .inTable('loan_facility_types');
    t.foreign('supersedes_version_id', 'fk_loan_type_version_supersedes')
      .references('id')
      .inTable('loan_facility_type_versions');
    t.index(
      ['loan_facility_type_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_loan_type_effective',
    );
    t.check('effective_end IS NULL OR effective_end >= effective_start', [], 'ck_loan_type_dates');
    t.check(
      'minimum_principal > 0 AND maximum_principal >= minimum_principal',
      [],
      'ck_loan_type_principal',
    );
    t.check(
      'minimum_term_months > 0 AND maximum_term_months >= minimum_term_months',
      [],
      'ck_loan_type_term',
    );
    t.check('installment_due_day BETWEEN 1 AND 31', [], 'ck_loan_type_due_day');
    t.check('maximum_active_facilities > 0', [], 'ck_loan_type_active_max');
  });
  await knex.schema.createTable('loan_applications', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.bigInteger('loan_facility_type_id').unsigned().notNullable();
    t.string('application_number', 30);
    t.enum('status', [
      'draft',
      'submitted',
      'manager_rejected',
      'manager_approved',
      'finance_rejected',
      'finance_approved',
      'cancellation_requested',
      'cancelled',
      'withdrawn',
      'disbursed',
    ])
      .notNullable()
      .defaultTo('draft');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.bigInteger('updated_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.unique(['company_id', 'application_number'], { indexName: 'uq_loan_application_number' });
    t.unique(['id', 'company_id'], { indexName: 'uq_loan_application_company' });
    t.foreign(['employment_id', 'company_id'], 'fk_loan_application_employment')
      .references(['id', 'company_id'])
      .inTable('employments');
    t.foreign(['loan_facility_type_id', 'company_id'], 'fk_loan_application_type')
      .references(['id', 'company_id'])
      .inTable('loan_facility_types');
    t.index(['company_id', 'status', 'employment_id'], 'ix_loan_application_list');
  });
  await knex.schema.createTable('loan_application_versions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_application_id').unsigned().notNullable();
    t.bigInteger('loan_facility_type_version_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.decimal('requested_principal', 19, 2).notNullable();
    t.integer('requested_term_months').unsigned().notNullable();
    t.string('currency_code', 3).notNullable();
    t.string('purpose', 500).notNullable();
    t.date('submission_anchor_date');
    t.bigInteger('manager_employment_id_snapshot').unsigned();
    t.bigInteger('manager_user_id_snapshot').unsigned();
    t.bigInteger('branch_id_snapshot').unsigned();
    t.bigInteger('department_id_snapshot').unsigned();
    t.string('employment_status_snapshot', 30);
    t.integer('service_days_snapshot').unsigned();
    t.decimal('compensation_amount_snapshot', 19, 2);
    t.string('change_reason', 500).notNullable();
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['loan_application_id', 'version_number'], {
      indexName: 'uq_loan_application_version',
    });
    t.unique(['id', 'company_id'], { indexName: 'uq_loan_application_version_company' });
    t.foreign(['loan_application_id', 'company_id'], 'fk_loan_version_application')
      .references(['id', 'company_id'])
      .inTable('loan_applications');
    t.foreign(['loan_facility_type_version_id', 'company_id'], 'fk_loan_version_type')
      .references(['id', 'company_id'])
      .inTable('loan_facility_type_versions');
    t.foreign(['manager_employment_id_snapshot', 'company_id'], 'fk_loan_version_manager')
      .references(['id', 'company_id'])
      .inTable('employments');
    t.foreign('manager_user_id_snapshot', 'fk_loan_version_manager_user')
      .references('id')
      .inTable('users');
    t.check('requested_principal > 0', [], 'ck_loan_application_principal');
    t.check('requested_term_months > 0', [], 'ck_loan_application_term');
  });
  await knex.schema.createTable('loan_approval_attempts', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_application_id').unsigned().notNullable();
    t.enum('step_type', ['manager', 'hr_fallback', 'finance', 'cancellation']).notNullable();
    t.integer('attempt_number').unsigned().notNullable();
    t.bigInteger('assigned_approver_user_id').unsigned();
    t.integer('record_version_at_creation').unsigned().notNullable();
    t.integer('workflow_version_at_creation').unsigned().notNullable();
    t.enum('status', ['pending', 'approved', 'rejected']).notNullable().defaultTo('pending');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['loan_application_id', 'step_type', 'attempt_number'], {
      indexName: 'uq_loan_approval_attempt',
    });
    t.unique(['id', 'company_id'], { indexName: 'uq_loan_attempt_company' });
    t.foreign(['loan_application_id', 'company_id'], 'fk_loan_attempt_application')
      .references(['id', 'company_id'])
      .inTable('loan_applications');
    t.foreign('assigned_approver_user_id', 'fk_loan_attempt_approver')
      .references('id')
      .inTable('users');
  });
  await knex.schema.createTable('loan_approval_decisions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_approval_attempt_id').unsigned().notNullable();
    t.bigInteger('loan_application_id').unsigned().notNullable();
    t.enum('decision', ['approved', 'rejected']).notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    t.string('idempotency_key', 100).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.timestamp('decided_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['loan_approval_attempt_id'], { indexName: 'uq_loan_attempt_terminal' });
    t.unique(['company_id', 'idempotency_key'], { indexName: 'uq_loan_decision_idempotency' });
    t.foreign(['loan_approval_attempt_id', 'company_id'], 'fk_loan_decision_attempt')
      .references(['id', 'company_id'])
      .inTable('loan_approval_attempts');
    t.foreign(['loan_application_id', 'company_id'], 'fk_loan_decision_application')
      .references(['id', 'company_id'])
      .inTable('loan_applications');
  });
  await knex.schema.createTable('loan_state_events', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_application_id').unsigned().notNullable();
    t.string('from_state', 30);
    t.string('to_state', 30).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['loan_application_id', 'workflow_version'], { indexName: 'uq_loan_state_version' });
    t.foreign(['loan_application_id', 'company_id'], 'fk_loan_state_application')
      .references(['id', 'company_id'])
      .inTable('loan_applications');
  });
  await knex.schema.createTable('loan_accounts', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_application_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.string('account_number', 30).notNullable();
    t.enum('status', ['active', 'settled', 'closed']).notNullable().defaultTo('active');
    t.decimal('original_principal', 19, 2).notNullable();
    t.decimal('total_repayable', 19, 2).notNullable();
    t.decimal('outstanding_amount', 19, 2).notNullable();
    t.string('currency_code', 3).notNullable();
    t.date('disbursement_date').notNullable();
    t.date('maturity_date').notNullable();
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['loan_application_id'], { indexName: 'uq_loan_account_application' });
    t.unique(['company_id', 'account_number'], { indexName: 'uq_loan_account_number' });
    t.unique(['id', 'company_id'], { indexName: 'uq_loan_account_company' });
    t.foreign(['loan_application_id', 'company_id'], 'fk_loan_account_application')
      .references(['id', 'company_id'])
      .inTable('loan_applications');
    t.foreign(['employment_id', 'company_id'], 'fk_loan_account_employment')
      .references(['id', 'company_id'])
      .inTable('employments');
    t.check(
      'original_principal > 0 AND total_repayable = original_principal',
      [],
      'ck_loan_account_interest_free',
    );
    t.check(
      'outstanding_amount >= 0 AND outstanding_amount <= total_repayable',
      [],
      'ck_loan_account_outstanding',
    );
  });
  await knex.schema.createTable('loan_disbursements', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_account_id').unsigned().notNullable();
    t.decimal('amount', 19, 2).notNullable();
    t.string('currency_code', 3).notNullable();
    t.date('disbursement_date').notNullable();
    t.string('reference', 100).notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.bigInteger('recorded_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['loan_account_id'], { indexName: 'uq_loan_account_disbursement' });
    t.unique(['company_id', 'idempotency_key'], { indexName: 'uq_loan_disbursement_idempotency' });
    t.foreign(['loan_account_id', 'company_id'], 'fk_loan_disbursement_account')
      .references(['id', 'company_id'])
      .inTable('loan_accounts');
    t.check('amount > 0', [], 'ck_loan_disbursement_positive');
  });
  await knex.schema.createTable('loan_repayment_schedules', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_account_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable().defaultTo(1);
    t.decimal('scheduled_total', 19, 2).notNullable();
    t.integer('installment_count').unsigned().notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['loan_account_id', 'version_number'], { indexName: 'uq_loan_schedule_version' });
    t.unique(['id', 'company_id'], { indexName: 'uq_loan_schedule_company' });
    t.foreign(['loan_account_id', 'company_id'], 'fk_loan_schedule_account')
      .references(['id', 'company_id'])
      .inTable('loan_accounts');
    t.check('scheduled_total > 0 AND installment_count > 0', [], 'ck_loan_schedule_positive');
  });
  await knex.schema.createTable('loan_repayment_installments', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_repayment_schedule_id').unsigned().notNullable();
    t.integer('installment_number').unsigned().notNullable();
    t.date('due_date').notNullable();
    t.decimal('principal_amount', 19, 2).notNullable();
    t.decimal('total_amount', 19, 2).notNullable();
    t.enum('status', ['scheduled', 'partially_paid', 'paid']).notNullable().defaultTo('scheduled');
    t.unique(['loan_repayment_schedule_id', 'installment_number'], {
      indexName: 'uq_loan_installment_number',
    });
    t.foreign(['loan_repayment_schedule_id', 'company_id'], 'fk_loan_installment_schedule')
      .references(['id', 'company_id'])
      .inTable('loan_repayment_schedules');
    t.check(
      'principal_amount > 0 AND total_amount = principal_amount',
      [],
      'ck_loan_installment_interest_free',
    );
  });
  await knex.schema.createTable('loan_repayment_ledger', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('loan_account_id').unsigned().notNullable();
    t.enum('entry_type', ['repayment', 'adjustment', 'reversal']).notNullable();
    t.decimal('amount', 19, 2).notNullable();
    t.date('effective_date').notNullable();
    t.string('reference', 100);
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.bigInteger('reversal_of_entry_id').unsigned();
    t.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['company_id', 'idempotency_key'], { indexName: 'uq_loan_ledger_idempotency' });
    t.unique(['reversal_of_entry_id'], { indexName: 'uq_loan_ledger_single_reversal' });
    t.foreign(['loan_account_id', 'company_id'], 'fk_loan_ledger_account')
      .references(['id', 'company_id'])
      .inTable('loan_accounts');
    t.foreign('reversal_of_entry_id', 'fk_loan_ledger_reversal')
      .references('id')
      .inTable('loan_repayment_ledger');
    t.check('amount <> 0', [], 'ck_loan_ledger_nonzero');
    t.check(
      "(entry_type IN ('repayment','adjustment') AND amount > 0 AND reversal_of_entry_id IS NULL) OR (entry_type = 'reversal' AND amount < 0 AND reversal_of_entry_id IS NOT NULL)",
      [],
      'ck_loan_ledger_shape',
    );
  });
}
export async function down(knex) {
  for (const name of [
    'loan_repayment_ledger',
    'loan_repayment_installments',
    'loan_repayment_schedules',
    'loan_disbursements',
    'loan_accounts',
    'loan_state_events',
    'loan_approval_decisions',
    'loan_approval_attempts',
    'loan_application_versions',
    'loan_applications',
    'loan_facility_type_versions',
    'loan_facility_types',
    'loan_number_sequences',
  ])
    await knex.schema.dropTableIfExists(name);
}
