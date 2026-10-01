import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { assertConfiguredTarget, buildGuardedEnvironment } from './databaseTargetGuard.js';

const migration = '202609270001_phase_21_recruitment.js';
const tables = [
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
];
const env = loadEnv(buildGuardedEnvironment(process.env));
assertConfiguredTarget(env);
const db = createDatabase(env);
try {
  const applied = await db('knex_migrations').where({ name: migration }).first('id');
  assert.equal(applied, undefined, 'Refusing cleanup: Phase 21 is recorded as applied.');
  for (const table of tables) await db.schema.dropTableIfExists(table);
  console.log('Removed incomplete, unapplied Phase 21 test-migration tables.');
} finally {
  await db.destroy();
}
