import { z } from 'zod';
const id = z.coerce.number().int().positive();
const key = z.string().trim().min(8).max(100);
const reason = z.string().trim().min(1).max(500);
const money = z
  .string()
  .regex(/^\d{1,17}(\.\d{1,2})?$/)
  .nullable()
  .optional();
export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().max(40).optional(),
});
export const dashboardQuery = z.object({ companyId: id });
export const manpowerSchema = z.object({
  companyId: id,
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  notes: z.string().trim().max(4000).nullable().optional(),
  idempotencyKey: key,
});
export const lineSchema = z.object({
  companyId: id,
  branchId: id.nullable().optional(),
  departmentId: id.nullable().optional(),
  designationId: id.nullable().optional(),
  requestedHeadcount: z.coerce.number().int().positive(),
  reason,
  version: id,
});
export const requisitionSchema = z.object({
  companyId: id,
  code: z.string().trim().min(1).max(50),
  manpowerPlanLineId: id.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  branchId: id,
  departmentId: id,
  designationId: id,
  hiringManagerUserId: id.nullable().optional(),
  requestedHeadcount: z.coerce.number().int().positive(),
  description: z.string().trim().max(4000).nullable().optional(),
  reason,
  idempotencyKey: key,
});
export const postingSchema = z.object({
  companyId: id,
  jobRequisitionId: id,
  code: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  channel: z.string().trim().max(100).nullable().optional(),
  closesOn: z.iso.date().nullable().optional(),
  idempotencyKey: key,
});
export const candidateSchema = z.object({
  companyId: id,
  candidateNumber: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  profileSummary: z.string().trim().max(4000).nullable().optional(),
  idempotencyKey: key,
});
export const applicationSchema = z.object({
  companyId: id,
  candidateId: id,
  jobRequisitionId: id,
  jobPostingId: id.nullable().optional(),
  idempotencyKey: key,
});
export const screeningSchema = z.object({
  outcome: z.enum(['shortlisted', 'rejected', 'return_to_screening']),
  reason,
  workflowVersion: id,
  idempotencyKey: key,
});
export const interviewSchema = z.object({
  companyId: id,
  candidateApplicationId: id,
  scheduledAt: z.iso.datetime(),
  durationMinutes: z.coerce.number().int().min(1).max(480),
  participantUserIds: z.array(id).max(20).default([]),
  idempotencyKey: key,
});
export const feedbackSchema = z.object({
  recommendation: z.enum(['recommend', 'do_not_recommend', 'neutral']),
  narrative: z.string().trim().max(4000).nullable().optional(),
  workflowVersion: id,
  idempotencyKey: key,
});
export const assessmentSchema = z.object({
  companyId: id,
  candidateApplicationId: id,
  assessmentType: z.string().trim().min(1).max(100),
  idempotencyKey: key,
});
export const assessmentResultSchema = z.object({
  outcome: z.enum(['pass', 'fail', 'not_scored']),
  score: z.coerce.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  workflowVersion: id,
  idempotencyKey: key,
});
export const offerSchema = z.object({
  companyId: id,
  candidateApplicationId: id,
  offerNumber: z.string().trim().min(1).max(50),
  employmentType: z.enum([
    'permanent',
    'probationary',
    'contractual',
    'temporary',
    'intern',
    'part_time',
  ]),
  proposedJoiningDate: z.iso.date(),
  monthlyAmount: money,
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase()),
  branchId: id,
  departmentId: id,
  designationId: id,
  managerEmploymentId: id.nullable().optional(),
  terms: z.string().trim().max(4000).nullable().optional(),
  idempotencyKey: key,
});
export const transitionSchema = z.object({ workflowVersion: id, reason, idempotencyKey: key });
export const convertSchema = z.object({
  workflowVersion: id,
  employeeCode: z.string().trim().toUpperCase().min(1).max(50),
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).nullable().optional(),
  lastName: z.string().trim().min(1).max(100),
  preferredName: z.string().trim().max(100).nullable().optional(),
  initialStatus: z.enum(['probation', 'confirmed']),
  statusReason: reason,
  workCalendarId: id.nullable().optional(),
  gradeId: id.nullable().optional(),
  costCenterId: id.nullable().optional(),
  idempotencyKey: key,
});
