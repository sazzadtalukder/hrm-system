import { z } from 'zod';

const id = z.coerce.number().int().positive();
const nullableId = id.nullable().optional();
const optionalText = (max) => z.string().trim().max(max).nullable().optional();
const employeeCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(50)
  .regex(/^[A-Z0-9_/-]+$/);
const isoDate = z.iso.date();
const status = z.enum(['probation', 'confirmed', 'suspended', 'resigned', 'terminated', 'retired']);

export const idParams = z.object({ id });
export const detailQuery = z.object({ asOfDate: isoDate.optional() });
export const contactParams = z.object({ id, contactId: id });
export const employeeListQuery = z.object({
  companyId: id,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  recordStatus: z.enum(['active', 'inactive']).optional(),
  employmentStatus: status.optional(),
  branchId: id.optional(),
  departmentId: id.optional(),
  designationId: id.optional(),
  managerEmploymentId: id.optional(),
  asOfDate: isoDate.optional(),
  sort: z
    .enum(['display_name', 'employee_code', 'joining_date', 'created_at'])
    .default('display_name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

const assignment = z.object({
  branchId: id,
  departmentId: id,
  designationId: id,
  gradeId: nullableId,
  costCenterId: nullableId,
  workCalendarId: nullableId,
  managerEmploymentId: nullableId,
  effectiveStart: isoDate,
  effectiveEnd: isoDate.nullable().optional(),
  reason: z.string().trim().min(1).max(500),
});

export const employeeCreateSchema = z.object({
  companyId: id,
  firstName: z.string().trim().min(1).max(100),
  middleName: optionalText(100),
  lastName: z.string().trim().min(1).max(100),
  preferredName: optionalText(100),
  employeeCode,
  employmentType: z.enum([
    'permanent',
    'probationary',
    'contractual',
    'temporary',
    'intern',
    'part_time',
  ]),
  joiningDate: isoDate,
  confirmationDate: isoDate.nullable().optional(),
  initialStatus: status,
  statusReason: z.string().trim().min(1).max(500),
  assignment,
});

export const employmentCreateSchema = z.object({
  employeeCode,
  employmentType: z.enum([
    'permanent',
    'probationary',
    'contractual',
    'temporary',
    'intern',
    'part_time',
  ]),
  joiningDate: isoDate,
  confirmationDate: isoDate.nullable().optional(),
  initialStatus: status,
  statusReason: z.string().trim().min(1).max(500),
  assignment,
});

export const employeeUpdateSchema = z.object({
  version: z.coerce.number().int().positive(),
  firstName: z.string().trim().min(1).max(100).optional(),
  middleName: optionalText(100),
  lastName: z.string().trim().min(1).max(100).optional(),
  preferredName: optionalText(100),
});

export const lifecycleSchema = z.object({
  version: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

export const personalSchema = z.object({
  version: z.coerce.number().int().positive(),
  dateOfBirth: isoDate.nullable().optional(),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']).nullable().optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).nullable().optional(),
  nationalityCountryCode: z.string().trim().length(2).toUpperCase().nullable().optional(),
});

const address = (prefix) => ({
  [`${prefix}AddressLine1`]: optionalText(250),
  [`${prefix}AddressLine2`]: optionalText(250),
  [`${prefix}City`]: optionalText(100),
  [`${prefix}PostalCode`]: optionalText(30),
  [`${prefix}CountryCode`]: z.string().trim().length(2).toUpperCase().nullable().optional(),
});

export const contactSchema = z.object({
  version: z.coerce.number().int().positive(),
  personalEmail: z.string().trim().email().max(320).nullable().optional(),
  personalPhone: optionalText(50),
  alternatePhone: optionalText(50),
  ...address('present'),
  ...address('permanent'),
});

export const emergencyContactCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  relationship: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(50),
  alternatePhone: optionalText(50),
  isPrimary: z.boolean().default(false),
});
export const emergencyContactUpdateSchema = emergencyContactCreateSchema.partial().extend({
  version: z.coerce.number().int().positive(),
});

export const assignmentSchema = assignment.extend({
  supersedesAssignmentId: nullableId,
});

export const statusTransitionSchema = z.object({
  employmentId: id,
  status,
  effectiveStart: isoDate,
  effectiveEnd: isoDate.nullable().optional(),
  reason: z.string().trim().min(1).max(500),
  supersedesStatusHistoryId: nullableId,
});

export const userLinkSchema = z.object({ userId: id, reason: z.string().trim().min(1).max(500) });
export const userUnlinkSchema = z.object({
  version: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});
