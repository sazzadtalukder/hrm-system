import { z } from 'zod';
import { BENEFIT_LIMITS } from './benefitConstants.js';

const id = z.coerce.number().int().positive();
const date = z.iso.date();
const money = z.string().regex(/^\d{1,13}(\.\d{1,2})?$/);
const reason = z.string().trim().min(1).max(500);
const version = z.coerce.number().int().positive();
export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  status: z.string().optional(),
  asOfDate: date.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(BENEFIT_LIMITS.maximumPageSize)
    .default(BENEFIT_LIMITS.defaultPageSize),
});
const planSchema = z.object({
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
  employerContributionAmount: money,
  employeeContributionAmount: money,
  currencyCode: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  eligibleEmploymentTypes: z
    .array(z.enum(['permanent', 'contract', 'probationary', 'temporary', 'intern']))
    .min(1),
  eligibleEmploymentStatuses: z.array(z.enum(['probation', 'confirmed'])).min(1),
  employeeVisible: z.boolean().default(true),
  sensitiveClassification: z.enum(['standard', 'sensitive']),
  reason,
});
const requirePositiveContribution = (value, context) => {
  if (value.effectiveEnd && value.effectiveEnd < value.effectiveStart)
    context.addIssue({
      code: 'custom',
      path: ['effectiveEnd'],
      message: 'The effective end cannot precede the effective start.',
    });
  if (
    Number(value.employerContributionAmount) === 0 &&
    Number(value.employeeContributionAmount) === 0
  )
    context.addIssue({
      code: 'custom',
      path: ['employerContributionAmount'],
      message: 'At least one contribution must be positive.',
    });
};
export const planCreateSchema = planSchema.superRefine(requirePositiveContribution);
export const planVersionSchema = planSchema
  .omit({ companyId: true, code: true, name: true, description: true })
  .superRefine(requirePositiveContribution);
export const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).nullable().optional(),
  version,
});
export const lifecycleSchema = z.object({
  workflowVersion: version,
  reason,
  effectiveDate: date.optional(),
});
export const deactivateSchema = z.object({ version, reason });
export const enrollmentCreateSchema = z.object({
  companyId: id,
  employmentId: id,
  benefitPlanId: id,
  effectiveStart: date,
  effectiveEnd: date.nullable().optional(),
  reason,
});
export const enrollmentUpdateSchema = z.object({
  version,
  effectiveStart: date,
  effectiveEnd: date.nullable().optional(),
  reason,
});
export const myQuery = z.object({
  asOfDate: date.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(BENEFIT_LIMITS.maximumPageSize)
    .default(BENEFIT_LIMITS.defaultPageSize),
});
