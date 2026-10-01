function auditColumns(table) {
  table.bigInteger('created_by').unsigned().nullable().references('id').inTable('users');
  table.bigInteger('updated_by').unsigned().nullable().references('id').inTable('users');
  table.timestamps(true, true);
  table.integer('version').unsigned().notNullable().defaultTo(1);
}

export async function up(knex) {
  await knex.schema.createTable('employees', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable().references('id').inTable('companies');
    table.bigInteger('user_id').unsigned().nullable().references('id').inTable('users');
    table.string('first_name', 100).notNullable();
    table.string('middle_name', 100).nullable();
    table.string('last_name', 100).notNullable();
    table.string('preferred_name', 100).nullable();
    table.string('display_name', 250).notNullable();
    table.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.timestamp('deactivated_at', { useTz: false }).nullable();
    table.bigInteger('deactivated_by').unsigned().nullable().references('id').inTable('users');
    table.string('deactivation_reason', 500).nullable();
    auditColumns(table);
    table.unique(['id', 'company_id'], { indexName: 'uq_employee_id_company' });
    table.unique(['user_id'], { indexName: 'uq_employee_user' });
    table.index(['company_id', 'record_status', 'display_name'], 'ix_employee_company_status_name');
  });

  await knex.schema.createTable('employee_personal_details', (table) => {
    table.bigInteger('employee_id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.date('date_of_birth').nullable();
    table.enum('gender', ['female', 'male', 'non_binary', 'prefer_not_to_say']).nullable();
    table.enum('marital_status', ['single', 'married', 'divorced', 'widowed']).nullable();
    table.string('nationality_country_code', 2).nullable();
    auditColumns(table);
    table.unique(['employee_id', 'company_id'], { indexName: 'uq_employee_personal_company' });
    table
      .foreign(['employee_id', 'company_id'], 'fk_employee_personal_employee_company')
      .references(['id', 'company_id'])
      .inTable('employees');
  });

  await knex.schema.createTable('employee_contacts', (table) => {
    table.bigInteger('employee_id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.string('personal_email', 320).nullable();
    table.string('personal_phone', 50).nullable();
    table.string('alternate_phone', 50).nullable();
    for (const prefix of ['present', 'permanent']) {
      table.string(`${prefix}_address_line_1`, 250).nullable();
      table.string(`${prefix}_address_line_2`, 250).nullable();
      table.string(`${prefix}_city`, 100).nullable();
      table.string(`${prefix}_postal_code`, 30).nullable();
      table.string(`${prefix}_country_code`, 2).nullable();
    }
    auditColumns(table);
    table.unique(['employee_id', 'company_id'], { indexName: 'uq_employee_contact_company' });
    table
      .foreign(['employee_id', 'company_id'], 'fk_employee_contact_employee_company')
      .references(['id', 'company_id'])
      .inTable('employees');
  });

  await knex.schema.createTable('employee_emergency_contacts', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employee_id').unsigned().notNullable();
    table.string('name', 150).notNullable();
    table.string('relationship', 100).notNullable();
    table.string('phone', 50).notNullable();
    table.string('alternate_phone', 50).nullable();
    table.boolean('is_primary').notNullable().defaultTo(false);
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.timestamp('deactivated_at', { useTz: false }).nullable();
    table.bigInteger('deactivated_by').unsigned().nullable().references('id').inTable('users');
    table.string('deactivation_reason', 500).nullable();
    auditColumns(table);
    table.unique(['id', 'company_id'], { indexName: 'uq_emergency_contact_id_company' });
    table.index(['employee_id', 'status', 'is_primary'], 'ix_emergency_contact_employee');
    table
      .foreign(['employee_id', 'company_id'], 'fk_emergency_contact_employee_company')
      .references(['id', 'company_id'])
      .inTable('employees');
  });

  await knex.schema.createTable('employments', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employee_id').unsigned().notNullable();
    table.string('employee_code', 50).notNullable();
    table
      .enum('employment_type', [
        'permanent',
        'probationary',
        'contractual',
        'temporary',
        'intern',
        'part_time',
      ])
      .notNullable();
    table.date('joining_date').notNullable();
    table.date('confirmation_date').nullable();
    table.date('employment_end_date').nullable();
    table.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.specificType(
      'active_employee_key',
      "BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN record_status = 'active' THEN employee_id ELSE NULL END) STORED",
    );
    auditColumns(table);
    table.unique(['company_id', 'employee_code'], { indexName: 'uq_employment_company_code' });
    table.unique(['id', 'company_id'], { indexName: 'uq_employment_id_company' });
    table.unique(['active_employee_key'], { indexName: 'uq_employment_one_active_episode' });
    table.index(['employee_id', 'record_status'], 'ix_employment_employee_status');
    table.check(
      'employment_end_date IS NULL OR employment_end_date >= joining_date',
      [],
      'ck_employment_dates',
    );
    table.check("employee_code REGEXP '^[A-Z0-9_/-]+$'", [], 'ck_employment_employee_code');
    table
      .foreign(['employee_id', 'company_id'], 'fk_employment_employee_company')
      .references(['id', 'company_id'])
      .inTable('employees');
  });

  await knex.schema.createTable('employment_status_history', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table
      .enum('status', ['probation', 'confirmed', 'suspended', 'resigned', 'terminated', 'retired'])
      .notNullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.string('reason', 500).notNullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_status_history_id').unsigned().nullable();
    table.timestamp('superseded_at', { useTz: false }).nullable();
    table.bigInteger('superseded_by').unsigned().nullable().references('id').inTable('users');
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_status_period',
    );
    table.index(
      ['employment_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_status_effective',
    );
    table
      .foreign(['employment_id', 'company_id'], 'fk_status_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign('supersedes_status_history_id', 'fk_status_supersedes')
      .references('id')
      .inTable('employment_status_history');
  });

  await knex.schema.createTable('employee_assignments', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('employment_id').unsigned().notNullable();
    table.bigInteger('branch_id').unsigned().notNullable();
    table.bigInteger('department_id').unsigned().notNullable();
    table.bigInteger('designation_id').unsigned().notNullable();
    table.bigInteger('grade_id').unsigned().nullable();
    table.bigInteger('cost_center_id').unsigned().nullable();
    table.bigInteger('work_calendar_id').unsigned().nullable();
    table.bigInteger('manager_employment_id').unsigned().nullable();
    table.date('effective_start').notNullable();
    table.date('effective_end').nullable();
    table.string('reason', 500).notNullable();
    table.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    table.bigInteger('supersedes_assignment_id').unsigned().nullable();
    table.timestamp('superseded_at', { useTz: false }).nullable();
    table.bigInteger('superseded_by').unsigned().nullable().references('id').inTable('users');
    table.bigInteger('created_by').unsigned().notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.check(
      'effective_end IS NULL OR effective_end >= effective_start',
      [],
      'ck_assignment_period',
    );
    table.check(
      'manager_employment_id IS NULL OR manager_employment_id <> employment_id',
      [],
      'ck_assignment_not_self_managed',
    );
    table.index(
      ['employment_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_assignment_effective',
    );
    table.index(
      ['manager_employment_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_assignment_manager_effective',
    );
    table.index(['company_id', 'branch_id', 'effective_start'], 'ix_assignment_branch_effective');
    table.index(
      ['company_id', 'department_id', 'effective_start'],
      'ix_assignment_department_effective',
    );
    table
      .foreign(['employment_id', 'company_id'], 'fk_assignment_employment_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    table
      .foreign(['manager_employment_id', 'company_id'], 'fk_assignment_manager_company')
      .references(['id', 'company_id'])
      .inTable('employments');
    for (const [column, target, constraint] of [
      ['branch_id', 'branches', 'fk_assignment_branch_company'],
      ['department_id', 'departments', 'fk_assignment_department_company'],
      ['designation_id', 'designations', 'fk_assignment_designation_company'],
      ['grade_id', 'grades', 'fk_assignment_grade_company'],
      ['cost_center_id', 'cost_centers', 'fk_assignment_cost_center_company'],
      ['work_calendar_id', 'work_calendars', 'fk_assignment_calendar_company'],
    ])
      table
        .foreign([column, 'company_id'], constraint)
        .references(['id', 'company_id'])
        .inTable(target);
    table
      .foreign('supersedes_assignment_id', 'fk_assignment_supersedes')
      .references('id')
      .inTable('employee_assignments');
  });
}

export async function down(knex) {
  for (const table of [
    'employee_assignments',
    'employment_status_history',
    'employments',
    'employee_emergency_contacts',
    'employee_contacts',
    'employee_personal_details',
    'employees',
  ])
    await knex.schema.dropTableIfExists(table);
}
