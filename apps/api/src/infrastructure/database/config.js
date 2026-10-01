import { fileURLToPath } from 'node:url';

export function createKnexConfig(env) {
  return {
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      timezone: 'Z',
      connectTimeout: env.DB_CONNECT_TIMEOUT_MS,
    },
    acquireConnectionTimeout: env.DB_ACQUIRE_TIMEOUT_MS,
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
      acquireTimeoutMillis: env.DB_ACQUIRE_TIMEOUT_MS,
      afterCreate(connection, done) {
        connection.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED', (error) => {
          if (error) return done(error, connection);
          return connection.query("SET SESSION time_zone = '+00:00'", (timezoneError) => {
            done(timezoneError, connection);
          });
        });
      },
    },
    migrations: { directory: fileURLToPath(new URL('../../../migrations/', import.meta.url)) },
    seeds: { directory: fileURLToPath(new URL('../../../seeds/', import.meta.url)) },
  };
}
