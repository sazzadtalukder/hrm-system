import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  assetSchema,
  assignSchema,
  categorySchema,
  idParams,
  listQuery,
  returnSchema,
  statusSchema,
} from './assetSchemas.js';
export function createAssetRouter({ authenticate, authorizationService, assetController: c }) {
  const router = Router();
  const permission = (code) => requirePermission(authorizationService, code);
  router.use(authenticate);
  router.get('/', permission('asset.view'), validate(listQuery, 'query'), c.list('asset.view'));
  router.get(
    '/my',
    permission('asset.view_own'),
    validate(listQuery, 'query'),
    c.list('asset.view_own'),
  );
  router.post(
    '/categories',
    permission('asset_category.create'),
    validate(categorySchema),
    c.createCategory,
  );
  router.post('/', permission('asset.create'), validate(assetSchema), c.create);
  router.get('/:id', permission('asset.view'), validate(idParams, 'params'), c.get('asset.view'));
  router.get(
    '/my/:id',
    permission('asset.view_own'),
    validate(idParams, 'params'),
    c.get('asset.view_own'),
  );
  router.post(
    '/:id/assign',
    permission('asset.assign'),
    validate(idParams, 'params'),
    validate(assignSchema),
    c.assign,
  );
  router.post(
    '/:id/return',
    permission('asset.return'),
    validate(idParams, 'params'),
    validate(returnSchema),
    c.returnAsset,
  );
  router.post(
    '/:id/status',
    permission('asset.update_status'),
    validate(idParams, 'params'),
    validate(statusSchema),
    c.status,
  );
  return router;
}
