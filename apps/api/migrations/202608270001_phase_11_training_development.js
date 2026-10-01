const audit = (t) => {
  t.bigInteger('created_by').unsigned().nullable();
  t.bigInteger('updated_by').unsigned().nullable();
  t.timestamp('created_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
  t.timestamp('updated_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
};
const companyIdentity = (t, name) => {
  t.bigIncrements('id');
  t.bigInteger('company_id').unsigned().notNullable();
  t.unique(['company_id', 'id'], { indexName: `uq_${name}_company_id` });
  t.foreign('company_id').references('companies.id').onDelete('RESTRICT');
};
export async function up(knex) {
  await knex.schema.createTable('training_courses', (t) => {
    companyIdentity(t, 'training_courses');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_training_course_code');
  });
  await knex.schema.createTable('training_course_versions', (t) => {
    companyIdentity(t, 'training_course_versions');
    t.bigInteger('training_course_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.date('effective_start').notNullable();
    t.date('effective_end');
    t.text('description').notNullable();
    t.enum('delivery_mode', ['in_person', 'virtual', 'blended']).notNullable();
    t.boolean('scoring_enabled').notNullable().defaultTo(false);
    t.decimal('minimum_score', 7, 2);
    t.decimal('maximum_score', 7, 2);
    t.decimal('passing_score', 7, 2);
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('reason', 500).notNullable();
    audit(t);
    t.foreign(['company_id', 'training_course_id'], 'fk_train_course_version')
      .references(['company_id', 'id'])
      .inTable('training_courses')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_train_course_supersedes')
      .references('training_course_versions.id')
      .onDelete('RESTRICT');
    t.unique(['training_course_id', 'version_number'], 'uq_train_course_version');
    t.index(
      ['training_course_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_train_course_effective',
    );
    t.check('effective_end is null or effective_end >= effective_start');
    t.check(
      '(scoring_enabled = 0 and minimum_score is null and maximum_score is null and passing_score is null) or (scoring_enabled = 1 and minimum_score is not null and maximum_score is not null and passing_score is not null and maximum_score > minimum_score and passing_score between minimum_score and maximum_score)',
    );
  });
  await knex.schema.createTable('training_course_competencies', (t) => {
    companyIdentity(t, 'training_course_comps');
    t.bigInteger('training_course_version_id').unsigned().notNullable();
    t.bigInteger('performance_competency_version_id').unsigned().notNullable();
    audit(t);
    t.foreign(['company_id', 'training_course_version_id'], 'fk_train_comp_course')
      .references(['company_id', 'id'])
      .inTable('training_course_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_competency_version_id'], 'fk_train_comp_perf_version')
      .references(['company_id', 'id'])
      .inTable('performance_competency_versions')
      .onDelete('RESTRICT');
    t.unique(
      ['training_course_version_id', 'performance_competency_version_id'],
      'uq_train_course_comp',
    );
  });
  await knex.schema.createTable('training_providers', (t) => {
    companyIdentity(t, 'training_providers');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_training_provider_code');
  });
  await knex.schema.createTable('training_provider_versions', (t) => {
    companyIdentity(t, 'training_provider_versions');
    t.bigInteger('training_provider_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.date('effective_start').notNullable();
    t.date('effective_end');
    t.string('contact_name', 150);
    t.string('contact_email', 254);
    t.string('external_url', 500);
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('reason', 500).notNullable();
    audit(t);
    t.foreign(['company_id', 'training_provider_id'], 'fk_train_provider_version')
      .references(['company_id', 'id'])
      .inTable('training_providers')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_train_provider_supersedes')
      .references('training_provider_versions.id')
      .onDelete('RESTRICT');
    t.unique(['training_provider_id', 'version_number'], 'uq_train_provider_version');
    t.index(
      ['training_provider_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_train_provider_effective',
    );
    t.check('effective_end is null or effective_end >= effective_start');
  });
  await knex.schema.createTable('training_sessions', (t) => {
    companyIdentity(t, 'training_sessions');
    t.string('code', 50).notNullable();
    t.bigInteger('training_course_version_id').unsigned().notNullable();
    t.enum('status', [
      'draft',
      'published',
      'enrollment_closed',
      'in_progress',
      'completed',
      'cancelled',
    ])
      .notNullable()
      .defaultTo('draft');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'training_course_version_id'], 'fk_train_session_course')
      .references(['company_id', 'id'])
      .inTable('training_course_versions')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'code'], 'uq_training_session_code');
    t.index(['company_id', 'status'], 'ix_training_session_status');
  });
  await knex.schema.createTable('training_session_versions', (t) => {
    companyIdentity(t, 'training_session_versions');
    t.bigInteger('training_session_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('title_snapshot', 150).notNullable();
    t.string('course_code_snapshot', 50).notNullable();
    t.enum('delivery_mode_snapshot', ['in_person', 'virtual', 'blended']).notNullable();
    t.timestamp('starts_at_utc').notNullable();
    t.timestamp('ends_at_utc').notNullable();
    t.string('timezone_snapshot', 64).notNullable();
    t.date('enrollment_opens_on').notNullable();
    t.date('enrollment_closes_on').notNullable();
    t.integer('capacity').unsigned().notNullable();
    t.bigInteger('branch_id').unsigned();
    t.string('location', 300);
    t.string('virtual_reference', 500);
    t.bigInteger('training_provider_version_id').unsigned();
    t.boolean('scoring_enabled_snapshot').notNullable().defaultTo(false);
    t.decimal('minimum_score_snapshot', 7, 2);
    t.decimal('maximum_score_snapshot', 7, 2);
    t.decimal('passing_score_snapshot', 7, 2);
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('reason', 500).notNullable();
    audit(t);
    t.foreign(['company_id', 'training_session_id'], 'fk_train_session_version')
      .references(['company_id', 'id'])
      .inTable('training_sessions')
      .onDelete('RESTRICT');
    t.foreign(['branch_id', 'company_id'], 'fk_train_session_branch')
      .references(['id', 'company_id'])
      .inTable('branches')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'training_provider_version_id'], 'fk_train_session_provider')
      .references(['company_id', 'id'])
      .inTable('training_provider_versions')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_train_session_supersedes')
      .references('training_session_versions.id')
      .onDelete('RESTRICT');
    t.unique(['training_session_id', 'version_number'], 'uq_train_session_version');
    t.check('ends_at_utc > starts_at_utc');
    t.check('enrollment_closes_on >= enrollment_opens_on');
    t.check('capacity between 1 and 1000');
  });
  await knex.schema.createTable('training_session_state_events', (t) => {
    companyIdentity(t, 'training_session_events');
    t.bigInteger('training_session_id').unsigned().notNullable();
    t.string('from_state', 40);
    t.string('to_state', 40).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable();
    t.string('idempotency_key', 100);
    t.string('request_id', 64);
    t.string('correlation_id', 128);
    t.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    t.foreign(['company_id', 'training_session_id'], 'fk_train_session_event')
      .references(['company_id', 'id'])
      .inTable('training_sessions')
      .onDelete('RESTRICT');
    t.unique(['training_session_id', 'workflow_version'], 'uq_train_session_workflow');
    t.unique(['company_id', 'idempotency_key'], 'uq_train_session_event_key');
  });
  await knex.schema.createTable('training_session_facilitators', (t) => {
    companyIdentity(t, 'training_facilitators');
    t.bigInteger('training_session_version_id').unsigned().notNullable();
    t.string('name', 150).notNullable();
    t.string('organization', 150);
    t.string('reference', 300);
    t.integer('display_order').unsigned().notNullable();
    audit(t);
    t.foreign(['company_id', 'training_session_version_id'], 'fk_train_facilitator_version')
      .references(['company_id', 'id'])
      .inTable('training_session_versions')
      .onDelete('RESTRICT');
  });
  await knex.schema.createTable('training_enrollments', (t) => {
    companyIdentity(t, 'training_enrollments');
    t.bigInteger('training_session_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.enum('source', ['self_request', 'manager_nomination', 'hr_assignment']).notNullable();
    t.boolean('is_mandatory').notNullable().defaultTo(false);
    t.enum('status', [
      'draft',
      'submitted',
      'employee_accepted',
      'enrolled',
      'withdrawn',
      'rejected',
      'employee_declined',
      'cancellation_requested',
      'cancelled',
    ]).notNullable();
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'training_session_id'], 'fk_train_enrollment_session')
      .references(['company_id', 'id'])
      .inTable('training_sessions')
      .onDelete('RESTRICT');
    t.foreign(['employment_id', 'company_id'], 'fk_train_enrollment_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.index(['company_id', 'status', 'employment_id'], 'ix_train_enrollment_scope');
  });
  await knex.schema.createTable('training_enrollment_versions', (t) => {
    companyIdentity(t, 'training_enrollment_versions');
    t.bigInteger('training_enrollment_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.bigInteger('training_session_version_id_snapshot').unsigned().notNullable();
    t.bigInteger('employee_id_snapshot').unsigned().notNullable();
    t.string('employee_code_snapshot', 50).notNullable();
    t.string('employee_name_snapshot', 200).notNullable();
    t.string('employment_status_snapshot', 30).notNullable();
    t.bigInteger('branch_id_snapshot').unsigned();
    t.bigInteger('department_id_snapshot').unsigned();
    t.bigInteger('manager_employment_id_snapshot').unsigned();
    t.bigInteger('manager_user_id_snapshot').unsigned();
    t.string('request_narrative', 2000);
    t.string('reason', 500).notNullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    audit(t);
    t.foreign(['company_id', 'training_enrollment_id'], 'fk_train_enrollment_version')
      .references(['company_id', 'id'])
      .inTable('training_enrollments')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'training_session_version_id_snapshot'], 'fk_train_enroll_session_ver')
      .references(['company_id', 'id'])
      .inTable('training_session_versions')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_train_enroll_supersedes')
      .references('training_enrollment_versions.id')
      .onDelete('RESTRICT');
    t.unique(['training_enrollment_id', 'version_number'], 'uq_train_enrollment_version');
    t.index(
      ['company_id', 'manager_user_id_snapshot', 'branch_id_snapshot', 'department_id_snapshot'],
      'ix_train_enrollment_snapshot_scope',
    );
  });
  await knex.schema.createTable('training_enrollment_state_events', (t) => {
    companyIdentity(t, 'training_enrollment_events');
    t.bigInteger('training_enrollment_id').unsigned().notNullable();
    t.string('from_state', 40);
    t.string('to_state', 40).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable();
    t.string('idempotency_key', 100);
    t.string('request_id', 64);
    t.string('correlation_id', 128);
    t.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    t.foreign(['company_id', 'training_enrollment_id'], 'fk_train_enrollment_event')
      .references(['company_id', 'id'])
      .inTable('training_enrollments')
      .onDelete('RESTRICT');
    t.unique(['training_enrollment_id', 'workflow_version'], 'uq_train_enrollment_workflow');
    t.unique(['company_id', 'idempotency_key'], 'uq_train_enrollment_event_key');
  });
  await knex.schema.createTable('training_enrollment_decisions', (t) => {
    companyIdentity(t, 'training_decisions');
    t.bigInteger('training_enrollment_id').unsigned().notNullable();
    t.string('step', 40).notNullable();
    t.integer('attempt_number').unsigned().notNullable().defaultTo(1);
    t.enum('decision', [
      'approved',
      'rejected',
      'cancelled',
      'cancellation_rejected',
    ]).notNullable();
    t.bigInteger('decision_user_id').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.timestamp('decided_at').notNullable().defaultTo(knex.fn.now());
    t.foreign(['company_id', 'training_enrollment_id'], 'fk_train_decision_enrollment')
      .references(['company_id', 'id'])
      .inTable('training_enrollments')
      .onDelete('RESTRICT');
    t.unique(['training_enrollment_id', 'step', 'attempt_number'], 'uq_train_decision_attempt');
    t.unique(['company_id', 'idempotency_key'], 'uq_train_decision_key');
  });
  await knex.schema.createTable('training_manager_reassignments', (t) => {
    companyIdentity(t, 'training_manager_reassign');
    t.bigInteger('training_enrollment_id').unsigned().notNullable();
    t.bigInteger('from_manager_employment_id').unsigned();
    t.bigInteger('to_manager_employment_id').unsigned().notNullable();
    t.bigInteger('to_manager_user_id').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    t.foreign(['company_id', 'training_enrollment_id'], 'fk_train_reassign_enrollment')
      .references(['company_id', 'id'])
      .inTable('training_enrollments')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_train_reassign_key');
  });
  await knex.schema.createTable('training_participation_records', (t) => {
    companyIdentity(t, 'training_participation');
    t.bigInteger('training_enrollment_id').unsigned().notNullable();
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'training_enrollment_id'], 'fk_train_participation_enroll')
      .references(['company_id', 'id'])
      .inTable('training_enrollments')
      .onDelete('RESTRICT');
    t.unique(['training_enrollment_id'], 'uq_train_participation_enroll');
  });
  await knex.schema.createTable('training_participation_versions', (t) => {
    companyIdentity(t, 'training_participation_ver');
    t.bigInteger('training_participation_record_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.enum('participation_status', [
      'not_recorded',
      'attended',
      'partially_attended',
      'no_show',
      'excused',
    ]).notNullable();
    t.string('comment', 1000);
    t.string('reason', 500).notNullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'training_participation_record_id'], 'fk_train_participation_version')
      .references(['company_id', 'id'])
      .inTable('training_participation_records')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_train_participation_supersedes')
      .references('training_participation_versions.id')
      .onDelete('RESTRICT');
    t.unique(
      ['training_participation_record_id', 'version_number'],
      'uq_train_participation_version',
    );
    t.unique(['company_id', 'idempotency_key'], 'uq_train_participation_key');
  });
  await knex.schema.createTable('training_completion_records', (t) => {
    companyIdentity(t, 'training_completion');
    t.bigInteger('training_enrollment_id').unsigned().notNullable();
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'training_enrollment_id'], 'fk_train_completion_enroll')
      .references(['company_id', 'id'])
      .inTable('training_enrollments')
      .onDelete('RESTRICT');
    t.unique(['training_enrollment_id'], 'uq_train_completion_enroll');
  });
  await knex.schema.createTable('training_completion_versions', (t) => {
    companyIdentity(t, 'training_completion_versions');
    t.bigInteger('training_completion_record_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.enum('outcome', ['completed', 'passed', 'failed', 'not_completed']).notNullable();
    t.decimal('score', 7, 2);
    t.date('completion_date').notNullable();
    t.string('comment', 1000);
    t.string('reason', 500).notNullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'training_completion_record_id'], 'fk_train_completion_version')
      .references(['company_id', 'id'])
      .inTable('training_completion_records')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_train_completion_supersedes')
      .references('training_completion_versions.id')
      .onDelete('RESTRICT');
    t.unique(['training_completion_record_id', 'version_number'], 'uq_train_completion_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_train_completion_key');
  });
  await knex.schema.createTable('training_evidence_references', (t) => {
    companyIdentity(t, 'training_evidence_refs');
    t.bigInteger('training_completion_record_id').unsigned().notNullable();
    t.enum('reference_type', [
      'certificate_number',
      'external_url',
      'external_reference',
    ]).notNullable();
    t.string('reference_value', 500).notNullable();
    t.enum('record_status', ['active', 'revoked']).notNullable().defaultTo('active');
    t.string('revoke_reason', 500);
    t.bigInteger('revoked_by').unsigned();
    t.timestamp('revoked_at');
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'training_completion_record_id'], 'fk_train_evidence_completion')
      .references(['company_id', 'id'])
      .inTable('training_completion_records')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_train_evidence_key');
  });
}
export async function down(knex) {
  for (const table of [
    'training_evidence_references',
    'training_completion_versions',
    'training_completion_records',
    'training_participation_versions',
    'training_participation_records',
    'training_manager_reassignments',
    'training_enrollment_decisions',
    'training_enrollment_state_events',
    'training_enrollment_versions',
    'training_enrollments',
    'training_session_facilitators',
    'training_session_state_events',
    'training_session_versions',
    'training_sessions',
    'training_provider_versions',
    'training_providers',
    'training_course_competencies',
    'training_course_versions',
    'training_courses',
  ])
    await knex.schema.dropTableIfExists(table);
}
