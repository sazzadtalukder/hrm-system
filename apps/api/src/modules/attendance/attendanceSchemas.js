import { z } from 'zod';
import { ATTENDANCE_LIMITS } from './attendanceConstants.js';

const id = z.coerce.number().int().positive();
const date = z.iso.date();
const reason = z.string().trim().min(1).max(500);
const timestamp = z.iso.datetime({ offset: true });

export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  dateFrom: date.optional(),
  dateTo: date.optional(),
  employmentId: id.optional(),
  branchId: id.optional(),
  departmentId: id.optional(),
  status: z
    .enum(['present', 'absent', 'incomplete', 'rest_day', 'holiday', 'configuration_exception'])
    .optional(),
  scopeView: z.enum(['own', 'direct_reports']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['attendance_date', 'status', 'created_at']).default('attendance_date'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
export const eventListQuery = z.object({
  companyId: id,
  dateFrom: date.optional(),
  dateTo: date.optional(),
  employmentId: id.optional(),
  disposition: z
    .enum(['accepted', 'ignored', 'duplicate', 'invalid', 'superseded', 'review_required'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const employmentOptionQuery = z.object({
  companyId: id,
  search: z.string().trim().max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
const shiftVersionFields = {
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).nullable().optional(),
  effectiveStart: date,
  effectiveEnd: date.nullable().optional(),
  timezone: z.string().trim().min(1).max(100),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  crossesMidnight: z.boolean(),
  unpaidBreakMinutes: z.coerce.number().int().min(0).max(1439),
  graceInMinutes: z.coerce.number().int().min(0).max(1440),
  graceOutMinutes: z.coerce.number().int().min(0).max(1440),
  reason,
};
const effectivePeriod = (schema) =>
  schema.refine((value) => !value.effectiveEnd || value.effectiveEnd >= value.effectiveStart, {
    message: 'effectiveEnd must not precede effectiveStart.',
    path: ['effectiveEnd'],
  });
export const shiftCreateSchema = effectivePeriod(
  z.object({
    companyId: id,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/),
    ...shiftVersionFields,
  }),
);
export const shiftUpdateSchema = effectivePeriod(z.object({ ...shiftVersionFields, version: id }));
export const shiftDeactivateSchema = z.object({ version: id, reason });
export const shiftAssignmentSchema = z
  .object({
    attendanceShiftId: id,
    effectiveStart: date,
    effectiveEnd: date.nullable().optional(),
    supersedesShiftAssignmentId: id.nullable().optional(),
    reason,
  })
  .refine((value) => !value.effectiveEnd || value.effectiveEnd >= value.effectiveStart, {
    message: 'effectiveEnd must not precede effectiveStart.',
    path: ['effectiveEnd'],
  });
export const manualEventSchema = z.object({
  companyId: id,
  employeeCode: z.string().trim().toUpperCase().min(1).max(50),
  eventType: z.enum(['check_in', 'check_out']),
  occurredAt: timestamp,
  sourceEventKey: z.string().trim().max(150).nullable().optional(),
  reason,
});
export const dispositionSchema = z.object({
  disposition: z.enum([
    'accepted',
    'ignored',
    'duplicate',
    'invalid',
    'superseded',
    'review_required',
  ]),
  relatedEventId: id.nullable().optional(),
  reason,
});
export const importJsonSchema = z
  .object({
    companyId: id,
    idempotencyKey: z.string().trim().min(1).max(100),
    sourceReference: z.string().trim().max(150).nullable().optional(),
    rows: z
      .array(
        z
          .object({
            employee_code: z.string().trim().toUpperCase().min(1).max(50),
            event_type: z.enum(['check_in', 'check_out']),
            occurred_at: timestamp,
            source_event_key: z.string().trim().max(150).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(ATTENDANCE_LIMITS.maxImportRows),
  })
  .strict();
export const calculationSchema = z
  .object({
    companyId: id,
    dateFrom: date,
    dateTo: date,
    employmentIds: z.array(id).min(1).max(ATTENDANCE_LIMITS.maxCalculationEmploymentIds).optional(),
    branchId: id.optional(),
    departmentId: id.optional(),
  })
  .refine((value) => value.dateTo >= value.dateFrom, {
    message: 'dateTo must not precede dateFrom.',
    path: ['dateTo'],
  })
  .refine(
    (value) =>
      !value.employmentIds || new Set(value.employmentIds).size === value.employmentIds.length,
    { message: 'employmentIds must not contain duplicates.', path: ['employmentIds'] },
  )
  .refine(
    (value) => Boolean(value.employmentIds?.length || value.branchId || value.departmentId),
    'An employment list, branch, or department scope is required.',
  );
export const correctionCreateSchema = z
  .object({
    requestedCheckInUtc: timestamp.nullable().optional(),
    requestedCheckOutUtc: timestamp.nullable().optional(),
    reason,
  })
  .refine(
    (value) => value.requestedCheckInUtc || value.requestedCheckOutUtc,
    'At least one corrected timestamp is required.',
  );
export const correctionUpdateSchema = correctionCreateSchema.extend({ workflowVersion: id });
export const workflowActionSchema = z.object({ workflowVersion: id, reason: reason.optional() });
export const decisionSchema = z.object({
  workflowVersion: id,
  idempotencyKey: z.string().trim().min(1).max(100),
  reason,
});
export const lockCreateSchema = z
  .object({
    companyId: id,
    branchId: id.nullable().optional(),
    periodStart: date,
    periodEnd: date,
    reason,
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: 'periodEnd must not precede periodStart.',
    path: ['periodEnd'],
  });
export const lockReverseSchema = z.object({ version: id, reason });
