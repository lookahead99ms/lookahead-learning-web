import './build-code-presentation.mjs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtectedBuild, writeSeoFiles } from './generate-seo-files.mjs';
import { writeRouteSnapshots } from './generate-route-snapshots.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
// DLV-941: robots.txt (and sitemap.xml when LOOKAHEAD_SITE_ORIGIN is set) ship from public/.
await writeSeoFiles({ protectedBuild: isProtectedBuild(process.argv.slice(2)) });
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
child.once('exit', async (code, signal) => {
  if (signal) console.error(`Build exited with ${signal}.`);
  process.exitCode = code ?? 1;
  if (code !== 0 || process.argv.includes('--watch')) return;
  // DLV-941 phase 2: one HTML file per public page, with its own tags and a plain summary.
  try {
    await writeRouteSnapshots({ protectedBuild: isProtectedBuild(process.argv.slice(2)) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
});
