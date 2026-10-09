import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
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
