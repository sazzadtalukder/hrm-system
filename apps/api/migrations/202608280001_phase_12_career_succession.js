const audit = (t) => {
  t.bigInteger('created_by').unsigned();
  t.bigInteger('updated_by').unsigned();
  t.timestamp('created_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
  t.timestamp('updated_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
};
const identity = (t, name) => {
  t.bigIncrements('id');
  t.bigInteger('company_id').unsigned().notNullable();
  t.unique(['company_id', 'id'], { indexName: `uq_${name}_company_id` });
  t.foreign('company_id').references('companies.id').onDelete('RESTRICT');
};
const history = (t) => {
  t.enum('history_status', ['current', 'superseded']).notNullable().defaultTo('current');
  t.bigInteger('supersedes_version_id').unsigned();
  t.string('reason', 500).notNullable();
  audit(t);
};
const event = (t) => {
  t.string('from_state', 40);
  t.string('to_state', 40).notNullable();
  t.integer('workflow_version').unsigned().notNullable();
  t.string('reason', 500).notNullable();
  t.bigInteger('acting_user_id').unsigned().notNullable();
  t.string('idempotency_key', 100);
  t.string('request_id', 64);
  t.string('correlation_id', 128);
  t.timestamp('occurred_at').notNullable().defaultTo(t.client.raw('CURRENT_TIMESTAMP'));
};
export async function up(knex) {
  await knex.schema.createTable('career_paths', (t) => {
    identity(t, 'career_paths');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_career_path_code');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_path_create_key');
  });
  await knex.schema.createTable('career_path_versions', (t) => {
    identity(t, 'career_path_versions');
    t.bigInteger('career_path_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.date('effective_start').notNullable();
    t.date('effective_end');
    t.string('idempotency_key', 100);
    t.text('description').notNullable();
    history(t);
    t.foreign(['company_id', 'career_path_id'], 'fk_career_path_version')
      .references(['company_id', 'id'])
      .inTable('career_paths')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_career_path_supersedes')
      .references('career_path_versions.id')
      .onDelete('RESTRICT');
    t.unique(['career_path_id', 'version_number'], 'uq_career_path_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_path_version_key');
    t.check('effective_end is null or effective_end >= effective_start');
  });
  await knex.schema.createTable('career_path_steps', (t) => {
    identity(t, 'career_path_steps');
    t.bigInteger('career_path_version_id').unsigned().notNullable();
    t.integer('step_number').unsigned().notNullable();
    t.bigInteger('designation_id').unsigned().notNullable();
    t.integer('minimum_time_months').unsigned();
    audit(t);
    t.foreign(['company_id', 'career_path_version_id'], 'fk_career_step_path')
      .references(['company_id', 'id'])
      .inTable('career_path_versions')
      .onDelete('RESTRICT');
    t.foreign(['designation_id', 'company_id'], 'fk_career_step_designation')
      .references(['id', 'company_id'])
      .inTable('designations')
      .onDelete('RESTRICT');
    t.unique(['career_path_version_id', 'step_number'], 'uq_career_step_order');
    t.unique(['career_path_version_id', 'designation_id'], 'uq_career_step_designation');
  });
  await knex.schema.createTable('career_path_step_competencies', (t) => {
    identity(t, 'career_step_competencies');
    t.bigInteger('career_path_step_id').unsigned().notNullable();
    t.bigInteger('performance_competency_version_id').unsigned().notNullable();
    t.string('required_proficiency', 50);
    audit(t);
    t.foreign(['company_id', 'career_path_step_id'], 'fk_career_step_comp_step')
      .references(['company_id', 'id'])
      .inTable('career_path_steps')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_competency_version_id'], 'fk_career_step_comp_perf')
      .references(['company_id', 'id'])
      .inTable('performance_competency_versions')
      .onDelete('RESTRICT');
    t.unique(['career_path_step_id', 'performance_competency_version_id'], 'uq_career_step_comp');
  });
  await knex.schema.createTable('career_plans', (t) => {
    identity(t, 'career_plans');
    t.bigInteger('employment_id').unsigned().notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.enum('status', [
      'draft',
      'returned',
      'submitted',
      'active',
      'completed',
      'withdrawn',
      'cancelled',
    ])
      .notNullable()
      .defaultTo('draft');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.boolean('active_slot').nullable().defaultTo(true);
    audit(t);
    t.foreign(['employment_id', 'company_id'], 'fk_career_plan_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'employment_id', 'active_slot'], 'uq_career_plan_active');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_plan_create_key');
    t.index(['company_id', 'status', 'employment_id'], 'ix_career_plan_scope');
  });
  await knex.schema.createTable('career_plan_versions', (t) => {
    identity(t, 'career_plan_versions');
    t.bigInteger('career_plan_id').unsigned().notNullable();
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
    t.bigInteger('career_path_version_id').unsigned();
    t.bigInteger('target_designation_id').unsigned();
    t.string('career_direction', 500);
    t.text('employee_narrative');
    t.date('plan_start').notNullable();
    t.date('plan_end').notNullable();
    t.date('anchor_date');
    t.string('idempotency_key', 100);
    history(t);
    t.foreign(['company_id', 'career_plan_id'], 'fk_career_plan_version')
      .references(['company_id', 'id'])
      .inTable('career_plans')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'career_path_version_id'], 'fk_career_plan_path')
      .references(['company_id', 'id'])
      .inTable('career_path_versions')
      .onDelete('RESTRICT');
    t.foreign(['target_designation_id', 'company_id'], 'fk_career_plan_target')
      .references(['id', 'company_id'])
      .inTable('designations')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_career_plan_supersedes')
      .references('career_plan_versions.id')
      .onDelete('RESTRICT');
    t.unique(['career_plan_id', 'version_number'], 'uq_career_plan_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_plan_version_key');
    t.check('plan_end >= plan_start');
    t.index(
      ['company_id', 'manager_user_id_snapshot', 'branch_id_snapshot', 'department_id_snapshot'],
      'ix_career_plan_snapshot_scope',
    );
  });
  await knex.schema.createTable('career_plan_goals', (t) => {
    identity(t, 'career_plan_goals');
    t.bigInteger('career_plan_id').unsigned().notNullable();
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'career_plan_id'], 'fk_career_goal_plan')
      .references(['company_id', 'id'])
      .inTable('career_plans')
      .onDelete('RESTRICT');
  });
  await knex.schema.createTable('career_plan_goal_versions', (t) => {
    identity(t, 'career_goal_versions');
    t.bigInteger('career_plan_goal_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('title', 200).notNullable();
    t.text('description').notNullable();
    t.date('target_date').notNullable();
    t.enum('status', ['planned', 'in_progress', 'completed', 'cancelled'])
      .notNullable()
      .defaultTo('planned');
    t.string('progress_comment', 1000);
    t.string('idempotency_key', 100);
    history(t);
    t.foreign(['company_id', 'career_plan_goal_id'], 'fk_career_goal_version')
      .references(['company_id', 'id'])
      .inTable('career_plan_goals')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_career_goal_supersedes')
      .references('career_plan_goal_versions.id')
      .onDelete('RESTRICT');
    t.unique(['career_plan_goal_id', 'version_number'], 'uq_career_goal_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_goal_progress_key');
  });
  await knex.schema.createTable('career_plan_goal_competencies', (t) => {
    identity(t, 'career_goal_competencies');
    t.bigInteger('career_plan_goal_version_id').unsigned().notNullable();
    t.bigInteger('performance_competency_version_id').unsigned().notNullable();
    audit(t);
    t.foreign(['company_id', 'career_plan_goal_version_id'], 'fk_career_goal_comp_goal')
      .references(['company_id', 'id'])
      .inTable('career_plan_goal_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_competency_version_id'], 'fk_career_goal_comp_perf')
      .references(['company_id', 'id'])
      .inTable('performance_competency_versions')
      .onDelete('RESTRICT');
    t.unique(
      ['career_plan_goal_version_id', 'performance_competency_version_id'],
      'uq_career_goal_comp',
    );
  });
  await knex.schema.createTable('career_development_actions', (t) => {
    identity(t, 'career_actions');
    t.bigInteger('career_plan_id').unsigned().notNullable();
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'career_plan_id'], 'fk_career_action_plan')
      .references(['company_id', 'id'])
      .inTable('career_plans')
      .onDelete('RESTRICT');
  });
  await knex.schema.createTable('career_development_action_versions', (t) => {
    identity(t, 'career_action_versions');
    t.bigInteger('career_development_action_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.enum('action_type', [
      'training',
      'coaching',
      'project',
      'self_development',
      'other',
    ]).notNullable();
    t.text('description').notNullable();
    t.date('target_date').notNullable();
    t.enum('responsible_party', ['employee', 'manager', 'hr']).notNullable();
    t.enum('status', ['planned', 'in_progress', 'completed', 'cancelled'])
      .notNullable()
      .defaultTo('planned');
    t.bigInteger('training_course_version_id').unsigned();
    t.date('completion_date');
    t.string('completion_comment', 1000);
    t.string('idempotency_key', 100);
    history(t);
    t.foreign(['company_id', 'career_development_action_id'], 'fk_career_action_version')
      .references(['company_id', 'id'])
      .inTable('career_development_actions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'training_course_version_id'], 'fk_career_action_course')
      .references(['company_id', 'id'])
      .inTable('training_course_versions')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_career_action_supersedes')
      .references('career_development_action_versions.id')
      .onDelete('RESTRICT');
    t.unique(['career_development_action_id', 'version_number'], 'uq_career_action_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_action_progress_key');
  });
  await knex.schema.createTable('career_development_action_evidence_references', (t) => {
    identity(t, 'career_action_evidence');
    t.bigInteger('career_development_action_version_id').unsigned().notNullable();
    t.enum('reference_type', ['training_completion_version', 'external_reference']).notNullable();
    t.bigInteger('training_completion_version_id').unsigned();
    t.string('external_reference', 300);
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'career_development_action_version_id'], 'fk_career_evidence_action')
      .references(['company_id', 'id'])
      .inTable('career_development_action_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'training_completion_version_id'], 'fk_career_evidence_training')
      .references(['company_id', 'id'])
      .inTable('training_completion_versions')
      .onDelete('RESTRICT');
    t.check(
      "(reference_type='training_completion_version' and training_completion_version_id is not null and external_reference is null) or (reference_type='external_reference' and training_completion_version_id is null and external_reference is not null)",
    );
    t.unique(['company_id', 'idempotency_key'], 'uq_career_evidence_key');
  });
  await knex.schema.createTable('career_plan_state_events', (t) => {
    identity(t, 'career_plan_events');
    t.bigInteger('career_plan_id').unsigned().notNullable();
    event(t);
    t.foreign(['company_id', 'career_plan_id'], 'fk_career_event_plan')
      .references(['company_id', 'id'])
      .inTable('career_plans')
      .onDelete('RESTRICT');
    t.unique(['career_plan_id', 'workflow_version'], 'uq_career_plan_workflow');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_plan_event_key');
  });
  await knex.schema.createTable('career_plan_decisions', (t) => {
    identity(t, 'career_decisions');
    t.bigInteger('career_plan_id').unsigned().notNullable();
    t.enum('decision', ['approved', 'returned']).notNullable();
    t.bigInteger('actor_user_id').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'career_plan_id'], 'fk_career_decision_plan')
      .references(['company_id', 'id'])
      .inTable('career_plans')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_decision_key');
  });
  await knex.schema.createTable('career_plan_manager_reassignments', (t) => {
    identity(t, 'career_manager_reassign');
    t.bigInteger('career_plan_id').unsigned().notNullable();
    t.bigInteger('from_manager_employment_id').unsigned();
    t.bigInteger('to_manager_employment_id').unsigned().notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'career_plan_id'], 'fk_career_reassign_plan')
      .references(['company_id', 'id'])
      .inTable('career_plans')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_career_reassign_key');
  });
  await knex.schema.createTable('critical_positions', (t) => {
    identity(t, 'critical_positions');
    t.string('code', 50).notNullable();
    t.string('name', 150).notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.enum('record_status', ['active', 'inactive']).notNullable().defaultTo('active');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.unique(['company_id', 'code'], 'uq_critical_position_code');
    t.unique(['company_id', 'idempotency_key'], 'uq_critical_position_create_key');
  });
  await knex.schema.createTable('critical_position_versions', (t) => {
    identity(t, 'critical_position_versions');
    t.bigInteger('critical_position_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.bigInteger('designation_id').unsigned().notNullable();
    t.bigInteger('branch_id').unsigned();
    t.bigInteger('department_id').unsigned();
    t.enum('criticality', ['high', 'critical']).notNullable();
    t.text('description').notNullable();
    t.date('effective_start').notNullable();
    t.date('effective_end');
    t.string('idempotency_key', 100);
    history(t);
    t.foreign(['company_id', 'critical_position_id'], 'fk_critical_position_version')
      .references(['company_id', 'id'])
      .inTable('critical_positions')
      .onDelete('RESTRICT');
    t.foreign(['designation_id', 'company_id'], 'fk_critical_position_designation')
      .references(['id', 'company_id'])
      .inTable('designations')
      .onDelete('RESTRICT');
    t.foreign(['branch_id', 'company_id'], 'fk_critical_position_branch')
      .references(['id', 'company_id'])
      .inTable('branches')
      .onDelete('RESTRICT');
    t.foreign(['department_id', 'company_id'], 'fk_critical_position_department')
      .references(['id', 'company_id'])
      .inTable('departments')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_critical_position_supersedes')
      .references('critical_position_versions.id')
      .onDelete('RESTRICT');
    t.unique(['critical_position_id', 'version_number'], 'uq_critical_position_version');
    t.unique(['company_id', 'idempotency_key'], 'uq_critical_position_version_key');
    t.check('effective_end is null or effective_end >= effective_start');
  });
  await knex.schema.createTable('critical_position_competencies', (t) => {
    identity(t, 'critical_position_comps');
    t.bigInteger('critical_position_version_id').unsigned().notNullable();
    t.bigInteger('performance_competency_version_id').unsigned().notNullable();
    t.string('required_proficiency', 50);
    audit(t);
    t.foreign(['company_id', 'critical_position_version_id'], 'fk_critical_comp_position')
      .references(['company_id', 'id'])
      .inTable('critical_position_versions')
      .onDelete('RESTRICT');
    t.foreign(['company_id', 'performance_competency_version_id'], 'fk_critical_comp_perf')
      .references(['company_id', 'id'])
      .inTable('performance_competency_versions')
      .onDelete('RESTRICT');
    t.unique(
      ['critical_position_version_id', 'performance_competency_version_id'],
      'uq_critical_position_comp',
    );
  });
  await knex.schema.createTable('succession_plans', (t) => {
    identity(t, 'succession_plans');
    t.bigInteger('critical_position_version_id').unsigned().notNullable();
    t.date('anchor_date').notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.enum('status', ['draft', 'active', 'closed', 'cancelled']).notNullable().defaultTo('draft');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    audit(t);
    t.foreign(['company_id', 'critical_position_version_id'], 'fk_succession_plan_position')
      .references(['company_id', 'id'])
      .inTable('critical_position_versions')
      .onDelete('RESTRICT');
    t.index(['company_id', 'status'], 'ix_succession_plan_status');
    t.unique(['company_id', 'idempotency_key'], 'uq_succession_plan_create_key');
  });
  await knex.schema.createTable('succession_plan_versions', (t) => {
    identity(t, 'succession_plan_versions');
    t.bigInteger('succession_plan_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.string('critical_position_code_snapshot', 50).notNullable();
    t.string('critical_position_name_snapshot', 150).notNullable();
    t.bigInteger('designation_id_snapshot').unsigned().notNullable();
    t.bigInteger('branch_id_snapshot').unsigned();
    t.bigInteger('department_id_snapshot').unsigned();
    t.bigInteger('incumbent_employment_id_snapshot').unsigned();
    t.string('incumbent_employee_code_snapshot', 50);
    t.string('incumbent_employee_name_snapshot', 200);
    t.date('planning_horizon_date').notNullable();
    t.text('risk_rationale');
    history(t);
    t.foreign(['company_id', 'succession_plan_id'], 'fk_succession_plan_version')
      .references(['company_id', 'id'])
      .inTable('succession_plans')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_succession_plan_supersedes')
      .references('succession_plan_versions.id')
      .onDelete('RESTRICT');
    t.unique(['succession_plan_id', 'version_number'], 'uq_succession_plan_version');
  });
  await knex.schema.createTable('succession_plan_state_events', (t) => {
    identity(t, 'succession_plan_events');
    t.bigInteger('succession_plan_id').unsigned().notNullable();
    event(t);
    t.foreign(['company_id', 'succession_plan_id'], 'fk_succession_event_plan')
      .references(['company_id', 'id'])
      .inTable('succession_plans')
      .onDelete('RESTRICT');
    t.unique(['succession_plan_id', 'workflow_version'], 'uq_succession_plan_workflow');
    t.unique(['company_id', 'idempotency_key'], 'uq_succession_plan_event_key');
  });
  await knex.schema.createTable('successor_nominations', (t) => {
    identity(t, 'successor_nominations');
    t.bigInteger('succession_plan_id').unsigned().notNullable();
    t.bigInteger('employment_id').unsigned().notNullable();
    t.string('idempotency_key', 100).notNullable();
    t.enum('source', ['manager', 'hr_talent']).notNullable();
    t.enum('status', [
      'draft',
      'submitted',
      'manager_recommended',
      'hr_confirmed',
      'manager_rejected',
      'hr_rejected',
      'withdrawn',
      'removed',
    ])
      .notNullable()
      .defaultTo('draft');
    t.integer('current_version_number').unsigned().notNullable().defaultTo(1);
    t.integer('workflow_version').unsigned().notNullable().defaultTo(1);
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.boolean('active_slot').nullable().defaultTo(true);
    audit(t);
    t.foreign(['company_id', 'succession_plan_id'], 'fk_nomination_plan')
      .references(['company_id', 'id'])
      .inTable('succession_plans')
      .onDelete('RESTRICT');
    t.foreign(['employment_id', 'company_id'], 'fk_nomination_employment')
      .references(['id', 'company_id'])
      .inTable('employments')
      .onDelete('RESTRICT');
    t.unique(
      ['company_id', 'succession_plan_id', 'employment_id', 'active_slot'],
      'uq_nomination_active',
    );
    t.unique(['company_id', 'idempotency_key'], 'uq_nomination_create_key');
    t.index(['company_id', 'status', 'employment_id'], 'ix_nomination_scope');
  });
  await knex.schema.createTable('successor_nomination_versions', (t) => {
    identity(t, 'successor_nomination_versions');
    t.bigInteger('successor_nomination_id').unsigned().notNullable();
    t.integer('version_number').unsigned().notNullable();
    t.bigInteger('employee_id_snapshot').unsigned().notNullable();
    t.string('employee_code_snapshot', 50).notNullable();
    t.string('employee_name_snapshot', 200).notNullable();
    t.string('employment_status_snapshot', 30).notNullable();
    t.bigInteger('branch_id_snapshot').unsigned();
    t.bigInteger('department_id_snapshot').unsigned();
    t.bigInteger('designation_id_snapshot').unsigned();
    t.bigInteger('manager_employment_id_snapshot').unsigned();
    t.bigInteger('manager_user_id_snapshot').unsigned();
    t.enum('manager_readiness_recommendation', [
      'ready_now',
      'ready_within_1_year',
      'ready_within_2_years',
      'development_required',
    ]).notNullable();
    t.enum('confirmed_readiness', [
      'ready_now',
      'ready_within_1_year',
      'ready_within_2_years',
      'development_required',
    ]);
    t.date('readiness_target_date');
    t.text('strengths');
    t.text('development_needs');
    t.text('nomination_rationale');
    t.text('competency_gap_narrative');
    t.date('anchor_date').notNullable();
    history(t);
    t.foreign(['company_id', 'successor_nomination_id'], 'fk_nomination_version')
      .references(['company_id', 'id'])
      .inTable('successor_nominations')
      .onDelete('RESTRICT');
    t.foreign('supersedes_version_id', 'fk_nomination_supersedes')
      .references('successor_nomination_versions.id')
      .onDelete('RESTRICT');
    t.unique(['successor_nomination_id', 'version_number'], 'uq_nomination_version');
    t.index(
      ['company_id', 'manager_user_id_snapshot', 'branch_id_snapshot', 'department_id_snapshot'],
      'ix_nomination_snapshot_scope',
    );
  });
  await knex.schema.createTable('successor_nomination_state_events', (t) => {
    identity(t, 'nomination_events');
    t.bigInteger('successor_nomination_id').unsigned().notNullable();
    event(t);
    t.foreign(['company_id', 'successor_nomination_id'], 'fk_nomination_event')
      .references(['company_id', 'id'])
      .inTable('successor_nominations')
      .onDelete('RESTRICT');
    t.unique(['successor_nomination_id', 'workflow_version'], 'uq_nomination_workflow');
    t.unique(['company_id', 'idempotency_key'], 'uq_nomination_event_key');
  });
  await knex.schema.createTable('successor_nomination_decisions', (t) => {
    identity(t, 'nomination_decisions');
    t.bigInteger('successor_nomination_id').unsigned().notNullable();
    t.enum('decision', [
      'recommended',
      'manager_rejected',
      'confirmed',
      'hr_rejected',
      'removed',
    ]).notNullable();
    t.bigInteger('actor_user_id').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'successor_nomination_id'], 'fk_nomination_decision')
      .references(['company_id', 'id'])
      .inTable('successor_nominations')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_nomination_decision_key');
  });
  await knex.schema.createTable('successor_nomination_readiness_events', (t) => {
    identity(t, 'nomination_readiness');
    t.bigInteger('successor_nomination_id').unsigned().notNullable();
    t.enum('authority', ['manager', 'hr_talent']).notNullable();
    t.enum('readiness', [
      'ready_now',
      'ready_within_1_year',
      'ready_within_2_years',
      'development_required',
    ]).notNullable();
    t.string('reason', 500).notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'successor_nomination_id'], 'fk_nomination_readiness')
      .references(['company_id', 'id'])
      .inTable('successor_nominations')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_nomination_readiness_key');
  });
  await knex.schema.createTable('successor_nomination_manager_reassignments', (t) => {
    identity(t, 'nomination_reassign');
    t.bigInteger('successor_nomination_id').unsigned().notNullable();
    t.bigInteger('from_manager_employment_id').unsigned();
    t.bigInteger('to_manager_employment_id').unsigned().notNullable();
    t.bigInteger('acting_user_id').unsigned().notNullable();
    t.string('reason', 500).notNullable();
    t.string('idempotency_key', 100).notNullable();
    audit(t);
    t.foreign(['company_id', 'successor_nomination_id'], 'fk_nomination_reassign')
      .references(['company_id', 'id'])
      .inTable('successor_nominations')
      .onDelete('RESTRICT');
    t.unique(['company_id', 'idempotency_key'], 'uq_nomination_reassign_key');
  });
}
export async function down(knex) {
  for (const table of [
    'successor_nomination_manager_reassignments',
    'successor_nomination_readiness_events',
    'successor_nomination_decisions',
    'successor_nomination_state_events',
    'successor_nomination_versions',
    'successor_nominations',
    'succession_plan_state_events',
    'succession_plan_versions',
    'succession_plans',
    'critical_position_competencies',
    'critical_position_versions',
    'critical_positions',
    'career_plan_manager_reassignments',
    'career_plan_decisions',
    'career_plan_state_events',
    'career_development_action_evidence_references',
    'career_development_action_versions',
    'career_development_actions',
    'career_plan_goal_competencies',
    'career_plan_goal_versions',
    'career_plan_goals',
    'career_plan_versions',
    'career_plans',
    'career_path_step_competencies',
    'career_path_steps',
    'career_path_versions',
    'career_paths',
  ])
    await knex.schema.dropTableIfExists(table);
}
