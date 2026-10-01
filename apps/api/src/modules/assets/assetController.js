import { sendSuccess } from '../../common/http/responses.js';
const run = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};
export function createAssetController(service) {
  return {
    list: (permission) =>
      run(async (req, res) =>
        sendSuccess(res, {
          items: await service.list(req.accessContext, req.validated.query, permission),
        }),
      ),
    get: (permission) =>
      run(async (req, res) =>
        sendSuccess(res, await service.get(req.accessContext, req.validated.params.id, permission)),
      ),
    createCategory: run(async (req, res) =>
      sendSuccess(
        res,
        await service.createCategory(req.actor, req.accessContext, req.validated.body, req.context),
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
    assign: run(async (req, res) =>
      sendSuccess(
        res,
        await service.assign(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
        201,
      ),
    ),
    returnAsset: run(async (req, res) =>
      sendSuccess(
        res,
        await service.returnAsset(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
      ),
    ),
    status: run(async (req, res) =>
      sendSuccess(
        res,
        await service.status(
          req.actor,
          req.accessContext,
          req.validated.params.id,
          req.validated.body,
          req.context,
        ),
      ),
    ),
  };
}
