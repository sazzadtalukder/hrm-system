import { AuthorizationError } from '../../common/errors/ApplicationError.js';

export function requireAllowedOrigin(env) {
  return (request, _response, next) => {
    const origin = request.get('origin');
    if (!origin || !env.WEB_ORIGINS.includes(origin)) {
      return next(new AuthorizationError('The request origin is not allowed.'));
    }
    return next();
  };
}
