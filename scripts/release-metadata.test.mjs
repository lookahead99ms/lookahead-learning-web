import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseMetadata, writeReleaseMetadata } from './release-metadata.mjs';
const env = { LOOKAHEAD_RELEASE_VERSION: 'v2026.10.26.20.00', LOOKAHEAD_SOURCE_REVISION: 'a'.repeat(40) };
test('embeds exact release/source without touching npm semantic version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'web-release-'));
  try {
    await writeReleaseMetadata(dir, env);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'release.json'))), { app: 'web', releaseVersion: env.LOOKAHEAD_RELEASE_VERSION, buildVersion: '2026.10.26.20.00', revision: env.LOOKAHEAD_SOURCE_REVISION });
    await assert.rejects(writeReleaseMetadata(dir, env));
  } finally { await rm(dir, { recursive: true }); }
});
test('local builds omit release metadata; malformed dates and sources fail closed', async () => {
  assert.equal(releaseMetadata({}), null);
  await writeReleaseMetadata('/does-not-exist', {});
  assert.equal(releaseMetadata({ LOOKAHEAD_RELEASE_VERSION: 'dev' }), null);
  for (const version of ['latest', 'v2026.02.30.01.00', 'v2026.10.26.24.00', 'v2026.10.26.01.0', 'v2026.10.26.01.001']) {
    assert.throws(() => releaseMetadata({ ...env, LOOKAHEAD_RELEASE_VERSION: version }));
  }
  assert.throws(() => releaseMetadata({ ...env, LOOKAHEAD_SOURCE_REVISION: 'main' }));
});
