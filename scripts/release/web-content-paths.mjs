import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contractFile as fetchedContractFile, missingContractMessage } from './fetch-contracts.mjs';

/**
 * DLV-968: the `/content/...` paths this application opens by a fixed path, as a contract with the private Content
 * repository (owner decision 2026-11-06: every cross-repository contract lives only in Content under docs/contracts/;
 * a consumer fetches the master on its own pull request and tests against it; no repository keeps a copy).
 *
 * Content owns the master (`docs/contracts/web-content-paths.json` there) and promises to publish every listed path in
 * each protected release. `npm run contracts:fetch` (scripts/release/fetch-contracts.mjs) brings it to the git-ignored
 * scripts/release/contracts/web-content-paths.json; this module discovers the paths the Web source opens, with the
 * same rule the Content release used while it still cloned this repository:
 * - every `src/app/**\/*.ts` file except `*.spec.ts` and files with `fixture` in their name;
 * - a quoted string `/content/<segments>.<json|html|css|js|svg|png|jpg|jpeg|webp|woff2>`, with an optional `#fragment`
 *   inside the quotes that is not part of the path;
 * - paths through a private segment (`delivery`, `evidence`, `access`) are left out: Infra and Domain refuse them in a
 *   protected delivery, and only a Local build reads them.
 * Every discovered path must be in the master; a listed path the Web no longer opens is Content's to remove.
 * A path with no published file is a Web feature that copes without it; the Content release decides that, not this list.
 *
 * Usage: node scripts/release/web-content-paths.mjs [--root <web-root>] [--subset [<master.json>]]
 *   (no mode)   print the discovered paths in the contract's shape
 *   --subset    fail when a discovered path is missing from the master (default: the fetched scripts/release/contracts file)
 */
export const SCHEMA = 'web-content-paths/v1';
export const CONTRACT_NAME = 'web-content-paths.json';
export const CONTRACT_PATH = 'scripts/release/contracts/web-content-paths.json';
export const SOURCE_ROOT = 'src/app';
export const WEB_CONTENT_PATH = /["'`](\/content\/[A-Za-z0-9_./-]+\.(?:json|html|css|js|svg|png|jpe?g|webp|woff2))(?:#[^"'`]*)?["'`]/g;
export const PRIVATE_SEGMENTS = new Set(['delivery', 'evidence', 'access']);

/** The repository root: this file lives at scripts/release/. */
export const WEB_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** Whether a source file takes part in the discovery (same rule as Content's webContentPaths). */
export function isApplicationSource(fileName) {
  return fileName.endsWith('.ts') && !fileName.endsWith('.spec.ts') && !fileName.includes('fixture');
}

/** Whether a path goes through a private segment, which a protected delivery never serves. */
export function isPrivatePath(path) {
  return path.split('/').some((segment) => PRIVATE_SEGMENTS.has(segment));
}

/** The fixed content paths quoted in one source text, private segments left out; order of appearance, may repeat. */
export function pathsInText(text) {
  return [...text.matchAll(WEB_CONTENT_PATH)].map((match) => match[1]).filter((path) => !isPrivatePath(path));
}

/** Every `/content/...` path the application source opens by a fixed path, sorted and unique. */
export async function discoverWebContentPaths(webRoot = WEB_ROOT) {
  const root = join(resolve(webRoot), ...SOURCE_ROOT.split('/'));
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const found = new Set();
  for (const entry of entries) {
    if (!entry.isFile() || !isApplicationSource(entry.name)) continue;
    const file = join(entry.parentPath ?? entry.path, entry.name);
    for (const path of pathsInText(await readFile(file, 'utf8'))) found.add(path);
  }
  return [...found].sort();
}

/** The contract shape for a list of paths (schema and paths, sorted and unique): what the print mode shows. */
export function contractText(paths) {
  const unique = [...new Set(paths)].sort();
  return JSON.stringify({ schema: SCHEMA, paths: unique }, null, 2) + '\n';
}

/** The paths of a well-formed master text; anything else is an assertion error naming the file. */
export function readContract(text, name = 'web-content-paths contract') {
  let contract;
  try { contract = JSON.parse(text); } catch { throw new assert.AssertionError({ message: `${name} is not JSON` }); }
  assert(contract && typeof contract === 'object' && !Array.isArray(contract), `${name} must be an object`);
  assert.equal(contract.schema, SCHEMA, `${name} schema must be ${SCHEMA}`);
  assert(Array.isArray(contract.paths), `${name} must list paths`);
  assert(contract.paths.every((path) => typeof path === 'string' && path.startsWith('/content/')), `${name} paths must be strings under /content/`);
  assert.equal(new Set(contract.paths).size, contract.paths.length, `${name} paths repeat a path`);
  assert.deepEqual(contract.paths, [...contract.paths].sort(), `${name} paths must be sorted`);
  return contract.paths;
}

/** The discovered paths the master does not promise; empty when Web's paths are a subset of it. */
export function missingFromProducer(webPaths, producerPaths) {
  const promised = new Set(producerPaths);
  return webPaths.filter((path) => !promised.has(path));
}

/** The fetched master's location under a Web root (git-ignored; written by `npm run contracts:fetch`). */
export function contractFile(webRoot = WEB_ROOT) {
  return fetchedContractFile(CONTRACT_NAME, webRoot);
}

/** The master's text, or an assertion error with the one sentence that names the fetch command when it is absent. */
export async function readFetchedContract(file) {
  try { return await readFile(file, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') throw new assert.AssertionError({ message: missingContractMessage(basename(file)) });
    throw error;
  }
}

/** Check Web's discovered paths against the master; the result lists what Content does not promise. */
export async function checkAgainstProducer(producerFile = contractFile(), webRoot = WEB_ROOT) {
  const discovered = await discoverWebContentPaths(webRoot);
  const name = relative(resolve(webRoot), resolve(producerFile)) || producerFile;
  const producer = readContract(await readFetchedContract(producerFile), `master ${name}`);
  return { paths: discovered.length, promised: producer.length, missing: missingFromProducer(discovered, producer) };
}

export function parseArguments(argv) {
  const options = { root: WEB_ROOT, mode: 'print', producer: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') { options.root = argv[++index]; assert(options.root, '--root needs a directory'); }
    else if (argument === '--subset') {
      options.mode = 'subset';
      if (argv[index + 1] && !argv[index + 1].startsWith('--')) options.producer = argv[++index];
    }
    else throw new assert.AssertionError({ message: `Unknown argument: ${argument}` });
  }
  if (options.mode === 'subset' && options.producer === null) options.producer = contractFile(options.root);
  return options;
}

/** Run one mode; returns the process exit code and prints to `log`. */
export async function main(argv, log = console.log) {
  const options = parseArguments(argv);
  if (options.mode === 'print') {
    log(contractText(await discoverWebContentPaths(options.root)).trimEnd());
    return 0;
  }
  const result = await checkAgainstProducer(options.producer, options.root);
  if (result.missing.length === 0) {
    log(`All ${result.paths} Web content paths are among the ${result.promised} paths Content promises to publish`);
    return 0;
  }
  log(`${result.missing.length} Web content path(s) are not in Content's contract; add them to Content's docs/contracts/web-content-paths.json first:`);
  for (const path of result.missing) log(`  ${path}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
