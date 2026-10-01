import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  evidenceSchema,
  idParams,
  listQuery,
  pathSchema,
  pathVersionSchema,
  planSchema,
  planUpdateSchema,
  progressSchema,
  reassignSchema,
  recordVersionSchema,
  transitionSchema,
} from './careerSchemas.js';
export function createCareerRouter({ authenticate, authorizationService, careerController: c }) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x);
  r.use(authenticate);
  r.get('/limits', p('career_plan.view_own'), c.limits);
  r.get('/paths', p('career_path.view'), validate(listQuery, 'query'), c.listPaths);
  r.post('/paths', p('career_path.create'), validate(pathSchema), c.createPath);
  r.get('/paths/:id', p('career_path.view'), validate(idParams, 'params'), c.getPath);
  r.get('/paths/:id/history', p('career_path.view'), validate(idParams, 'params'), c.pathHistory);
  r.post(
    '/paths/:id/versions',
    p('career_path.version_create'),
    validate(idParams, 'params'),
    validate(pathVersionSchema),
    c.versionPath,
  );
  r.post(
    '/paths/:id/activate',
    p('career_path.activate'),
    validate(idParams, 'params'),
    validate(recordVersionSchema),
    c.pathStatus('active', 'career_path.activate'),
  );
  r.post(
    '/paths/:id/deactivate',
    p('career_path.deactivate'),
    validate(idParams, 'params'),
    validate(recordVersionSchema),
    c.pathStatus('inactive', 'career_path.deactivate'),
  );
  r.get(
    '/my',
    p('career_plan.view_own'),
    validate(listQuery, 'query'),
    c.list('career_plan.view_own'),
  );
  r.post('/my', p('career_plan.create'), validate(planSchema), c.createPlan);
  r.put(
    '/plans/:id',
    p('career_plan.update_draft'),
    validate(idParams, 'params'),
    validate(planUpdateSchema),
    c.updatePlan,
  );
  r.post(
    '/plans/:id/progress',
    p('career_plan.update_progress'),
    validate(idParams, 'params'),
    validate(progressSchema),
    c.progress,
  );
  r.post(
    '/plans/:id/reassign-manager',
    p('career_plan.reassign_manager'),
    validate(idParams, 'params'),
    validate(reassignSchema),
    c.reassign,
  );
  r.post(
    '/plans/:id/evidence',
    p('career_plan.update_progress'),
    validate(idParams, 'params'),
    validate(evidenceSchema),
    c.evidence,
  );
  r.get(
    '/team',
    p('career_plan.view_team'),
    validate(listQuery, 'query'),
    c.list('career_plan.view_team'),
  );
  r.get('/plans', p('career_plan.view'), validate(listQuery, 'query'), c.list('career_plan.view'));
  r.get('/export.csv', p('career_plan.export'), validate(listQuery, 'query'), c.export);
  for (const [prefix, permission] of [
    ['my', 'career_plan.view_own'],
    ['team', 'career_plan.view_team'],
    ['plans', 'career_plan.view'],
  ]) {
    r.get(`/${prefix}/:id`, p(permission), validate(idParams, 'params'), c.get(permission));
    r.get(
      `/${prefix}/:id/history`,
      p(permission),
      validate(idParams, 'params'),
      c.history(permission),
    );
  }
  for (const [path, action, permission] of [
    ['submit', 'submit', 'career_plan.submit'],
    ['withdraw', 'withdraw', 'career_plan.withdraw'],
    ['approve', 'approve', 'career_plan.approve'],
    ['return', 'return', 'career_plan.return'],
    ['complete', 'complete', 'career_plan.complete'],
    ['cancel', 'cancel', 'career_plan.cancel'],
  ])
    r.post(
      `/plans/:id/${path}`,
      p(permission),
      validate(idParams, 'params'),
      validate(transitionSchema),
      c.act(action, permission),
    );
  return r;
}
