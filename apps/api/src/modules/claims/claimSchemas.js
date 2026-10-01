import { z } from 'zod';
import { CLAIM_LIMITS } from './claimConstants.js';
const id = z.coerce.number().int().positive();
const date = z.iso.date();
const reason = z.string().trim().min(1).max(500);
const money = z.string().regex(/^\d{1,17}(\.\d{1,2})?$/);
const evidence = z.object({
  referenceType: z.enum(['document_reference', 'external_reference']),
  referenceValue: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(150),
});
const item = z.object({
  claimCategoryId: id,
  expenseDate: date,
  description: z.string().trim().min(1).max(500),
  amount: money,
  merchantReference: z.string().trim().max(150).nullable().optional(),
  evidence: z.array(evidence).max(CLAIM_LIMITS.maximumEvidencePerItem).default([]),
});
export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id.optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(CLAIM_LIMITS.maximumPageSize)
    .default(CLAIM_LIMITS.defaultPageSize),
});
export const exportQuery = listQuery.extend({ companyId: id });
export const categoryCreateSchema = z.object({
  companyId: id,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).nullable().optional(),
  effectiveStart: date,
  effectiveEnd: date.nullable().optional(),
  receiptRequired: z.boolean(),
  maximumItemAmount: money.nullable().optional(),
  currencyCode: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase()),
  sensitiveClassification: z.enum(['standard', 'sensitive']),
  reason,
});
export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).nullable().optional(),
  version: z.coerce.number().int().positive(),
});
export const categoryVersionSchema = categoryCreateSchema.omit({
  companyId: true,
  code: true,
  name: true,
  description: true,
});
export const deactivateSchema = z.object({
  version: z.coerce.number().int().positive(),
  reason,
});
export const claimCreateSchema = z.object({
  companyId: id,
  employmentId: id,
  title: z.string().trim().min(1).max(150),
  businessPurpose: z.string().trim().min(1).max(500),
  currencyCode: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase()),
  reason,
  items: z.array(item).min(1).max(CLAIM_LIMITS.maximumItems),
});
export const claimUpdateSchema = claimCreateSchema
  .omit({ companyId: true, employmentId: true })
  .extend({ version: z.coerce.number().int().positive() });
export const transitionSchema = z.object({
  workflowVersion: z.coerce.number().int().positive(),
  reason,
});
export const decisionSchema = transitionSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(100),
});
export const paymentSchema = decisionSchema.extend({
  paymentReference: z.string().trim().min(1).max(100),
  paymentDate: date,
});
