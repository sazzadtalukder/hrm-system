import { z } from 'zod';
import { MONEY_PATTERN, PAYROLL_LIMITS } from './payrollConstants.js';

const id = z.coerce.number().int().positive();
const date = z.iso.date();
const reason = z.string().trim().min(1).max(500);
const money = z.string().trim().regex(MONEY_PATTERN);
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,59}$/);

export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(PAYROLL_LIMITS.maximumPageSize).default(20),
  status: z.string().trim().max(30).optional(),
});
export const companyQuery = z.object({ companyId: id });
export const periodCreateSchema = z
  .object({
    companyId: id,
    code,
    name: z.string().trim().min(1).max(150),
    periodStart: date,
    periodEnd: date,
    paymentDate: date,
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    path: ['periodEnd'],
    message: 'The period end must not precede its start.',
  });
export const periodUpdateSchema = z.object({
  version: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(150),
  paymentDate: date,
});
export const componentCreateSchema = z.object({
  companyId: id,
  code,
  name: z.string().trim().min(1).max(150),
  componentType: z.enum(['earning', 'deduction']),
  effectiveStart: date,
  showOnPayslip: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).max(10000).default(0),
});
export const componentUpdateSchema = z.object({
  version: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(150),
});
export const lifecycleSchema = z.object({
  version: z.coerce.number().int().positive(),
  reason,
});
export const compensationSchema = z.object({
  companyId: id,
  effectiveStart: date,
  effectiveEnd: date.nullable().optional(),
  monthlyBaseAmount: money,
  currencyCode: z.string().trim().length(3).toUpperCase(),
  reason,
});
export const recurringSchema = z.object({
  companyId: id,
  payrollComponentId: id,
  effectiveStart: date,
  effectiveEnd: date.nullable().optional(),
  amount: money,
  reason,
});
export const inputSchema = z.object({
  companyId: id,
  payrollPeriodId: id,
  employmentId: id,
  payrollComponentId: id,
  amount: money,
  reason,
  idempotencyKey: z.string().trim().min(8).max(128),
});
export const runCreateSchema = z
  .object({
    companyId: id,
    payrollPeriodId: id,
    code,
    employmentIds: z.array(id).min(1).max(PAYROLL_LIMITS.maximumRunEmployments).optional(),
    branchId: id.optional(),
    departmentId: id.optional(),
  })
  .superRefine((value, context) => {
    const selectors = [
      Boolean(value.employmentIds?.length),
      Boolean(value.branchId),
      Boolean(value.departmentId),
    ].filter(Boolean).length;
    if (selectors !== 1)
      context.addIssue({
        code: 'custom',
        path: ['employmentIds'],
        message: 'Specify employment IDs, a branch, or a department.',
      });
  });
export const processSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  workflowVersion: z.coerce.number().int().positive(),
  reason,
});
export const transitionSchema = z.object({
  workflowVersion: z.coerce.number().int().positive(),
  reason,
});
export const decisionSchema = transitionSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(128),
});
export const publishSchema = z.object({ reason });
export const adjustmentSchema = z.object({
  payrollComponentId: id,
  componentType: z.enum(['earning', 'deduction']),
  amount: money,
  reason,
  idempotencyKey: z.string().trim().min(8).max(128),
});
export const adjustmentTransitionSchema = z.object({
  workflowVersion: z.coerce.number().int().positive(),
  reason,
});
export const reversalSchema = z.object({
  reason,
  idempotencyKey: z.string().trim().min(8).max(128),
});
