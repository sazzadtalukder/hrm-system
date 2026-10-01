import { Router } from 'express';
import { ApplicationError } from '../common/errors/ApplicationError.js';
import { sendSuccess } from '../common/http/responses.js';
import { checkDatabaseHealth } from '../infrastructure/database/health.js';

export function createHealthRouter({ database }) {
  const router = Router();

  router.get('/live', (_request, response) => {
    sendSuccess(response, { status: 'alive' });
  });

  router.get('/ready', async (_request, response, next) => {
    try {
      const databaseHealth = await checkDatabaseHealth(database);
      sendSuccess(response, { status: 'ready', database: databaseHealth });
    } catch (cause) {
      next(
        new ApplicationError({
          code: 'SERVICE_NOT_READY',
          message: 'The service is not ready to accept traffic.',
          statusCode: 503,
          cause,
        }),
      );
    }
  });

  return router;
}
