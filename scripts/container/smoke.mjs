import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { verifyStatic } from './verify-static.mjs';

const immutableId = /^sha256:[a-f0-9]{64}$/;
const containerId = /^[a-f0-9]{64}$/;
const webRoot = '/usr/share/nginx/html';
export const deniedPaths = [
  '/api', '/api/', '/api/auth/session', '/bff', '/bff/', '/bff/test',
  '/oauth2', '/oauth2/authorization/cognito', '/login/oauth2', '/login/oauth2/code/cognito',
  '/content', '/content/catalog.json', '/local-previews', '/local-previews/author-documents/manifest.json',
  '/.env', '/.git/config', '/assets/.env', '/main.js.map', '/assets/app.css.map',
  '/assets/missing', '/missing-asset.js', '/assets/missing-asset.js', '/missing-asset.css', '/missing-asset.svg',
];

function localDocker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 20_000, maxBuffer: 16 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function parseResponse(result) {
  const statuses = [...result.stderr.matchAll(/^\s*HTTP\/\d(?:\.\d)?\s+(\d{3})\b/gm)];
  assert.equal(statuses.length, 1, 'Expected one HTTP response without redirects');
  const status = Number(statuses[0][1]);
  assert(result.status === 0 || (result.status === 1 && status >= 400), 'HTTP probe failed');
  const headers = {};
  for (const line of result.stderr.split('\n')) {
    const header = /^\s+([A-Za-z0-9-]+):\s*(.*?)\s*$/.exec(line);
    if (header) {
      const key = header[1].toLowerCase();
      headers[key] = headers[key] ? headers[key] + ', ' + header[2] : header[2];
    }
  }
  return { status, headers, body: result.stdout };
}

export function assertOperationalLogs(logs, marker) {
  assert(!logs.includes(marker), 'Private request marker leaked into container logs');
  const records = logs.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const access = records.filter(record => record.event === 'http_access');
  assert(access.some(record => record.status === '404'), 'Denied requests must emit access logs');
  const fields = ['event', 'time', 'requestId', 'method', 'status', 'bytes', 'durationSeconds'].sort();
  for (const record of access) {
    assert.deepEqual(Object.keys(record).sort(), fields, 'Unexpected access-log field');
    assert.match(record.requestId, /^[a-f0-9]{32}$/);
    assert.match(record.status, /^[1-5][0-9]{2}$/);
    assert(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'OTHER'].includes(record.method), 'Unbounded HTTP method in logs');
  }
  return access.length;
}

export function assertPrivateBundle(response) {
  assert.equal(response.status, 200, 'Fingerprint bundle unavailable');
  assert.match(response.headers['content-type'] ?? '', /^(?:application|text)\/javascript(?:\s*;|$)/i, 'Incorrect JavaScript MIME');
  const cache = (response.headers['cache-control'] ?? '').toLowerCase().split(',').map(value => value.trim());
  assert(cache.includes('private') && cache.includes('immutable') && cache.includes('max-age=31536000'), 'Fingerprint bundle cache contract violated');
  assert(!cache.includes('public') && !cache.some(value => value.startsWith('s-maxage=')), 'Shared caching must remain disabled');
  assert(response.body.length > 0 && !/<(?:!doctype|html|app-root)\b/i.test(response.body), 'Bundle returned an HTML fallback');
}

export function requireLocalEngine(run, environment) {
  let endpoint = environment.DOCKER_HOST;
  // Docker's explicit context takes precedence over DOCKER_HOST.
  if (environment.DOCKER_CONTEXT || !endpoint) {
    const args = ['context', 'inspect'];
    if (environment.DOCKER_CONTEXT) args.push(environment.DOCKER_CONTEXT);
    endpoint = JSON.parse(run(args))[0]?.Endpoints?.docker?.Host;
  }
  assert(typeof endpoint === 'string' && endpoint.startsWith('unix:///'), 'Only a local Unix-socket Docker engine is authorized');
}

