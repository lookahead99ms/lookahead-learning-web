// Reconstitute the published npm CLI source with a reviewed fixed dependency graph.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
export const fixedDependencies = Object.freeze({ 'brace-expansion': '5.0.12', 'http-cache-semantics': '4.3.0', 'ip-address': '10.7.3', tar: '$tar', undici: '6.29.0' });
export function prepareNpmCli(source, lock) {
  if (source.name !== 'npm' || source.version !== '11.17.0' || lock.name !== 'npm' || lock.version !== '11.17.0' || lock.lockfileVersion !== 3) throw new Error('Reviewed npm source and CLI lock required');
  const manifest = structuredClone(source);
  delete manifest.bundleDependencies;
  delete manifest.bundledDependencies;
  delete manifest.workspaces;
  delete manifest.devDependencies;
  manifest.dependencies.tar = '7.5.22';
  manifest.overrides = { ...fixedDependencies };
  if (!isDeepStrictEqual(manifest.dependencies, lock.packages?.['']?.dependencies)) throw new Error('CLI manifest differs from frozen production graph');
  for (const [path, item] of Object.entries(lock.packages)) {
    if (path && (!/^https:\/\/registry\.npmjs\.org\//.test(item.resolved ?? '') || !/^sha512-[A-Za-z0-9+/=]+$/.test(item.integrity ?? '') || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(item.version ?? ''))) throw new Error('CLI package version, registry or integrity missing');
  }
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [path, lockPath] = process.argv.slice(2);
  if (!path || !lockPath) throw new Error('Source manifest and reviewed lock paths required');
  const output = prepareNpmCli(JSON.parse(readFileSync(path, 'utf8')), JSON.parse(readFileSync(lockPath, 'utf8')));
  writeFileSync(path, JSON.stringify(output, null, 2) + '\n');
}
