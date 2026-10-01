import { sendSuccess } from '../../common/http/responses.js';
const run = (fn) => async (r, res, next) => {
  try {
    await fn(r, res);
  } catch (error) {
    next(error);
  }
};
export function createClaimController(service) {
  return {
    limits: run(async (_r, res) => sendSuccess(res, service.limits)),
    categories: run(async (r, res) =>
      sendSuccess(res, {
        items: await service.listCategories(r.actor, r.accessContext, r.validated.query),
      }),
    ),
    getCategory: run(async (r, res) =>
      sendSuccess(res, await service.getCategory(r.accessContext, r.validated.params.id)),
    ),
    createCategory: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createCategory(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    updateCategory: run(async (r, res) =>
      sendSuccess(
        res,
        await service.updateCategory(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    versionCategory: (correction = false) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.versionCategory(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            r.validated.body,
            r.context,
            correction,
          ),
          201,
        ),
      ),
    deactivateCategory: run(async (r, res) =>
      sendSuccess(
        res,
        await service.deactivateCategory(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    list: (permission) =>
      run(async (r, res) =>
        sendSuccess(res, {
          items: await service.list(r.actor, r.accessContext, r.validated.query, permission),
        }),
      ),
    get: (permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.get(r.actor, r.accessContext, r.validated.params.id, permission),
        ),
      ),
    create: run(async (r, res) =>
      sendSuccess(
        res,
        await service.create(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    update: run(async (r, res) =>
      sendSuccess(
        res,
        await service.updateDraft(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    submit: run(async (r, res) =>
      sendSuccess(
        res,
        await service.submit(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    transition: (target, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.simpleTransition(
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
    decide: (kind, decision) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.decide(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            kind,
            decision,
            r.validated.body,
            r.context,
          ),
        ),
      ),
    cancelDecision: (decision) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.decideCancellation(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            decision,
            r.validated.body,
            r.context,
          ),
        ),
      ),
    payment: run(async (r, res) =>
      sendSuccess(
        res,
        await service.recordPayment(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    history: run(async (r, res) =>
      sendSuccess(res, await service.history(r.accessContext, r.validated.params.id)),
    ),
    export: run(async (r, res) => {
      const csv = await service.export(r.actor, r.accessContext, r.validated.query, r.context);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="expense-claims.csv"');
      res.send(csv);
    }),
  };
}
