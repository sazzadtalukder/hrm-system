export async function up(knex) {
  await knex.schema.createTable('benefit_plans', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    table.enum('plan_type', ['other']).notNullable().defaultTo('other');
    table.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.bigInteger('updated_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('deactivated_at').nullable();
    table.bigInteger('deactivated_by').unsigned().nullable().references('id').inTable('users');
    table.string('deactivation_reason', 500).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.integer('version').unsigned().notNullable().defaultTo(1);
    table.unique(['company_id', 'code'], { indexName: 'uq_benefit_plan_company_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_benefit_plan_company' });
    table.foreign('company_id').references('id').inTable('companies');
    table.index(['company_id', 'record_status', 'name'], 'ix_benefit_plan_list');
  });

  await knex.schema.createTable('benefit_plan_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('benefit_plan_id').unsigned().notNullable();
    table.integer('version_number').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.string('currency_code', 3).notNullable();
    table.decimal('employer_contribution_amount', 15, 2).notNullable().defaultTo(0);
    table.decimal('employee_contribution_amount', 15, 2).notNullable().defaultTo(0);
    table.json('eligible_employment_types').notNullable();
    table.json('eligible_employment_statuses').notNullable();
    table.boolean('employee_visible').notNullable().defaultTo(true);
    table.enum('sensitive_classification', ['standard', 'sensitive']).notNullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_version_id').unsigned().nullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['benefit_plan_id', 'version_number'], { indexName: 'uq_benefit_plan_version' });
    table.unique(['id', 'company_id'], { indexName: 'uq_benefit_plan_version_company' });
    table
      .foreign(['benefit_plan_id', 'company_id'], 'fk_benefit_version_plan_company')
      .references(['id', 'company_id'])
      .inTable('benefit_plans');
    table.foreign('supersedes_version_id').references('id').inTable('benefit_plan_versions');
    table.index(
      ['benefit_plan_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_benefit_version_effective',
    );
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_benefit_version_dates',
    );
    table.check(
      'employer_contribution_amount >= 0 AND employee_contribution_amount >= 0',
      [],
      'ck_benefit_contribution_nonnegative',
    );
    table.check(
      'employer_contribution_amount > 0 OR employee_contribution_amount > 0',
      [],
      'ck_benefit_contribution_positive',
    );
  });

  await knex.schema.createTable('benefit_enrollments', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.bigInteger('benefit_plan_id').unsigned().notNullable();
    table
      .enum('status', ['draft', 'active', 'suspended', 'ended', 'cancelled'])
      .notNullable()
      .defaultTo('draft');
    table.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    table.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.bigInteger('updated_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.integer('version').unsigned().notNullable().defaultTo(1);
    table.unique(['id', 'company_id'], { indexName: 'uq_benefit_enrollment_company' });
    table
      .foreign(['employment_id', 'company_id'], 'fk_benefit_enrollment_employment')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign(['benefit_plan_id', 'company_id'], 'fk_benefit_enrollment_plan')
      .references(['id', 'company_id'])
      .inTable('benefit_plans');
    table.index(['company_id', 'status', 'employment_id'], 'ix_benefit_enrollment_list');
  });

  await knex.schema.createTable('benefit_enrollment_versions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('benefit_enrollment_id').unsigned().notNullable();
    table.bigInteger('benefit_plan_version_id').unsigned().notNullable();
    table.integer('version_number').unsigned().notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.decimal('employer_contribution_amount_snapshot', 15, 2).notNullable();
    table.decimal('employee_contribution_amount_snapshot', 15, 2).notNullable();
    table.string('currency_code', 3).notNullable();
    table.string('enrollment_reason', 500).notNullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_version_id').unsigned().nullable();
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['benefit_enrollment_id', 'version_number'], {
      indexName: 'uq_benefit_enrollment_version',
    });
    table.unique(['id', 'company_id'], { indexName: 'uq_benefit_enrollment_version_company' });
    table
      .foreign(['benefit_enrollment_id', 'company_id'], 'fk_benefit_enrollment_version_parent')
      .references(['id', 'company_id'])
      .inTable('benefit_enrollments');
    table
      .foreign(['benefit_plan_version_id', 'company_id'], 'fk_benefit_enrollment_version_plan')
      .references(['id', 'company_id'])
      .inTable('benefit_plan_versions');
    table.foreign('supersedes_version_id').references('id').inTable('benefit_enrollment_versions');
    table.index(
      ['benefit_enrollment_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_benefit_enrollment_effective',
    );
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_benefit_enrollment_version_dates',
    );
    table.check(
      'employer_contribution_amount_snapshot >= 0 AND employee_contribution_amount_snapshot >= 0',
      [],
      'ck_benefit_enrollment_snapshot_amounts',
    );
  });

  await knex.schema.createTable('benefit_enrollment_state_events', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('benefit_enrollment_id').unsigned().notNullable();
    table.string('from_state', 30).nullable();
    table.string('to_state', 30).notNullable();
    table.integer('workflow_version').unsigned().notNullable();
    table.string('reason', 500).notNullable();
    table.bigInteger('acting_user_id').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['benefit_enrollment_id', 'workflow_version'], {
      indexName: 'uq_benefit_enrollment_state_version',
    });
    table
      .foreign(['benefit_enrollment_id', 'company_id'], 'fk_benefit_state_enrollment')
      .references(['id', 'company_id'])
      .inTable('benefit_enrollments');
    table.index(['company_id', 'occurred_at'], 'ix_benefit_state_company_time');
  });
}

export async function down(knex) {
  for (const table of [
    'benefit_enrollment_state_events',
    'benefit_enrollment_versions',
    'benefit_enrollments',
    'benefit_plan_versions',
    'benefit_plans',
  ])
    await knex.schema.dropTableIfExists(table);
}
