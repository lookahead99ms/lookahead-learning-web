import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { smokeImage, parseResponse, assertPrivateBundle, deniedPaths, requireLocalEngine, assertOperationalLogs, credentialMount } from './smoke.mjs';

const reference = 'sha256:' + 'a'.repeat(64);
const resolvedDockerId = 'sha256:' + 'b'.repeat(64);
const id = 'c'.repeat(64);
const index = '<!doctype html><app-root></app-root><script src="main-ABCDEFGH.js"></script>';
function response(status, body, headers = {}) {
  return { status: status >= 400 ? 1 : 0, stdout: body,
    stderr: `Connecting to127.0.0.1\n  HTTP/1.1 ${status} Response\n` + Object.entries(headers).map(([k, v]) => `  ${k}: ${v}\n`).join('') };
}

function fixture({ unhealthy = false, fallbackPath, privateFile = false, volumes = { '/tmp': {}, [credentialMount]: {} } } = {}) {
  const calls = [];
  const docker = args => {
    calls.push(args);
    const ok = stdout => ({ status: 0, stdout, stderr: '' });
    if (args[0] === 'context') return ok(JSON.stringify([{ Endpoints: { docker: { Host: 'unix:///var/run/docker.sock' } } }]));
    if (args[0] === 'image') return ok(JSON.stringify([{ Id: resolvedDockerId, Config: { User: '10001:10001', Volumes: volumes, Healthcheck: { Test: ['CMD', '/opt/lookahead/healthcheck.sh'] } } }]));
    if (args[0] === 'create') return ok(id + '\n');
    if (args[0] === 'logs') return ok(JSON.stringify({ event: 'http_access', time: '2026-10-09T00:00:00Z', requestId: 'a'.repeat(32), method: 'GET', status: '404', bytes: '9', durationSeconds: '0.001' }) + '\n');
    if (args[0] === 'start' || args[0] === 'rm') return ok('');
    if (args[0] === 'container') return ok(JSON.stringify([{ Image: resolvedDockerId, State: { Running: true, Health: { Status: unhealthy ? 'unhealthy' : 'healthy' } },
      HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], Tmpfs: { '/tmp': 'rw', [credentialMount]: 'rw' } } }]));
    if (args[0] === 'cp') {
      writeFileSync(join(args[2], 'index.html'), index);
      writeFileSync(join(args[2], 'main-ABCDEFGH.js'), 'console.log("public application")');
      if (privateFile) writeFileSync(join(args[2], '.env'), 'synthetic');
      return ok('');
    }
    assert.equal(args[0], 'exec');
    if (args[2] === 'id') return ok('10001\n');
    if (args[2] === 'find') return ok('/opt/lookahead/start-tls.sh\n/opt/lookahead/healthcheck.sh\n');
    if (args[2] === 'sh') return ok('');
    assert.equal(args[2], 'wget');
    const path = new URL(args.at(-1)).pathname;
    if (path === '/health') return response(200, '{"status":"UP"}\n');
    if (['/', '/index.html', '/learn/deep', fallbackPath].includes(path)) return response(200, index, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    if (path === '/main-ABCDEFGH.js') return response(200, 'console.log("public application")', { 'Content-Type': 'application/javascript', 'Cache-Control': 'private, max-age=31536000, immutable' });
    return response(404, 'Not found');
  };
  return { docker, calls };
}

test('rejects mutable tags before any Docker operation', async () => {
  await assert.rejects(smokeImage('web:latest', { docker: () => assert.fail('Docker must not run') }), /immutable/);
});

test('rejects remote Docker hosts and honors explicit context precedence', () => {
  const noInspect = () => assert.fail('Context lookup was not expected');
  assert.throws(() => requireLocalEngine(noInspect, { DOCKER_HOST: 'tcp://remote.example:2376' }), /local Unix/);
  requireLocalEngine(noInspect, { DOCKER_HOST: 'unix:///var/run/docker.sock' });
  const inspect = args => {
    assert.deepEqual(args, ['context', 'inspect', 'remote']);
    return JSON.stringify([{ Endpoints: { docker: { Host: 'ssh://remote.example' } } }]);
  };
  assert.throws(() => requireLocalEngine(inspect, { DOCKER_CONTEXT: 'remote', DOCKER_HOST: 'unix:///var/run/docker.sock' }), /local Unix/);
});

test('does not certify redirected or failed HTTP probes', () => {
  assert.throws(() => parseResponse({ status: 0, stdout: '', stderr: ' HTTP/1.1 302 Found\n HTTP/1.1 200 OK\n' }), /without redirects/);
  assert.throws(() => parseResponse({ status: 4, stdout: '', stderr: ' HTTP/1.1 200 OK\n' }), /probe failed/);
});

