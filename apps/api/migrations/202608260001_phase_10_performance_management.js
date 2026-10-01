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
  await knex.schema.createTable('performance_rating_scales', (t) => {
    companyIdentity(t, 'perf_scales');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.string('description', 500);
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_perf_scale_code');
  });
  await knex.schema.createTable('performance_rating_scale_levels', (t) => {
    companyIdentity(t, 'perf_levels');
    t.bigInteger('performance_rating_scale_id').unsigned().notNullable();
    t.integer('level_value').unsigned().notNullable();
    t.string('code', 50).notNullable();
    t.string('label', 100).notNullable();
    t.string('description', 500);
    t.integer('display_order').unsigned().notNullable();
    audit(t);
    t.foreign(['company_id', 'performance_rating_scale_id'], 'fk_perf_level_scale')
      .references(['company_id', 'id'])
      .inTable('performance_rating_scales')
      .onDelete('RESTRICT');
    t.unique(['performance_rating_scale_id', 'level_value'], 'uq_perf_level_value');
    t.unique(['performance_rating_scale_id', 'code'], 'uq_perf_level_code');
    t.check('level_value between 1 and 7');
  });
  await knex.schema.createTable('performance_competencies', (t) => {
    companyIdentity(t, 'perf_competencies');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_perf_comp_code');
  });
  await knex.schema.createTable('performance_competency_versions', (t) => {
    companyIdentity(t, 'perf_comp_versions');
    t.bigInteger('performance_competency_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.date('effective_start').notNullable();
    t.date('effective_end');
    t.string('description', 1000).notNullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('reason', 500).notNullable();
    audit(t);
    t.foreign(['company_id', 'performance_competency_id'], 'fk_perf_comp_version')
      .references(['company_id', 'id'])
      .inTable('performance_competencies')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_perf_comp_supersedes')
      .references('performance_competency_versions.id')
      .onDelete('RESTRICT');
    t.unique(['performance_competency_id', 'version_number'], 'uq_perf_comp_version');
    t.index(
      ['performance_competency_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_perf_comp_effective',
    );
    t.check('effective_end is null or effective_end >= effective_start');
  });
  await knex.schema.createTable('performance_review_templates', (t) => {
    companyIdentity(t, 'perf_templates');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_perf_template_code');
  });
  await knex.schema.createTable('performance_review_template_versions', (t) => {
    companyIdentity(t, 'perf_template_versions');
    t.bigInteger('performance_review_template_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.date('effective_start').notNullable();
    t.date('effective_end');
    t.bigInteger('performance_rating_scale_id').unsigned().notNullable();
    t.boolean('goals_enabled').notNullable().defaultTo(true);
    t.boolean('goal_weights_enabled').notNullable().defaultTo(false);
    t.boolean('competencies_enabled').notNullable().defaultTo(true);
    t.integer('minimum_goal_count').unsigned().notNullable().defaultTo(1);
    t.integer('maximum_goal_count').unsigned().notNullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('reason', 500).notNullable();
    audit(t);
    t.foreign(['company_id', 'performance_review_template_id'], 'fk_perf_template_version')
      .references(['company_id', 'id'])
      .inTable('performance_review_templates')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_rating_scale_id'], 'fk_perf_template_scale')
      .references(['company_id', 'id'])
      .inTable('performance_rating_scales')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_perf_template_supersedes')
      .references('performance_review_template_versions.id')
      .onDelete('RESTRICT');
    t.unique(['performance_review_template_id', 'version_number'], 'uq_perf_template_version');
    t.index(
      ['performance_review_template_id', 'history_status', 'effective_start', 'effective_end'],
      'ix_perf_template_effective',
    );
    t.check('maximum_goal_count between 1 and 20');
    t.check('minimum_goal_count <= maximum_goal_count');
    t.check('effective_end is null or effective_end >= effective_start');
  });
  await knex.schema.createTable('performance_template_competencies', (t) => {
    companyIdentity(t, 'perf_template_comps');
    t.bigInteger('performance_review_template_version_id').unsigned().notNullable();
    t.bigInteger('performance_competency_version_id').unsigned().notNullable();
    t.integer('display_order').unsigned().notNullable();
    t.boolean('is_required').notNullable().defaultTo(true);
    audit(t);
    t.foreign(['company_id', 'performance_review_template_version_id'], 'fk_perf_map_template')
      .references(['company_id', 'id'])
      .inTable('performance_review_template_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_competency_version_id'], 'fk_perf_map_comp')
      .references(['company_id', 'id'])
      .inTable('performance_competency_versions')
      .onDelete('RESTRICT');
    t.unique(
      ['performance_review_template_version_id', 'performance_competency_version_id'],
      'uq_perf_template_comp',
    );
  });
  await knex.schema.createTable('performance_cycles', (t) => {
    companyIdentity(t, 'perf_cycles');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.date('review_period_start').notNullable();
    t.date('review_period_end').notNullable();
    t.date('goal_submission_due_date').notNullable();
    t.date('self_review_due_date').notNullable();
    t.date('manager_review_due_date').notNullable();
    t.date('acknowledgment_due_date').notNullable();
    t.enum('status', ['draft', 'active', 'review_open', 'closed', 'cancelled'])
      .notNullable()
      .defaultTo('draft');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_perf_cycle_code');
    t.index(
      ['company_id', 'status', 'review_period_start', 'review_period_end'],
      'ix_perf_cycle_status_dates',
    );
    t.check('review_period_end >= review_period_start');
    t.check('self_review_due_date >= goal_submission_due_date');
    t.check('manager_review_due_date >= self_review_due_date');
    t.check('acknowledgment_due_date >= manager_review_due_date');
  });
  await knex.schema.createTable('performance_cycle_state_events', (t) => {
    companyIdentity(t, 'perf_cycle_events');
    t.bigInteger('performance_cycle_id').unsigned().notNullable();
    t.string('from_state', 40);
    t.string('to_state', 40).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable();
    t.string('request_id', 64);
    t.string('correlation_id', 128);
    t.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    t.foreign(['company_id', 'performance_cycle_id'], 'fk_perf_cycle_event')
      .references(['company_id', 'id'])
      .inTable('performance_cycles')
      .onDelete('RESTRICT');
    t.unique(['performance_cycle_id', 'workflow_version'], 'uq_perf_cycle_workflow');
  });
  await knex.schema.createTable('performance_reviews', (t) => {
    companyIdentity(t, 'perf_reviews');
    t.bigInteger('performance_cycle_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.bigInteger('performance_review_template_version_id').unsigned().notNullable();
    t.enum('status', [
      'goals_draft',
      'goals_submitted',
      'goals_returned',
      'goals_approved',
      'self_review_submitted',
      'manager_review_submitted',
      'employee_acknowledged',
      'finalized',
      'finalized_without_acknowledgment',
      'cancelled',
    ])
      .notNullable()
      .defaultTo('goals_draft');
    t.integer('current_review_version').unsigned().notNullable().defaultTo(1);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.boolean('overlap_override').notNullable().defaultTo(false);
    t.string('overlap_override_reason', 500);
    audit(t);
    t.foreign(['company_id', 'performance_cycle_id'], 'fk_perf_review_cycle')
      .references(['company_id', 'id'])
      .inTable('performance_cycles')
      .onDelete('RESTRICT');
    t.foreign(['employment_id', 'company_id'], 'fk_perf_review_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_review_template_version_id'], 'fk_perf_review_template')
      .references(['company_id', 'id'])
      .inTable('performance_review_template_versions')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'performance_cycle_id', 'employment_id'], 'uq_perf_review_population');
    t.index(['company_id', 'status', 'employment_id'], 'ix_perf_review_scope');
  });
  await knex.schema.createTable('performance_review_versions', (t) => {
    companyIdentity(t, 'perf_review_versions');
    t.bigInteger('performance_review_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.bigInteger('employee_id_snapshot').unsigned().notNullable();
    t.string('employee_code_snapshot', 50).notNullable();
    t.string('employee_name_snapshot', 200).notNullable();
    t.bigInteger('employment_id_snapshot').unsigned().notNullable();
    t.string('employment_status_snapshot', 30).notNullable();
    t.bigInteger('branch_id_snapshot').unsigned();
    t.bigInteger('department_id_snapshot').unsigned();
    t.bigInteger('designation_id_snapshot').unsigned();
    t.bigInteger('grade_id_snapshot').unsigned();
    t.bigInteger('manager_employment_id_snapshot').unsigned();
    t.bigInteger('manager_user_id_snapshot').unsigned();
    t.bigInteger('template_version_id_snapshot').unsigned().notNullable();
    t.bigInteger('rating_scale_id_snapshot').unsigned().notNullable();
    t.date('anchor_date').notNullable();
    t.string('reason', 500).notNullable();
    audit(t);
    t.foreign(['company_id', 'performance_review_id'], 'fk_perf_review_version')
      .references(['company_id', 'id'])
      .inTable('performance_reviews')
      .onDelete('RESTRICT');
    t.unique(['performance_review_id', 'version_number'], 'uq_perf_review_version');
    t.index(
      ['company_id', 'manager_user_id_snapshot', 'branch_id_snapshot', 'department_id_snapshot'],
      'ix_perf_review_snapshot_scope',
    );
  });
  await knex.schema.createTable('performance_goals', (t) => {
    companyIdentity(t, 'perf_goals');
    t.bigInteger('performance_review_id').unsigned().notNullable();
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.enum('status', ['draft', 'submitted', 'approved', 'returned'])
      .notNullable()
      .defaultTo('draft');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'performance_review_id'], 'fk_perf_goal_review')
      .references(['company_id', 'id'])
      .inTable('performance_reviews')
      .onDelete('RESTRICT');
    t.index(['performance_review_id', 'status']);
  });
  await knex.schema.createTable('performance_goal_versions', (t) => {
    companyIdentity(t, 'perf_goal_versions');
    t.bigInteger('performance_goal_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('title', 200).notNullable();
    t.string('description', 2000).notNullable();
    t.string('measurement_criteria', 1000).notNullable();
    t.string('target_value', 500).notNullable();
    t.integer('weight').unsigned();
    t.date('due_date').notNullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.bigInteger('supersedes_version_id').unsigned();
    t.string('reason', 500).notNullable();
    audit(t);
    t.foreign(['company_id', 'performance_goal_id'], 'fk_perf_goal_version')
      .references(['company_id', 'id'])
      .inTable('performance_goals')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_perf_goal_supersedes')
      .references('performance_goal_versions.id')
      .onDelete('RESTRICT');
    t.unique(['performance_goal_id', 'version_number'], 'uq_perf_goal_version');
    t.check('weight is null or weight between 1 and 100');
  });
  await knex.schema.createTable('performance_assessments', (t) => {
    companyIdentity(t, 'perf_assessments');
    t.bigInteger('performance_review_id').unsigned().notNullable();
    t.enum('assessment_type', ['self', 'manager']).notNullable();
    t.bigInteger('assessor_user_id').unsigned().notNullable();
    t.enum('status', ['draft', 'submitted']).notNullable().defaultTo('draft');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.timestamp('submitted_at');
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'performance_review_id'], 'fk_perf_assessment_review')
      .references(['company_id', 'id'])
      .inTable('performance_reviews')
      .onDelete('RESTRICT');
    t.unique(['performance_review_id', 'assessment_type'], 'uq_perf_assessment_type');
  });
  await knex.schema.createTable('performance_assessment_versions', (t) => {
    companyIdentity(t, 'perf_assessment_versions');
    t.bigInteger('performance_assessment_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('overall_comment', 2000).notNullable();
    t.string('strengths_comment', 2000);
    t.string('development_comment', 2000);
    t.bigInteger('overall_rating_level_id').unsigned();
    t.string('reason', 500).notNullable();
    t.timestamp('submitted_at');
    audit(t);
    t.foreign(['company_id', 'performance_assessment_id'], 'fk_perf_assessment_version')
      .references(['company_id', 'id'])
      .inTable('performance_assessments')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'overall_rating_level_id'], 'fk_perf_overall_level')
      .references(['company_id', 'id'])
      .inTable('performance_rating_scale_levels')
      .onDelete('RESTRICT');
    t.unique(['performance_assessment_id', 'version_number'], 'uq_perf_assessment_version');
  });
  await knex.schema.createTable('performance_goal_assessment_ratings', (t) => {
    companyIdentity(t, 'perf_goal_ratings');
    t.bigInteger('performance_assessment_version_id').unsigned().notNullable();
    t.bigInteger('performance_goal_version_id').unsigned().notNullable();
    t.bigInteger('rating_scale_level_id').unsigned().notNullable();
    t.string('comment', 1000);
    audit(t);
    t.foreign(['company_id', 'performance_assessment_version_id'], 'fk_perf_goal_rating_assess')
      .references(['company_id', 'id'])
      .inTable('performance_assessment_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_goal_version_id'], 'fk_perf_goal_rating_goal')
      .references(['company_id', 'id'])
      .inTable('performance_goal_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'rating_scale_level_id'], 'fk_perf_goal_rating_level')
      .references(['company_id', 'id'])
      .inTable('performance_rating_scale_levels')
      .onDelete('RESTRICT');
    t.unique(
      ['performance_assessment_version_id', 'performance_goal_version_id'],
      'uq_perf_goal_rating',
    );
  });
  await knex.schema.createTable('performance_competency_assessment_ratings', (t) => {
    companyIdentity(t, 'perf_comp_ratings');
    t.bigInteger('performance_assessment_version_id').unsigned().notNullable();
    t.bigInteger('performance_competency_version_id').unsigned().notNullable();
    t.bigInteger('rating_scale_level_id').unsigned().notNullable();
    t.string('comment', 1000);
    audit(t);
    t.foreign(['company_id', 'performance_assessment_version_id'], 'fk_perf_comp_rating_assess')
      .references(['company_id', 'id'])
      .inTable('performance_assessment_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_competency_version_id'], 'fk_perf_comp_rating_comp')
      .references(['company_id', 'id'])
      .inTable('performance_competency_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'rating_scale_level_id'], 'fk_perf_comp_rating_level')
      .references(['company_id', 'id'])
      .inTable('performance_rating_scale_levels')
      .onDelete('RESTRICT');
    t.unique(
      ['performance_assessment_version_id', 'performance_competency_version_id'],
      'uq_perf_comp_rating',
    );
  });
  await knex.schema.createTable('performance_review_acknowledgments', (t) => {
    companyIdentity(t, 'perf_acknowledgments');
    t.bigInteger('performance_review_id').unsigned().notNullable();
    t.bigInteger('employee_user_id').unsigned().notNullable();
    t.enum('acknowledgment', ['acknowledged', 'acknowledged_with_comment']).notNullable();
    t.string('comment', 2000);
    t.integer('review_version_acknowledged').unsigned().notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.timestamp('acknowledged_at').notNullable().defaultTo(knex.fn.now());
    t.foreign(['company_id', 'performance_review_id'], 'fk_perf_ack_review')
      .references(['company_id', 'id'])
      .inTable('performance_reviews')
      .onDelete('RESTRICT');
    t.unique(['performance_review_id'], 'uq_perf_ack_review');
    t.unique(['company_id', 'idempotency_key'], 'uq_perf_ack_key');
  });
  await knex.schema.createTable('performance_review_state_events', (t) => {
    companyIdentity(t, 'perf_review_events');
    t.bigInteger('performance_review_id').unsigned().notNullable();
    t.string('from_state', 50);
    t.string('to_state', 50).notNullable();
    t.integer('workflow_version').unsigned().notNullable();
    t.integer('record_version').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable();
    t.string('idempotency_key', 100);
    t.string('request_id', 64);
    t.string('correlation_id', 128);
    t.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());
    t.foreign(['company_id', 'performance_review_id'], 'fk_perf_review_event')
      .references(['company_id', 'id'])
      .inTable('performance_reviews')
      .onDelete('RESTRICT');
    t.unique(['performance_review_id', 'workflow_version'], 'uq_perf_review_workflow');
    t.unique(['company_id', 'idempotency_key'], 'uq_perf_review_event_key');
  });
}
export async function down(knex) {
  for (const table of [
    'performance_review_state_events',
    'performance_review_acknowledgments',
    'performance_competency_assessment_ratings',
    'performance_goal_assessment_ratings',
    'performance_assessment_versions',
    'performance_assessments',
    'performance_goal_versions',
    'performance_goals',
    'performance_review_versions',
    'performance_reviews',
    'performance_cycle_state_events',
    'performance_cycles',
    'performance_template_competencies',
    'performance_review_template_versions',
    'performance_review_templates',
    'performance_competency_versions',
    'performance_competencies',
    'performance_rating_scale_levels',
    'performance_rating_scales',
  ])
    await knex.schema.dropTableIfExists(table);
}
