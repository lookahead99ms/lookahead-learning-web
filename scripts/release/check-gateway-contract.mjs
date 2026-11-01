import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * DLV-968 T13: every Web path the Gateway forwards (the `webPaths` of the Gateway's consumer contract,
 * contracts/domain-api-v1.json) must be served by the built site. The rules are the container's nginx rules
 * (deployment/container/nginx.conf and nginx-lower-cost-dev.conf):
 * - Gateway-owned prefixes, dotfiles and key material answer 404, so a contract path there is an error;
 * - a path with an extension, or under /assets/ or /formatters/, must be an existing file (`try_files $uri =404`);
 * - any other GET resolves `$uri` (a file), `$uri/` (a route snapshot `<route>/index.html`, generate-route-snapshots.mjs)
 *   or the application shell /index.html (`try_files $uri $uri/ /index.html`).
 */
export const GATEWAY_OWNED = /^\/(?:api|bff|content|auth|oauth2|login|logout|local-previews)(?:\/|$)/;
export const HIDDEN = /\/\./;
export const KEY_MATERIAL = /\.(?:map|pem|key|p12|pfx|jks|keystore)$/i;
export const FILE_ONLY = /^\/(?:assets|formatters)\//;
export const EXTENSION = /\.[^/]+$/;
const SAFE = /^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/?)?$/;

/** How nginx treats the path before looking at the output: 'blocked', 'file' (must exist) or 'route' (may fall back). */
export function classify(path) {
  assert(typeof path === 'string' && SAFE.test(path) && !path.includes('..') && !path.includes('//'), `Unsafe contract path: ${path}`);
  if (GATEWAY_OWNED.test(path) || HIDDEN.test(path) || KEY_MATERIAL.test(path)) return 'blocked';
  if (FILE_ONLY.test(path) || EXTENSION.test(path)) return 'file';
  return 'route';
}

async function kind(target) {
  try { return (await stat(target)).isFile() ? 'file' : (await stat(target)).isDirectory() ? 'directory' : 'other'; } catch { return 'absent'; }
}

/** The file nginx would serve for `path` under `root`, or an error naming why nothing is served. */
export async function resolvePath(root, path) {
  const kindOfPath = classify(path);
  assert.notEqual(kindOfPath, 'blocked', `Path is answered 404 by the Web container, never served: ${path}`);
  const base = await realpath(resolve(root));
  const relative = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const target = relative ? join(base, ...relative.split('/')) : base;
  assert(target === base || target.startsWith(base + sep), `Path escapes the output directory: ${path}`);
  const found = await kind(target);
  if (found === 'file') return { path, kind: 'file', file: relative };
  if (kindOfPath === 'file') throw new assert.AssertionError({ message: `Missing static file for contract path: ${path}` });
  if (found === 'directory' && (await kind(join(target, 'index.html'))) === 'file') {
    return { path, kind: 'snapshot', file: relative ? `${relative}/index.html` : 'index.html' };
  }
  assert.equal(await kind(join(base, 'index.html')), 'file', `Missing application shell index.html; cannot serve ${path}`);
  return { path, kind: 'shell', file: 'index.html' };
}

export function readWebPaths(text) {
  let contract;
  try { contract = JSON.parse(text); } catch { throw new assert.AssertionError({ message: 'Gateway contract is not JSON' }); }
  assert(contract && typeof contract === 'object' && !Array.isArray(contract), 'Gateway contract must be an object');
  assert.equal(contract.schema, 'gateway-domain-contract/v1', 'Gateway contract schema must be gateway-domain-contract/v1');
  assert(Array.isArray(contract.webPaths) && contract.webPaths.length > 0, 'Gateway contract lists no webPaths');
  assert(contract.webPaths.every((path) => typeof path === 'string'), 'Gateway contract webPaths must be strings');
  assert.equal(new Set(contract.webPaths).size, contract.webPaths.length, 'Gateway contract webPaths repeat a path');
  return contract.webPaths;
}

export async function checkGatewayContract(contractPath, root) {
  const webPaths = readWebPaths(await readFile(contractPath, 'utf8'));
  const resolved = [];
  for (const path of webPaths) resolved.push(await resolvePath(root, path));
  return { contract: contractPath, root, checked: resolved.length, resolved };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 3 || process.argv.length === 4,
    'Usage: node scripts/release/check-gateway-contract.mjs <contract.json> [browser-output=dist/lookahead-learning-web/browser]');
  const result = await checkGatewayContract(process.argv[2], process.argv[3] ?? 'dist/lookahead-learning-web/browser');
  console.log(JSON.stringify(result));
}
