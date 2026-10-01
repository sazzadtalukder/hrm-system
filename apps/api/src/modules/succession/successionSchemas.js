import { z } from 'zod';
import { READINESS_LEVELS, SUCCESSION_LIMITS as L } from './successionConstants.js';
const id = z.coerce.number().int().positive(),
  date = z.iso.date(),
  reason = z.string().trim().min(1).max(500),
  key = z.string().trim().min(8).max(100),
  version = z.coerce.number().int().positive();
const code = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((v) => v.toUpperCase());
const readiness = z.enum(READINESS_LEVELS);
export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  status: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(L.maximumPageSize).default(L.defaultPageSize),
});
export const positionSchema = z.object({
  companyId: id,
  code,
  name: z.string().trim().min(1).max(150),
  designationId: id,
  branchId: id.nullable().optional(),
  departmentId: id.nullable().optional(),
  criticality: z.enum(['high', 'critical']),
  description: z.string().trim().min(1).max(5000),
  effectiveStart: date,
  competencies: z
    .array(
      z.object({
        performanceCompetencyVersionId: id,
        requiredProficiency: z.string().max(50).nullable().optional(),
      }),
    )
    .max(L.maximumCompetencies)
    .default([]),
  reason,
  idempotencyKey: key,
});
export const positionVersionSchema = positionSchema
  .omit({ companyId: true, code: true })
  .extend({ version, idempotencyKey: key });
export const planSchema = z.object({
  companyId: id,
  criticalPositionVersionId: id,
  anchorDate: date,
  planningHorizonDate: date,
  incumbentEmploymentId: id.nullable().optional(),
  riskRationale: z.string().trim().max(5000).nullable().optional(),
  reason,
  idempotencyKey: key,
});
export const transitionSchema = z.object({ workflowVersion: version, reason, idempotencyKey: key });
export const nominationSchema = z.object({
  companyId: id,
  successionPlanId: id,
  employmentId: id,
  managerReadinessRecommendation: readiness,
  readinessTargetDate: date.nullable().optional(),
  strengths: z.string().trim().max(5000),
  developmentNeeds: z.string().trim().max(5000),
  nominationRationale: z.string().trim().max(5000),
  competencyGapNarrative: z.string().trim().max(5000).nullable().optional(),
  reason,
  idempotencyKey: key,
});
export const readinessSchema = z.object({
  workflowVersion: version,
  version,
  readiness,
  reason,
  idempotencyKey: key,
});
export const reassignSchema = z.object({
  managerEmploymentId: id,
  workflowVersion: version,
  reason,
  idempotencyKey: key,
});
export const recordVersionSchema = z.object({ version, reason, idempotencyKey: key });
