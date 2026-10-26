import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareNpmCli, fixedDependencies } from './prepare-npm-cli.mjs';
const source = {name:'npm',version:'11.17.0',dependencies:{tar:'^7.5.0'},bundleDependencies:['tar'],workspaces:['workspaces/*'],devDependencies:{privateTest:'1'}};
const lock = {name:'npm',version:'11.17.0',lockfileVersion:3,packages:{'':{dependencies:{tar:'7.5.22'}},'node_modules/tar':{version:'7.5.22',resolved:'https://registry.npmjs.org/tar/-/tar-7.5.22.tgz',integrity:'sha512-YWJjZA=='}}};
test('CLI source retains identity and installs real fixed dependency implementations', () => {
  const actual = prepareNpmCli(source,lock);
  assert.deepEqual(actual.overrides,fixedDependencies);
  assert.equal(actual.dependencies.tar,'7.5.22');
  assert.equal(actual.version,'11.17.0');
  assert.equal(actual.bundleDependencies,undefined);
  assert.equal(actual.devDependencies,undefined);
  assert(source.bundleDependencies,'Source object is not mutated');
  for (const bad of [{...lock,version:'latest'},{...lock,packages:{...lock.packages,'':{dependencies:{tar:'7.5.9'}}}}]) assert.throws(() => prepareNpmCli(source,bad));
  for (const field of ['resolved','integrity','version']) { const bad=structuredClone(lock);bad.packages['node_modules/tar'][field]='invalid';assert.throws(()=>prepareNpmCli(source,bad)); }
});

test('frozen CLI graph contains the patched implementations selected by its overrides', () => {
  const productionLock = JSON.parse(readFileSync(new URL('../../deployment/container/npm-cli-lock.json', import.meta.url), 'utf8'));
  assert.equal(fixedDependencies.undici, '6.29.1');
  assert.equal(fixedDependencies['ip-address'], '10.7.4');
  for (const [name, override] of Object.entries(fixedDependencies)) {
    const version = override === '$tar' ? productionLock.packages[''].dependencies.tar : override;
    const installed = Object.entries(productionLock.packages).filter(([path]) => path.endsWith(`node_modules/${name}`));
    assert.ok(installed.length > 0, `${name} must be covered by the frozen CLI inventory`);
    for (const [path, item] of installed) assert.equal(item.version, version, path);
  }
});

test('CLI entrypoint writes the verified manifest and preserves it on invalid input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'npm-cli-contract-'));
  const command = new URL('./prepare-npm-cli.mjs', import.meta.url).pathname;
  try {
    const manifestPath = join(directory, 'package.json');
    const lockPath = join(directory, 'package-lock.json');
    writeFileSync(manifestPath, JSON.stringify(source));
    writeFileSync(lockPath, JSON.stringify(lock));
    const run = (...args) => spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' });
    assert.equal(run(manifestPath, lockPath).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, 'utf8')), prepareNpmCli(source, lock));
    const verified = readFileSync(manifestPath, 'utf8');
    writeFileSync(lockPath, JSON.stringify({ ...lock, version: 'invalid' }));
    assert.notEqual(run(manifestPath, lockPath).status, 0);
    assert.equal(readFileSync(manifestPath, 'utf8'), verified);
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
