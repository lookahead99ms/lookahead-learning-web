import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import fileSystem, { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const forbiddenName = /(^|\/)(?:content|local-previews|node_modules|src|docs|test-fixtures|demo-content|\.git|\.env(?:\..*)?)(?:\/|$)|\.(?:map|ts|pem|key|p12|pfx|jks|keystore)$/i;
const privateMarker = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}|\/Users\/|lookahead-learning-content\/(?:runtime|docs)/;
const releaseTag = /^v\d{4}\.\d{2}\.\d{2}\.\d{2}\.(?:\d{2}|[1-9]\d{2,})$/;

// DLV-914: a release build serves release.json with the calendar tag the pipeline cut; a local build has none.
export function verifyReleaseMetadata(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new assert.AssertionError({ message: 'release.json is not JSON' }); }
  assert(value && typeof value === 'object' && !Array.isArray(value), 'release.json must be an object');
  assert.equal(value.app, 'web', 'release.json app must be web');
  assert(releaseTag.test(value.releaseVersion), 'release.json releaseVersion must be a calendar tag');
  assert.equal(value.releaseTag, value.releaseVersion, 'release.json releaseTag must equal releaseVersion');
  assert.equal(value.buildVersion, value.releaseVersion.slice(1), 'release.json buildVersion must be the tag without v');
  assert(/^[a-f0-9]{40}$/.test(value.revision), 'release.json revision must be the exact source commit');
  return value;
}

export async function verifyStatic(root) {
  const files = [];
  let index;
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = entry.name;
      const relative = prefix + name;
      assert(!forbiddenName.test(relative), `Forbidden static artifact: ${relative}`);
      const path = join(directory, name);
      assert(!entry.isSymbolicLink(), `Static symlink forbidden: ${relative}`);
      if (entry.isDirectory()) await walk(path, relative + '/');
      else {
        // Inspect and read the same open file; O_NOFOLLOW rejects a replaced symlink.
        const handle = await fileSystem.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          assert((await handle.stat()).isFile(), `Non-file static artifact: ${relative}`);
          if (/\.(?:html|js|css|json|txt|svg)$/i.test(name)) {
            const text = await handle.readFile('utf8');
            assert(!privateMarker.test(text), `Private marker in static artifact: ${relative}`);
            if (relative === 'index.html') index = text;
            if (relative === 'release.json') verifyReleaseMetadata(text);
          }
        } finally { await handle.close(); }
        files.push(relative);
      }
    }
  }
  await walk(resolve(root));
  assert(files.includes('index.html'), 'Missing application shell');
  assert(files.some(file => /^main-[A-Z0-9]+\.js$/i.test(file)), 'Missing fingerprinted main bundle');
  assert(index.includes('<app-root'), 'Unexpected application shell');
  assert(!/sourceMappingURL/.test(index), 'Source maps are forbidden');
  return { fileCount: files.length, privateArtifacts: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 3, 'Usage: node scripts/container/verify-static.mjs <browser-output>');
  console.log(JSON.stringify(await verifyStatic(process.argv[2])));
}
