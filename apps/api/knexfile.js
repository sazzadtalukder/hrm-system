import { loadEnv } from './src/config/env.js';
import { createKnexConfig } from './src/infrastructure/database/config.js';

const env = loadEnv();

export default {
  development: createKnexConfig(env),
  production: createKnexConfig(env),
  test: createKnexConfig(env),
};
