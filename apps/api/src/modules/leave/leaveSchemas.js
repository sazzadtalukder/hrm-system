import { z } from 'zod';
import { LEAVE_LIMITS } from './leaveConstants.js';

const id = z.coerce.number().int().positive();
const date = z.iso.date();
const reason = z.string().trim().min(1).max(500);
const period = (schema, from = 'effectiveStart', to = 'effectiveEnd') =>
  schema.refine((value) => !value[to] || value[to] >= value[from], {
    path: [to],
    message: `${to} must not precede ${from}.`,
  });

export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  employmentId: id.optional(),
  status: z
    .enum([
      'draft',
      'submitted',
      'approved',
      'rejected',
      'withdrawn',
      'cancellation_requested',
      'cancelled',
      'cancellation_rejected',
    ])
    .optional(),
  dateFrom: date.optional(),
  dateTo: date.optional(),
  scopeView: z.enum(['own', 'direct_reports']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(LEAVE_LIMITS.maximumPageSize).default(20),
});
export const companyQuery = z.object({ companyId: id });
export const typeCreateSchema = period(
  z.object({
    companyId: id,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(500).nullable().optional(),
    category: z.enum(['paid', 'unpaid', 'other']),
    isSensitive: z.boolean().default(false),
    effectiveStart: date,
    effectiveEnd: date.nullable().optional(),
    unit: z.enum(['full_day', 'half_day']),
    minimumIncrement: z.union([z.literal(0.5), z.literal(1)]),
    countsRestDays: z.boolean().default(false),
    countsHolidays: z.boolean().default(false),
    requiresReason: z.boolean().default(true),
    requiresApproval: z.boolean().default(true),
    allowNegativeBalance: z.boolean().default(false),
    reason,
  }),
);
export const typeUpdateSchema = period(
  z.object({
    version: id,
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(500).nullable().optional(),
    category: z.enum(['paid', 'unpaid', 'other']),
    isSensitive: z.boolean(),
    effectiveStart: date,
    effectiveEnd: date.nullable().optional(),
    unit: z.enum(['full_day', 'half_day']),
    minimumIncrement: z.union([z.literal(0.5), z.literal(1)]),
    countsRestDays: z.boolean(),
    countsHolidays: z.boolean(),
    requiresReason: z.boolean(),
    requiresApproval: z.boolean(),
    allowNegativeBalance: z.boolean(),
    reason,
  }),
);
export const deactivateSchema = z.object({ version: id, reason });
export const policyCreateSchema = period(
  z.object({
    companyId: id,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(500).nullable().optional(),
    effectiveStart: date,
    effectiveEnd: date.nullable().optional(),
    leaveYearStartMonth: z.coerce.number().int().min(1).max(12).default(1),
    leaveYearStartDay: z.coerce.number().int().min(1).max(31).default(1),
    configs: z
      .array(
        z.object({
          leaveTypeVersionId: id,
          entitlementUnits: z.coerce.number().min(0).max(999999),
          minimumServiceDays: z.coerce.number().int().min(0).default(0),
        }),
      )
      .min(1),
    reason,
  }),
);
export const policyAssignmentSchema = period(
  z.object({
    leavePolicyId: id,
    effectiveStart: date,
    effectiveEnd: date.nullable().optional(),
    supersedesAssignmentId: id.nullable().optional(),
    reason,
  }),
);
export const requestCreateSchema = z
  .object({
    companyId: id,
    employmentId: id,
    leaveTypeId: id,
    dateFrom: date,
    dateTo: date,
    dayPart: z.enum(['full_day', 'first_half', 'second_half']),
    reason,
  })
  .refine((value) => value.dateTo >= value.dateFrom, {
    path: ['dateTo'],
    message: 'dateTo must not precede dateFrom.',
  })
  .refine((value) => value.dayPart === 'full_day' || value.dateFrom === value.dateTo, {
    path: ['dayPart'],
    message: 'Half-day leave must cover one date.',
  });
export const requestUpdateSchema = z
  .object({
    version: id,
    leaveTypeId: id,
    dateFrom: date,
    dateTo: date,
    dayPart: z.enum(['full_day', 'first_half', 'second_half']),
    reason,
  })
  .refine((value) => value.dateTo >= value.dateFrom, {
    path: ['dateTo'],
    message: 'dateTo must not precede dateFrom.',
  })
  .refine((value) => value.dayPart === 'full_day' || value.dateFrom === value.dateTo, {
    path: ['dayPart'],
    message: 'Half-day leave must cover one date.',
  });
export const workflowSchema = z.object({ workflowVersion: id, reason: reason.optional() });
export const decisionSchema = z.object({
  workflowVersion: id,
  requestVersion: id,
  idempotencyKey: z.string().trim().min(1).max(150),
  reason,
});
export const cancellationSchema = z.object({ workflowVersion: id, reason });
export const balanceAdjustmentSchema = z.object({
  units: z.coerce.number().refine((value) => value !== 0, 'Units must not be zero.'),
  effectiveDate: date,
  idempotencyKey: z.string().trim().min(1).max(150),
  reason,
});
export const reversalSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(150),
  reason,
});
