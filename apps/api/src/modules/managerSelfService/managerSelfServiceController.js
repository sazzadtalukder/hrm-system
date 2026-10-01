import { sendSuccess } from '../../common/http/responses.js';

export function createManagerSelfServiceController(service) {
  return {
    async dashboard(req, res, next) {
      try {
        sendSuccess(res, await service.dashboard(req.accessContext, req.validated.query.companyId));
      } catch (error) {
        next(error);
      }
    },
  };
}
