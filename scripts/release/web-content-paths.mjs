import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * DLV-968: the `/content/...` paths this application opens by a fixed path, as a contract with the private Content
 * repository (owner decision 2026-11-05: no repository clones another at build or deploy time; every cross-repo
 * expectation is a committed contract file owned by the producer and tested on each side's own pull request).
 *
 * Content owns the contract (`docs/contracts/web-content-paths.json` there) and promises to publish every listed path in
 * each protected release. This file is Web's copy, generated from the Web source by the same discovery the Content
 * release used while it still cloned this repository (`webContentPaths` in Content's tools/utilities/content_release.py):
 * - every `src/app/**\/*.ts` file except `*.spec.ts` and files with `fixture` in their name;
 * - a quoted string `/content/<segments>.<json|html|css|js|svg|png|jpg|jpeg|webp|woff2>`, with an optional `#fragment`
 *   inside the quotes that is not part of the path;
 * - paths through a private segment (`delivery`, `evidence`, `access`) are left out: Infra and Domain refuse them in a
 *   protected delivery, and only a Local build reads them.
 * A path with no published file is a Web feature that copes without it; the Content release decides that, not this list.
 *
 * Usage: node scripts/release/web-content-paths.mjs [--root <web-root>] [--write | --check | --subset <producer.json>]
 *   (no mode)   print the contract JSON for the discovered paths
 *   --write     write scripts/release/contracts/web-content-paths.json
 *   --check     fail when the committed copy differs from the discovery
 *   --subset    fail when a discovered path is missing from the producer's copy (Content's file, fetched on a PR)
 */
export const SCHEMA_VERSION = 'web-content-paths/v1';
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

/** The contract file text for a list of paths: the shape Content publishes, sorted and unique. */
export function contractText(paths) {
  const unique = [...new Set(paths)].sort();
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, paths: unique }, null, 2) + '\n';
}

/** The paths of a well-formed contract text (either side's copy); anything else is an assertion error. */
export function readContract(text, name = 'web-content-paths contract') {
  let contract;
  try { contract = JSON.parse(text); } catch { throw new assert.AssertionError({ message: `${name} is not JSON` }); }
  assert(contract && typeof contract === 'object' && !Array.isArray(contract), `${name} must be an object`);
  assert.equal(contract.schemaVersion, SCHEMA_VERSION, `${name} schemaVersion must be ${SCHEMA_VERSION}`);
  assert(Array.isArray(contract.paths), `${name} must list paths`);
  assert(contract.paths.every((path) => typeof path === 'string' && path.startsWith('/content/')), `${name} paths must be strings under /content/`);
  assert.equal(new Set(contract.paths).size, contract.paths.length, `${name} paths repeat a path`);
  assert.deepEqual(contract.paths, [...contract.paths].sort(), `${name} paths must be sorted`);
  return contract.paths;
}

/** The discovered paths the producer's list does not promise; empty when Web's paths are a subset of it. */
export function missingFromProducer(webPaths, producerPaths) {
  const promised = new Set(producerPaths);
  return webPaths.filter((path) => !promised.has(path));
}

/** The committed copy's location under a Web root. */
export function contractFile(webRoot) {
  return join(resolve(webRoot), ...CONTRACT_PATH.split('/'));
}

/** Compare the committed copy with the discovery; the result names the drift when there is one. */
export async function checkCommittedCopy(webRoot = WEB_ROOT) {
  const discovered = await discoverWebContentPaths(webRoot);
  let committedText;
  try { committedText = await readFile(contractFile(webRoot), 'utf8'); } catch { committedText = null; }
  const expected = contractText(discovered);
  if (committedText === expected) return { ok: true, paths: discovered.length, added: [], removed: [] };
  const committed = committedText === null ? [] : readContract(committedText, CONTRACT_PATH);
  return {
    ok: false,
    paths: discovered.length,
    added: discovered.filter((path) => !committed.includes(path)),
    removed: committed.filter((path) => !discovered.includes(path)),
    formatting: committedText !== null && committed.join('\n') === discovered.join('\n'),
  };
}

/** Check Web's discovered paths against the producer's copy; the result lists what Content does not promise. */
export async function checkAgainstProducer(producerFile, webRoot = WEB_ROOT) {
  const discovered = await discoverWebContentPaths(webRoot);
  const producer = readContract(await readFile(producerFile, 'utf8'), `producer copy ${relative(resolve(webRoot), resolve(producerFile)) || producerFile}`);
  return { paths: discovered.length, promised: producer.length, missing: missingFromProducer(discovered, producer) };
}

export function parseArguments(argv) {
  const options = { root: WEB_ROOT, mode: 'print', producer: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') { options.root = argv[++index]; assert(options.root, '--root needs a directory'); }
    else if (argument === '--write' || argument === '--check') { options.mode = argument.slice(2); }
    else if (argument === '--subset') { options.mode = 'subset'; options.producer = argv[++index]; assert(options.producer, '--subset needs the producer file'); }
    else throw new assert.AssertionError({ message: `Unknown argument: ${argument}` });
  }
  return options;
}

/** Run one mode; returns the process exit code and prints to `log`. */
export async function main(argv, log = console.log) {
  const options = parseArguments(argv);
  if (options.mode === 'print') {
    log(contractText(await discoverWebContentPaths(options.root)).trimEnd());
    return 0;
  }
  if (options.mode === 'write') {
    const paths = await discoverWebContentPaths(options.root);
    await writeFile(contractFile(options.root), contractText(paths));
    log(`Wrote ${CONTRACT_PATH} with ${paths.length} paths`);
    return 0;
  }
  if (options.mode === 'check') {
    const result = await checkCommittedCopy(options.root);
    if (result.ok) { log(`${CONTRACT_PATH} matches the ${result.paths} paths found in ${SOURCE_ROOT}`); return 0; }
    log(`${CONTRACT_PATH} differs from the paths found in ${SOURCE_ROOT}; run: node scripts/release/web-content-paths.mjs --write`);
    for (const path of result.added) log(`  not in the committed copy: ${path}`);
    for (const path of result.removed) log(`  no longer opened by the source: ${path}`);
    if (result.formatting) log('  same paths, different formatting');
    return 1;
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
