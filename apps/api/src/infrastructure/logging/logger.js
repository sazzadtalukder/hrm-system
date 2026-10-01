import pino from 'pino';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.password_hash',
  '*.rawToken',
  '*.tokenHash',
  '*.token_hash',
  '*.token',
  '*.secret',
  '*.DB_PASSWORD',
];

export function createLogger(env) {
  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    base: { service: 'hrm-api', environment: env.NODE_ENV },
  });
}
