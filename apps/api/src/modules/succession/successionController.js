import { sendSuccess } from '../../common/http/responses.js';
const run = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};
export function createSuccessionController(s) {
  return {
    limits: run(async (_r, res) => sendSuccess(res, s.limits)),
    positions: run(async (r, res) =>
      sendSuccess(res, { items: await s.listPositions(r.accessContext, r.validated.query) }),
    ),
    createPosition: run(async (r, res) =>
      sendSuccess(
        res,
        await s.createPosition(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    position: run(async (r, res) =>
      sendSuccess(
        res,
        await s.getPosition(r.accessContext, r.validated.params.id, 'critical_position.view'),
      ),
    ),
    positionHistory: run(async (r, res) =>
      sendSuccess(
        res,
        await s.positionHistory(r.accessContext, r.validated.params.id, 'critical_position.view'),
      ),
    ),
    versionPosition: run(async (r, res) =>
      sendSuccess(
        res,
        await s.versionPosition(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    positionStatus: (status, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await s.positionStatus(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            status,
            r.validated.body,
            permission,
            r.context,
          ),
        ),
      ),
    plans: run(async (r, res) =>
      sendSuccess(res, { items: await s.listPlans(r.accessContext, r.validated.query) }),
    ),
    createPlan: run(async (r, res) =>
      sendSuccess(
        res,
        await s.createPlan(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    plan: run(async (r, res) =>
      sendSuccess(
        res,
        await s.getPlan(
          r.accessContext,
          r.validated.params.id,
          'succession_plan.view',
          r.actor,
          r.context,
        ),
      ),
    ),
    planHistory: run(async (r, res) =>
      sendSuccess(
        res,
        await s.planHistory(
          r.accessContext,
          r.validated.params.id,
          'succession_plan.view',
          r.actor,
          r.context,
        ),
      ),
    ),
    planAction: (a, p) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await s.planAction(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            a,
            r.validated.body,
            p,
            r.context,
          ),
        ),
      ),
    createNomination: run(async (r, res) =>
      sendSuccess(
        res,
        await s.createNomination(
          r.actor,
          r.accessContext,
          { ...r.validated.body, successionPlanId: r.validated.params.id },
          r.context,
        ),
        201,
      ),
    ),
    list: (p) =>
      run(async (r, res) =>
        sendSuccess(res, {
          items: await s.list(r.actor, r.accessContext, r.validated.query, p, r.context),
        }),
      ),
    get: (p) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await s.get(r.actor, r.accessContext, r.validated.params.id, p, r.context),
        ),
      ),
    action: (a, p) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await s.nominationAction(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            a,
            r.validated.body,
            p,
            r.context,
          ),
        ),
      ),
    readiness: run(async (r, res) =>
      sendSuccess(
        res,
        await s.readiness(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          'succession_nomination.update_readiness',
          r.context,
        ),
      ),
    ),
    reassign: run(async (r, res) =>
      sendSuccess(
        res,
        await s.reassign(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    history: (p) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await s.history(r.actor, r.accessContext, r.validated.params.id, p, r.context),
        ),
      ),
    export: run(async (r, res) =>
      res
        .type('text/csv')
        .send(await s.export(r.actor, r.accessContext, r.validated.query, r.context)),
    ),
  };
}
