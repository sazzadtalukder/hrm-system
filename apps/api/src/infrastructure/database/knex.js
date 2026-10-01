import knex from 'knex';
import { createKnexConfig } from './config.js';

export function createDatabase(env) {
  return knex(createKnexConfig(env));
}
