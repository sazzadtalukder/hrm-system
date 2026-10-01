export const LEAVE_LIMITS = Object.freeze({
  maximumFutureApplicationDays: 365,
  maximumRequestRangeDays: 366,
  maximumPageSize: 100,
});

export const BLOCKING_LEAVE_STATUSES = Object.freeze([
  'submitted',
  'approved',
  'cancellation_requested',
]);
