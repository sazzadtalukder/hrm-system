import { sendSuccess } from '../../common/http/responses.js';
const run = (fn) => async (r, res, next) => {
  try {
    await fn(r, res);
  } catch (e) {
    next(e);
  }
};
export function createPerformanceController(service) {
  return {
    limits: run(async (_r, res) => sendSuccess(res, service.limits)),
    scales: run(async (r, res) =>
      sendSuccess(res, { items: await service.listScales(r.accessContext, r.validated.query) }),
    ),
    createScale: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createScale(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    competencies: run(async (r, res) =>
      sendSuccess(res, {
        items: await service.listCompetencies(r.accessContext, r.validated.query),
      }),
    ),
    createCompetency: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createCompetency(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    templates: run(async (r, res) =>
      sendSuccess(res, { items: await service.listTemplates(r.accessContext, r.validated.query) }),
    ),
    createTemplate: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createTemplate(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    cycles: run(async (r, res) =>
      sendSuccess(res, { items: await service.listCycles(r.accessContext, r.validated.query) }),
    ),
    createCycle: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createCycle(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    cycleTransition: (target, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.cycleTransition(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            target,
            r.validated.body,
            permission,
            r.context,
          ),
        ),
      ),
    populate: run(async (r, res) =>
      sendSuccess(
        res,
        await service.populate(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    list: (p) =>
      run(async (r, res) =>
        sendSuccess(res, {
          items: await service.list(r.actor, r.accessContext, r.validated.query, p, r.context),
        }),
      ),
    get: (p) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.get(r.actor, r.accessContext, r.validated.params.id, p, r.context),
        ),
      ),
    goal: run(async (r, res) =>
      sendSuccess(
        res,
        await service.addGoal(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    updateGoal: (correction) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.updateGoal(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            r.validated.params.goalId,
            r.validated.body,
            r.context,
            correction,
          ),
        ),
      ),
    goalTransition: (target, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.goalTransition(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            target,
            r.validated.body,
            permission,
            r.context,
          ),
        ),
      ),
    assessment: (type, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.submitAssessment(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            type,
            r.validated.body,
            permission,
            r.context,
          ),
        ),
      ),
    acknowledge: run(async (r, res) =>
      sendSuccess(
        res,
        await service.acknowledge(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    finalTransition: (target, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.finalTransition(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            target,
            r.validated.body,
            permission,
            r.context,
          ),
        ),
      ),
    reassign: run(async (r, res) =>
      sendSuccess(
        res,
        await service.reassign(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    history: (permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.history(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            permission,
            r.context,
          ),
        ),
      ),
    export: run(async (r, res) => {
      const csv = await service.export(r.actor, r.accessContext, r.validated.query, r.context);
      res.type('text/csv').send(csv);
    }),
  };
}
