export async function up(knex) {
  await knex.schema.createTable('notifications', (t) => {
    t.bigIncrements('id');
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.string('notification_type', 80).notNullable();
    t.string('title', 200).notNullable();
    t.string('message', 1000).notNullable();
    t.string('reference_type', 80).nullable();
    t.bigInteger('reference_id').unsigned().nullable();
    t.enum('status', ['unread', 'read', 'dismissed']).notNullable().defaultTo('unread');
    t.timestamp('read_at').nullable();
    t.string('idempotency_key', 100).notNullable();
    t.bigInteger('created_by').unsigned().nullable();
    t.bigInteger('updated_by').unsigned().nullable();
    t.timestamp('created_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
    t.timestamp('updated_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
    t.foreign('company_id').references('companies.id').onDelete('RESTRICT');
    t.foreign('user_id').references('users.id').onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_notification_idempotency');
    t.index(['user_id', 'status', 'created_at'], 'ix_notification_inbox');
  });
  await knex.schema.createTable('notification_preferences', (t) => {
    t.bigIncrements('id');
    t.bigInteger('company_id').unsigned().notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.boolean('in_app_enabled').notNullable().defaultTo(true);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.bigInteger('created_by').unsigned().nullable();
    t.bigInteger('updated_by').unsigned().nullable();
    t.timestamp('created_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
    t.timestamp('updated_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
    t.foreign('company_id').references('companies.id').onDelete('RESTRICT');
    t.foreign('user_id').references('users.id').onDelete('RESTRICT');
    t.unique(['company_id', 'user_id'], 'uq_notification_preference');
  });
}
export async function down(knex) {
  await knex.schema.dropTableIfExists('notification_preferences');
  await knex.schema.dropTableIfExists('notifications');
}
