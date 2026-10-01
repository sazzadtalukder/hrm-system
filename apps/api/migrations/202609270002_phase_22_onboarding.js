const audit = (t) => {
  t.bigInteger('created_by').unsigned().nullable();
  t.bigInteger('updated_by').unsigned().nullable();
  t.timestamp('created_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
  t.timestamp('updated_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
};
const owned = (t, n) => {
  t.bigIncrements('id');
  t.bigInteger('company_id').unsigned().notNullable();
  t.unique(['company_id', 'id'], { indexName: `uq_${n}_company_id` });
  t.foreign('company_id').references('companies.id').onDelete('RESTRICT');
};
export async function up(knex) {
  await knex.schema.createTable('onboarding_templates', (t) => {
    owned(t, 'onboarding_templates');
    t.string('code', 50).notNullable();
    t.string('name', 200).notNullable();
    t.enum('status', ['draft', 'active', 'inactive']).notNullable().defaultTo('draft');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).nullable();
    audit(t);
    t.unique(['company_id', 'code'], 'uq_onboarding_template_code');
    t.unique(['company_id', 'idempotency_key'], 'uq_onboarding_template_idem');
  });
  await knex.schema.createTable('onboarding_template_versions', (t) => {
    owned(t, 'onboarding_template_versions');
    t.bigInteger('onboarding_template_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.text('description').nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.string('idempotency_key', 100).nullable();
    audit(t);
    t.foreign(['company_id', 'onboarding_template_id'], 'fk_onboard_template_version_template')
      .references(['company_id', 'id'])
      .inTable('onboarding_templates');
    t.unique(['onboarding_template_id', 'version_number'], 'uq_onboarding_template_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_onboarding_template_version_idem');
  });
  await knex.schema.createTable('onboarding_template_tasks', (t) => {
    owned(t, 'onboarding_template_tasks');
    t.bigInteger('onboarding_template_version_id').unsigned().notNullable();
    t.string('task_code', 50).notNullable();
    t.string('title', 200).notNullable();
    t.enum('task_type', [
      'task',
      'document',
      'equipment',
      'access',
      'orientation',
      'probation_milestone',
      'attendance_readiness',
      'payroll_readiness',
    ]).notNullable();
    t.boolean('is_mandatory').notNullable().defaultTo(true);
    t.integer('sequence_number').unsigned().notNullable();
    t.integer('due_offset_days').unsigned().nullable();
    t.text('instructions').nullable();
    audit(t);
    t.foreign(['company_id', 'onboarding_template_version_id'], 'fk_onboard_template_task_version')
      .references(['company_id', 'id'])
      .inTable('onboarding_template_versions');
    t.unique(['onboarding_template_version_id', 'task_code'], 'uq_onboarding_template_task');
  });
  await knex.schema.createTable('onboarding_cases', (t) => {
    owned(t, 'onboarding_cases');
    t.bigInteger('recruitment_hire_conversion_id').unsigned().notNullable();
    t.bigInteger('employee_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.bigInteger('onboarding_template_version_id').unsigned().notNullable();
    t.bigInteger('manager_user_id_snapshot').unsigned().nullable();
    t.bigInteger('branch_id_snapshot').unsigned().nullable();
    t.bigInteger('department_id_snapshot').unsigned().nullable();
    t.enum('status', ['pre_joining', 'in_progress', 'joined', 'completed', 'cancelled'])
      .notNullable()
      .defaultTo('pre_joining');
    t.date('joining_date_snapshot').notNullable();
    t.datetime('joining_confirmed_at').nullable();
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.boolean('active_slot').nullable().defaultTo(true);
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'recruitment_hire_conversion_id'], 'fk_onboard_case_conversion')
      .references(['company_id', 'id'])
      .inTable('recruitment_hire_conversions');
    // Phase 3 predates composite employee ownership keys. Company ownership is
    // asserted by the conversion and case services; this FK preserves referential integrity.
    t.foreign('employee_id').references('employees.id').onDelete('RESTRICT');
    t.foreign('employment_id').references('employments.id').onDelete('RESTRICT');
    t.foreign(['company_id', 'onboarding_template_version_id'], 'fk_onboard_case_template_version')
      .references(['company_id', 'id'])
      .inTable('onboarding_template_versions');
    t.unique(['recruitment_hire_conversion_id'], 'uq_onboarding_conversion');
    t.unique(['employment_id', 'active_slot'], 'uq_onboarding_active_employment');
    t.unique(['company_id', 'idempotency_key'], 'uq_onboarding_case_idem');
  });
  await knex.schema.createTable('onboarding_case_versions', (t) => {
    owned(t, 'onboarding_case_versions');
    t.bigInteger('onboarding_case_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.enum('status_snapshot', [
      'pre_joining',
      'in_progress',
      'joined',
      'completed',
      'cancelled',
    ]).notNullable();
    t.string('reason', 500).nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    audit(t);
    t.foreign(['company_id', 'onboarding_case_id'], 'fk_onboard_case_version_case')
      .references(['company_id', 'id'])
      .inTable('onboarding_cases');
    t.unique(['onboarding_case_id', 'version_number'], 'uq_onboarding_case_version');
  });
  await knex.schema.createTable('onboarding_case_tasks', (t) => {
    owned(t, 'onboarding_case_tasks');
    t.bigInteger('onboarding_case_id').unsigned().notNullable();
    t.bigInteger('onboarding_template_task_id').unsigned().nullable();
    t.string('task_code_snapshot', 50).notNullable();
    t.string('title_snapshot', 200).notNullable();
    t.enum('task_type', [
      'task',
      'document',
      'equipment',
      'access',
      'orientation',
      'probation_milestone',
      'attendance_readiness',
      'payroll_readiness',
    ]).notNullable();
    t.boolean('is_mandatory').notNullable();
    t.date('due_date').nullable();
    t.enum('status', ['pending', 'in_progress', 'completed', 'waived', 'cancelled'])
      .notNullable()
      .defaultTo('pending');
    t.string('completion_note', 500).nullable();
    t.string('waiver_reason', 500).nullable();
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).nullable();
    audit(t);
    t.foreign(['company_id', 'onboarding_case_id'], 'fk_onboard_task_case')
      .references(['company_id', 'id'])
      .inTable('onboarding_cases');
    t.foreign(['company_id', 'onboarding_template_task_id'], 'fk_onboard_task_template_task')
      .references(['company_id', 'id'])
      .inTable('onboarding_template_tasks');
    t.unique(['company_id', 'idempotency_key'], 'uq_onboarding_case_task_idem');
  });
  await knex.schema.createTable('onboarding_document_requirements', (t) => {
    owned(t, 'onboarding_document_requirements');
    t.bigInteger('onboarding_case_task_id').unsigned().notNullable();
    t.string('document_type_code', 50).notNullable();
    t.enum('status', ['pending', 'verified', 'waived', 'rejected'])
      .notNullable()
      .defaultTo('pending');
    t.string('reason', 500).nullable();
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'onboarding_case_task_id'], 'fk_onboard_document_task')
      .references(['company_id', 'id'])
      .inTable('onboarding_case_tasks');
    t.unique(['onboarding_case_task_id'], 'uq_onboarding_document_requirement');
  });
  await knex.schema.createTable('onboarding_document_evidence', (t) => {
    owned(t, 'onboarding_document_evidence');
    t.bigInteger('onboarding_document_requirement_id').unsigned().notNullable();
    t.bigInteger('document_id').unsigned().nullable();
    t.bigInteger('document_version_id').unsigned().nullable();
    t.string('external_reference', 200).nullable();
    t.string('verification_note', 500).nullable();
    audit(t);
    t.foreign(
      ['company_id', 'onboarding_document_requirement_id'],
      'fk_onboard_evidence_requirement',
    )
      .references(['company_id', 'id'])
      .inTable('onboarding_document_requirements');
    t.foreign(['company_id', 'document_id']).references(['company_id', 'id']).inTable('documents');
    t.foreign(['company_id', 'document_version_id'], 'fk_onboard_evidence_document_version')
      .references(['company_id', 'id'])
      .inTable('document_versions');
  });
  await knex.schema.createTable('onboarding_resource_requests', (t) => {
    owned(t, 'onboarding_resource_requests');
    t.bigInteger('onboarding_case_task_id').unsigned().notNullable();
    t.enum('request_type', ['equipment', 'access']).notNullable();
    t.string('resource_name', 200).notNullable();
    t.enum('status', ['requested', 'in_progress', 'fulfilled', 'rejected', 'cancelled', 'waived'])
      .notNullable()
      .defaultTo('requested');
    t.string('external_reference', 200).nullable();
    t.string('reason', 500).nullable();
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'onboarding_case_task_id'], 'fk_onboard_resource_task')
      .references(['company_id', 'id'])
      .inTable('onboarding_case_tasks');
    t.unique(['company_id', 'idempotency_key'], 'uq_onboarding_resource_idem');
  });
  await knex.schema.createTable('onboarding_probation_milestones', (t) => {
    owned(t, 'onboarding_probation_milestones');
    t.bigInteger('onboarding_case_task_id').unsigned().notNullable();
    t.date('due_date').notNullable();
    t.enum('status', ['pending', 'completed', 'waived']).notNullable().defaultTo('pending');
    t.string('note', 500).nullable();
    t.string('waiver_reason', 500).nullable();
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'onboarding_case_task_id'], 'fk_onboard_milestone_task')
      .references(['company_id', 'id'])
      .inTable('onboarding_case_tasks');
    t.unique(['onboarding_case_task_id'], 'uq_onboarding_probation_milestone');
  });
  await knex.schema.createTable('onboarding_readiness_checks', (t) => {
    owned(t, 'onboarding_readiness_checks');
    t.bigInteger('onboarding_case_id').unsigned().notNullable();
    t.enum('readiness_type', ['attendance', 'payroll']).notNullable();
    t.enum('status', ['not_ready', 'ready', 'waived']).notNullable().defaultTo('not_ready');
    t.date('assessed_on').notNullable();
    t.string('reason', 500).notNullable();
    t.string('snapshot_json', 4000).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'onboarding_case_id'], 'fk_onboard_readiness_case')
      .references(['company_id', 'id'])
      .inTable('onboarding_cases');
    t.unique(['company_id', 'idempotency_key'], 'uq_onboarding_readiness_idem');
    t.index(['onboarding_case_id', 'readiness_type', 'id'], 'ix_onboarding_readiness_history');
  });
  await knex.schema.createTable('onboarding_case_state_events', (t) => {
    owned(t, 'onboarding_case_state_events');
    t.bigInteger('onboarding_case_id').unsigned().notNullable();
    t.string('from_status', 40).nullable();
    t.enum('to_status', [
      'pre_joining',
      'in_progress',
      'joined',
      'completed',
      'cancelled',
    ]).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'onboarding_case_id'], 'fk_onboard_state_case')
      .references(['company_id', 'id'])
      .inTable('onboarding_cases');
    t.unique(['company_id', 'idempotency_key'], 'uq_onboarding_case_state_idem');
  });
}
export async function down(knex) {
  for (const table of [
    'onboarding_case_state_events',
    'onboarding_readiness_checks',
    'onboarding_probation_milestones',
    'onboarding_resource_requests',
    'onboarding_document_evidence',
    'onboarding_document_requirements',
    'onboarding_case_tasks',
    'onboarding_case_versions',
    'onboarding_cases',
    'onboarding_template_tasks',
    'onboarding_template_versions',
    'onboarding_templates',
  ])
    await knex.schema.dropTableIfExists(table);
}
