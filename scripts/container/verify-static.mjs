import assert from 'node:assert/strict';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const forbiddenName = /(^|\/)(?:content|local-previews|node_modules|src|docs|test-fixtures|demo-content|\.git|\.env(?:\..*)?)(?:\/|$)|\.(?:map|ts|pem|key|p12|pfx|jks|keystore)$/i;
const privateMarker = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}|\/Users\/|lookahead-learning-content\/(?:runtime|docs)/;

export async function verifyStatic(root) {
  const files = [];
  async function walk(directory, prefix = '') {
    for (const name of await readdir(directory)) {
      const relative = prefix + name;
      assert(!forbiddenName.test(relative), `Forbidden static artifact: ${relative}`);
      const path = join(directory, name);
      const stat = await lstat(path);
      assert(!stat.isSymbolicLink(), `Static symlink forbidden: ${relative}`);
      if (stat.isDirectory()) await walk(path, relative + '/');
      else {
        assert(stat.isFile(), `Non-file static artifact: ${relative}`);
        if (/\.(?:html|js|css|json|txt|svg)$/i.test(name)) {
          assert(!privateMarker.test(await readFile(path, 'utf8')), `Private marker in static artifact: ${relative}`);
        }
        files.push(relative);
      }
    }
  }
  await walk(resolve(root));
  assert(files.includes('index.html'), 'Missing application shell');
  assert(files.some(file => /^main-[A-Z0-9]+\.js$/i.test(file)), 'Missing fingerprinted main bundle');
  const index = await readFile(join(root, 'index.html'), 'utf8');
  assert(index.includes('<app-root'), 'Unexpected application shell');
  assert(!/sourceMappingURL/.test(index), 'Source maps are forbidden');
  return { fileCount: files.length, privateArtifacts: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 3, 'Usage: node scripts/container/verify-static.mjs <browser-output>');
  console.log(JSON.stringify(await verifyStatic(process.argv[2])));
}
