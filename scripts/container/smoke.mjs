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
export const credentialMount = '/run/credentials';
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

/**
 * Plain logs (owner decision 2026-11-17): every access line is
 * `<time> <LEVEL padded to 5> <METHOD> <path> <status> <bytes> B <seconds> s[ upstream <address> status <status>]  [request <id8>]`.
 * Access lines are the stdout lines that open with an ISO-8601 time; nginx error_log lines (`2026/11/17 ...`) and the
 * start-tls.sh sentences are not access lines but are still scanned for the private marker.
 */
export const accessLinePattern = /^(?<time>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})) (?<level>[A-Z ]{5}) (?<method>[A-Z]+) (?<path>\S*) (?<status>\d{3}) (?<bytes>\d+) B (?<seconds>\d+\.\d{3}) s(?<upstream> upstream \S.*?)?  \[request (?<requestId>[^\]]*)\]$/;
const isoTime = /^\d{4}-\d{2}-\d{2}T/;
const requestIdPrefix = /^[0-9a-f]{8}$/;

/** DLV-969: access lines carry the path (never the query string) and the first 8 characters of Gateway's X-Request-Id when it is a canonical UUID. */
export function assertOperationalLogs(logs, marker, { gatewayId } = {}) {
  assert(!logs.includes(marker), 'Private request marker leaked into container logs');
  const lines = logs.split('\n');
  assert(!lines.some(line => line.startsWith('{')), 'Container logs must be plain lines, not JSON records');
  const access = lines.filter(line => isoTime.test(line)).map(line => {
    const match = accessLinePattern.exec(line);
    assert(match, 'Unexpected access-log line shape: ' + line);
    return match.groups;
  });
  assert(access.some(record => record.status === '404'), 'Denied requests must emit access logs');
  for (const record of access) {
    assert.match(record.requestId, requestIdPrefix, 'Malformed access-log request ID');
    assert.match(record.status, /^[1-5][0-9]{2}$/);
    assert.equal(record.level, record.status.startsWith('5') ? 'ERROR' : 'INFO ', 'Access-log level must follow status');
    assert.match(record.path, /^\/[^?#]*$/, 'Access-log path must exclude the query string');
    assert(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'OTHER'].includes(record.method), 'Unbounded HTTP method in logs');
  }
  if (gatewayId !== undefined) {
    assert(access.some(record => record.requestId === gatewayId.slice(0, 8)), "Gateway's request ID was not reused in access logs");
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
  // DLV-914/DLV-968: the declared volumes are the two ECS task mounts whose UID-10001 ownership the image initializes.
  assert.deepEqual(Object.keys(image.Config.Volumes ?? {}).sort(), [credentialMount, '/tmp'], 'Only the ECS credential mount and /tmp may be declared volumes');
  assert(image.Config.Healthcheck?.Test?.length && image.Config.Healthcheck.Test[0] !== 'NONE', 'Image must define a Docker healthcheck');
  const owner = randomUUID();
  let id;
  let copiedRoot;
  try {
    id = run(['create', '--pull=never', '--name', `lookahead-web-smoke-${owner}`, '--label', `lookahead.smoke.owner=${owner}`,
      '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--user', '10001:10001', '--pids-limit', '64', '--memory', '128m',
      '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777',
      // Mount the declared credential volume as an owned tmpfs so no anonymous Docker volume is created.
      '--tmpfs', `${credentialMount}:rw,nosuid,nodev,noexec,size=1m,mode=0700,uid=10001,gid=10001`, image.Id]).trim();
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
    assert.deepEqual(Object.keys(inspected.HostConfig.Tmpfs ?? {}).sort(), [credentialMount, '/tmp'], 'Only the owned tmpfs mounts are permitted');
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

    // The path is logged by design; the marker rides only in the query string, headers and a malformed request ID.
    const privateMarker = 'privacy-probe-' + owner;
    const privateResponse = parseResponse(docker(['exec', id, 'wget', '-S', '-O', '-', '-T', '5',
      '--header', `Cookie: synthetic=${privateMarker}`, '--header', `Authorization: Bearer ${privateMarker}`,
      '--header', `X-Request-Id: ${privateMarker}`, `http://127.0.0.1:8080/api/privacy-probe?code=${privateMarker}`]));
    assert.equal(privateResponse.status, 404);
    const gatewayId = randomUUID();
    const traced = parseResponse(docker(['exec', id, 'wget', '-S', '-O', '-', '-T', '5',
      '--header', `X-Request-Id: ${gatewayId}`, 'http://127.0.0.1:8080/health']));
    assert.equal(traced.status, 200);
    // Access lines arrive on stdout; nginx's error_log (warn) and start-tls.sh denials on stderr. Both must stay free of the marker.
    const captured = docker(['logs', id]);
    assert.equal(captured.status, 0, 'Docker logs failed');
    const operationalLogRecords = assertOperationalLogs(captured.stdout + captured.stderr, privateMarker, { gatewayId });

    // Copy only static bytes into an owned scratch directory and reuse the build-boundary verifier.
    await mkdir(scratchRoot, { recursive: true });
    copiedRoot = await mkdtemp(join(scratchRoot, 'web-image-smoke-'));
    run(['cp', `${id}:${webRoot}/.`, copiedRoot]);
    const artifacts = await verifyStatic(copiedRoot);
    const runtimeFiles = run(['exec', id, 'find', '/opt/lookahead', '-type', 'f']).trim().split('\n').sort();
    assert.deepEqual(runtimeFiles, ['/opt/lookahead/healthcheck.sh', '/opt/lookahead/start-tls.sh'], 'Unexpected runtime helper files');
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
