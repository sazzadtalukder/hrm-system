import { ApplicationError } from '../../common/errors/ApplicationError.js';

export function createManagerSelfServiceService(repository) {
  return {
    async dashboard(context, companyId) {
      const result = await repository.dashboard(context, companyId);
      if (!result)
        throw new ApplicationError({
          code: 'NOT_FOUND',
          message: 'The requested manager workspace was not found.',
          statusCode: 404,
        });
      return result;
    },
  };
}
