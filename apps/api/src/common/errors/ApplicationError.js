export class ApplicationError extends Error {
  constructor({ code, message, statusCode = 500, details = [], cause }) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message, details = []) {
    super({ code: 'VALIDATION_FAILED', message, statusCode: 422, details });
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(message = 'Authentication is required.') {
    super({ code: 'AUTHENTICATION_REQUIRED', message, statusCode: 401 });
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(message = 'You are not authorized to perform this action.') {
    super({ code: 'FORBIDDEN', message, statusCode: 403 });
  }
}

export class ConflictError extends ApplicationError {
  constructor(code, message) {
    super({ code, message, statusCode: 409 });
  }
}
