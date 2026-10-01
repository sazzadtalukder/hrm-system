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
  await knex.schema.createTable('final_settlements', (t) => {
    owned(t, 'final_settlements');
    t.bigInteger('employee_exit_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.string('currency_code', 3).notNullable();
    t.enum('status', [
      'draft',
      'calculated',
      'submitted',
      'approved',
      'paid',
      'rejected',
      'cancelled',
    ])
      .notNullable()
      .defaultTo('draft');
    t.decimal('total_earnings', 19, 2).notNullable().defaultTo(0);
    t.decimal('total_deductions', 19, 2).notNullable().defaultTo(0);
    t.decimal('net_amount', 19, 2).notNullable().defaultTo(0);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'employee_exit_id'], 'fk_settlement_exit')
      .references(['company_id', 'id'])
      .inTable('employee_exits')
      .onDelete('RESTRICT');
    t.foreign(['employment_id', 'company_id'], 'fk_settlement_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.unique(['employee_exit_id'], 'uq_settlement_exit');
    t.unique(['company_id', 'idempotency_key'], 'uq_settlement_idempotency');
    t.check('total_earnings >= 0 and total_deductions >= 0 and net_amount >= 0');
  });
  await knex.schema.createTable('final_settlement_versions', (t) => {
    owned(t, 'final_settlement_versions');
    t.bigInteger('final_settlement_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.date('settlement_date').notNullable();
    t.string('employee_code_snapshot', 50).notNullable();
    t.string('employee_name_snapshot', 200).notNullable();
    t.date('last_working_day_snapshot').notNullable();
    t.string('reason', 500).notNullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    audit(t);
    t.foreign(['company_id', 'final_settlement_id'], 'fk_settlement_version_parent')
      .references(['company_id', 'id'])
      .inTable('final_settlements')
      .onDelete('RESTRICT');
    t.unique(['final_settlement_id', 'version_number'], 'uq_settlement_version');
  });
  await knex.schema.createTable('final_settlement_items', (t) => {
    owned(t, 'final_settlement_items');
    t.bigInteger('final_settlement_version_id').unsigned().notNullable();
    t.enum('item_type', ['earning', 'deduction']).notNullable();
    t.string('code', 50).notNullable();
    t.string('description', 200).notNullable();
    t.decimal('amount', 19, 2).notNullable();
    audit(t);
    t.foreign(['company_id', 'final_settlement_version_id'], 'fk_settlement_item_version')
      .references(['company_id', 'id'])
      .inTable('final_settlement_versions')
      .onDelete('RESTRICT');
    t.unique(['final_settlement_version_id', 'code'], 'uq_settlement_item_code');
    t.check('amount > 0');
  });
  await knex.schema.createTable('final_settlement_state_events', (t) => {
    owned(t, 'final_settlement_states');
    t.bigInteger('final_settlement_id').unsigned().notNullable();
    t.string('from_state', 30).notNullable();
    t.string('to_state', 30).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'final_settlement_id'], 'fk_settlement_state_parent')
      .references(['company_id', 'id'])
      .inTable('final_settlements')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_settlement_state_idempotency');
  });
  await knex.schema.createTable('final_settlement_payments', (t) => {
    owned(t, 'final_settlement_payments');
    t.bigInteger('final_settlement_id').unsigned().notNullable();
    t.decimal('amount', 19, 2).notNullable();
    t.date('paid_on').notNullable();
    t.string('payment_reference', 200).notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'final_settlement_id'], 'fk_settlement_payment_parent')
      .references(['company_id', 'id'])
      .inTable('final_settlements')
      .onDelete('RESTRICT');
    t.unique(['final_settlement_id'], 'uq_settlement_payment');
    t.unique(['company_id', 'idempotency_key'], 'uq_settlement_payment_idempotency');
    t.check('amount > 0');
  });
}
export async function down(knex) {
  await knex.schema.dropTableIfExists('final_settlement_payments');
  await knex.schema.dropTableIfExists('final_settlement_state_events');
  await knex.schema.dropTableIfExists('final_settlement_items');
  await knex.schema.dropTableIfExists('final_settlement_versions');
  await knex.schema.dropTableIfExists('final_settlements');
}
