import { z } from 'zod';
import { CAREER_LIMITS as L } from './careerConstants.js';
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
export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  status: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(L.maximumPageSize).default(L.defaultPageSize),
});
const competency = z.object({
  performanceCompetencyVersionId: id,
  requiredProficiency: z.string().trim().max(50).nullable().optional(),
});
export const pathSchema = z.object({
  companyId: id,
  code,
  name: z.string().trim().min(1).max(150),
  effectiveStart: date,
  description: z.string().trim().min(1).max(5000),
  steps: z
    .array(
      z.object({
        designationId: id,
        minimumTimeMonths: z.coerce.number().int().min(0).nullable().optional(),
        competencies: z.array(competency).max(L.maximumCompetencies).default([]),
      }),
    )
    .min(1)
    .max(20),
  reason,
  idempotencyKey: key,
});
export const pathVersionSchema = pathSchema
  .omit({ companyId: true, code: true })
  .extend({ version, idempotencyKey: key });
const goal = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  targetDate: date,
  competencyVersionIds: z.array(id).max(L.maximumCompetencies).default([]),
});
const action = z.object({
  actionType: z.enum(['training', 'coaching', 'project', 'self_development', 'other']),
  description: z.string().trim().min(1).max(5000),
  targetDate: date,
  responsibleParty: z.enum(['employee', 'manager', 'hr']),
  trainingCourseVersionId: id.nullable().optional(),
});
export const planSchema = z.object({
  companyId: id,
  employmentId: id,
  careerPathVersionId: id.nullable().optional(),
  targetDesignationId: id.nullable().optional(),
  careerDirection: z.string().trim().max(500).nullable().optional(),
  employeeNarrative: z.string().trim().max(5000).nullable().optional(),
  planStart: date,
  planEnd: date,
  goals: z.array(goal).min(1).max(L.maximumGoals),
  actions: z.array(action).max(50).default([]),
  reason,
  idempotencyKey: key,
});
export const planUpdateSchema = planSchema
  .omit({ companyId: true, employmentId: true })
  .extend({ version, idempotencyKey: key });
export const transitionSchema = z.object({ workflowVersion: version, reason, idempotencyKey: key });
export const progressSchema = z.object({
  kind: z.enum(['goal', 'action']),
  itemId: id,
  status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']),
  comment: z.string().trim().max(1000).nullable().optional(),
  completionDate: date.nullable().optional(),
  version,
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
export const evidenceSchema = z
  .object({
    actionVersionId: id,
    referenceType: z.enum(['training_completion_version', 'external_reference']),
    trainingCompletionVersionId: id.nullable().optional(),
    externalReference: z.string().trim().min(1).max(300).nullable().optional(),
    reason,
    idempotencyKey: key,
  })
  .superRefine((v, ctx) => {
    const training = v.referenceType === 'training_completion_version';
    if (
      training !== Boolean(v.trainingCompletionVersionId) ||
      training === Boolean(v.externalReference)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['referenceType'],
        message: 'Evidence reference fields do not match the selected type.',
      });
  });
