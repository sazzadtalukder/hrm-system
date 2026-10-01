import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../../common/validation/validate.js';
import { ApplicationError } from '../../common/errors/ApplicationError.js';
import { requireAllowedOrigin } from './originProtection.js';

export function createAuthRouter({ env, authController, authenticate }) {
  const router = Router();
  const origin = requireAllowedOrigin(env);
  const limiter = rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_request, _response, next) {
      next(
        new ApplicationError({
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts. Try again later.',
          statusCode: 429,
        }),
      );
    },
  });
  const loginSchema = z.object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(1024),
  });
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(env.PASSWORD_MIN_LENGTH).max(1024),
  });
  const passwordSetupTokenSchema = z.object({ token: z.string().min(1).max(1024) });

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  router.post('/login', origin, limiter, validate(loginSchema), authController.login);
  router.post(
    '/password-setup/validate',
    origin,
    limiter,
    validate(passwordSetupTokenSchema),
    authController.validatePasswordSetup,
  );
  router.post(
    '/password-setup/complete',
    origin,
    limiter,
    validate(
      passwordSetupTokenSchema.extend({
        newPassword: z.string().min(env.PASSWORD_MIN_LENGTH).max(1024),
      }),
    ),
    authController.completePasswordSetup,
  );
  router.post('/refresh', origin, limiter, authController.refresh);
  router.post('/logout', origin, authController.logout);
  router.post('/logout-all', origin, authenticate, authController.logoutAll);
  router.get('/me', authenticate, authController.me);
  router.post(
    '/change-password',
    origin,
    authenticate,
    validate(changePasswordSchema),
    authController.changePassword,
  );
  return router;
}
