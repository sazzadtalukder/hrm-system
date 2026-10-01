import { z } from 'zod';
import { PERFORMANCE_LIMITS as L } from './performanceConstants.js';
const id = z.coerce.number().int().positive(),
  date = z.iso.date(),
  reason = z.string().trim().min(1).max(500),
  key = z.string().trim().min(8).max(100),
  version = z.coerce.number().int().positive();
export const idParams = z.object({ id });
export const goalParams = z.object({ id, goalId: id });
export const listQuery = z.object({
  companyId: id.optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(L.maximumPageSize).default(L.defaultPageSize),
});
export const exportQuery = listQuery.extend({ companyId: id });
export const scaleSchema = z.object({
  companyId: id,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).nullable().optional(),
  levels: z
    .array(
      z.object({
        value: z.coerce.number().int().min(1).max(7),
        code: z.string().trim().min(1).max(50),
        label: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .min(L.minimumRatingLevels)
    .max(L.maximumRatingLevels),
  reason,
});
export const competencySchema = z.object({
  companyId: id,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(1000),
  effectiveStart: date,
  reason,
});
export const templateSchema = z.object({
  companyId: id,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  effectiveStart: date,
  ratingScaleId: id,
  goalsEnabled: z.boolean().default(true),
  goalWeightsEnabled: z.boolean().default(false),
  competenciesEnabled: z.boolean().default(true),
  minimumGoalCount: z.coerce.number().int().min(1).max(L.maximumGoals),
  maximumGoalCount: z.coerce.number().int().min(1).max(L.maximumGoals),
  competencyVersionIds: z.array(id).max(50).default([]),
  reason,
});
export const cycleSchema = z.object({
  companyId: id,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  reviewPeriodStart: date,
  reviewPeriodEnd: date,
  goalSubmissionDueDate: date,
  selfReviewDueDate: date,
  managerReviewDueDate: date,
  acknowledgmentDueDate: date,
  reason,
});
export const populationSchema = z
  .object({
    employmentIds: z.array(id).min(1).max(L.maximumPopulation).optional(),
    branchId: id.optional(),
    departmentId: id.optional(),
    templateVersionId: id,
    allowOverlapOverride: z.boolean().default(false),
    reason,
  })
  .refine(
    (value) =>
      Number(Boolean(value.employmentIds)) +
        Number(Boolean(value.branchId)) +
        Number(Boolean(value.departmentId)) ===
      1,
    'Specify exactly one bounded population selector.',
  );
export const goalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  measurementCriteria: z.string().trim().min(1).max(1000),
  targetValue: z.string().trim().min(1).max(500),
  weight: z.coerce.number().int().min(1).max(100).nullable().optional(),
  dueDate: date,
  reason,
  version: version.optional(),
});
export const transitionSchema = z.object({ workflowVersion: version, reason, idempotencyKey: key });
const rating = z.object({
  targetId: id,
  ratingLevelId: id,
  comment: z.string().trim().max(1000).nullable().optional(),
});
export const assessmentSchema = z.object({
  workflowVersion: version,
  overallComment: z.string().trim().min(1).max(2000),
  strengthsComment: z.string().trim().max(2000).nullable().optional(),
  developmentComment: z.string().trim().max(2000).nullable().optional(),
  overallRatingLevelId: id.nullable().optional(),
  goalRatings: z.array(rating).max(L.maximumGoals),
  competencyRatings: z.array(rating).max(50),
  reason,
  idempotencyKey: key,
});
export const acknowledgmentSchema = z.object({
  workflowVersion: version,
  acknowledgment: z.enum(['acknowledged', 'acknowledged_with_comment']),
  comment: z.string().trim().max(2000).nullable().optional(),
  reason,
  idempotencyKey: key,
});
export const reassignmentSchema = z.object({
  workflowVersion: version,
  managerEmploymentId: id,
  reason,
  idempotencyKey: key,
});
