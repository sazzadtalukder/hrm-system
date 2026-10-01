import assert from 'node:assert/strict';
import test from 'node:test';
import { systemAdministratorAllScopeAssignment } from './bootstrap-admin-scope.js';

test('bootstrap System Administrator assignment uses unrestricted all scope', () => {
  const assignment = systemAdministratorAllScopeAssignment({
    userId: 7,
    roleId: 3,
    assignedBy: 7,
    effectiveStart: '2026-09-26',
  });
  assert.equal(assignment.company_id, null);
  assert.equal(assignment.role_id, 3);
  assert.equal(assignment.scope_type, 'all');
  assert.equal(assignment.scope_key, 'all');
  assert.equal(assignment.branch_id, null);
  assert.equal(assignment.department_id, null);
});
