import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  idParams,
  listQuery,
  nominationSchema,
  planSchema,
  positionSchema,
  positionVersionSchema,
  readinessSchema,
  reassignSchema,
  recordVersionSchema,
  transitionSchema,
} from './successionSchemas.js';
export function createSuccessionRouter({
  authenticate,
  authorizationService,
  successionController: c,
}) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x);
  r.use(authenticate);
  r.get('/limits', p('succession_plan.view'), c.limits);
  r.get(
    '/critical-positions',
    p('critical_position.view'),
    validate(listQuery, 'query'),
    c.positions,
  );
  r.post(
    '/critical-positions',
    p('critical_position.create'),
    validate(positionSchema),
    c.createPosition,
  );
  r.get(
    '/critical-positions/:id',
    p('critical_position.view'),
    validate(idParams, 'params'),
    c.position,
  );
  r.get(
    '/critical-positions/:id/history',
    p('critical_position.view'),
    validate(idParams, 'params'),
    c.positionHistory,
  );
  r.post(
    '/critical-positions/:id/versions',
    p('critical_position.version_create'),
    validate(idParams, 'params'),
    validate(positionVersionSchema),
    c.versionPosition,
  );
  r.post(
    '/critical-positions/:id/activate',
    p('critical_position.activate'),
    validate(idParams, 'params'),
    validate(recordVersionSchema),
    c.positionStatus('active', 'critical_position.activate'),
  );
  r.post(
    '/critical-positions/:id/deactivate',
    p('critical_position.deactivate'),
    validate(idParams, 'params'),
    validate(recordVersionSchema),
    c.positionStatus('inactive', 'critical_position.deactivate'),
  );
  r.get('/plans', p('succession_plan.view'), validate(listQuery, 'query'), c.plans);
  r.post('/plans', p('succession_plan.create'), validate(planSchema), c.createPlan);
  r.get('/plans/:id', p('succession_plan.view'), validate(idParams, 'params'), c.plan);
  r.get(
    '/plans/:id/history',
    p('succession_plan.view'),
    validate(idParams, 'params'),
    c.planHistory,
  );
  for (const [path, action, permission] of [
    ['activate', 'activate', 'succession_plan.activate'],
    ['close', 'close', 'succession_plan.close'],
    ['cancel', 'cancel', 'succession_plan.cancel'],
  ])
    r.post(
      `/plans/:id/${path}`,
      p(permission),
      validate(idParams, 'params'),
      validate(transitionSchema),
      c.planAction(action, permission),
    );
  r.post(
    '/plans/:id/nominations',
    p('succession_nomination.create'),
    validate(idParams, 'params'),
    validate(nominationSchema.omit({ successionPlanId: true })),
    c.createNomination,
  );
  r.get(
    '/nominations',
    p('succession_nomination.view'),
    validate(listQuery, 'query'),
    c.list('succession_nomination.view'),
  );
  r.get(
    '/team',
    p('succession_nomination.view_team'),
    validate(listQuery, 'query'),
    c.list('succession_nomination.view_team'),
  );
  r.get('/export.csv', p('succession.export'), validate(listQuery, 'query'), c.export);
  for (const [prefix, permission] of [
    ['nominations', 'succession_nomination.view'],
    ['team', 'succession_nomination.view_team'],
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
    ['submit', 'submit', 'succession_nomination.submit'],
    ['recommend', 'recommend', 'succession_nomination.recommend'],
    ['reject', 'reject', 'succession_nomination.reject'],
    ['confirm', 'confirm', 'succession_nomination.confirm'],
    ['remove', 'remove', 'succession_nomination.remove'],
    ['withdraw', 'withdraw', 'succession_nomination.withdraw'],
  ])
    r.post(
      `/nominations/:id/${path}`,
      p(permission),
      validate(idParams, 'params'),
      validate(transitionSchema),
      c.action(action, permission),
    );
  r.post(
    '/nominations/:id/readiness',
    p('succession_nomination.update_readiness'),
    validate(idParams, 'params'),
    validate(readinessSchema),
    c.readiness,
  );
  r.post(
    '/nominations/:id/reassign-manager',
    p('succession_nomination.reassign_manager'),
    validate(idParams, 'params'),
    validate(reassignSchema),
    c.reassign,
  );
  return r;
}
