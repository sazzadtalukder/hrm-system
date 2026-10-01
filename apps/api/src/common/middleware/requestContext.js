import { randomUUID } from 'node:crypto';

const externalIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestContext(request, response, next) {
  const requestId = randomUUID();
  const candidate = request.get('x-correlation-id') ?? request.get('x-request-id');
  const correlationId = candidate && externalIdPattern.test(candidate) ? candidate : undefined;

  request.context = { requestId, correlationId };
  response.locals.requestId = requestId;
  response.locals.correlationId = correlationId;
  response.setHeader('X-Request-ID', requestId);
  if (correlationId) response.setHeader('X-Correlation-ID', correlationId);
  next();
}
