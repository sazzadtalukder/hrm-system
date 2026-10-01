export class ApiError extends Error {
  constructor({ message, code, status, details = [], requestId, cause }) {
    super(message, { cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}
