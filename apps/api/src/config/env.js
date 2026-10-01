import 'dotenv/config';
import { z } from 'zod';

const trustProxySchema = z.union([z.boolean(), z.string()]).transform((value, context) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);

  context.addIssue({
    code: 'custom',
    message: 'TRUST_PROXY must be true, false, or a non-negative integer.',
  });
  return z.NEVER;
});

const webOriginsSchema = z
  .string()
  .min(1)
  .transform((value, context) => {
    const origins = value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      context.addIssue({ code: 'custom', message: 'At least one web origin is required.' });
      return z.NEVER;
    }

    const validatedOrigins = [];
    for (const origin of origins) {
      try {
        const url = new URL(origin);
        const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
        const isOriginOnly =
          url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
        if (!isHttp || !isOriginOnly || origin === '*') throw new Error('Invalid origin');
        validatedOrigins.push(url.origin);
      } catch {
        context.addIssue({
          code: 'custom',
          message: `WEB_ORIGINS contains an invalid origin: ${origin}`,
        });
      }
    }

    return context.issues.length > 0 ? z.NEVER : Object.freeze([...new Set(validatedOrigins)]);
  });

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
    API_BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/i)
      .default('1mb'),
    WEB_ORIGINS: webOriginsSchema.default('http://localhost:5173'),
    TRUST_PROXY: trustProxySchema.default(false),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().max(65535).default(3307),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string(),
    DB_POOL_MIN: z.coerce.number().int().nonnegative().default(0),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    DB_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().min(1).default('hrm-api'),
    JWT_AUDIENCE: z.string().min(1).default('hrm-web'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(600),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
    REFRESH_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('hrm_refresh'),
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(12).max(128).default(12),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  })
  .superRefine((value, context) => {
    if (value.DB_POOL_MIN > value.DB_POOL_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['DB_POOL_MIN'],
        message: 'DB_POOL_MIN must not exceed DB_POOL_MAX.',
      });
    }
    if (value.NODE_ENV === 'production' && value.DB_PASSWORD.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['DB_PASSWORD'],
        message: 'DB_PASSWORD must not be empty in production.',
      });
    }
  });

let cachedEnv;

export function loadEnv(source = process.env) {
  if (source === process.env && cachedEnv) return cachedEnv;

  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }

  const env = Object.freeze(result.data);

  if (source === process.env) cachedEnv = env;
  return env;
}
