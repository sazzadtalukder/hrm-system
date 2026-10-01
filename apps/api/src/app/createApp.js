import express from 'express';
import { errorHandler } from '../common/middleware/errorHandler.js';
import { notFound } from '../common/middleware/notFound.js';
import { registerMiddleware } from './registerMiddleware.js';
import { registerRoutes } from './registerRoutes.js';

export function createApp(dependencies) {
  const app = express();
  registerMiddleware(app, dependencies);
  registerRoutes(app, dependencies);
  app.use(notFound);
  app.use(errorHandler(dependencies.logger));
  return app;
}
