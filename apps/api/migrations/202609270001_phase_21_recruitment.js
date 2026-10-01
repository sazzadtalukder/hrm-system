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
const versioned = (t) => {
  t.integer('version').unsigned().notNullable().defaultTo(1);
  audit(t);
};
const state = (t, parent, states, name) => {
  owned(t, name);
  t.bigInteger(parent).unsigned().notNullable();
  t.string('from_status', 40).nullable();
  t.enum('to_status', states).notNullable();
  t.integer('workflow_version').unsigned().notNullable();
  t.string('reason', 500).notNullable();
  t.string('idempotency_key', 100).notNullable();
  audit(t);
  t.unique(['company_id', 'idempotency_key'], `uq_${name}_idempotency`);
};
export async function up(knex) {
  await knex.schema.createTable('manpower_plans', (t) => {
    owned(t, 'manpower_plans');
    t.string('code', 50).notNullable();
    t.string('name', 200).notNullable();
    t.date('period_start').notNullable();
    t.date('period_end').notNullable();
    t.enum('status', ['draft', 'submitted', 'approved', 'rejected', 'closed', 'cancelled'])
      .notNullable()
      .defaultTo('draft');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).nullable();
    versioned(t);
    t.unique(['company_id', 'code'], 'uq_manpower_plan_code');
    t.unique(['company_id', 'idempotency_key'], 'uq_manpower_plan_idempotency');
    t.check('period_end >= period_start');
  });
  await knex.schema.createTable('manpower_plan_versions', (t) => {
    owned(t, 'manpower_plan_versions');
    t.bigInteger('manpower_plan_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.text('notes').nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    t.string('idempotency_key', 100).nullable();
    audit(t);
    t.foreign(['company_id', 'manpower_plan_id'])
      .references(['company_id', 'id'])
      .inTable('manpower_plans');
    t.unique(['manpower_plan_id', 'version_number'], 'uq_manpower_plan_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_manpower_plan_version_idem');
  });
  await knex.schema.createTable('manpower_plan_lines', (t) => {
    owned(t, 'manpower_plan_lines');
    t.bigInteger('manpower_plan_id').unsigned().notNullable();
    t.bigInteger('branch_id').unsigned().nullable();
    t.bigInteger('department_id').unsigned().nullable();
    t.bigInteger('designation_id').unsigned().nullable();
    t.integer('requested_headcount').unsigned().notNullable();
    t.integer('approved_headcount').unsigned().nullable();
    t.integer('filled_headcount').unsigned().notNullable().defaultTo(0);
    t.string('reason', 500).notNullable();
    versioned(t);
    t.foreign(['company_id', 'manpower_plan_id'])
      .references(['company_id', 'id'])
      .inTable('manpower_plans');
    t.check('requested_headcount > 0');
  });
  await knex.schema.createTable('job_requisitions', (t) => {
    owned(t, 'job_requisitions');
    t.string('code', 50).notNullable();
    t.bigInteger('manpower_plan_line_id').unsigned().nullable();
    t.string('title', 200).notNullable();
    t.bigInteger('branch_id').unsigned().notNullable();
    t.bigInteger('department_id').unsigned().notNullable();
    t.bigInteger('designation_id').unsigned().notNullable();
    t.bigInteger('hiring_manager_user_id').unsigned().nullable();
    t.integer('requested_headcount').unsigned().notNullable();
    t.integer('filled_headcount').unsigned().notNullable().defaultTo(0);
    t.enum('status', [
      'draft',
      'submitted',
      'approved',
      'rejected',
      'open',
      'filled',
      'closed',
      'cancelled',
    ])
      .notNullable()
      .defaultTo('draft');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).nullable();
    versioned(t);
    t.unique(['company_id', 'code'], 'uq_job_requisition_code');
    t.unique(['company_id', 'idempotency_key'], 'uq_job_requisition_idem');
    t.check('requested_headcount > 0');
  });
  await knex.schema.createTable('job_requisition_versions', (t) => {
    owned(t, 'job_requisition_versions');
    t.bigInteger('job_requisition_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.text('description').nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    audit(t);
    t.foreign(['company_id', 'job_requisition_id'])
      .references(['company_id', 'id'])
      .inTable('job_requisitions');
    t.unique(['job_requisition_id', 'version_number'], 'uq_job_requisition_version');
  });
  await knex.schema.createTable('job_postings', (t) => {
    owned(t, 'job_postings');
    t.bigInteger('job_requisition_id').unsigned().notNullable();
    t.string('code', 50).notNullable();
    t.string('title', 200).notNullable();
    t.enum('status', ['draft', 'published', 'closed', 'withdrawn'])
      .notNullable()
      .defaultTo('draft');
    t.date('published_on').nullable();
    t.date('closes_on').nullable();
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).nullable();
    versioned(t);
    t.foreign(['company_id', 'job_requisition_id'])
      .references(['company_id', 'id'])
      .inTable('job_requisitions');
    t.unique(['company_id', 'code'], 'uq_job_posting_code');
    t.unique(['company_id', 'idempotency_key'], 'uq_job_posting_idem');
  });
  await knex.schema.createTable('job_posting_versions', (t) => {
    owned(t, 'job_posting_versions');
    t.bigInteger('job_posting_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.text('description').nullable();
    t.string('channel', 100).nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    audit(t);
    t.foreign(['company_id', 'job_posting_id'])
      .references(['company_id', 'id'])
      .inTable('job_postings');
    t.unique(['job_posting_id', 'version_number'], 'uq_job_posting_version');
  });
  await knex.schema.createTable('recruitment_candidates', (t) => {
    owned(t, 'recruitment_candidates');
    t.string('candidate_number', 50).notNullable();
    t.enum('status', ['active', 'archived']).notNullable().defaultTo('active');
    t.string('normalized_email', 320).nullable();
    t.string('normalized_phone', 50).nullable();
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).nullable();
    audit(t);
    t.unique(['company_id', 'candidate_number'], 'uq_candidate_number');
    t.unique(['company_id', 'idempotency_key'], 'uq_candidate_idem');
  });
  await knex.schema.createTable('recruitment_candidate_versions', (t) => {
    owned(t, 'recruitment_candidate_versions');
    t.bigInteger('candidate_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('first_name', 100).notNullable();
    t.string('last_name', 100).notNullable();
    t.string('email', 320).nullable();
    t.string('phone', 50).nullable();
    t.text('profile_summary').nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    audit(t);
    t.foreign(['company_id', 'candidate_id'])
      .references(['company_id', 'id'])
      .inTable('recruitment_candidates');
    t.unique(['candidate_id', 'version_number'], 'uq_candidate_version');
  });
  await knex.schema.createTable('candidate_applications', (t) => {
    owned(t, 'candidate_applications');
    t.bigInteger('candidate_id').unsigned().notNullable();
    t.bigInteger('job_requisition_id').unsigned().notNullable();
    t.bigInteger('job_posting_id').unsigned().nullable();
    t.enum('status', [
      'applied',
      'screening',
      'shortlisted',
      'evaluation',
      'selected',
      'offered',
      'accepted',
      'converted',
      'rejected',
      'withdrawn',
    ])
      .notNullable()
      .defaultTo('applied');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.boolean('active_slot').nullable().defaultTo(true);
    t.string('idempotency_key', 100).notNullable();
    versioned(t);
    t.foreign(['company_id', 'candidate_id'])
      .references(['company_id', 'id'])
      .inTable('recruitment_candidates');
    t.foreign(['company_id', 'job_requisition_id'])
      .references(['company_id', 'id'])
      .inTable('job_requisitions');
    t.foreign(['company_id', 'job_posting_id'])
      .references(['company_id', 'id'])
      .inTable('job_postings');
    t.unique(
      ['candidate_id', 'job_requisition_id', 'active_slot'],
      'uq_candidate_application_active',
    );
    t.unique(['company_id', 'idempotency_key'], 'uq_candidate_application_idem');
  });
  await knex.schema.createTable('application_screenings', (t) => {
    owned(t, 'application_screenings');
    t.bigInteger('candidate_application_id').unsigned().notNullable();
    t.enum('outcome', ['shortlisted', 'rejected', 'return_to_screening']).notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'candidate_application_id'], 'fk_app_screening_app')
      .references(['company_id', 'id'])
      .inTable('candidate_applications');
    t.unique(['company_id', 'idempotency_key'], 'uq_application_screening_idem');
  });
  await knex.schema.createTable('recruitment_interviews', (t) => {
    owned(t, 'recruitment_interviews');
    t.bigInteger('candidate_application_id').unsigned().notNullable();
    t.datetime('scheduled_at').notNullable();
    t.integer('duration_minutes').unsigned().notNullable();
    t.enum('status', ['scheduled', 'completed', 'cancelled', 'no_show'])
      .notNullable()
      .defaultTo('scheduled');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).notNullable();
    versioned(t);
    t.foreign(['company_id', 'candidate_application_id'], 'fk_recruitment_interview_app')
      .references(['company_id', 'id'])
      .inTable('candidate_applications');
    t.unique(['company_id', 'idempotency_key'], 'uq_recruitment_interview_idem');
  });
  await knex.schema.createTable('interview_participants', (t) => {
    owned(t, 'interview_participants');
    t.bigInteger('recruitment_interview_id').unsigned().notNullable();
    t.bigInteger('user_id').unsigned().notNullable();
    t.enum('role', ['interviewer', 'observer']).notNullable().defaultTo('interviewer');
    audit(t);
    t.foreign(['company_id', 'recruitment_interview_id'], 'fk_interview_participant_interview')
      .references(['company_id', 'id'])
      .inTable('recruitment_interviews');
    t.unique(['recruitment_interview_id', 'user_id'], 'uq_interview_participant');
  });
  await knex.schema.createTable('interview_feedback', (t) => {
    owned(t, 'interview_feedback');
    t.bigInteger('recruitment_interview_id').unsigned().notNullable();
    t.bigInteger('interviewer_user_id').unsigned().notNullable();
    t.enum('recommendation', ['recommend', 'do_not_recommend', 'neutral']).notNullable();
    t.text('narrative').nullable();
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'recruitment_interview_id'], 'fk_interview_feedback_interview')
      .references(['company_id', 'id'])
      .inTable('recruitment_interviews');
    t.unique(['recruitment_interview_id', 'interviewer_user_id'], 'uq_interview_feedback');
  });
  await knex.schema.createTable('recruitment_assessments', (t) => {
    owned(t, 'recruitment_assessments');
    t.bigInteger('candidate_application_id').unsigned().notNullable();
    t.string('assessment_type', 100).notNullable();
    t.enum('status', ['assigned', 'completed', 'cancelled']).notNullable().defaultTo('assigned');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.string('idempotency_key', 100).notNullable();
    versioned(t);
    t.foreign(['company_id', 'candidate_application_id'], 'fk_recruitment_assessment_app')
      .references(['company_id', 'id'])
      .inTable('candidate_applications');
    t.unique(['company_id', 'idempotency_key'], 'uq_recruitment_assessment_idem');
  });
  await knex.schema.createTable('assessment_results', (t) => {
    owned(t, 'assessment_results');
    t.bigInteger('recruitment_assessment_id').unsigned().notNullable();
    t.enum('outcome', ['pass', 'fail', 'not_scored']).notNullable();
    t.decimal('score', 8, 2).nullable();
    t.text('notes').nullable();
    audit(t);
    t.foreign(['company_id', 'recruitment_assessment_id'], 'fk_assessment_result_assessment')
      .references(['company_id', 'id'])
      .inTable('recruitment_assessments');
    t.unique(['recruitment_assessment_id'], 'uq_assessment_result');
  });
  await knex.schema.createTable('recruitment_offers', (t) => {
    owned(t, 'recruitment_offers');
    t.bigInteger('candidate_application_id').unsigned().notNullable();
    t.string('offer_number', 50).notNullable();
    t.enum('status', [
      'draft',
      'submitted',
      'approved',
      'rejected',
      'issued',
      'accepted',
      'declined',
      'expired',
      'withdrawn',
      'converted',
    ])
      .notNullable()
      .defaultTo('draft');
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.boolean('active_slot').nullable().defaultTo(true);
    t.string('idempotency_key', 100).notNullable();
    versioned(t);
    t.foreign(['company_id', 'candidate_application_id'], 'fk_recruitment_offer_app')
      .references(['company_id', 'id'])
      .inTable('candidate_applications');
    t.unique(['company_id', 'offer_number'], 'uq_recruitment_offer_number');
    t.unique(['candidate_application_id', 'active_slot'], 'uq_recruitment_offer_active');
    t.unique(['company_id', 'idempotency_key'], 'uq_recruitment_offer_idem');
  });
  await knex.schema.createTable('recruitment_offer_versions', (t) => {
    owned(t, 'recruitment_offer_versions');
    t.bigInteger('recruitment_offer_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('employment_type', 30).notNullable();
    t.date('proposed_joining_date').notNullable();
    t.decimal('monthly_amount', 19, 2).nullable();
    t.string('currency_code', 3).notNullable();
    t.bigInteger('branch_id').unsigned().notNullable();
    t.bigInteger('department_id').unsigned().notNullable();
    t.bigInteger('designation_id').unsigned().notNullable();
    t.bigInteger('manager_employment_id').unsigned().nullable();
    t.text('terms').nullable();
    t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
    audit(t);
    t.foreign(['company_id', 'recruitment_offer_id'], 'fk_recruitment_offer_version_offer')
      .references(['company_id', 'id'])
      .inTable('recruitment_offers');
    t.unique(['recruitment_offer_id', 'version_number'], 'uq_recruitment_offer_version');
  });
  await knex.schema.createTable('recruitment_hire_conversions', (t) => {
    owned(t, 'recruitment_hire_conversions');
    t.bigInteger('recruitment_offer_id').unsigned().notNullable();
    t.bigInteger('employee_id').unsigned().nullable();
    t.bigInteger('employment_id').unsigned().nullable();
    t.enum('status', ['pending', 'completed', 'failed']).notNullable().defaultTo('pending');
    t.string('failure_code', 100).nullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'recruitment_offer_id'], 'fk_recruitment_conversion_offer')
      .references(['company_id', 'id'])
      .inTable('recruitment_offers');
    t.unique(['recruitment_offer_id'], 'uq_recruitment_offer_conversion');
    t.unique(['company_id', 'idempotency_key'], 'uq_recruitment_conversion_idem');
  });
  await knex.schema.createTable('manpower_plans_state_events', (t) => {
    state(
      t,
      'manpower_plan_id',
      ['draft', 'submitted', 'approved', 'rejected', 'closed', 'cancelled'],
      'manpower_plan_states',
    );
    t.foreign(['company_id', 'manpower_plan_id'], 'fk_manpower_plan_state_plan')
      .references(['company_id', 'id'])
      .inTable('manpower_plans');
  });
  await knex.schema.createTable('job_requisitions_state_events', (t) => {
    state(
      t,
      'job_requisition_id',
      ['draft', 'submitted', 'approved', 'rejected', 'open', 'filled', 'closed', 'cancelled'],
      'job_requisition_states',
    );
    t.foreign(['company_id', 'job_requisition_id'], 'fk_requisition_state_requisition')
      .references(['company_id', 'id'])
      .inTable('job_requisitions');
  });
  await knex.schema.createTable('job_postings_state_events', (t) => {
    state(t, 'job_posting_id', ['draft', 'published', 'closed', 'withdrawn'], 'job_posting_states');
    t.foreign(['company_id', 'job_posting_id'], 'fk_posting_state_posting')
      .references(['company_id', 'id'])
      .inTable('job_postings');
  });
  await knex.schema.createTable('recruitment_offers_state_events', (t) => {
    state(
      t,
      'recruitment_offer_id',
      [
        'draft',
        'submitted',
        'approved',
        'rejected',
        'issued',
        'accepted',
        'declined',
        'expired',
        'withdrawn',
        'converted',
      ],
      'recruitment_offer_states',
    );
    t.foreign(['company_id', 'recruitment_offer_id'], 'fk_offer_state_offer')
      .references(['company_id', 'id'])
      .inTable('recruitment_offers');
  });
}
export async function down(knex) {
  for (const table of [
    'recruitment_offers_state_events',
    'job_postings_state_events',
    'job_requisitions_state_events',
    'manpower_plans_state_events',
    'recruitment_hire_conversions',
    'recruitment_offer_versions',
    'recruitment_offers',
    'assessment_results',
    'recruitment_assessments',
    'interview_feedback',
    'interview_participants',
    'recruitment_interviews',
    'application_screenings',
    'candidate_applications',
    'recruitment_candidate_versions',
    'recruitment_candidates',
    'job_posting_versions',
    'job_postings',
    'job_requisition_versions',
    'job_requisitions',
    'manpower_plan_lines',
    'manpower_plan_versions',
    'manpower_plans',
  ])
    await knex.schema.dropTableIfExists(table);
}
