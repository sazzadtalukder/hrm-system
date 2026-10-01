const repairs = [
  ['career_paths', false, 'uq_career_path_create_key'],
  ['career_path_versions', true, 'uq_career_path_version_key'],
  ['career_plans', false, 'uq_career_plan_create_key'],
  ['career_plan_versions', true, 'uq_career_plan_version_key'],
  ['career_plan_goal_versions', true, 'uq_career_goal_progress_key'],
  ['career_development_action_versions', true, 'uq_career_action_progress_key'],
  ['career_development_action_evidence_references', false, 'uq_career_evidence_key'],
  ['critical_positions', false, 'uq_critical_position_create_key'],
  ['critical_position_versions', true, 'uq_critical_position_version_key'],
  ['succession_plans', false, 'uq_succession_plan_create_key'],
  ['successor_nominations', false, 'uq_nomination_create_key'],
];

async function hasIndex(knex, tableName, indexName) {
  return Boolean(
    await knex('information_schema.statistics')
      .whereRaw('table_schema = database()')
      .where({ table_name: tableName, index_name: indexName })
      .first('index_name'),
  );
}

export async function up(knex) {
  for (const [tableName, nullable, indexName] of repairs) {
    if (!(await knex.schema.hasColumn(tableName, 'idempotency_key'))) {
      await knex.schema.alterTable(tableName, (table) => {
        table.string('idempotency_key', 100);
      });
      if (!nullable) {
        await knex(tableName)
          .whereNull('idempotency_key')
          .update({
            idempotency_key: knex.raw('concat(?, id)', [`repair:${tableName}:`]),
          });
        await knex.schema.alterTable(tableName, (table) => {
          table.string('idempotency_key', 100).notNullable().alter();
        });
      }
    }
    if (!(await hasIndex(knex, tableName, indexName))) {
      await knex.schema.alterTable(tableName, (table) => {
        table.unique(['company_id', 'idempotency_key'], indexName);
      });
    }
  }
}

// This is a forward-only drift repair. Reverting it could invalidate idempotency guarantees.
export async function down() {
  throw new Error('The Phase 12 idempotency schema repair is forward-only.');
}
