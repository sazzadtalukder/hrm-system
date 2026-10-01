const audit = (t) => {
  t.bigInteger('created_by').unsigned().nullable();
  t.bigInteger('updated_by').unsigned().nullable();
  t.timestamp('created_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
  t.timestamp('updated_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
};
const owned = (t, name) => {
  t.bigIncrements('id');
  t.bigInteger('company_id').unsigned().notNullable();
  t.unique(['company_id', 'id'], { indexName: `uq_${name}_company_id` });
  t.foreign('company_id').references('companies.id').onDelete('RESTRICT');
};
export async function up(knex) {
  await knex.schema.createTable('employee_exits', (t) => {
    owned(t, 'employee_exits');
    t.bigInteger('employment_id').unsigned().notNullable();
    t.enum('exit_type', ['resignation', 'termination', 'retirement', 'contract_end']).notNullable();
    t.date('requested_last_working_day').notNullable();
    t.date('approved_last_working_day').nullable();
    t.enum('status', [
      'draft',
      'submitted',
      'manager_approved',
      'approved',
      'clearance',
      'completed',
      'withdrawn',
      'rejected',
      'cancelled',
    ])
      .notNullable()
      .defaultTo('draft');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.boolean('active_slot').nullable().defaultTo(true);
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['employment_id', 'company_id'], 'fk_exit_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.unique(['employment_id', 'active_slot'], 'uq_exit_active_employment');
    t.unique(['company_id', 'idempotency_key'], 'uq_exit_idempotency');
  });
  await knex.schema.createTable('employee_exit_versions', (t) => {
    owned(t, 'employee_exit_versions');
    t.bigInteger('employee_exit_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('employee_code_snapshot', 50).notNullable();
    t.string('employee_name_snapshot', 200).notNullable();
    t.bigInteger('manager_user_id_snapshot').unsigned().nullable();
    t.bigInteger('branch_id_snapshot').unsigned().nullable();
    t.bigInteger('department_id_snapshot').unsigned().nullable();
    t.string('reason', 500).notNullable();
    t.text('employee_comment').nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    audit(t);
    t.foreign(['company_id', 'employee_exit_id'], 'fk_exit_version_parent')
      .references(['company_id', 'id'])
      .inTable('employee_exits')
      .onDelete('RESTRICT');
    t.unique(['employee_exit_id', 'version_number'], 'uq_exit_version');
  });
  await knex.schema.createTable('employee_exit_state_events', (t) => {
    owned(t, 'employee_exit_states');
    t.bigInteger('employee_exit_id').unsigned().notNullable();
    t.string('from_state', 40).notNullable();
    t.string('to_state', 40).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'employee_exit_id'], 'fk_exit_state_parent')
      .references(['company_id', 'id'])
      .inTable('employee_exits')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_exit_state_idempotency');
  });
  await knex.schema.createTable('employee_exit_clearances', (t) => {
    owned(t, 'employee_exit_clearances');
    t.bigInteger('employee_exit_id').unsigned().notNullable();
    t.enum('area', ['manager', 'hr', 'asset', 'finance', 'it']).notNullable();
    t.enum('status', ['pending', 'cleared', 'blocked', 'waived'])
      .notNullable()
      .defaultTo('pending');
    t.string('comment', 500).nullable();
    t.string('idempotency_key', 100).notNullable();
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'employee_exit_id'], 'fk_exit_clearance_parent')
      .references(['company_id', 'id'])
      .inTable('employee_exits')
      .onDelete('RESTRICT');
    t.unique(['employee_exit_id', 'area'], 'uq_exit_clearance_area');
    t.unique(['company_id', 'idempotency_key'], 'uq_exit_clearance_idempotency');
  });
}
export async function down(knex) {
  await knex.schema.dropTableIfExists('employee_exit_clearances');
  await knex.schema.dropTableIfExists('employee_exit_state_events');
  await knex.schema.dropTableIfExists('employee_exit_versions');
  await knex.schema.dropTableIfExists('employee_exits');
}
