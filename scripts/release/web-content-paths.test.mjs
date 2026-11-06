import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CONTRACT_NAME, CONTRACT_PATH, SCHEMA, WEB_ROOT, checkAgainstProducer, contractFile, contractText,
  discoverWebContentPaths, isApplicationSource, isPrivatePath, main, missingFromProducer, parseArguments, pathsInText, readContract,
  readFetchedContract,
} from './web-content-paths.mjs';
import { missingContractMessage } from './fetch-contracts.mjs';

/** A synthetic Web root: application sources, a spec, a fixture and a nested folder, like src/app. */
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'lookahead-web-content-paths-'));
  try {
    await mkdir(join(root, 'src', 'app', 'features', 'deep'), { recursive: true });
    await mkdir(join(root, 'scripts', 'release', 'contracts'), { recursive: true });
    await writeFile(join(root, 'src', 'app', 'catalog.service.ts'), [
      "const index = '/content/indexes/blaze.json';",
      'const lab = `/content/learn/visuals/binary-search-lab.html#step-2`;',
      'const plan = "/content/delivery/delivery-plan.json";',
      "const again = '/content/indexes/blaze.json';",
      "const route = '/learn/blaze';",
      "const noExtension = '/content/learn/visuals/lab';",
    ].join('\n'));
    await writeFile(join(root, 'src', 'app', 'features', 'deep', 'manifest.ts'), "fetch('/content/content-index-manifest.json');\n");
    await writeFile(join(root, 'src', 'app', 'catalog.service.spec.ts'), "const only = '/content/spec-only.json';\n");
    await writeFile(join(root, 'src', 'app', 'features', 'catalog.fixture.ts'), "const only = '/content/fixture-only.json';\n");
    await writeFile(join(root, 'src', 'app', 'features', 'notes.md'), "'/content/not-a-source.json'\n");
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

const EXPECTED = ['/content/content-index-manifest.json', '/content/indexes/blaze.json', '/content/learn/visuals/binary-search-lab.html'];

/** The master's shape as Content keeps it: schema, owner, consumer, note and the paths. */
function master(paths) {
  return JSON.stringify({ schema: SCHEMA, owner: 'lookahead-learning-content', consumer: 'lookahead-learning-web', note: 'synthetic', paths }, null, 2) + '\n';
}

test('takes only application TypeScript sources: no specs, no fixtures, no other files', () => {
  assert.equal(isApplicationSource('catalog.service.ts'), true);
  assert.equal(isApplicationSource('catalog.service.spec.ts'), false);
  assert.equal(isApplicationSource('catalog.fixture.ts'), false);
  assert.equal(isApplicationSource('fixtures.ts'), false);
  assert.equal(isApplicationSource('notes.md'), false);
  assert.equal(isApplicationSource('catalog.ts.bak'), false);
});

test('finds quoted content paths the way the Content release did', () => {
  assert.deepEqual(pathsInText("'/content/a.json' \"/content/b.html\" `/content/c.svg#x`"), ['/content/a.json', '/content/b.html', '/content/c.svg']);
  for (const extension of ['json', 'html', 'css', 'js', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'woff2']) {
    assert.deepEqual(pathsInText(`'/content/x/file.${extension}'`), [`/content/x/file.${extension}`], extension);
  }
  assert.deepEqual(pathsInText("'/content/x/file.txt' '/content/x/folder' '/content/' 'content/x.json' '/api/content/x.json'"), []);
  assert.deepEqual(pathsInText("'/content/x.json?v=1' '/content/x y.json' '/content/x.json "), []);
  assert.deepEqual(pathsInText("'/content/delivery/plan.json' '/content/evidence/a.json' '/content/access/b.json' '/content/staff/plan.json'"), ['/content/staff/plan.json']);
  assert.equal(isPrivatePath('/content/delivery/plan.json'), true);
  assert.equal(isPrivatePath('/content/access-levels.json'), false);
});

test('discovers sorted unique paths from src/app, fragments and private segments left out', () => fixture(async (root) => {
  assert.deepEqual(await discoverWebContentPaths(root), EXPECTED);
}));

test('prints the contract shape and reads the master shape Content keeps', () => {
  const text = contractText(['/content/b.json', '/content/a.json', '/content/b.json']);
  assert.equal(text, `{\n  "schema": "${SCHEMA}",\n  "paths": [\n    "/content/a.json",\n    "/content/b.json"\n  ]\n}\n`);
  assert.deepEqual(readContract(text), ['/content/a.json', '/content/b.json']);
  assert.deepEqual(readContract(master(['/content/a.json', '/content/b.json'])), ['/content/a.json', '/content/b.json']);
  assert.deepEqual(readContract(contractText([])), []);
  assert.throws(() => readContract('nope'), /is not JSON/);
  assert.throws(() => readContract('[]'), /must be an object/);
  assert.throws(() => readContract(JSON.stringify({ schema: 'other', paths: [] })), /schema must be/);
  assert.throws(() => readContract(JSON.stringify({ schemaVersion: SCHEMA, paths: [] })), /schema must be/, 'the old copy key is not the master key');
  assert.throws(() => readContract(JSON.stringify({ schema: SCHEMA })), /must list paths/);
  assert.throws(() => readContract(JSON.stringify({ schema: SCHEMA, paths: ['/content/a.json', 1] })), /must be strings under/);
  assert.throws(() => readContract(JSON.stringify({ schema: SCHEMA, paths: ['/assets/a.json'] })), /must be strings under/);
  assert.throws(() => readContract(JSON.stringify({ schema: SCHEMA, paths: ['/content/a.json', '/content/a.json'] })), /repeat a path/);
  assert.throws(() => readContract(JSON.stringify({ schema: SCHEMA, paths: ['/content/b.json', '/content/a.json'] })), /must be sorted/);
  assert.throws(() => readContract('{}', 'master x.json'), /master x.json schema/);
});

test('names the Web paths a master does not promise', () => {
  assert.deepEqual(missingFromProducer(['/content/a.json', '/content/b.json'], ['/content/a.json', '/content/b.json', '/content/extra.json']), []);
  assert.deepEqual(missingFromProducer(['/content/a.json', '/content/b.json'], ['/content/a.json']), ['/content/b.json']);
  assert.deepEqual(missingFromProducer([], []), []);
});

test('reads the fetched master and, when it is absent, says to run the fetch in one sentence', () => fixture(async (root) => {
  const file = contractFile(root);
  assert.equal(file, join(root, 'scripts', 'release', 'contracts', 'web-content-paths.json'));
  assert.equal(contractFile(), join(WEB_ROOT, ...CONTRACT_PATH.split('/')));
  await assert.rejects(readFetchedContract(file), { message: missingContractMessage(CONTRACT_NAME) });
  assert.equal(missingContractMessage(CONTRACT_NAME), `${CONTRACT_PATH} is missing; run \`npm run contracts:fetch\` to fetch the contracts from the Content repository.`);
  await assert.rejects(checkAgainstProducer(file, root), { message: missingContractMessage(CONTRACT_NAME) });
  await writeFile(file, master(EXPECTED));
  assert.equal(await readFetchedContract(file), master(EXPECTED));
  assert.deepEqual(await checkAgainstProducer(file, root), { paths: 3, promised: 3, missing: [] });
  await assert.rejects(readFetchedContract(join(root, 'other.json')), { message: missingContractMessage('other.json') }, 'the sentence names the file asked for');
  await assert.rejects(readFetchedContract(join(root, 'scripts')), (error) => error.code === 'EISDIR', 'other read errors pass through');
}));

test('checks the discovery against the master', () => fixture(async (root) => {
  const producer = join(root, 'producer.json');
  await writeFile(producer, master([...EXPECTED, '/content/more.json']));
  assert.deepEqual(await checkAgainstProducer(producer, root), { paths: 3, promised: 4, missing: [] });
  await writeFile(producer, master(EXPECTED.slice(1)));
  assert.deepEqual(await checkAgainstProducer(producer, root), { paths: 3, promised: 2, missing: [EXPECTED[0]] });
  await writeFile(producer, JSON.stringify({ schema: 'other', paths: [] }));
  await assert.rejects(checkAgainstProducer(producer, root), /master producer.json schema must be/);
}));

test('parses the command line', () => {
  assert.deepEqual(parseArguments([]), { root: WEB_ROOT, mode: 'print', producer: null });
  assert.deepEqual(parseArguments(['--root', '/x']), { root: '/x', mode: 'print', producer: null });
  assert.deepEqual(parseArguments(['--subset', 'p.json']), { root: WEB_ROOT, mode: 'subset', producer: 'p.json' });
  assert.deepEqual(parseArguments(['--subset']), { root: WEB_ROOT, mode: 'subset', producer: contractFile(WEB_ROOT) });
  assert.deepEqual(parseArguments(['--subset', '--root', '/x']), { root: '/x', mode: 'subset', producer: contractFile('/x') });
  assert.throws(() => parseArguments(['--root']), /--root needs a directory/);
  assert.throws(() => parseArguments(['--write']), /Unknown argument: --write/);
  assert.throws(() => parseArguments(['--bogus']), /Unknown argument: --bogus/);
});

test('runs each mode with a clear message and exit code', () => fixture(async (root) => {
  const lines = [];
  const log = (line) => lines.push(line);
  assert.equal(await main(['--root', root], log), 0);
  assert.equal(lines.join('\n') + '\n', contractText(EXPECTED));
  lines.length = 0;
  await assert.rejects(main(['--root', root, '--subset'], log), { message: missingContractMessage(CONTRACT_NAME) });
  await writeFile(contractFile(root), master(EXPECTED));
  assert.equal(await main(['--root', root, '--subset'], log), 0);
  assert.deepEqual(lines, ['All 3 Web content paths are among the 3 paths Content promises to publish']);
  lines.length = 0;
  const producer = join(root, 'producer.json');
  await writeFile(producer, master([]));
  assert.equal(await main(['--root', root, '--subset', producer], log), 1);
  assert.match(lines[0], /3 Web content path\(s\) are not in Content's contract; add them to Content's docs\/contracts\/web-content-paths.json first/);
  assert.deepEqual(lines.slice(1), EXPECTED.map((path) => `  ${path}`));
}));

test('every content path this source opens is in the fetched Content master (run `npm run contracts:fetch` first)', async () => {
  const result = await checkAgainstProducer(contractFile(WEB_ROOT), WEB_ROOT);
  assert.deepEqual(result.missing, [],
    `${result.missing.length} path(s) opened by src/app are not in Content's docs/contracts/web-content-paths.json: ${JSON.stringify(result.missing)}; add them to Content first`);
  assert(result.paths > 0, 'the application opens at least one fixed content path');
  assert(result.promised >= result.paths, 'the master promises at least every path the source opens');
  const promised = readContract(await readFetchedContract(contractFile(WEB_ROOT)));
  assert(promised.every((path) => !isPrivatePath(path)), 'no private segment is in the master');
});
