import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const sourceDirectory = new URL('../src/', import.meta.url);

async function findJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const location = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) return findJavaScriptFiles(location);
      return entry.name.endsWith('.js') ? [location] : [];
    }),
  );
  return files.flat();
}

const files = [
  new URL('../knexfile.js', import.meta.url),
  ...(await findJavaScriptFiles(sourceDirectory)),
];
for (const file of files) {
  await execute(process.execPath, ['--check', fileURLToPath(file)]);
}
