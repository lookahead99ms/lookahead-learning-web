import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkGatewayContract, classify, readWebPaths, resolvePath } from './check-gateway-contract.mjs';

function contract(webPaths) {
  return JSON.stringify({ schema: 'gateway-domain-contract/v1', calls: [{ id: 'auth-me', method: 'GET', path: '/api/v1/auth/me' }], webPaths });
}

/** A built site: shell, hashed bundle, one asset, one route snapshot. */
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'lookahead-gateway-contract-'));
  try {
    const browser = join(root, 'browser');
    await mkdir(join(browser, 'assets'), { recursive: true });
    await mkdir(join(browser, 'learn'), { recursive: true });
    await mkdir(join(browser, 'empty-directory'), { recursive: true });
    await writeFile(join(browser, 'index.html'), '<html><app-root></app-root></html>');
    await writeFile(join(browser, 'main-ABCDEFGH.js'), 'console.log("synthetic");');
    await writeFile(join(browser, 'assets', 'logo.svg'), '<svg/>');
    await writeFile(join(browser, 'learn', 'index.html'), '<html><app-root>Learn</app-root></html>');
    await run(root, browser);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('classifies paths the way the container nginx does', () => {
  assert.equal(classify('/'), 'route');
  assert.equal(classify('/sign-in/choose'), 'route');
  assert.equal(classify('/index.html'), 'file');
  assert.equal(classify('/assets/logo.svg'), 'file');
  assert.equal(classify('/formatters/java'), 'file');
  for (const blocked of ['/api/v1/auth/me', '/bff', '/content/x', '/oauth2/authorization/lookahead', '/login', '/logout/', '/.well-known/x', '/main.js.map', '/server.key']) {
    assert.equal(classify(blocked), 'blocked', blocked);
  }
  for (const unsafe of ['sign-in', '/a/../b', '/a//b', '/a b', '/a?x=1', 7]) assert.throws(() => classify(unsafe), /Unsafe contract path/);
});

test('resolves files, route snapshots and the application shell', () => fixture(async (root, browser) => {
  assert.deepEqual(await resolvePath(browser, '/'), { path: '/', kind: 'snapshot', file: 'index.html' });
  assert.deepEqual(await resolvePath(browser, '/index.html'), { path: '/index.html', kind: 'file', file: 'index.html' });
  assert.deepEqual(await resolvePath(browser, '/assets/logo.svg'), { path: '/assets/logo.svg', kind: 'file', file: 'assets/logo.svg' });
  assert.deepEqual(await resolvePath(browser, '/learn'), { path: '/learn', kind: 'snapshot', file: 'learn/index.html' });
  assert.deepEqual(await resolvePath(browser, '/learn/'), { path: '/learn/', kind: 'snapshot', file: 'learn/index.html' });
  assert.deepEqual(await resolvePath(browser, '/sign-in/choose'), { path: '/sign-in/choose', kind: 'shell', file: 'index.html' });
  assert.deepEqual(await resolvePath(browser, '/empty-directory'), { path: '/empty-directory', kind: 'shell', file: 'index.html' });
  await assert.rejects(resolvePath(browser, '/assets/missing.svg'), /Missing static file/);
  await assert.rejects(resolvePath(browser, '/favicon.ico'), /Missing static file/);
  await assert.rejects(resolvePath(browser, '/api/v1/auth/me'), /answered 404/);
  await rm(join(browser, 'index.html'));
  await assert.rejects(resolvePath(browser, '/sign-in'), /Missing application shell/);
}));

test('reads only a well-formed Gateway contract', () => {
  assert.deepEqual(readWebPaths(contract(['/', '/sign-in'])), ['/', '/sign-in']);
  assert.throws(() => readWebPaths('nope'), /not JSON/);
  assert.throws(() => readWebPaths('[]'), /must be an object/);
  assert.throws(() => readWebPaths(JSON.stringify({ schema: 'other', webPaths: ['/'] })), /schema/);
  assert.throws(() => readWebPaths(JSON.stringify({ schema: 'gateway-domain-contract/v1', webPaths: [] })), /lists no webPaths/);
  assert.throws(() => readWebPaths(JSON.stringify({ schema: 'gateway-domain-contract/v1', webPaths: ['/', 1] })), /must be strings/);
  assert.throws(() => readWebPaths(JSON.stringify({ schema: 'gateway-domain-contract/v1', webPaths: ['/', '/'] })), /repeat a path/);
});

test('checks every contract path against the built output', () => fixture(async (root, browser) => {
  const good = join(root, 'good.json');
  await writeFile(good, contract(['/', '/index.html', '/sign-in', '/sign-in/choose', '/learn', '/assets/logo.svg']));
  const result = await checkGatewayContract(good, browser);
  assert.equal(result.checked, 6);
  assert.deepEqual(result.resolved.map((entry) => entry.kind), ['snapshot', 'file', 'shell', 'shell', 'snapshot', 'file']);
  const bad = join(root, 'bad.json');
  await writeFile(bad, contract(['/', '/assets/missing.svg']));
  await assert.rejects(checkGatewayContract(bad, browser), /Missing static file for contract path: \/assets\/missing.svg/);
  const blocked = join(root, 'blocked.json');
  await writeFile(blocked, contract(['/bff/login']));
  await assert.rejects(checkGatewayContract(blocked, browser), /answered 404/);
}));
