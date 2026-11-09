import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertWorkingGatewayProxy,
  loadLocalBaseProxy,
  withLocalStaffDocuments,
} from './local-base-proxy.mjs';

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
    '/bff/**',
    '/oauth2/authorization/**',
    '/login/oauth2/code/**',
    '/content/**',
    '/api/**',
    '/oauth2/**',
    '/userinfo',
    '/connect/**',
    '/.well-known/**',
  ];
  const selected = Object.fromEntries(
    routes.map((route) => [route, { target: 'http://127.0.0.1:4350' }]),
  );
  selected['^/bff/author/previews/example(?=\\?|$)'] = {
    target: 'http://127.0.0.1:4350',
    pathRewrite: {
      '^/bff/author/previews/example(?=\\?|$)': '/bff/author/previews/immutable/example',
    },
  };
  await writeFile(resolve(root, 'working.json'), JSON.stringify(selected));
  assert.deepEqual(
    assertWorkingGatewayProxy(await loadLocalBaseProxy(root, 'working.json')),
    selected,
  );

  const wrongApi = structuredClone(selected);
  wrongApi['/api/**'].target = 'http://127.0.0.1:4320';
  assert.throws(() => assertWorkingGatewayProxy(wrongApi), /api\/\*\*/);
  const missingCsrfRoute = structuredClone(selected);
  delete missingCsrfRoute['/api/**'];
  assert.throws(() => assertWorkingGatewayProxy(missingCsrfRoute), /api\/\*\*/);
});

test('local staff document aliases preserve the immutable snapshot and Gateway authorization', () => {
  const route = '^/bff/author/previews/preview-directory/author-documents/';
  const staffRoute = '^/content/staff/author-documents/';
  const snapshot =
    '/bff/author/previews/preview-directory/working-author-documents/' + 'a'.repeat(64) + '/';
  const selected = {
    [route]: { target: 'http://127.0.0.1:4350', pathRewrite: { [route]: snapshot } },
    '/content/**': { target: 'http://127.0.0.1:4350' },
  };
  const original = structuredClone(selected);
  const result = withLocalStaffDocuments(selected);
  assert.deepEqual(selected, original);
  assert.equal(Object.keys(result)[0], staffRoute);
  assert.equal(result[staffRoute].target, 'http://127.0.0.1:4350');
  assert.equal(result[staffRoute].changeOrigin, false);
  assert.equal(result[staffRoute].pathRewrite[staffRoute], snapshot);
  assert.deepEqual(result['/content/**'], original['/content/**']);
  for (const suffix of [
    'manifest.json',
    'screen-names/' + 'b'.repeat(64) + '/index.html?theme=light',
    'downloads/' + 'c'.repeat(64) + '/guide.md',
  ]) {
    assert.equal(
      ('/content/staff/author-documents/' + suffix).replace(new RegExp(staffRoute), snapshot),
      snapshot + suffix,
    );
  }
  // DLV-1000: the publication previews path follows the working api and architecture snapshots, the rest the live directory.
  const apiRoute = '^/bff/author/previews/preview-directory/api/';
  const apiSnapshot = '/bff/author/previews/preview-directory/working-api-reference/' + 'd'.repeat(64) + '/';
  const withApi = withLocalStaffDocuments({ ...selected, [apiRoute]: { target: 'http://127.0.0.1:4350', pathRewrite: { [apiRoute]: apiSnapshot } } });
  const previewsRoute = '^/content/staff/previews/preview-directory/';
  assert.equal(withApi[previewsRoute + 'api/'].pathRewrite[previewsRoute + 'api/'], apiSnapshot);
  assert.equal(withApi[previewsRoute + 'architecture/'].pathRewrite[previewsRoute + 'architecture/'], '/bff/author/previews/preview-directory/architecture/');
  assert.equal(withApi[previewsRoute].pathRewrite[previewsRoute], '/bff/author/previews/preview-directory/');
  assert.equal(withApi[previewsRoute].target, 'http://127.0.0.1:4350');
  assert.ok(Object.keys(withApi).indexOf(previewsRoute + 'api/') < Object.keys(withApi).indexOf(previewsRoute), 'specific aliases come first');
  assert.ok(Object.keys(withApi).indexOf(previewsRoute) < Object.keys(withApi).indexOf('/content/**'), 'aliases precede the catch-all');
  assert.equal(('/content/staff/previews/preview-directory/manifest.json').replace(new RegExp(previewsRoute), '/bff/author/previews/preview-directory/'), '/bff/author/previews/preview-directory/manifest.json');
  assert.throws(() => withLocalStaffDocuments({ ...selected, [apiRoute]: { target: 'http://127.0.0.1:4350', pathRewrite: { [apiRoute]: '/unprotected/' } } }), /immutable snapshot/);
  assert.deepEqual(withLocalStaffDocuments({}), {});
  for (const bad of [
    { target: 'http://127.0.0.1:4315', pathRewrite: { [route]: snapshot } },
    { target: 'http://127.0.0.1:4350', pathRewrite: { [route]: '/unprotected/' } },
    { target: 'http://127.0.0.1:4350' },
  ])
    assert.throws(() => withLocalStaffDocuments({ [route]: bad }), /immutable snapshot/);
});
