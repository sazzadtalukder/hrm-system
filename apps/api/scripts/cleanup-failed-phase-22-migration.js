import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { assertConfiguredTarget, buildGuardedEnvironment } from './databaseTargetGuard.js';

const migration = '202609270002_phase_22_onboarding.js';
const tables = [
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
];
const env = loadEnv(buildGuardedEnvironment(process.env));
assertConfiguredTarget(env);
const db = createDatabase(env);
try {
  const applied = await db('knex_migrations').where({ name: migration }).first('id');
  assert.equal(applied, undefined, 'Refusing cleanup: Phase 22 is recorded as applied.');
  for (const table of tables) await db.schema.dropTableIfExists(table);
  console.log('Removed incomplete, unapplied Phase 22 test-migration tables.');
} finally {
  await db.destroy();
}
