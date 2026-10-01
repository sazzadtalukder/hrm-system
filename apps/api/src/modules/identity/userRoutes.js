import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../common/http/responses.js';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';

export function createUserRouter({
  authenticate,
  authorizationService,
  userService,
  passwordSetupService,
}) {
  const router = Router();
  const idSchema = z.object({ id: z.coerce.number().int().positive() });
  const reasonSchema = z.object({ reason: z.string().min(1).max(500) });
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.use(authenticate);
  router.get(
    '/',
    requirePermission(authorizationService, 'user.view'),
    validate(
      z.object({
        companyId: z.coerce.number().int().positive().optional(),
        search: z.string().trim().max(320).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      }),
      'query',
    ),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await userService.listUsers({
            accessContext: request.accessContext,
            input: request.validated.query,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/:id',
    requirePermission(authorizationService, 'user.view'),
    validate(idSchema, 'params'),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await userService.getUser({
            accessContext: request.accessContext,
            userId: request.validated.params.id,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.patch(
    '/:id',
    requirePermission(authorizationService, 'user.update'),
    validate(idSchema, 'params'),
    validate(z.object({ email: z.string().email().max(320), reason: z.string().min(1).max(500) })),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await userService.updateUser({
            actor: request.actor,
            accessContext: request.accessContext,
            userId: request.validated.params.id,
            ...request.validated.body,
            requestContext: request.context,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/',
    requirePermission(authorizationService, 'user.create'),
    validate(
      z.object({
        email: z.string().email().max(320),
        companyId: z.coerce.number().int().positive(),
      }),
    ),
    async (request, response, next) => {
      try {
        const result = await userService.createUser({
          actor: request.actor,
          accessContext: request.accessContext,
          email: request.validated.body.email,
          companyId: request.validated.body.companyId,
          requestContext: request.context,
        });
        sendSuccess(response, result, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  for (const [path, permission, status] of [
    ['activate', 'user.activate', 'active'],
    ['deactivate', 'user.deactivate', 'inactive'],
  ]) {
    router.post(
      `/:id/${path}`,
      requirePermission(authorizationService, permission),
      validate(idSchema, 'params'),
      validate(reasonSchema),
      async (request, response, next) => {
        try {
          await userService.setStatus({
            actor: request.actor,
            accessContext: request.accessContext,
            userId: request.validated.params.id,
            status,
            reason: request.validated.body.reason,
            requestContext: request.context,
          });
          response.status(204).end();
        } catch (error) {
          next(error);
        }
      },
    );
  }
  router.post(
    '/:id/invitations',
    requirePermission(authorizationService, 'user.reset_authentication'),
    validate(idSchema, 'params'),
    validate(
      z.object({
        companyId: z.coerce.number().int().positive(),
        reason: z.string().trim().min(1).max(500),
      }),
    ),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await passwordSetupService.issueInvitation({
            actor: request.actor,
            accessContext: request.accessContext,
            userId: request.validated.params.id,
            ...request.validated.body,
            requestContext: request.context,
          }),
          201,
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/:id/password-setup-status',
    requirePermission(authorizationService, 'user.view'),
    validate(idSchema, 'params'),
    validate(z.object({ companyId: z.coerce.number().int().positive() }), 'query'),
    async (request, response, next) => {
      try {
        sendSuccess(
          response,
          await passwordSetupService.status({
            accessContext: request.accessContext,
            userId: request.validated.params.id,
            companyId: request.validated.query.companyId,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:id/reset-authentication',
    requirePermission(authorizationService, 'user.reset_authentication'),
    validate(idSchema, 'params'),
    validate(
      z.object({
        companyId: z.coerce.number().int().positive(),
        reason: z.string().trim().min(1).max(500),
      }),
    ),
    async (request, response, next) => {
      try {
        const result = await passwordSetupService.resetAuthentication({
          actor: request.actor,
          accessContext: request.accessContext,
          userId: request.validated.params.id,
          ...request.validated.body,
          requestContext: request.context,
        });
        sendSuccess(response, result, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:id/revoke-sessions',
    requirePermission(authorizationService, 'user.revoke_session'),
    validate(idSchema, 'params'),
    validate(reasonSchema),
    async (request, response, next) => {
      try {
        await userService.revokeSessions({
          actor: request.actor,
          accessContext: request.accessContext,
          userId: request.validated.params.id,
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
