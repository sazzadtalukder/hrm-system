import { z } from 'zod';
const id = z.coerce.number().int().positive(),
  key = z.string().trim().min(8).max(100),
  reason = z.string().trim().min(1).max(500);
export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().trim().max(40).optional(),
});
export const templateSchema = z.object({
  companyId: id,
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  idempotencyKey: key,
});
export const templateTaskSchema = z.object({
  companyId: id,
  taskCode: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  taskType: z.enum([
    'task',
    'document',
    'equipment',
    'access',
    'orientation',
    'probation_milestone',
    'attendance_readiness',
    'payroll_readiness',
  ]),
  isMandatory: z.boolean().default(true),
  sequenceNumber: z.coerce.number().int().positive(),
  dueOffsetDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  instructions: z.string().trim().max(4000).nullable().optional(),
  idempotencyKey: key,
});
export const caseSchema = z.object({
  companyId: id,
  recruitmentHireConversionId: id,
  onboardingTemplateVersionId: id,
  idempotencyKey: key,
});
export const actionSchema = z.object({ workflowVersion: id, reason, idempotencyKey: key });
export const taskActionSchema = z.object({
  workflowVersion: id,
  note: z.string().trim().max(500).nullable().optional(),
  reason: reason.optional(),
  idempotencyKey: key,
});
export const documentSchema = z.object({
  onboardingCaseTaskId: id,
  documentTypeCode: z.string().trim().min(1).max(50),
  documentId: id.nullable().optional(),
  documentVersionId: id.nullable().optional(),
  externalReference: z.string().trim().max(200).nullable().optional(),
  reason: reason.optional(),
  idempotencyKey: key,
});
export const resourceSchema = z.object({
  onboardingCaseTaskId: id,
  requestType: z.enum(['equipment', 'access']),
  resourceName: z.string().trim().min(1).max(200),
  reason: reason.optional(),
  idempotencyKey: key,
});
export const readinessSchema = z.object({
  readinessType: z.enum(['attendance', 'payroll']),
  status: z.enum(['ready', 'not_ready', 'waived']),
  assessedOn: z.iso.date(),
  reason,
  idempotencyKey: key,
});
