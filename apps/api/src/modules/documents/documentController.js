import { sendSuccess } from '../../common/http/responses.js';
const run = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};
export function createDocumentController(service) {
  return {
    list: (permission) =>
      run(async (req, res) =>
        sendSuccess(res, {
          items: await service.list(req.actor, req.accessContext, req.validated.query, permission),
        }),
      ),
    get: (permission) =>
      run(async (req, res) =>
        sendSuccess(
          res,
          await service.get(req.actor, req.accessContext, req.validated.params.id, permission),
        ),
      ),
    history: (permission) =>
      run(async (req, res) =>
        sendSuccess(
          res,
          await service.history(req.actor, req.accessContext, req.validated.params.id, permission),
        ),
      ),
    createType: run(async (req, res) =>
      sendSuccess(
        res,
        await service.createType(req.actor, req.accessContext, req.validated.body, req.context),
        201,
      ),
    ),
    create: run(async (req, res) =>
      sendSuccess(
        res,
        await service.create(req.actor, req.accessContext, req.validated.body, req.context),
        201,
      ),
    ),
    version: run(async (req, res) =>
      sendSuccess(
        res,
        await service.version(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
        201,
      ),
    ),
    transition: (target, permission) =>
      run(async (req, res) =>
        sendSuccess(
          res,
          await service.transition(
            req.actor,
            req.accessContext,
            req.validated.params.id,
            target,
            req.validated.body,
            permission,
            req.context,
          ),
        ),
      ),
    acknowledge: run(async (req, res) =>
      sendSuccess(
        res,
        await service.acknowledge(
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
