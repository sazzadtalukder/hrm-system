import { sendSuccess } from '../../common/http/responses.js';
const run = (f) => async (req, res, next) => {
  try {
    await f(req, res);
  } catch (e) {
    next(e);
  }
};
export function createOnboardingController(service) {
  const list = (table, p) =>
    run(async (req, res) =>
      sendSuccess(res, {
        items: await service.list(req.accessContext, req.validated.query, p, table),
      }),
    );
  const get = (table, p) =>
    run(async (req, res) =>
      sendSuccess(res, await service.get(req.accessContext, req.validated.params.id, p, table)),
    );
  return {
    list,
    get,
    createTemplate: run(async (req, res) =>
      sendSuccess(
        res,
        await service.createTemplate(req.actor, req.accessContext, req.validated.body, req.context),
        201,
      ),
    ),
    addTemplateTask: run(async (req, res) =>
      sendSuccess(
        res,
        await service.addTemplateTask(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
        201,
      ),
    ),
    templateTransition: (to) =>
      run(async (req, res) =>
        sendSuccess(
          res,
          await service.transitionTemplate(
            req.actor,
            req.accessContext,
            req.validated.params.id,
            req.validated.body,
            req.context,
            to,
          ),
        ),
      ),
    createCase: run(async (req, res) =>
      sendSuccess(
        res,
        await service.createCase(req.actor, req.accessContext, req.validated.body, req.context),
        201,
      ),
    ),
    caseTransition: (to) =>
      run(async (req, res) =>
        sendSuccess(
          res,
          await service.caseTransition(
            req.actor,
            req.accessContext,
            req.validated.params.id,
            req.validated.body,
            req.context,
            to,
          ),
        ),
      ),
    taskAction: (to) =>
      run(async (req, res) =>
        sendSuccess(
          res,
          await service.taskAction(
            req.actor,
            req.accessContext,
            req.validated.params.id,
            req.validated.body,
            req.context,
            to,
          ),
        ),
      ),
    readiness: run(async (req, res) =>
      sendSuccess(
        res,
        await service.readiness(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
        201,
      ),
    ),
    children: (table, permission) =>
      run(async (req, res) =>
        sendSuccess(res, {
          items: await service.caseChildren(
            req.accessContext,
            req.validated.params.id,
            permission,
            table,
          ),
        }),
      ),
    addDocument: run(async (req, res) =>
      sendSuccess(
        res,
        await service.addDocument(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
        201,
      ),
    ),
    addResource: run(async (req, res) =>
      sendSuccess(
        res,
        await service.addResource(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
        201,
      ),
    ),
  };
}
