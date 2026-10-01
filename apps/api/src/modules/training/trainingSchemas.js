import { z } from 'zod';
import { TRAINING_LIMITS as L } from './trainingConstants.js';
const id = z.coerce.number().int().positive();
const date = z.iso.date();
const reason = z.string().trim().min(1).max(500);
const key = z.string().trim().min(8).max(100);
const version = z.coerce.number().int().positive();
const code = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((v) => v.toUpperCase());
export const idParams = z.object({ id });
export const evidenceParams = z.object({ id, evidenceId: id });
export const listQuery = z.object({
  companyId: id,
  status: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(L.maximumPageSize).default(L.defaultPageSize),
});
const scoring = {
  scoringEnabled: z.boolean().default(false),
  minimumScore: z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  maximumScore: z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  passingScore: z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/)
    .nullable()
    .optional(),
};
export const courseSchema = z.object({
  companyId: id,
  code,
  name: z.string().trim().min(1).max(150),
  effectiveStart: date,
  description: z.string().trim().min(1).max(5000),
  deliveryMode: z.enum(['in_person', 'virtual', 'blended']),
  competencyVersionIds: z.array(id).max(50).default([]),
  ...scoring,
  reason,
});
export const courseVersionSchema = courseSchema
  .omit({ companyId: true, code: true })
  .extend({ version });
export const providerSchema = z.object({
  companyId: id,
  code,
  name: z.string().trim().min(1).max(150),
  effectiveStart: date,
  contactName: z.string().trim().max(150).nullable().optional(),
  contactEmail: z.string().email().max(254).nullable().optional(),
  externalUrl: z
    .string()
    .url()
    .max(500)
    .refine((x) => x.startsWith('https://'))
    .nullable()
    .optional(),
  reason,
});
export const providerVersionSchema = providerSchema
  .omit({ companyId: true, code: true })
  .extend({ version });
export const sessionSchema = z.object({
  companyId: id,
  code,
  trainingCourseVersionId: id,
  title: z.string().trim().min(1).max(150),
  startsAtUtc: z.iso.datetime({ offset: true }),
  endsAtUtc: z.iso.datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(64),
  enrollmentOpensOn: date,
  enrollmentClosesOn: date,
  capacity: z.coerce.number().int().min(1).max(L.maximumSessionCapacity),
  branchId: id.nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  virtualReference: z.string().trim().max(500).nullable().optional(),
  trainingProviderVersionId: id.nullable().optional(),
  facilitators: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(150),
        organization: z.string().trim().max(150).nullable().optional(),
        reference: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .max(20)
    .default([]),
  reason,
});
export const sessionUpdateSchema = sessionSchema
  .omit({ companyId: true, code: true, trainingCourseVersionId: true })
  .extend({ version });
export const transitionSchema = z.object({ workflowVersion: version, reason, idempotencyKey: key });
export const enrollmentSchema = z.object({
  companyId: id,
  trainingSessionId: id,
  employmentId: id,
  requestNarrative: z.string().trim().min(1).max(2000),
  isMandatory: z.boolean().default(false),
  reason,
});
export const enrollmentUpdateSchema = z.object({
  requestNarrative: z.string().trim().min(1).max(2000),
  version,
  reason,
});
export const participationSchema = z.object({
  participationStatus: z.enum([
    'not_recorded',
    'attended',
    'partially_attended',
    'no_show',
    'excused',
  ]),
  comment: z.string().trim().max(1000).nullable().optional(),
  version: version.optional(),
  reason,
  idempotencyKey: key,
});
export const completionSchema = z.object({
  outcome: z.enum(['completed', 'passed', 'failed', 'not_completed']),
  score: z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  completionDate: date,
  comment: z.string().trim().max(1000).nullable().optional(),
  version: version.optional(),
  reason,
  idempotencyKey: key,
});
export const evidenceSchema = z
  .object({
    referenceType: z.enum(['certificate_number', 'external_url', 'external_reference']),
    referenceValue: z.string().trim().min(1).max(500),
    reason,
    idempotencyKey: key,
  })
  .superRefine((v, c) => {
    if (v.referenceType === 'external_url' && !v.referenceValue.startsWith('https://'))
      c.addIssue({
        code: 'custom',
        path: ['referenceValue'],
        message: 'External URLs must use HTTPS.',
      });
  });
export const reassignmentSchema = z.object({
  managerEmploymentId: id,
  workflowVersion: version,
  reason,
  idempotencyKey: key,
});
