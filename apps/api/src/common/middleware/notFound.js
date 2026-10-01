import { ApplicationError } from '../errors/ApplicationError.js';

export function notFound(request, _response, next) {
  next(
    new ApplicationError({
      code: 'ROUTE_NOT_FOUND',
      message: `No route exists for ${request.method} ${request.path}.`,
      statusCode: 404,
    }),
  );
}
