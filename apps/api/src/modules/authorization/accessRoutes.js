import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../common/http/responses.js';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from './authorizationMiddleware.js';

export function createAccessRouter({ authenticate, authorizationService, accessService }) {
  const router = Router();
  const scopeTypes = ['own', 'direct_reports', 'department', 'branch', 'company', 'all'];
  const scopedGrantFields = {
    userId: z.coerce.number().int().positive(),
    scopeType: z.enum(scopeTypes),
    companyId: z.coerce.number().int().positive().nullable().optional(),
    branchId: z.coerce.number().int().positive().nullable().optional(),
    departmentId: z.coerce.number().int().positive().nullable().optional(),
    effectiveStart: z.iso.date(),
    effectiveEnd: z.iso.date().nullable().optional(),
  };
  const validPeriod = (value) => !value.effectiveEnd || value.effectiveEnd >= value.effectiveStart;
  const assignmentSchema = z
    .object({ ...scopedGrantFields, roleCode: z.string().min(1).max(100) })
    .refine(validPeriod, {
      path: ['effectiveEnd'],
      message: 'Effective end must not precede effective start.',
    });
  const revokeSchema = z.object({ reason: z.string().min(1).max(500) });
  const grantSchema = z
    .object({
      ...scopedGrantFields,
      permissionCode: z.string().min(1).max(150),
      reason: z.string().min(1).max(500),
    })
    .refine(validPeriod, {
      path: ['effectiveEnd'],
      message: 'Effective end must not precede effective start.',
    });

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(authenticate);
  router.get(
    '/roles',
    requirePermission(authorizationService, 'role.view'),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await accessService.listRoles({ accessContext: request.accessContext }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/permissions/direct-grant-eligible',
    requirePermission(authorizationService, 'user.assign_role'),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await accessService.listDirectGrantPermissions({ accessContext: request.accessContext }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/role-assignments',
    requirePermission(authorizationService, 'role.view_assignment_history'),
    validate(z.object({ userId: z.coerce.number().int().positive() }), 'query'),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await accessService.listRoleAssignments({
            accessContext: request.accessContext,
            userId: request.validated.query.userId,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/permission-grants',
    requirePermission(authorizationService, 'user.assign_role'),
    validate(z.object({ userId: z.coerce.number().int().positive() }), 'query'),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await accessService.listPermissionGrants({
            accessContext: request.accessContext,
            userId: request.validated.query.userId,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/role-assignments',
    requirePermission(authorizationService, 'role.assign'),
    validate(assignmentSchema),
    async (request, response, next) => {
      try {
        const result = await accessService.assignRole({
          actor: request.actor,
          accessContext: request.accessContext,
          input: request.validated.body,
          requestContext: request.context,
        });
        sendSuccess(response, result, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/permission-grants',
    requirePermission(authorizationService, 'user.assign_role'),
    validate(grantSchema),
    async (request, response, next) => {
      try {
        const result = await accessService.grantPermission({
          actor: request.actor,
          accessContext: request.accessContext,
          input: request.validated.body,
          requestContext: request.context,
        });
        sendSuccess(response, result, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/permission-grants/:id/revoke',
    requirePermission(authorizationService, 'user.assign_role'),
    validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
    validate(revokeSchema),
    async (request, response, next) => {
      try {
        await accessService.revokePermission({
          actor: request.actor,
          accessContext: request.accessContext,
          grantId: request.validated.params.id,
          reason: request.validated.body.reason,
          requestContext: request.context,
        });
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/role-assignments/:id/revoke',
    requirePermission(authorizationService, 'role.revoke'),
    validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
    validate(revokeSchema),
    async (request, response, next) => {
      try {
        await accessService.revokeRole({
          actor: request.actor,
          accessContext: request.accessContext,
          assignmentId: request.validated.params.id,
          reason: request.validated.body.reason,
          requestContext: request.context,
        });
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
