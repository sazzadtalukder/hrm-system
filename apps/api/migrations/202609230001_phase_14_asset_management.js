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
  await knex.schema.createTable('asset_categories', (t) => {
    owned(t, 'asset_categories');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_asset_category_code');
  });
  await knex.schema.createTable('assets', (t) => {
    owned(t, 'assets');
    t.bigInteger('asset_category_id').unsigned().notNullable();
    t.string('asset_code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.string('serial_number', 150).nullable();
    t.date('acquired_on').nullable();
    t.decimal('acquisition_cost', 19, 2).nullable();
    t.string('currency_code', 3).notNullable();
    t.enum('status', ['available', 'assigned', 'maintenance', 'lost', 'retired'])
      .notNullable()
      .defaultTo('available');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'asset_category_id'], 'fk_asset_category')
      .references(['company_id', 'id'])
      .inTable('asset_categories')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'asset_code'], 'uq_asset_code');
    t.unique(['company_id', 'serial_number'], 'uq_asset_serial');
    t.check('acquisition_cost is null or acquisition_cost >= 0');
  });
  await knex.schema.createTable('asset_assignments', (t) => {
    owned(t, 'asset_assignments');
    t.bigInteger('asset_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.date('assigned_on').notNullable();
    t.date('returned_on').nullable();
    t.enum('status', ['active', 'returned']).notNullable().defaultTo('active');
    t.boolean('active_slot').nullable().defaultTo(true);
    t.string('condition_at_assignment', 500).notNullable();
    t.string('condition_at_return', 500).nullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'asset_id'], 'fk_asset_assignment_asset')
      .references(['company_id', 'id'])
      .inTable('assets')
      .onDelete('RESTRICT');
    t.foreign(['employment_id', 'company_id'], 'fk_asset_assignment_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.unique(['asset_id', 'active_slot'], 'uq_asset_active_assignment');
    t.unique(['company_id', 'idempotency_key'], 'uq_asset_assignment_idempotency');
    t.check('returned_on is null or returned_on >= assigned_on');
  });
  await knex.schema.createTable('asset_events', (t) => {
    owned(t, 'asset_events');
    t.bigInteger('asset_id').unsigned().notNullable();
    t.bigInteger('asset_assignment_id').unsigned().nullable();
    t.string('event_type', 40).notNullable();
    t.string('from_status', 40).nullable();
    t.string('to_status', 40).notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'asset_id'], 'fk_asset_event_asset')
      .references(['company_id', 'id'])
      .inTable('assets')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'asset_assignment_id'], 'fk_asset_event_assignment')
      .references(['company_id', 'id'])
      .inTable('asset_assignments')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_asset_event_idempotency');
    t.index(['asset_id', 'id'], 'ix_asset_event_history');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('asset_events');
  await knex.schema.dropTableIfExists('asset_assignments');
  await knex.schema.dropTableIfExists('assets');
  await knex.schema.dropTableIfExists('asset_categories');
}
