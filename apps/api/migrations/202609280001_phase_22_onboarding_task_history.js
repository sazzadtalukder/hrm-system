const audit = (table) => {
  table.bigInteger('created_by').unsigned().nullable();
  table.bigInteger('updated_by').unsigned().nullable();
  table.timestamp('created_at').notNullable().defaultTo(table.client.raw('CURRENT_TIMESTAMP'));
  table.timestamp('updated_at').notNullable().defaultTo(table.client.raw('CURRENT_TIMESTAMP'));
};

export async function up(knex) {
  await knex.schema.createTable('onboarding_case_task_state_events', (table) => {
    table.bigIncrements('id');
    table.bigInteger('company_id').unsigned().notNullable();
    table.bigInteger('onboarding_case_id').unsigned().notNullable();
    table.bigInteger('onboarding_case_task_id').unsigned().notNullable();
    table
      .enum('from_status', ['pending', 'in_progress', 'completed', 'waived', 'cancelled'])
      .nullable();
    table
      .enum('to_status', ['pending', 'in_progress', 'completed', 'waived', 'cancelled'])
      .notNullable();
    table.integer('workflow_version').unsigned().notNullable();
    table.string('reason', 500).nullable();
    table.string('idempotency_key', 100).notNullable();
    audit(table);

    table.foreign('company_id').references('companies.id').onDelete('RESTRICT');
    table
      .foreign(['company_id', 'onboarding_case_id'], 'fk_onboard_task_event_case')
      .references(['company_id', 'id'])
      .inTable('onboarding_cases');
    table
      .foreign(['company_id', 'onboarding_case_task_id'], 'fk_onboard_task_event_task')
      .references(['company_id', 'id'])
      .inTable('onboarding_case_tasks');
    table.unique(['company_id', 'id'], 'uq_onboarding_task_event_company_id');
    table.unique(['company_id', 'idempotency_key'], 'uq_onboarding_task_event_idem');
    table.index(['onboarding_case_id', 'id'], 'ix_onboarding_task_event_case_history');
    table.index(['onboarding_case_task_id', 'id'], 'ix_onboarding_task_event_task_history');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('onboarding_case_task_state_events');
}
