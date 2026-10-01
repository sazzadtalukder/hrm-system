export const TRAINING_LIMITS = Object.freeze({
  defaultPageSize: 25,
  maximumPageSize: 100,
  maximumExportRows: 10000,
  maximumPopulation: 500,
  maximumSessionCapacity: 1000,
});
export const TRAINING_ELIGIBLE_STATUSES = Object.freeze(['probation', 'confirmed']);
export const TRAINING_SESSION_TRANSITIONS = Object.freeze({
  draft: ['published', 'cancelled'],
  published: ['enrollment_closed', 'cancelled'],
  enrollment_closed: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
});
export const TRAINING_PARTICIPATION_STATUSES = Object.freeze([
  'not_recorded',
  'attended',
  'partially_attended',
  'no_show',
  'excused',
]);
export const TRAINING_OUTCOMES = Object.freeze(['completed', 'passed', 'failed', 'not_completed']);
