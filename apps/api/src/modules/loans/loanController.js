import { sendSuccess } from '../../common/http/responses.js';
const run = (fn) => async (r, res, next) => {
  try {
    await fn(r, res);
  } catch (e) {
    next(e);
  }
};
export function createLoanController(service) {
  return {
    limits: run(async (_r, res) => sendSuccess(res, service.limits)),
    types: run(async (r, res) =>
      sendSuccess(res, {
        items: await service.listTypes(r.actor, r.accessContext, r.validated.query),
      }),
    ),
    createType: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createType(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    getType: run(async (r, res) =>
      sendSuccess(res, await service.getType(r.accessContext, r.validated.params.id)),
    ),
    updateType: run(async (r, res) =>
      sendSuccess(
        res,
        await service.updateType(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    versionType: (correction) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.versionType(
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
    deactivateType: run(async (r, res) =>
      sendSuccess(
        res,
        await service.deactivateType(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
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
    transition: (target, p) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.transition(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            target,
            r.validated.body,
            p,
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
    disburse: run(async (r, res) =>
      sendSuccess(
        res,
        await service.disburse(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    account: (p) =>
      run(async (r, res) =>
        sendSuccess(res, await service.account(r.actor, r.accessContext, r.validated.params.id, p)),
      ),
    ledger: (type, p) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.recordLedger(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            r.validated.body,
            type,
            p,
            r.context,
          ),
          201,
        ),
      ),
    reverse: run(async (r, res) =>
      sendSuccess(
        res,
        await service.reverse(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.params.entryId,
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
      res.setHeader('Content-Disposition', 'attachment; filename="loan-facilities.csv"');
      res.send(csv);
    }),
  };
}
