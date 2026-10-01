export const ATTENDANCE_LIMITS = Object.freeze({
  checkInWindowBeforeMinutes: 120,
  checkOutWindowAfterMinutes: 240,
  nearDuplicateWindowSeconds: 60,
  maxCalculationRangeDays: 31,
  maxCalculationEmploymentIds: 500,
  maxImportRows: 10_000,
  importChunkSize: 500,
});

export const ATTENDANCE_STATUSES = Object.freeze([
  'present',
  'absent',
  'incomplete',
  'rest_day',
  'holiday',
  'configuration_exception',
]);
