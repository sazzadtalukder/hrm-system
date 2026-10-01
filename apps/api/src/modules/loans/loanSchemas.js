import { z } from 'zod';
import { LOAN_LIMITS } from './loanConstants.js';
const id = z.coerce.number().int().positive(),
  date = z.iso.date(),
  reason = z.string().trim().min(1).max(500),
  money = z.string().regex(/^\d{1,17}(\.\d{1,2})?$/),
  workflowVersion = z.coerce.number().int().positive();
export const idParams = z.object({ id });
export const entryParams = z.object({ id, entryId: id });
export const listQuery = z.object({
  companyId: id.optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(LOAN_LIMITS.maximumPageSize)
    .default(LOAN_LIMITS.defaultPageSize),
});
export const exportQuery = listQuery.extend({ companyId: id });
export const typeCreateSchema = z.object({
  companyId: id,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).nullable().optional(),
  facilityKind: z.enum(['loan', 'salary_advance']),
  effectiveStart: date,
  effectiveEnd: date.nullable().optional(),
  currencyCode: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase()),
  minimumPrincipal: money,
  maximumPrincipal: money,
  minimumTermMonths: z.coerce.number().int().positive(),
  maximumTermMonths: z.coerce.number().int().positive(),
  installmentDueDay: z.coerce.number().int().min(1).max(31),
  minimumServiceDays: z.coerce.number().int().nonnegative().nullable().optional(),
  maximumActiveFacilities: z.coerce.number().int().positive(),
  sensitiveClassification: z.enum(['standard', 'sensitive']).default('sensitive'),
  reason,
});
export const typeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).nullable().optional(),
  version: z.coerce.number().int().positive(),
});
export const typeVersionSchema = typeCreateSchema.omit({
  companyId: true,
  code: true,
  name: true,
  description: true,
  facilityKind: true,
});
export const deactivateSchema = z.object({ version: z.coerce.number().int().positive(), reason });
export const applicationCreateSchema = z.object({
  companyId: id,
  employmentId: id,
  loanFacilityTypeId: id,
  requestedPrincipal: money,
  requestedTermMonths: z.coerce.number().int().positive(),
  currencyCode: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase()),
  purpose: z.string().trim().min(1).max(500),
  reason,
});
export const applicationUpdateSchema = applicationCreateSchema
  .omit({ companyId: true, employmentId: true })
  .extend({ version: z.coerce.number().int().positive() });
export const transitionSchema = z.object({ workflowVersion, reason });
export const decisionSchema = transitionSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(100),
});
export const disbursementSchema = decisionSchema.extend({
  disbursementDate: date,
  reference: z.string().trim().min(1).max(100),
});
export const ledgerSchema = z.object({
  amount: money,
  effectiveDate: date,
  reference: z.string().trim().max(100).nullable().optional(),
  reason,
  idempotencyKey: z.string().trim().min(8).max(100),
});
export const reversalSchema = z.object({
  effectiveDate: date,
  reason,
  idempotencyKey: z.string().trim().min(8).max(100),
});
