import { test } from 'node:test';
import assert from 'node:assert/strict';
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
