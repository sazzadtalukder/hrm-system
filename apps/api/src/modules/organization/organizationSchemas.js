import { z } from 'zod';

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/);
const name = z.string().trim().min(1).max(150);
const nullableText = (max) => z.string().trim().max(max).nullable().optional();

export const idParams = z.object({ id: z.coerce.number().int().positive() });
export const listQuery = z.object({
  companyId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'cancelled']).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['name', 'code', 'created_at', 'holiday_date']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});
export const companyUpdateSchema = z.object({
  version: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  legalName: nullableText(250),
  countryCode: z.string().trim().length(2).toUpperCase(),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  timezone: z.string().trim().min(1).max(100),
  locale: z.string().trim().min(2).max(20),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: nullableText(50),
  addressLine1: nullableText(250),
  addressLine2: nullableText(250),
  city: nullableText(100),
  postalCode: nullableText(30),
});
export const masterCreateSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  code,
  name,
  description: nullableText(500),
  rank: z.coerce.number().int().positive().nullable().optional(),
  parentDepartmentId: z.coerce.number().int().positive().nullable().optional(),
  defaultWorkCalendarId: z.coerce.number().int().positive().nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: nullableText(50),
  addressLine1: nullableText(250),
  addressLine2: nullableText(250),
  city: nullableText(100),
  postalCode: nullableText(30),
  timezone: z.string().trim().min(1).max(100).optional(),
});
export const masterUpdateSchema = masterCreateSchema.omit({ companyId: true }).partial().extend({
  version: z.coerce.number().int().positive(),
});
export const lifecycleSchema = z.object({
  version: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});
export const calendarDaysSchema = z.object({
  version: z.coerce.number().int().positive(),
  days: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(1).max(7),
        isWorkingDay: z.boolean(),
        startTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable(),
        endTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable(),
        breakMinutes: z.coerce.number().int().min(0).max(1440).default(0),
      }),
    )
    .length(7)
    .refine(
      (days) => new Set(days.map(({ weekday }) => weekday)).size === 7,
      'Weekdays must be unique.',
    )
    .refine(
      (days) =>
        days.every((day) =>
          day.isWorkingDay
            ? day.startTime && day.endTime && day.startTime < day.endTime
            : !day.startTime && !day.endTime,
        ),
      'Working-day hours are invalid.',
    ),
});
export const holidayCreateSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  workCalendarId: z.coerce.number().int().positive().nullable().optional(),
  holidayDate: z.iso.date(),
  name,
  description: nullableText(500),
});
export const holidayUpdateSchema = holidayCreateSchema.omit({ companyId: true }).partial().extend({
  version: z.coerce.number().int().positive(),
});
