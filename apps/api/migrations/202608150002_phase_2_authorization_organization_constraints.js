import { validateOrganizationScopes } from '../src/modules/organization/reconciliation.js';

export async function up(knex) {
  await validateOrganizationScopes(knex);

  for (const tableName of ['role_assignments', 'user_permission_grants']) {
    await knex.schema.alterTable(tableName, (table) => {
      table.index(['branch_id', 'company_id'], `ix_${tableName}_branch_company`);
      table.index(['department_id', 'company_id'], `ix_${tableName}_department_company`);
      table.foreign('company_id', `fk_${tableName}_company`).references('id').inTable('companies');
      table
        .foreign(['branch_id', 'company_id'], `fk_${tableName}_branch_company`)
        .references(['id', 'company_id'])
        .inTable('branches');
      table
        .foreign(['department_id', 'company_id'], `fk_${tableName}_department_company`)
        .references(['id', 'company_id'])
        .inTable('departments');
    });
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (
      (scope_type = 'all' AND company_id IS NULL AND branch_id IS NULL AND department_id IS NULL)
      OR (scope_type IN ('own','direct_reports','company') AND company_id IS NOT NULL AND branch_id IS NULL AND department_id IS NULL)
      OR (scope_type = 'branch' AND company_id IS NOT NULL AND branch_id IS NOT NULL AND department_id IS NULL)
      OR (scope_type = 'department' AND company_id IS NOT NULL AND branch_id IS NULL AND department_id IS NOT NULL)
    )`,
      [tableName, `ck_${tableName}_scope_shape`],
    );
  }

  await knex.schema.alterTable('audit_events', (table) => {
    table.foreign('company_id', 'fk_audit_events_company').references('id').inTable('companies');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('audit_events', (table) => {
    table.dropForeign('company_id', 'fk_audit_events_company');
  });
  for (const tableName of ['user_permission_grants', 'role_assignments']) {
    await knex.raw('ALTER TABLE ?? DROP CHECK ??', [tableName, `ck_${tableName}_scope_shape`]);
    await knex.schema.alterTable(tableName, (table) => {
      table.dropForeign(['department_id', 'company_id'], `fk_${tableName}_department_company`);
      table.dropForeign(['branch_id', 'company_id'], `fk_${tableName}_branch_company`);
      table.dropForeign('company_id', `fk_${tableName}_company`);
      table.dropIndex(['department_id', 'company_id'], `ix_${tableName}_department_company`);
      table.dropIndex(['branch_id', 'company_id'], `ix_${tableName}_branch_company`);
    });
  }
}
