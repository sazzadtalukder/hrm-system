import { ValidationError } from '../errors/ApplicationError.js';

export function validate(schema, source = 'body') {
  return (request, _response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      }));
      return next(new ValidationError('The request contains invalid values.', details));
    }

    request.validated ??= {};
    request.validated[source] = result.data;
    return next();
  };
}
