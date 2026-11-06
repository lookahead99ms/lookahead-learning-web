import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CONTRACT_PATH, SCHEMA_VERSION, WEB_ROOT, checkAgainstProducer, checkCommittedCopy, contractFile, contractText,
  discoverWebContentPaths, isApplicationSource, isPrivatePath, main, missingFromProducer, parseArguments, pathsInText, readContract,
} from './web-content-paths.mjs';

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

test('writes and reads the contract shape Content publishes', () => {
  const text = contractText(['/content/b.json', '/content/a.json', '/content/b.json']);
  assert.equal(text, `{\n  "schemaVersion": "${SCHEMA_VERSION}",\n  "paths": [\n    "/content/a.json",\n    "/content/b.json"\n  ]\n}\n`);
  assert.deepEqual(readContract(text), ['/content/a.json', '/content/b.json']);
  assert.deepEqual(readContract(contractText([])), []);
  assert.throws(() => readContract('nope'), /is not JSON/);
  assert.throws(() => readContract('[]'), /must be an object/);
  assert.throws(() => readContract(JSON.stringify({ schemaVersion: 'other', paths: [] })), /schemaVersion must be/);
  assert.throws(() => readContract(JSON.stringify({ schemaVersion: SCHEMA_VERSION })), /must list paths/);
  assert.throws(() => readContract(JSON.stringify({ schemaVersion: SCHEMA_VERSION, paths: ['/content/a.json', 1] })), /must be strings under/);
  assert.throws(() => readContract(JSON.stringify({ schemaVersion: SCHEMA_VERSION, paths: ['/assets/a.json'] })), /must be strings under/);
  assert.throws(() => readContract(JSON.stringify({ schemaVersion: SCHEMA_VERSION, paths: ['/content/a.json', '/content/a.json'] })), /repeat a path/);
  assert.throws(() => readContract(JSON.stringify({ schemaVersion: SCHEMA_VERSION, paths: ['/content/b.json', '/content/a.json'] })), /must be sorted/);
  assert.throws(() => readContract('{}', 'producer copy'), /producer copy schemaVersion/);
});

test('names the Web paths a producer list does not promise', () => {
  assert.deepEqual(missingFromProducer(['/content/a.json', '/content/b.json'], ['/content/a.json', '/content/b.json', '/content/extra.json']), []);
  assert.deepEqual(missingFromProducer(['/content/a.json', '/content/b.json'], ['/content/a.json']), ['/content/b.json']);
  assert.deepEqual(missingFromProducer([], []), []);
});

test('checks the committed copy against the discovery', () => fixture(async (root) => {
  const file = contractFile(root);
  assert.equal(file, join(root, 'scripts', 'release', 'contracts', 'web-content-paths.json'));
  assert.deepEqual(await checkCommittedCopy(root), { ok: false, paths: 3, added: EXPECTED, removed: [], formatting: false });
  await writeFile(file, contractText([...EXPECTED, '/content/stale.json']));
  assert.deepEqual(await checkCommittedCopy(root), { ok: false, paths: 3, added: [], removed: ['/content/stale.json'], formatting: false });
  await writeFile(file, JSON.stringify({ schemaVersion: SCHEMA_VERSION, paths: EXPECTED }));
  assert.deepEqual(await checkCommittedCopy(root), { ok: false, paths: 3, added: [], removed: [], formatting: true });
  await writeFile(file, contractText(EXPECTED));
  assert.deepEqual(await checkCommittedCopy(root), { ok: true, paths: 3, added: [], removed: [] });
  await writeFile(file, '{');
  await assert.rejects(checkCommittedCopy(root), /is not JSON/);
}));

test('checks the discovery against the producer copy', () => fixture(async (root) => {
  const producer = join(root, 'producer.json');
  await writeFile(producer, contractText([...EXPECTED, '/content/more.json']));
  assert.deepEqual(await checkAgainstProducer(producer, root), { paths: 3, promised: 4, missing: [] });
  await writeFile(producer, contractText(EXPECTED.slice(1)));
  assert.deepEqual(await checkAgainstProducer(producer, root), { paths: 3, promised: 2, missing: [EXPECTED[0]] });
  await writeFile(producer, JSON.stringify({ schemaVersion: 'other', paths: [] }));
  await assert.rejects(checkAgainstProducer(producer, root), /producer copy .*schemaVersion must be/);
}));

