async function hasIndex(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT 1
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1`,
    [tableName, indexName],
  );
  return rows.length > 0;
}

async function hasConstraint(knex, tableName, constraintName) {
  const [rows] = await knex.raw(
    `SELECT 1
       FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE()
        AND table_name = ?
        AND constraint_name = ?
      LIMIT 1`,
    [tableName, constraintName],
  );
  return rows.length > 0;
}

export async function up(knex) {
  const tableName = 'attendance_record_versions';
  const columnName = 'leave_request_day_id';
  const indexName = 'ix_attendance_version_leave_day_company';
  const constraintName = 'fk_attendance_version_leave_day_company';

  if (!(await knex.schema.hasColumn(tableName, columnName))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.bigInteger(columnName).unsigned().nullable();
    });
  }

  if (!(await hasIndex(knex, tableName, indexName))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.index([columnName, 'company_id'], indexName);
    });
  }

  if (!(await hasConstraint(knex, tableName, constraintName))) {
    await knex.schema.alterTable(tableName, (table) => {
      table
        .foreign([columnName, 'company_id'], constraintName)
        .references(['id', 'company_id'])
        .inTable('leave_request_days');
    });
  }
}

// Forward-only repair: rollback must not remove a column that may have been
// created by the original Phase 5 migration on a fresh database.
export async function down() {}
