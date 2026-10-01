export async function up(knex) {
  await knex.schema.createTable('claim_number_sequences', (t) => {
    t.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    t.integer('sequence_year').unsigned().notNullable();
    t.bigInteger('next_value').unsigned().notNullable().defaultTo(1);
    t.primary(['company_id', 'sequence_year']);
    t.check('next_value > 0', [], 'ck_claim_sequence_positive');
  });
  await knex.schema.createTable('claim_categories', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.string('description', 500);
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.bigInteger('updated_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['company_id', 'code'], { indexName: 'uq_claim_category_company_code' });
    t.unique(['id', 'company_id'], { indexName: 'uq_claim_category_company' });
    t.foreign('company_id').references('id').inTable('companies');
    t.index(['company_id', 'record_status', 'name'], 'ix_claim_category_list');
  });
  await knex.schema.createTable('claim_category_versions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('claim_category_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.date('effective_start').notNullable();
    t.date('effective_end');
    t.boolean('receipt_required').notNullable().defaultTo(false);
    t.decimal('maximum_item_amount', 19, 2);
    t.string('currency_code', 3).notNullable();
    t.enum('sensitive_classification', ['standard', 'sensitive'])
      .notNullable()
      .defaultTo('standard');
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('reason', 500).notNullable();
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['claim_category_id', 'version_number'], { indexName: 'uq_claim_category_version' });
    t.unique(['id', 'company_id'], { indexName: 'uq_claim_category_version_company' });
    t.foreign(['claim_category_id', 'company_id'], 'fk_claim_category_version_parent')
      .references(['id', 'company_id'])
      .inTable('claim_categories');
    t.foreign('supersedes_version_id').references('id').inTable('claim_category_versions');
    t.index(
      ['claim_category_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_claim_category_effective',
    );
    t.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_claim_category_dates',
    );
    t.check('maximum_item_amount IS NULL OR maximum_item_amount > 0', [], 'ck_claim_category_max');
  });
  await knex.schema.createTable('expense_claims', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.string('claim_number', 30);
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
      'paid',
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
    t.unique(['company_id', 'claim_number'], { indexName: 'uq_expense_claim_number' });
    t.unique(['id', 'company_id'], { indexName: 'uq_expense_claim_company' });
    t.foreign(['employment_id', 'company_id'], 'fk_expense_claim_employment')
      .references(['id', 'company_id'])
      .inTable('employments');
    t.index(['company_id', 'status', 'employment_id'], 'ix_expense_claim_list');
  });
  await knex.schema.createTable('expense_claim_versions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('expense_claim_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('title', 150).notNullable();
    t.string('business_purpose', 500).notNullable();
    t.string('currency_code', 3).notNullable();
    t.decimal('total_amount', 19, 2).notNullable();
    t.date('submission_anchor_date');
    t.bigInteger('manager_employment_id_snapshot').unsigned();
    t.bigInteger('manager_user_id_snapshot').unsigned();
    t.bigInteger('branch_id_snapshot').unsigned();
    t.bigInteger('department_id_snapshot').unsigned();
    t.string('employment_status_snapshot', 30);
    t.string('change_reason', 500).notNullable();
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['expense_claim_id', 'version_number'], { indexName: 'uq_expense_claim_version' });
    t.unique(['id', 'company_id'], { indexName: 'uq_expense_claim_version_company' });
    t.foreign(['expense_claim_id', 'company_id'], 'fk_expense_claim_version_parent')
      .references(['id', 'company_id'])
      .inTable('expense_claims');
    t.foreign(
      ['manager_employment_id_snapshot', 'company_id'],
      'fk_expense_version_manager_company',
    )
      .references(['id', 'company_id'])
      .inTable('employments');
    t.foreign('manager_user_id_snapshot').references('id').inTable('users');
    t.check('total_amount > 0', [], 'ck_expense_claim_total_positive');
  });
  await knex.schema.createTable('expense_claim_items', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('expense_claim_id').unsigned().notNullable();
    t.bigInteger('expense_claim_version_id').unsigned().notNullable();
    t.bigInteger('claim_category_id').unsigned().notNullable();
    t.bigInteger('claim_category_version_id').unsigned().notNullable();
    t.date('expense_date').notNullable();
    t.string('description', 500).notNullable();
    t.decimal('amount', 19, 2).notNullable();
    t.string('merchant_reference', 150);
    t.boolean('receipt_required_snapshot').notNullable();
    t.enum('sensitive_classification_snapshot', ['standard', 'sensitive']).notNullable();
    t.foreign(['expense_claim_id', 'company_id'], 'fk_expense_item_claim')
      .references(['id', 'company_id'])
      .inTable('expense_claims');
    t.foreign(['expense_claim_version_id', 'company_id'], 'fk_expense_item_version')
      .references(['id', 'company_id'])
      .inTable('expense_claim_versions');
    t.foreign(['claim_category_id', 'company_id'], 'fk_expense_item_category')
      .references(['id', 'company_id'])
      .inTable('claim_categories');
    t.foreign(['claim_category_version_id', 'company_id'], 'fk_expense_item_category_version')
      .references(['id', 'company_id'])
      .inTable('claim_category_versions');
    t.index(['expense_claim_id', 'expense_claim_version_id'], 'ix_expense_claim_items');
    t.unique(['id', 'company_id'], { indexName: 'uq_expense_claim_item_company' });
    t.check('amount > 0', [], 'ck_expense_item_positive');
  });
  await knex.schema.createTable('expense_claim_evidence', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('expense_claim_item_id').unsigned().notNullable();
    t.enum('reference_type', ['document_reference', 'external_reference']).notNullable();
    t.string('reference_value', 255).notNullable();
    t.string('display_name', 150).notNullable();
    t.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['expense_claim_item_id'], 'ix_expense_evidence_item');
    t.foreign(['expense_claim_item_id', 'company_id'], 'fk_expense_evidence_item')
      .references(['id', 'company_id'])
      .inTable('expense_claim_items');
  });
  await knex.schema.createTable('expense_claim_approval_attempts', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('expense_claim_id').unsigned().notNullable();
    t.enum('step_type', ['manager', 'hr_fallback', 'finance', 'cancellation']).notNullable();
    t.integer('attempt_number').unsigned().notNullable();
    t.bigInteger('assigned_approver_user_id').unsigned();
    t.integer('record_version_at_creation').unsigned().notNullable();
    t.integer('workflow_version_at_creation').unsigned().notNullable();
    t.enum('status', ['pending', 'approved', 'rejected', 'cancelled'])
      .notNullable()
      .defaultTo('pending');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['expense_claim_id', 'step_type', 'attempt_number'], {
      indexName: 'uq_expense_claim_attempt',
    });
    t.unique(['id', 'company_id'], { indexName: 'uq_expense_attempt_company' });
    t.foreign(['expense_claim_id', 'company_id'], 'fk_expense_attempt_claim')
      .references(['id', 'company_id'])
      .inTable('expense_claims');
    t.foreign('assigned_approver_user_id', 'fk_expense_attempt_approver')
      .references('id')
      .inTable('users');
  });
  await knex.schema.createTable('expense_claim_approval_decisions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('approval_attempt_id').unsigned().notNullable();
    t.bigInteger('expense_claim_id').unsigned().notNullable();
    t.enum('decision', ['approved', 'rejected']).notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    t.string('idempotency_key', 100).notNullable();
    t.integer('record_version').unsigned().notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.timestamp('decided_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['approval_attempt_id'], { indexName: 'uq_expense_attempt_terminal' });
    t.unique(['company_id', 'idempotency_key'], { indexName: 'uq_expense_decision_idempotency' });
    t.foreign(['expense_claim_id', 'company_id'], 'fk_expense_decision_claim')
      .references(['id', 'company_id'])
      .inTable('expense_claims');
    t.foreign(['approval_attempt_id', 'company_id'], 'fk_expense_decision_attempt')
      .references(['id', 'company_id'])
      .inTable('expense_claim_approval_attempts');
  });
  await knex.schema.createTable('expense_claim_state_events', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('expense_claim_id').unsigned().notNullable();
    t.string('from_state', 30);
    t.string('to_state', 30).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    t.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['expense_claim_id', 'workflow_version'], {
      indexName: 'uq_expense_claim_state_version',
    });
    t.foreign(['expense_claim_id', 'company_id'], 'fk_expense_state_claim')
      .references(['id', 'company_id'])
      .inTable('expense_claims');
  });
  await knex.schema.createTable('expense_claim_payments', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('expense_claim_id').unsigned().notNullable();
    t.string('payment_reference', 100).notNullable();
    t.date('payment_date').notNullable();
    t.decimal('paid_amount', 19, 2).notNullable();
    t.string('currency_code', 3).notNullable();
    t.bigInteger('recorded_by').unsigned().notNullable().references('id').inTable('users');
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['expense_claim_id'], { indexName: 'uq_expense_claim_payment' });
    t.unique(['company_id', 'idempotency_key'], { indexName: 'uq_expense_payment_idempotency' });
    t.foreign(['expense_claim_id', 'company_id'], 'fk_expense_payment_claim')
      .references(['id', 'company_id'])
      .inTable('expense_claims');
    t.check('paid_amount > 0', [], 'ck_expense_payment_positive');
  });
}

export async function down(knex) {
  for (const name of [
    'expense_claim_payments',
    'expense_claim_state_events',
    'expense_claim_approval_decisions',
    'expense_claim_approval_attempts',
    'expense_claim_evidence',
    'expense_claim_items',
    'expense_claim_versions',
    'expense_claims',
    'claim_category_versions',
    'claim_categories',
    'claim_number_sequences',
  ])
    await knex.schema.dropTableIfExists(name);
}
