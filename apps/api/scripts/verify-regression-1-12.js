import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const phases = ['1b', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
for (const phase of phases) {
  const result = spawnSync(process.execPath, [`scripts/verify-phase-${phase}.js`], {
    cwd: new URL('..', import.meta.url),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Phase ${phase} regression failed.`);
}
console.log(`SUMMARY ${phases.length} protected phase regression verifiers passed`);
