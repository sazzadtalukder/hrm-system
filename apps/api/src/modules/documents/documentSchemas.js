import { z } from 'zod';
const id = z.coerce.number().int().positive();
const reason = z.string().trim().min(1).max(500);
const key = z.string().trim().min(8).max(100);
export const idParams = z.object({ id });
export const listQuery = z.object({
  companyId: id,
  status: z.enum(['draft', 'published', 'revoked']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const typeSchema = z.object({
  companyId: id,
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  isSensitive: z.boolean().default(false),
  acknowledgmentRequired: z.boolean().default(false),
});
const reference = {
  referenceType: z.enum(['external_url', 'external_reference']),
  referenceValue: z.string().trim().min(1).max(500),
  fileName: z.string().trim().max(255).nullable().optional(),
  mimeType: z.string().trim().max(100).nullable().optional(),
  checksumSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .nullable()
    .optional(),
  effectiveOn: z.iso.date(),
  expiresOn: z.iso.date().nullable().optional(),
  reason,
  idempotencyKey: key,
};
export const documentSchema = z
  .object({
    companyId: id,
    documentTypeId: id,
    documentCode: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform((v) => v.toUpperCase()),
    title: z.string().trim().min(1).max(200),
    audience: z.enum(['company', 'branch', 'department', 'employee']),
    branchId: id.nullable().optional(),
    departmentId: id.nullable().optional(),
    employmentId: id.nullable().optional(),
    ...reference,
  })
  .superRefine((value, ctx) => {
    const required =
      value.audience === 'branch'
        ? value.branchId
        : value.audience === 'department'
          ? value.departmentId
          : value.audience === 'employee'
            ? value.employmentId
            : true;
    if (!required)
      ctx.addIssue({
        code: 'custom',
        path: ['audience'],
        message: 'The selected audience requires its matching target.',
      });
    if (value.referenceType === 'external_url' && !value.referenceValue.startsWith('https://'))
      ctx.addIssue({
        code: 'custom',
        path: ['referenceValue'],
        message: 'External URLs must use HTTPS.',
      });
  });
export const versionSchema = z.object({ ...reference, version: id });
export const transitionSchema = z.object({ workflowVersion: id, reason, idempotencyKey: key });
export const acknowledgmentSchema = z.object({ idempotencyKey: key });
