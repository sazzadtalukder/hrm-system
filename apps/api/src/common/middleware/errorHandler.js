import { ApplicationError } from '../errors/ApplicationError.js';

function malformedJson(error) {
  return error instanceof SyntaxError && error.status === 400 && 'body' in error;
}

function payloadTooLarge(error) {
  return error?.status === 413 || error?.type === 'entity.too.large';
}

function unsupportedBody(error) {
  return (
    error?.status === 415 ||
    error?.type === 'charset.unsupported' ||
    error?.type === 'encoding.unsupported'
  );
}

export function errorHandler(logger) {
  return (error, request, response, _next) => {
    let normalized = error;
    if (payloadTooLarge(error)) {
      normalized = new ApplicationError({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body exceeds the allowed size.',
        statusCode: 413,
      });
    } else if (unsupportedBody(error)) {
      normalized = new ApplicationError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'The request body uses an unsupported media type or encoding.',
        statusCode: 415,
      });
    } else if (malformedJson(error)) {
      normalized = new ApplicationError({
        code: 'MALFORMED_JSON',
        message: 'The request body contains malformed JSON.',
        statusCode: 400,
      });
    } else if (!(error instanceof ApplicationError)) {
      normalized = new ApplicationError({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        statusCode: 500,
        cause: error,
      });
    }

    const logContext = {
      requestId: response.locals.requestId,
      correlationId: response.locals.correlationId,
      code: normalized.code,
    };
    if (normalized.statusCode >= 500) {
      logger.error({ ...logContext, err: error }, 'Request failed');
    } else {
      // Client errors can contain raw request fragments (for example malformed JSON). Never log
      // the original error object because authentication bodies may contain credentials.
      logger.warn(logContext, 'Request rejected');
    }

    response.status(normalized.statusCode).json({
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
      requestId: response.locals.requestId,
    });
  };
}
