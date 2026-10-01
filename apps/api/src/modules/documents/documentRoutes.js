import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  acknowledgmentSchema,
  documentSchema,
  idParams,
  listQuery,
  transitionSchema,
  typeSchema,
  versionSchema,
} from './documentSchemas.js';
export function createDocumentRouter({
  authenticate,
  authorizationService,
  documentController: c,
}) {
  const router = Router();
  const permission = (code) => requirePermission(authorizationService, code);
  router.use(authenticate);
  router.get(
    '/',
    permission('document.view'),
    validate(listQuery, 'query'),
    c.list('document.view'),
  );
  router.get(
    '/my',
    permission('document.view_own'),
    validate(listQuery, 'query'),
    c.list('document.view_own'),
  );
  router.post('/types', permission('document_type.create'), validate(typeSchema), c.createType);
  router.post('/', permission('document.create'), validate(documentSchema), c.create);
  for (const [prefix, viewPermission] of [
    ['', 'document.view'],
    ['/my', 'document.view_own'],
  ]) {
    router.get(
      `${prefix}/:id`,
      permission(viewPermission),
      validate(idParams, 'params'),
      c.get(viewPermission),
    );
    router.get(
      `${prefix}/:id/history`,
      permission(viewPermission),
      validate(idParams, 'params'),
      c.history(viewPermission),
    );
  }
  router.post(
    '/:id/versions',
    permission('document.version_create'),
    validate(idParams, 'params'),
    validate(versionSchema),
    c.version,
  );
  router.post(
    '/:id/publish',
    permission('document.publish'),
    validate(idParams, 'params'),
    validate(transitionSchema),
    c.transition('published', 'document.publish'),
  );
  router.post(
    '/:id/revoke',
    permission('document.revoke'),
    validate(idParams, 'params'),
    validate(transitionSchema),
    c.transition('revoked', 'document.revoke'),
  );
  router.post(
    '/my/:id/acknowledge',
    permission('document.acknowledge'),
    validate(idParams, 'params'),
    validate(acknowledgmentSchema),
    c.acknowledge,
  );
  return router;
}