test('rejects shared-cache bundle headers, incorrect MIME and SPA fallback', () => {
  const good = { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'private,max-age=31536000,immutable' }, body: 'console.log(1)' };
  assertPrivateBundle(good);
  assert.throws(() => assertPrivateBundle({ ...good, headers: { ...good.headers, 'cache-control': 'public,max-age=31536000,immutable' } }), /cache contract/);
  assert.throws(() => assertPrivateBundle({ ...good, headers: { ...good.headers, 'content-type': 'text/html' } }), /MIME/);
  assert.throws(() => assertPrivateBundle({ ...good, body: index }), /HTML fallback/);
});

test('checks immutable config identity, all denied routes, hardening and cleanup', async t => {
  const scratchRoot = await mkdtemp(join(tmpdir(), 'web-smoke-test-'));
  t.after(() => rm(scratchRoot, { recursive: true, force: true }));
  const { docker, calls } = fixture();
  const report = await smokeImage(reference, { docker, scratchRoot, environment: {} });
  assert.equal(report.buildArtifactDigest, reference);
  assert.equal(report.resolvedDockerId, resolvedDockerId);
  assert.equal(report.passed, true);
  assert(deniedPaths.every(path => report.requests.some(item => item.path === path && item.status === 404)));
  const create = calls.find(args => args[0] === 'create');
  assert(create.includes('--pull=never') && create.includes('--read-only') && create.includes('--cap-drop'));
  assert.equal(create.at(-1), resolvedDockerId);
  assert(!create.includes('-p') && !create.includes('--publish'));
  // DLV-914: the declared credential volume is mounted as an owned tmpfs, never as an anonymous Docker volume.
  assert(create.some(arg => arg.startsWith(`${credentialMount}:`) && arg.includes('uid=10001') && arg.includes('mode=0700')), 'Credential tmpfs missing');
  assert.deepEqual(calls.at(-1), ['rm', '-f', id]);
});

// DLV-914/DLV-968: ECS copies a declared VOLUME path's ownership into the Fargate bind mount; the image must declare exactly the two task mounts.
for (const [name, volumes] of [['no volume', {}], ['only the credential mount', { [credentialMount]: {} }], ['only /tmp', { '/tmp': {} }],
  ['an extra volume', { [credentialMount]: {}, '/tmp': {}, '/data': {} }], ['a different volume', { '/data': {} }]]) {
  test(`rejects an image declaring ${name} before creating a container`, async t => {
    const scratchRoot = await mkdtemp(join(tmpdir(), 'web-smoke-test-'));
    t.after(() => rm(scratchRoot, { recursive: true, force: true }));
    const { docker, calls } = fixture({ volumes });
    await assert.rejects(smokeImage(reference, { docker, scratchRoot, environment: {} }), /credential mount/);
    assert(!calls.some(args => args[0] === 'create'), 'No container may be created for a rejected image');
  });
}

for (const [name, options, failure] of [
  ['Docker reports unhealthy', { unhealthy: true }, /healthcheck failed/],
  ['reserved API returns SPA shell', { fallbackPath: '/api' }, /return404/],
  ['actual copied runtime contains a private file', { privateFile: true }, /Forbidden static artifact/],
]) {
  test(`fails and cleans only its disposable container when ${name}`, async t => {
    const scratchRoot = await mkdtemp(join(tmpdir(), 'web-smoke-test-'));
    t.after(() => rm(scratchRoot, { recursive: true, force: true }));
    const { docker, calls } = fixture(options);
    await assert.rejects(smokeImage(reference, { docker, scratchRoot, environment: {} }), failure);
    assert.deepEqual(calls.at(-1), ['rm', '-f', id]);
    assert.equal(calls.filter(args => args[0] === 'rm').length, 1);
  });
}

test('operational logs reject private content and unexpected fields', () => {
  const record = { event: 'http_access', time: '2026-10-09T00:00:00Z', requestId: 'a'.repeat(32), method: 'GET', status: '404', bytes: '9', durationSeconds: '0.001' };
  assert.equal(assertOperationalLogs(JSON.stringify(record), 'synthetic-secret'), 1);
  assert.throws(() => assertOperationalLogs(JSON.stringify({ ...record, uri: '/private' }), 'synthetic-secret'), /Unexpected/);
  assert.throws(() => assertOperationalLogs(JSON.stringify(record) + '\nsynthetic-secret', 'synthetic-secret'), /leaked/);
  assert.throws(() => assertOperationalLogs('', 'synthetic-secret'), /emit/);
});