/** Probe only an already present immutable local image. Never build, pull or publish. */
export async function smokeImage(imageReference, { docker = localDocker, scratchRoot = resolve('.codex-scratch'), environment = process.env } = {}) {
  assert(immutableId.test(imageReference), 'An immutable sha256 image reference is required');
  const run = args => {
    const result = docker(args);
    assert.equal(result.status, 0, `Docker ${args[0]} failed`);
    return result.stdout;
  };
  requireLocalEngine(run, environment);
  const image = JSON.parse(run(['image', 'inspect', imageReference]))[0];
  assert(immutableId.test(image.Id), 'Image inspection did not resolve an immutable config ID');
  assert.match(image.Config.User ?? '', /^10001(?::10001)?$/, 'Image must default to nonroot user10001');
  assert.equal(Object.keys(image.Config.Volumes ?? {}).length, 0, 'Image must not create anonymous volumes');
  assert(image.Config.Healthcheck?.Test?.length && image.Config.Healthcheck.Test[0] !== 'NONE', 'Image must define a Docker healthcheck');
  const owner = randomUUID();
  let id;
  let copiedRoot;
  try {
    id = run(['create', '--pull=never', '--name', `lookahead-web-smoke-${owner}`, '--label', `lookahead.smoke.owner=${owner}`,
      '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--user', '10001:10001', '--pids-limit', '64', '--memory', '128m',
      '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777', image.Id]).trim();
    assert(containerId.test(id), 'Docker returned an invalid container ID');
    run(['start', id]);
    let inspected;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      inspected = JSON.parse(run(['container', 'inspect', id]))[0];
      assert(inspected.State.Running, 'Disposable Web container stopped');
      const status = inspected.State.Health?.Status;
      if (status === 'healthy') break;
      assert.equal(status, 'starting', 'Docker healthcheck failed or is missing');
      await delay(500);
    }
    assert.equal(inspected.State.Health?.Status, 'healthy', 'Docker healthcheck did not become healthy');
    assert.equal(inspected.Image, image.Id, 'Container image identity changed');
    assert.equal(inspected.HostConfig.NetworkMode, 'none');
    assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
    assert(inspected.HostConfig.CapDrop?.includes('ALL'));
    assert(inspected.HostConfig.SecurityOpt?.includes('no-new-privileges:true'));
    assert.equal(Object.keys(inspected.HostConfig.PortBindings ?? {}).length, 0, 'No host ports may be published');
    assert.equal(Object.keys(inspected.HostConfig.Tmpfs ?? {}).join(), '/tmp', 'Only the owned tmpfs is permitted');
    assert.equal(run(['exec', id, 'id', '-u']).trim(), '10001');
    assert.equal(run(['exec', id, 'id', '-g']).trim(), '10001');

    const requests = [];
    const request = path => {
      const response = parseResponse(docker(['exec', id, 'wget', '-S', '-O', '-', '-T', '5', `http://127.0.0.1:8080${path}`]));
      requests.push({ path, status: response.status, bytes: Buffer.byteLength(response.body),
        contentType: response.headers['content-type'] ?? null, cacheControl: response.headers['cache-control'] ?? null });
      return response;
    };
    const health = request('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.trim(), '{"status":"UP"}', 'Unexpected health response');
    const index = request('/');
    assert.equal(index.status, 200);
    assert.match(index.headers['content-type'] ?? '', /^text\/html(?:\s*;|$)/i);
    assert(index.body.includes('<app-root'), 'Expected Angular application shell');
    for (const path of ['/', '/index.html', '/learn/deep']) {
      const response = path === '/' ? index : request(path);
      assert.equal(response.status, 200, 'SPA route unavailable');
      assert.equal(response.body, index.body, 'SPA route must serve the application shell');
      assert((response.headers['cache-control'] ?? '').toLowerCase().split(',').map(value => value.trim()).includes('no-store'), 'HTML must not be cached');
    }
    const scripts = [...index.body.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => match[1]);
    const bundle = scripts.find(path => /^\/?(?:[A-Za-z0-9_-]+\/)*main-[A-Za-z0-9_-]{8,}\.js$/.test(path));
    assert(bundle, 'No fingerprinted main bundle in application shell');
    assertPrivateBundle(request('/' + bundle.replace(/^\//, '')));
    for (const path of deniedPaths) {
      const response = request(path);
      assert.equal(response.status, 404, `Reserved or missing path must return404: ${path}`);
      assert(!response.body.includes('<app-root') && response.body !== index.body, 'Denied path returned the application shell');
    }

    const privateMarker = 'privacy-probe-' + owner;
    const privateResponse = parseResponse(docker(['exec', id, 'wget', '-S', '-O', '-', '-T', '5',
      '--header', `Cookie: synthetic=${privateMarker}`, '--header', `Authorization: Bearer ${privateMarker}`,
      `http://127.0.0.1:8080/api/${privateMarker}?code=${privateMarker}`]));
    assert.equal(privateResponse.status, 404);
    const operationalLogRecords = assertOperationalLogs(run(['logs', id]), privateMarker);

    // Copy only static bytes into an owned scratch directory and reuse the build-boundary verifier.
    await mkdir(scratchRoot, { recursive: true });
    copiedRoot = await mkdtemp(join(scratchRoot, 'web-image-smoke-'));
    run(['cp', `${id}:${webRoot}/.`, copiedRoot]);
    const artifacts = await verifyStatic(copiedRoot);
    const runtimeFiles = run(['exec', id, 'find', '/opt/lookahead', '-type', 'f']).trim().split('\n');
    assert.deepEqual(runtimeFiles, ['/opt/lookahead/healthcheck.sh'], 'Unexpected runtime helper files');
    run(['exec', id, 'sh', '-c', 'for p in /workspace /build /app /src /node_modules /usr/local/lib/node_modules; do test ! -e "$p" || exit 1; done; for tool in node npm npx git; do ! command -v "$tool" >/dev/null 2>&1 || exit 1; done']);
    return { schema: 'lookahead-web-container-smoke/v1', checkedAt: new Date().toISOString(),
      buildArtifactDigest: imageReference, resolvedDockerId: image.Id, dockerHealth: 'healthy', user: 10001,
      network: 'none', readOnly: true, publishedPorts: 0, operationalLogRecords, staticArtifacts: artifacts,
      shellSha256: createHash('sha256').update(index.body).digest('hex'), requests,
      limitation: 'Focused packaging and routing regression checks; not an exhaustive vulnerability or secret scan.', passed: true };
  } finally {
    try {
      if (containerId.test(id ?? '')) run(['rm', '-f', id]);
    } finally {
      if (copiedRoot) await rm(copiedRoot, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: node scripts/container/smoke.mjs sha256:<immutable-local-image-id>');
    console.log(JSON.stringify(await smokeImage(process.argv[2]), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ passed: false, error: error.message }));
    process.exitCode = 1;
  }
}
