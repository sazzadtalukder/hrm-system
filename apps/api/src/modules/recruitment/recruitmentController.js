import { sendSuccess } from '../../common/http/responses.js';
const run = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
export function createRecruitmentController(service) {
  const list = (kind, permission) =>
    run(async (req, res) =>
      sendSuccess(res, {
        items: await service.list(req.accessContext, req.validated.query, permission, kind),
      }),
    );
  const detail = (kind, permission, sensitive = false) =>
    run(async (req, res) =>
      sendSuccess(
        res,
        await service.detail(
          req.accessContext,
          req.validated.params.id,
          permission,
          kind,
          sensitive,
        ),
      ),
    );
  const create = (method) =>
    run(async (req, res) =>
      sendSuccess(
        res,
        await service[method](req.actor, req.accessContext, req.validated.body, req.context),
        201,
      ),
    );
  const transition = (kind, to, permission) =>
    run(async (req, res) =>
      sendSuccess(
        res,
        await service.transition(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
          permission,
          kind,
          to,
        ),
      ),
    );
  return {
    dashboard: run(async (req, res) =>
      sendSuccess(res, await service.dashboard(req.actor, req.validated.query)),
    ),
    list,
    detail,
    create,
    transition,
    screen: run(async (req, res) =>
      sendSuccess(
        res,
        await service.screen(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
      ),
    ),
    convert: run(async (req, res) =>
      sendSuccess(
        res,
        await service.convert(
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
