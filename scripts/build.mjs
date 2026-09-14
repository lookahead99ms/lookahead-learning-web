import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const angularCli = resolve(repositoryRoot, 'node_modules/@angular/cli/bin/ng.js');
const child = spawn(
  process.execPath,
  [angularCli, 'build', ...process.argv.slice(2)],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Release validation must not share Angular's persistent cache with a
      // concurrently running connected preview.
      CI: 'true',
    },
  },
);

child.once('error', (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) console.error(`Build exited with ${signal}.`);
  process.exitCode = code ?? 1;
});
