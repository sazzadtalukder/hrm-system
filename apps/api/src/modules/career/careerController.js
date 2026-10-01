import { sendSuccess } from '../../common/http/responses.js';
const run = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};
export function createCareerController(s) {
  return {
    limits: run(async (_r, res) => sendSuccess(res, s.limits)),
    listPaths: run(async (r, res) =>
      sendSuccess(res, { items: await s.listPaths(r.accessContext, r.validated.query) }),
    ),
    createPath: run(async (r, res) =>
      sendSuccess(
        res,
        await s.createPath(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    getPath: run(async (r, res) =>
      sendSuccess(res, await s.getPath(r.accessContext, r.validated.params.id)),
    ),
    pathHistory: run(async (r, res) =>
      sendSuccess(res, await s.pathHistory(r.accessContext, r.validated.params.id)),
    ),
    versionPath: run(async (r, res) =>
      sendSuccess(
        res,
        await s.versionPath(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    pathStatus: (status, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await s.pathStatus(
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
    act: (a, p) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await s.act(
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
    createPlan: run(async (r, res) =>
      sendSuccess(
        res,
        await s.createPlan(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    updatePlan: run(async (r, res) =>
      sendSuccess(
        res,
        await s.updatePlan(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    progress: run(async (r, res) =>
      sendSuccess(
        res,
        await s.progress(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
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
    evidence: run(async (r, res) =>
      sendSuccess(
        res,
        await s.addEvidence(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
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
