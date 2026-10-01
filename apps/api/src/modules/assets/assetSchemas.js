import { z } from 'zod';
const id = z.coerce.number().int().positive();
const reason = z.string().trim().min(1).max(500);
const key = z.string().trim().min(8).max(100);
export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  status: z.enum(['available', 'assigned', 'maintenance', 'lost', 'retired']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const categorySchema = z.object({
  companyId: id,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
});
export const assetSchema = z.object({
  companyId: id,
  assetCategoryId: id,
  assetCode: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  serialNumber: z.string().trim().max(150).nullable().optional(),
  acquiredOn: z.iso.date().nullable().optional(),
  acquisitionCost: z
    .string()
    .regex(/^\d{1,17}(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase()),
});
export const assignSchema = z.object({
  employmentId: id,
  assignedOn: z.iso.date(),
  condition: z.string().trim().min(1).max(500),
  workflowVersion: id,
  reason,
  idempotencyKey: key,
});
export const returnSchema = z.object({
  returnedOn: z.iso.date(),
  condition: z.string().trim().min(1).max(500),
  workflowVersion: id,
  reason,
  idempotencyKey: key,
});
export const statusSchema = z.object({
  status: z.enum(['available', 'maintenance', 'lost', 'retired']),
  workflowVersion: id,
  reason,
  idempotencyKey: key,
});
