export async function checkDatabaseHealth(database) {
  const startedAt = performance.now();
  await database.raw('SELECT 1 AS healthy');
  return { healthy: true, latencyMs: Math.round((performance.now() - startedAt) * 100) / 100 };
}
