import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { createAccessContext } from '../src/modules/authorization/accessContext.js';
import { createManagerSelfServiceRepository } from '../src/modules/managerSelfService/managerSelfServiceRepository.js';
import { createManagerSelfServiceService } from '../src/modules/managerSelfService/managerSelfServiceService.js';
import { createAssetRepository } from '../src/modules/assets/assetRepository.js';
import { createAssetService } from '../src/modules/assets/assetService.js';
import { createDocumentRepository } from '../src/modules/documents/documentRepository.js';
import { createDocumentService } from '../src/modules/documents/documentService.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', DB_NAME: 'hrm_test', LOG_LEVEL: 'silent' });
assert.deepEqual([env.DB_HOST, env.DB_PORT, env.DB_NAME], ['127.0.0.1', 3307, 'hrm_test']);
const db = createDatabase(env);
const passed = [];
const pass = (name) => {
  passed.push(name);
  console.log(`PASS ${name}`);
};
const meta = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const access = (actor, permission, companyId, scope = 'company') =>
  createAccessContext({
    actor,
    permission,
    grants: [{ scope_type: scope, company_id: companyId }],
  });

try {
  const [[identity]] = await db.raw(
    'SELECT VERSION() version,DATABASE() database_name,@@port port,@@transaction_isolation isolation_level',
  );
  assert.match(identity.version, /^8\./);
  assert.deepEqual(
    [identity.database_name, Number(identity.port), identity.isolation_level],
    ['hrm_test', 3307, 'READ-COMMITTED'],
  );
  pass('guarded MySQL 8 hrm_test READ COMMITTED execution');

  const tables = [
    'asset_categories',
    'assets',
    'asset_assignments',
    'asset_events',
    'document_types',
    'documents',
    'document_versions',
    'document_state_events',
    'document_acknowledgments',
  ];
  const tableCount = await db('information_schema.tables')
    .where({ table_schema: 'hrm_test' })
    .whereIn('table_name', tables)
    .count({ total: '*' })
    .first();
  assert.equal(Number(tableCount.total), tables.length);
  pass('Phase 14 and Phase 15 schema');

  const requiredPermissions = [
    'manager_self_service.view',
    'asset.view_own',
    'asset.assign',
    'asset.return',
    'document.view_own',
    'document.publish',
    'document.acknowledge',
    'document_sensitive.view',
  ];
  const permissionRows = await db('permissions').whereIn('code', requiredPermissions);
  assert.equal(permissionRows.length, requiredPermissions.length);
  const sensitive = permissionRows.find((row) => row.code === 'document_sensitive.view');
  assert.equal(Boolean(sensitive.allow_direct_grant), true);
  const automaticSensitive = await db('role_permissions as grant')
    .join('permissions as permission', 'permission.id', 'grant.permission_id')
    .where('permission.code', 'document_sensitive.view')
    .count({ total: '*' })
    .first();
  assert.equal(Number(automaticSensitive.total), 0);
  pass('least-privilege permission catalog and sensitive exclusion');

  const subject = await db('employments as employment')
    .join('employees as employee', 'employee.id', 'employment.employee_id')
    .join('employee_assignments as assignment', function () {
      this.on('assignment.employment_id', 'employment.id').andOnVal(
        'assignment.history_status',
        'current',
      );
    })
    .join(
      'employments as manager_employment',
      'manager_employment.id',
      'assignment.manager_employment_id',
    )
    .join('employees as manager', 'manager.id', 'manager_employment.employee_id')
    .whereNotNull('employee.user_id')
    .whereNotNull('manager.user_id')
    .first(
      'employment.id as employment_id',
      'employment.company_id',
      'employee.user_id',
      'manager.user_id as manager_user_id',
    );
  assert.ok(subject, 'Phase 13-15 verification requires a linked employee and manager fixture.');
  const employee = { userId: subject.user_id };
  const manager = { userId: subject.manager_user_id };

  const managerService = createManagerSelfServiceService(createManagerSelfServiceRepository(db));
  const dashboard = await managerService.dashboard(
    access(manager, 'manager_self_service.view', subject.company_id, 'direct_reports'),
    subject.company_id,
  );
  assert.ok(
    dashboard.directReports.some(
      (row) => Number(row.employmentId) === Number(subject.employment_id),
    ),
  );
  pass('Phase 13 manager dashboard uses effective direct reports');

  const assetRepository = createAssetRepository(db);
  const assetService = createAssetService({ database: db, repository: assetRepository });
  const admin = employee;
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const category = await assetService.createCategory(
    admin,
    access(admin, 'asset_category.create', subject.company_id),
    { companyId: subject.company_id, code: `QA-${suffix}`, name: 'Verifier assets' },
    meta(),
  );
  const asset = await assetService.create(
    admin,
    access(admin, 'asset.create', subject.company_id),
    {
      companyId: subject.company_id,
      assetCategoryId: category.id,
      assetCode: `AST-${suffix}`,
      name: 'Verifier asset',
      serialNumber: null,
      acquiredOn: null,
      acquisitionCost: null,
      currencyCode: 'BDT',
    },
    meta(),
  );
  const assigned = await assetService.assign(
    admin,
    access(admin, 'asset.assign', subject.company_id),
    asset.id,
    {
      employmentId: subject.employment_id,
      assignedOn: '2026-09-24',
      condition: 'Good',
      workflowVersion: 1,
      reason: 'Verifier assignment',
      idempotencyKey: `asset-assign-${suffix}`,
    },
    meta(),
  );
  assert.equal(
    (
      await assetService.assign(
        admin,
        access(admin, 'asset.assign', subject.company_id),
        asset.id,
        {
          employmentId: subject.employment_id,
          assignedOn: '2026-09-24',
          condition: 'Good',
          workflowVersion: 1,
          reason: 'Verifier assignment',
          idempotencyKey: `asset-assign-${suffix}`,
        },
        meta(),
      )
    ).replayed,
    true,
  );
  const ownAssignedAsset = await assetService.get(
    access(employee, 'asset.view_own', subject.company_id, 'own'),
    asset.id,
    'asset.view_own',
  );
  assert.equal(ownAssignedAsset.status, 'assigned');
  await assetService.returnAsset(
    admin,
    access(admin, 'asset.return', subject.company_id),
    asset.id,
    {
      returnedOn: '2026-09-24',
      condition: 'Good',
      workflowVersion: assigned.workflowVersion,
      reason: 'Verifier return',
      idempotencyKey: `asset-return-${suffix}`,
    },
    meta(),
  );
  const returnedAsset = await assetService.get(
    access(admin, 'asset.view', subject.company_id),
    asset.id,
    'asset.view',
  );
  assert.equal(returnedAsset.status, 'available');
  assert.equal(returnedAsset.history.length, 2);
  pass('Phase 14 transactional custody, idempotency, own scope, and history');

  const documentRepository = createDocumentRepository(db);
  const authorizationService = {
    requirePermission: async (actor, permission) => {
      if (actor.sensitive && permission === 'document_sensitive.view')
        return access(actor, permission, subject.company_id);
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    },
  };
  const documentService = createDocumentService({
    database: db,
    repository: documentRepository,
    authorizationService,
  });
  const type = await documentService.createType(
    admin,
    access(admin, 'document_type.create', subject.company_id),
    {
      companyId: subject.company_id,
      code: `DOC-${suffix}`,
      name: 'Verifier sensitive document',
      isSensitive: true,
      acknowledgmentRequired: true,
    },
    meta(),
  );
  const document = await documentService.create(
    admin,
    access(admin, 'document.create', subject.company_id),
    {
      companyId: subject.company_id,
      documentTypeId: type.id,
      documentCode: `REF-${suffix}`,
      title: 'Verifier document',
      audience: 'employee',
      branchId: null,
      departmentId: null,
      employmentId: subject.employment_id,
      referenceType: 'external_reference',
      referenceValue: `secret-${suffix}`,
      fileName: null,
      mimeType: null,
      checksumSha256: null,
      effectiveOn: '2026-09-24',
      expiresOn: null,
      reason: 'Verifier create',
      idempotencyKey: `document-create-${suffix}`,
    },
    meta(),
  );
  await documentService.transition(
    admin,
    access(admin, 'document.publish', subject.company_id),
    document.id,
    'published',
    {
      workflowVersion: 1,
      reason: 'Verifier publish',
      idempotencyKey: `document-publish-${suffix}`,
    },
    'document.publish',
    meta(),
  );
  const projected = await documentService.get(
    employee,
    access(employee, 'document.view_own', subject.company_id, 'own'),
    document.id,
    'document.view_own',
  );
  assert.equal(Object.hasOwn(projected, 'reference_value'), false);
  const full = await documentService.get(
    { ...employee, sensitive: true },
    access(employee, 'document.view_own', subject.company_id, 'own'),
    document.id,
    'document.view_own',
  );
  assert.equal(full.reference_value, `secret-${suffix}`);
  const acknowledgment = await documentService.acknowledge(
    employee,
    access(employee, 'document.acknowledge', subject.company_id, 'own'),
    document.id,
    { idempotencyKey: `document-ack-${suffix}` },
    meta(),
  );
  assert.equal(
    (
      await documentService.acknowledge(
        employee,
        access(employee, 'document.acknowledge', subject.company_id, 'own'),
        document.id,
        { idempotencyKey: `document-ack-${suffix}` },
        meta(),
      )
    ).replayed,
    true,
  );
  assert.ok(acknowledgment.id);
  pass('Phase 15 sensitive projection, publication, acknowledgment, and idempotency');

  console.log(`SUMMARY ${passed.length} Phase 13-15 verification groups passed`);
} finally {
  await db.destroy();
}
