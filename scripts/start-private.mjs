import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDeliveryEditor } from './delivery-editor.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const contentRoot = resolve(
  repositoryRoot,
  process.env.LOOKAHEAD_CONTENT_ROOT ?? '../lookahead-learning-content/runtime',
);
const syncScript = resolve(repositoryRoot, 'scripts/sync-runtime-content.mjs');
const angularCli = resolve(repositoryRoot, 'node_modules/@angular/cli/bin/ng.js');
const forwardedArguments = process.argv.slice(2);

function argumentValue(name, fallback) {
  const index = forwardedArguments.indexOf(name);
  return (
    forwardedArguments
      .find((argument) => argument.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? (index >= 0 ? forwardedArguments[index + 1] : fallback)
  );
}

const angularConfiguration = JSON.parse(
  await readFile(resolve(repositoryRoot, 'angular.json'), 'utf8'),
);
const project = Object.values(angularConfiguration.projects)[0];
const port = Number(argumentValue('--port', project.architect.serve.options.port));
const host = argumentValue('--host', 'localhost');
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !['localhost', '127.0.0.1'].includes(host)
) {
  throw new Error(
    'Private editing requires a fixed port and a loopback host (localhost or 127.0.0.1).',
  );
}
if (
  forwardedArguments.some((argument) =>
    /^(--proxy-config|--ssl|--disable-host-check)(=|$)/.test(argument),
  )
) {
  throw new Error('start:private owns its local-only proxy and HTTP configuration.');
}

function run(command, arguments_, label) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      stdio: 'inherit',
    });

    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${label} exited with ${signal ?? `code ${code}`}.`));
    });
  });
}

async function syncPrivateContent() {
  await run(process.execPath, [syncScript, '--external'], 'Private content sync');
}

await syncPrivateContent();

const editor = await startDeliveryEditor({
  file: resolve(contentRoot, 'delivery/delivery-plan.json'),
  origins: [`http://localhost:${port}`, `http://127.0.0.1:${port}`],
});
const proxyDirectory = resolve(repositoryRoot, '.angular/delivery-editor');
const proxyFile = resolve(proxyDirectory, `proxy-${process.pid}.json`);
await mkdir(proxyDirectory, { recursive: true, mode: 0o700 });
const proxy = JSON.parse(await readFile(resolve(repositoryRoot, 'proxy.conf.json'), 'utf8'));
proxy['/__local/delivery/**'] = {
  target: editor.target,
  changeOrigin: true,
  xfwd: true,
  headers: { 'x-delivery-token': editor.token },
};
await writeFile(proxyFile, JSON.stringify(proxy), { mode: 0o600 });
console.log(`Local delivery editing enabled at http://${host}:${port}/delivery-plan`);

let debounceTimer;
let syncInProgress = false;
let syncQueued = false;

async function flushSync() {
  if (syncInProgress) {
    syncQueued = true;
    return;
  }

  syncInProgress = true;
  try {
    console.log('\nPrivate content changed. Refreshing runtime assets...');
    await syncPrivateContent();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  } finally {
    syncInProgress = false;
    if (syncQueued) {
      syncQueued = false;
      queueSync();
    }
  }
}

function queueSync() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void flushSync(), 250);
}

const contentWatcher = watch(contentRoot, { recursive: true }, (_event, filename) => {
  // The board reads private JSON directly. A whole-app reload here would erase editor drafts.
  if (filename && String(filename).replaceAll('\\', '/').split('/')[0] === 'delivery') return;
  queueSync();
});
contentWatcher.on('error', (error) =>
  console.error(`Private content watch failed: ${error.message}`),
);

const angular = spawn(
  process.execPath,
  [angularCli, 'serve', ...forwardedArguments, '--proxy-config', proxyFile],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
  },
);

function stop(signal) {
  clearTimeout(debounceTimer);
  contentWatcher.close();
  if (!angular.killed) angular.kill(signal);
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));

const exitCode = await new Promise((resolveExit, rejectExit) => {
  angular.once('error', rejectExit);
  angular.once('exit', (code, signal) => {
    if (signal === 'SIGINT' || signal === 'SIGTERM') {
      resolveExit(0);
      return;
    }
    resolveExit(code ?? 1);
  });
});

contentWatcher.close();
await editor.close();
await rm(proxyFile, { force: true });
process.exitCode = exitCode;
