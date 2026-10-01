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
  await knex.schema.createTable('document_types', (t) => {
    owned(t, 'document_types');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.boolean('is_sensitive').notNullable().defaultTo(false);
    t.boolean('acknowledgment_required').notNullable().defaultTo(false);
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_document_type_code');
  });
  await knex.schema.createTable('documents', (t) => {
    owned(t, 'documents');
    t.bigInteger('document_type_id').unsigned().notNullable();
    t.string('document_code', 50).notNullable();
    t.string('title', 200).notNullable();
    t.enum('audience', ['company', 'branch', 'department', 'employee']).notNullable();
    t.bigInteger('branch_id').unsigned().nullable();
    t.bigInteger('department_id').unsigned().nullable();
    t.bigInteger('employment_id').unsigned().nullable();
    t.enum('status', ['draft', 'published', 'revoked']).notNullable().defaultTo('draft');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'document_type_id'], 'fk_document_type')
      .references(['company_id', 'id'])
      .inTable('document_types')
      .onDelete('RESTRICT');
    t.foreign(['branch_id', 'company_id'], 'fk_document_branch')
      .references(['id', 'company_id'])
      .inTable('branches')
      .onDelete('RESTRICT');
    t.foreign(['department_id', 'company_id'], 'fk_document_department')
      .references(['id', 'company_id'])
      .inTable('departments')
      .onDelete('RESTRICT');
    t.foreign(['employment_id', 'company_id'], 'fk_document_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'document_code'], 'uq_document_code');
  });
  await knex.schema.createTable('document_versions', (t) => {
    owned(t, 'document_versions');
    t.bigInteger('document_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('reference_type', 30).notNullable();
    t.string('reference_value', 500).notNullable();
    t.string('file_name', 255).nullable();
    t.string('mime_type', 100).nullable();
    t.string('checksum_sha256', 64).nullable();
    t.date('effective_on').notNullable();
    t.date('expires_on').nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned().nullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'document_id'], 'fk_document_version_document')
      .references(['company_id', 'id'])
      .inTable('documents')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_document_version_supersedes')
      .references('document_versions.id')
      .onDelete('RESTRICT');
    t.unique(['document_id', 'version_number'], 'uq_document_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_document_version_idempotency');
    t.check("reference_type in ('external_url','external_reference')");
    t.check('expires_on is null or expires_on >= effective_on');
  });
  await knex.schema.createTable('document_state_events', (t) => {
    owned(t, 'document_state_events');
    t.bigInteger('document_id').unsigned().notNullable();
    t.string('from_state', 30).notNullable();
    t.string('to_state', 30).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'document_id'], 'fk_document_state_document')
      .references(['company_id', 'id'])
      .inTable('documents')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_document_state_idempotency');
  });
  await knex.schema.createTable('document_acknowledgments', (t) => {
    owned(t, 'document_acknowledgments');
    t.bigInteger('document_id').unsigned().notNullable();
    t.bigInteger('document_version_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.timestamp('acknowledged_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'document_id'], 'fk_document_ack_document')
      .references(['company_id', 'id'])
      .inTable('documents')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'document_version_id'], 'fk_document_ack_version')
      .references(['company_id', 'id'])
      .inTable('document_versions')
      .onDelete('RESTRICT');
    t.foreign(['employment_id', 'company_id'], 'fk_document_ack_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.unique(['document_version_id', 'employment_id'], 'uq_document_ack');
    t.unique(['company_id', 'idempotency_key'], 'uq_document_ack_idempotency');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('document_acknowledgments');
  await knex.schema.dropTableIfExists('document_state_events');
  await knex.schema.dropTableIfExists('document_versions');
  await knex.schema.dropTableIfExists('documents');
  await knex.schema.dropTableIfExists('document_types');
}
