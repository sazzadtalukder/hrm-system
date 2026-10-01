export async function up(knex) {
  if (!(await knex.schema.hasTable('audit_review_events')))
    await knex.schema.createTable('audit_review_events', (t) => {
      t.bigIncrements('id');
      t.bigInteger('company_id').unsigned().notNullable();
      t.bigInteger('audit_event_id').unsigned().notNullable();
      t.enum('review_status', ['reviewed', 'flagged', 'resolved']).notNullable();
      t.string('reason', 500).notNullable();
      t.bigInteger('acting_user_id').unsigned().notNullable();
      t.string('idempotency_key', 100).notNullable();
      t.timestamp('created_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
      t.foreign('company_id').references('companies.id').onDelete('RESTRICT');
      t.foreign('audit_event_id').references('audit_events.id').onDelete('RESTRICT');
      t.foreign('acting_user_id').references('users.id').onDelete('RESTRICT');
      t.unique(['company_id', 'idempotency_key'], 'uq_audit_review_idempotency');
      t.index(['audit_event_id', 'id'], 'ix_audit_review_history');
    });
  const [rows] = await knex.raw(
    "select distinct index_name from information_schema.statistics where table_schema = database() and table_name = 'audit_events'",
  );
  const indexes = new Set(rows.map((row) => row.INDEX_NAME ?? row.index_name));
  await knex.schema.alterTable('audit_events', (t) => {
    if (!indexes.has('ix_audit_company_occurred'))
      t.index(['company_id', 'occurred_at', 'id'], 'ix_audit_company_occurred');
    if (!indexes.has('ix_audit_actor_occurred'))
      t.index(['actor_user_id', 'occurred_at', 'id'], 'ix_audit_actor_occurred');
    if (!indexes.has('ix_audit_action_outcome'))
      t.index(['action_code', 'outcome', 'occurred_at'], 'ix_audit_action_outcome');
  });
}
export async function down(knex) {
  await knex.schema.alterTable('audit_events', (t) => {
    t.dropIndex(['company_id', 'occurred_at', 'id'], 'ix_audit_company_occurred');
    t.dropIndex(['actor_user_id', 'occurred_at', 'id'], 'ix_audit_actor_occurred');
    t.dropIndex(['action_code', 'outcome', 'occurred_at'], 'ix_audit_action_outcome');
  });
  await knex.schema.dropTableIfExists('audit_review_events');
}
