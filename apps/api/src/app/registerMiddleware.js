import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { requestContext } from '../common/middleware/requestContext.js';

export function registerMiddleware(app, { env, logger }) {
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => request.context.requestId,
      customProps: (request) => ({ correlationId: request.context.correlationId }),
      serializers: {
        req: (request) => ({
          method: request.method,
          path: request.url?.split('?')[0] ?? '/',
        }),
        res: (response) => ({ statusCode: response.statusCode }),
      },
      customSuccessMessage: () => 'Request completed',
      customErrorMessage: () => 'Request completed with error',
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.WEB_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Correlation-ID',
        'X-Request-ID',
        'X-Company-ID',
        'Idempotency-Key',
        'X-Source-Reference',
      ],
      exposedHeaders: ['X-Request-ID', 'X-Correlation-ID'],
    }),
  );
  app.use(express.json({ limit: env.API_BODY_LIMIT }));
}
