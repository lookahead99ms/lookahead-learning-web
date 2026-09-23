import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertWorkingGatewayProxy, loadLocalBaseProxy } from './local-base-proxy.mjs';

test('selects an isolated JSON proxy without changing API or gateway targets', async (t) => {
  const base = resolve('.angular/local-proxy-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(`${base}/run-`);
  t.after(() => rm(root, { recursive: true, force: true }));
  const defaults = { '/api/**': { target: 'http://127.0.0.1:4320' } };
  const isolated = {
    '/api/**': { target: 'http://127.0.0.1:4321' },
    '/bff/**': { target: 'http://127.0.0.1:4331', changeOrigin: false },
  };
  await writeFile(resolve(root, 'proxy.conf.json'), JSON.stringify(defaults));
  await writeFile(resolve(root, 'isolated.json'), JSON.stringify(isolated));
  assert.deepEqual(await loadLocalBaseProxy(root), defaults);
  assert.deepEqual(await loadLocalBaseProxy(root, 'isolated.json'), isolated);
  assert.deepEqual(await loadLocalBaseProxy(root, resolve(root, 'isolated.json')), isolated);
  for (const bad of [
    [],
    { '/api': { target: 'https://example.test' } },
    { '/api': { target: 'http://user:secret@127.0.0.1' } },
    { '/__local/delivery/**': { target: 'http://127.0.0.1:1' } },
    { '/api': { target: 'http://127.0.0.1:1', router: {} } },
  ]) {
    await writeFile(resolve(root, 'invalid.json'), JSON.stringify(bad));
    await assert.rejects(loadLocalBaseProxy(root, 'invalid.json'));
  }
});

test('protected working routes stay on Gateway 4350 and retain the author rewrite', async (t) => {
  const base = resolve('.angular/local-proxy-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(`${base}/working-`);
  t.after(() => rm(root, { recursive: true, force: true }));
  const routes = [
    '/bff/**', '/oauth2/authorization/**', '/login/oauth2/code/**', '/content/**',
    '/api/**', '/oauth2/**', '/userinfo', '/connect/**', '/.well-known/**',
  ];
  const selected = Object.fromEntries(
    routes.map((route) => [route, { target: 'http://127.0.0.1:4350' }]),
  );
  selected['^/bff/author/previews/example(?=\\?|$)'] = {
    target: 'http://127.0.0.1:4350',
    pathRewrite: { '^/bff/author/previews/example(?=\\?|$)': '/bff/author/previews/immutable/example' },
  };
  await writeFile(resolve(root, 'working.json'), JSON.stringify(selected));
  assert.deepEqual(assertWorkingGatewayProxy(await loadLocalBaseProxy(root, 'working.json')), selected);

  const wrongApi = structuredClone(selected);
  wrongApi['/api/**'].target = 'http://127.0.0.1:4320';
  assert.throws(() => assertWorkingGatewayProxy(wrongApi), /api\/\*\*/);
  const missingCsrfRoute = structuredClone(selected);
  delete missingCsrfRoute['/api/**'];
  assert.throws(() => assertWorkingGatewayProxy(missingCsrfRoute), /api\/\*\*/);
});
