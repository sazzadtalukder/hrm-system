function auditColumns(table) {
  table.bigInteger('created_by').unsigned().nullable().references('id').inTable('users');
  table.bigInteger('updated_by').unsigned().nullable().references('id').inTable('users');
  table.timestamps(true, true);
  table.integer('version').unsigned().notNullable().defaultTo(1);
}

function lifecycleColumns(table) {
  table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
  table.timestamp('deactivated_at', { useTz: false }).nullable();
  table.bigInteger('deactivated_by').unsigned().nullable().references('id').inTable('users');
  table.string('deactivation_reason', 500).nullable();
}

export async function up(knex) {
  await knex.schema.createTable('companies', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.string('code', 50).notNullable().unique();
    table.string('name', 200).notNullable();
    table.string('legal_name', 250).nullable();
    table.string('country_code', 2).notNullable().defaultTo('BD');
    table.string('currency_code', 3).notNullable().defaultTo('BDT');
    table.string('timezone', 100).notNullable().defaultTo('Asia/Dhaka');
    table.string('locale', 20).notNullable().defaultTo('en-BD');
    table.string('email', 320).nullable();
    table.string('phone', 50).nullable();
    table.string('address_line_1', 250).nullable();
    table.string('address_line_2', 250).nullable();
    table.string('city', 100).nullable();
    table.string('postal_code', 30).nullable();
    lifecycleColumns(table);
    auditColumns(table);
    table.index(['status', 'name'], 'ix_companies_status_name');
  });

  await knex.schema.createTable('work_calendars', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    table.string('timezone', 100).notNullable().defaultTo('Asia/Dhaka');
    lifecycleColumns(table);
    auditColumns(table);
    table.unique(['company_id', 'code'], { indexName: 'uq_work_calendar_company_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_work_calendar_id_company' });
    table.index(['company_id', 'status', 'name'], 'ix_work_calendar_company_status');
  });

  await knex.schema.createTable('branches', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    table.string('email', 320).nullable();
    table.string('phone', 50).nullable();
    table.string('address_line_1', 250).nullable();
    table.string('address_line_2', 250).nullable();
    table.string('city', 100).nullable();
    table.string('postal_code', 30).nullable();
    table.bigInteger('default_work_calendar_id').unsigned().nullable();
    lifecycleColumns(table);
    auditColumns(table);
    table.unique(['company_id', 'code'], { indexName: 'uq_branch_company_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_branch_id_company' });
    table.index(['company_id', 'status', 'name'], 'ix_branch_company_status');
    table
      .foreign(['default_work_calendar_id', 'company_id'], 'fk_branch_default_calendar_company')
      .references(['id', 'company_id'])
      .inTable('work_calendars');
  });

  await knex.schema.createTable('departments', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.bigInteger('parent_department_id').unsigned().nullable();
    table.string('code', 50).notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    lifecycleColumns(table);
    auditColumns(table);
    table.unique(['company_id', 'code'], { indexName: 'uq_department_company_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_department_id_company' });
    table.index(['company_id', 'parent_department_id', 'status'], 'ix_department_hierarchy');
    table
      .foreign(['parent_department_id', 'company_id'], 'fk_department_parent_company')
      .references(['id', 'company_id'])
      .inTable('departments');
  });

  for (const tableName of ['designations', 'grades', 'cost_centers']) {
    await knex.schema.createTable(tableName, (table) => {
      table.bigIncrements('id').unsigned().primary();
      table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
      table.string('code', 50).notNullable();
      table.string('name', 150).notNullable();
      table.string('description', 500).nullable();
      if (tableName === 'grades') table.integer('rank').unsigned().nullable();
      lifecycleColumns(table);
      auditColumns(table);
      table.unique(['company_id', 'code'], { indexName: `uq_${tableName}_company_code` });
      table.unique(['id', 'company_id'], { indexName: `uq_${tableName}_id_company` });
      table.index(['company_id', 'status', 'name'], `ix_${tableName}_company_status`);
      if (tableName === 'grades')
        table.unique(['company_id', 'rank'], { indexName: 'uq_grades_company_rank' });
    });
  }

  await knex.schema.createTable('work_calendar_days', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.bigInteger('work_calendar_id').unsigned().notNullable();
    table.integer('weekday').unsigned().notNullable();
    table.boolean('is_working_day').notNullable().defaultTo(false);
    table.time('start_time').nullable();
    table.time('end_time').nullable();
    table.integer('break_minutes').unsigned().notNullable().defaultTo(0);
    auditColumns(table);
    table.unique(['work_calendar_id', 'weekday'], { indexName: 'uq_calendar_weekday' });
    table.check('weekday BETWEEN 1 AND 7', [], 'ck_calendar_day_weekday');
    table.check(
      '(is_working_day = 0 AND start_time IS NULL AND end_time IS NULL) OR (is_working_day = 1 AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)',
      [],
      'ck_calendar_day_hours',
    );
    table
      .foreign(['work_calendar_id', 'company_id'], 'fk_calendar_day_calendar_company')
      .references(['id', 'company_id'])
      .inTable('work_calendars');
  });

  await knex.schema.createTable('holidays', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.bigInteger('branch_id').unsigned().nullable();
    table.bigInteger('work_calendar_id').unsigned().nullable();
    table.specificType(
      'branch_scope_key',
      'BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(branch_id, 0)) STORED',
    );
    table.specificType(
      'calendar_scope_key',
      'BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(work_calendar_id, 0)) STORED',
    );
    table.date('holiday_date').notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    table.enum('status', ['active', 'cancelled']).notNullable().defaultTo('active');
    table.timestamp('cancelled_at', { useTz: false }).nullable();
    table.bigInteger('cancelled_by').unsigned().nullable().references('id').inTable('users');
    table.string('cancellation_reason', 500).nullable();
    auditColumns(table);
    table.unique(['company_id', 'branch_scope_key', 'calendar_scope_key', 'holiday_date', 'name'], {
      indexName: 'uq_holiday_applicability_date_name',
    });
    table.index(['company_id', 'holiday_date', 'status'], 'ix_holiday_company_date');
    table
      .foreign(['branch_id', 'company_id'], 'fk_holiday_branch_company')
      .references(['id', 'company_id'])
      .inTable('branches');
    table
      .foreign(['work_calendar_id', 'company_id'], 'fk_holiday_calendar_company')
      .references(['id', 'company_id'])
      .inTable('work_calendars');
  });
}

export async function down(knex) {
  for (const table of [
    'holidays',
    'work_calendar_days',
    'cost_centers',
    'grades',
    'designations',
    'departments',
    'branches',
    'work_calendars',
    'companies',
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
}
