import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import fileSystem from 'node:fs/promises';
import { verifyStatic } from './verify-static.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'lookahead-static-'));
  try {
    await writeFile(join(root, 'index.html'), '<html><app-root></app-root></html>');
    await writeFile(join(root, 'main-ABCDEFGH.js'), 'console.log("synthetic");');
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('accepts built public shell and hashed bundle', () => fixture(async root => {
  assert.equal((await verifyStatic(root)).fileCount, 2);
}));
for (const name of ['content', 'local-previews', 'node_modules', '.git']) {
  test(`rejects forbidden output directory ${name}`, () => fixture(async root => {
    await mkdir(join(root, name));
    await assert.rejects(verifyStatic(root), /Forbidden static artifact/);
  }));
}
test('rejects source maps and credential-shaped material', () => fixture(async root => {
  await writeFile(join(root, 'main.js.map'), '{}');
  await assert.rejects(verifyStatic(root), /Forbidden static artifact/);
  await rm(join(root, 'main.js.map'));
  await writeFile(join(root, 'bad.js'), ['', 'Users', 'synthetic', 'private'].join('/'));
  await assert.rejects(verifyStatic(root), /Private marker/);
}));
test('rejects symlinks and absent application shell', () => fixture(async root => {
  await symlink(join(root, 'index.html'), join(root, 'alias.html'));
  await assert.rejects(verifyStatic(root), /symlink forbidden/);
  await rm(join(root, 'alias.html'));
  await rm(join(root, 'index.html'));
  await assert.rejects(verifyStatic(root), /Missing application shell/);
}));

test('rejects a file replaced with a symlink immediately before opening', () => fixture(async root => {
  const actualOpen = fileSystem.open;
  const replacement = mock.method(fileSystem, 'open', async (path, ...args) => {
    if (path === join(root, 'index.html')) {
      await rm(path);
      await symlink(join(root, 'main-ABCDEFGH.js'), path);
    }
    return actualOpen(path, ...args);
  });
  try { await assert.rejects(verifyStatic(root), { code: 'ELOOP' }); }
  finally { replacement.mock.restore(); }
}));

test('a served release.json must carry the calendar release tag bound to its source', () => fixture(async root => {
  const release = { app: 'web', releaseVersion: 'v2026.10.27.14.01', releaseTag: 'v2026.10.27.14.01', buildVersion: '2026.10.27.14.01', revision: 'a'.repeat(40) };
  await writeFile(join(root, 'release.json'), JSON.stringify(release));
  assert.equal((await verifyStatic(root)).fileCount, 3);
  for (const broken of [{ ...release, releaseTag: 'v2026.10.27.14.02' }, { ...release, buildVersion: '1.0.0' }, { ...release, app: 'domain' },
    { ...release, revision: 'main' }, { ...release, releaseVersion: 'latest', releaseTag: 'latest' }, [release]]) {
    await writeFile(join(root, 'release.json'), JSON.stringify(broken));
    await assert.rejects(verifyStatic(root), /release\.json/);
  }
  await writeFile(join(root, 'release.json'), '{not json');
  await assert.rejects(verifyStatic(root), /release\.json is not JSON/);
}));