test('parses the command line', () => {
  assert.deepEqual(parseArguments([]), { root: WEB_ROOT, mode: 'print', producer: null });
  assert.deepEqual(parseArguments(['--write']), { root: WEB_ROOT, mode: 'write', producer: null });
  assert.deepEqual(parseArguments(['--root', '/x', '--check']), { root: '/x', mode: 'check', producer: null });
  assert.deepEqual(parseArguments(['--subset', 'p.json']), { root: WEB_ROOT, mode: 'subset', producer: 'p.json' });
  assert.throws(() => parseArguments(['--root']), /--root needs a directory/);
  assert.throws(() => parseArguments(['--subset']), /--subset needs the producer file/);
  assert.throws(() => parseArguments(['--bogus']), /Unknown argument: --bogus/);
});

test('runs each mode with a clear message and exit code', () => fixture(async (root) => {
  const lines = [];
  const log = (line) => lines.push(line);
  assert.equal(await main(['--root', root], log), 0);
  assert.equal(lines.join('\n') + '\n', contractText(EXPECTED));
  lines.length = 0;
  assert.equal(await main(['--root', root, '--check'], log), 1);
  assert.match(lines[0], /differs from the paths found in src\/app; run: node scripts\/release\/web-content-paths.mjs --write/);
  assert.deepEqual(lines.slice(1), EXPECTED.map((path) => `  not in the committed copy: ${path}`));
  lines.length = 0;
  assert.equal(await main(['--root', root, '--write'], log), 0);
  assert.deepEqual(lines, [`Wrote ${CONTRACT_PATH} with 3 paths`]);
  assert.equal(await readFile(contractFile(root), 'utf8'), contractText(EXPECTED));
  lines.length = 0;
  assert.equal(await main(['--root', root, '--check'], log), 0);
  assert.deepEqual(lines, [`${CONTRACT_PATH} matches the 3 paths found in src/app`]);
  lines.length = 0;
  await writeFile(contractFile(root), contractText(['/content/stale.json', ...EXPECTED]).replace(/\n/g, '\n '));
  assert.equal(await main(['--root', root, '--check'], log), 1);
  assert.deepEqual(lines.slice(1), ['  no longer opened by the source: /content/stale.json']);
  lines.length = 0;
  await writeFile(contractFile(root), JSON.stringify({ schemaVersion: SCHEMA_VERSION, paths: EXPECTED }));
  assert.equal(await main(['--root', root, '--check'], log), 1);
  assert.deepEqual(lines.slice(1), ['  same paths, different formatting']);
  lines.length = 0;
  const producer = join(root, 'producer.json');
  await writeFile(producer, contractText(EXPECTED));
  assert.equal(await main(['--root', root, '--subset', producer], log), 0);
  assert.deepEqual(lines, ['All 3 Web content paths are among the 3 paths Content promises to publish']);
  lines.length = 0;
  await writeFile(producer, contractText([]));
  assert.equal(await main(['--root', root, '--subset', producer], log), 1);
  assert.match(lines[0], /3 Web content path\(s\) are not in Content's contract; add them to Content's docs\/contracts\/web-content-paths.json first/);
  assert.deepEqual(lines.slice(1), EXPECTED.map((path) => `  ${path}`));
}));

test('the committed contract copy equals what this source opens (run --write after changing a content path)', async () => {
  const result = await checkCommittedCopy(WEB_ROOT);
  assert.deepEqual(result, { ok: true, paths: result.paths, added: [], removed: [] },
    `${CONTRACT_PATH} drifted from src/app: added ${JSON.stringify(result.added)}, removed ${JSON.stringify(result.removed)}; run node scripts/release/web-content-paths.mjs --write`);
  assert(result.paths > 0, 'the application opens at least one fixed content path');
  const committed = readContract(await readFile(contractFile(WEB_ROOT), 'utf8'));
  assert.equal(committed.length, result.paths);
  assert(committed.every((path) => !isPrivatePath(path)), 'no private segment is in the contract');
});
