import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  withRuntimePublicationLock,
  publishRuntimeDirectory,
} from './runtime-content-publication.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'runtime-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('concurrent writers serialize their full transaction', async (t) => {
  const root = await fixture(t);
  const lock = join(root, 'publication.lock');
  const events = [];
  await Promise.all(
    [1, 2, 3].map((writer) =>
      withRuntimePublicationLock(lock, async () => {
        events.push(`start${writer}`);
        await delay(25);
        events.push(`end${writer}`);
      }),
    ),
  );
  for (let index = 0; index < events.length; index += 2) {
    assert.equal(events[index].replace('start', ''), events[index + 1].replace('end', ''));
  }
});

test('failed generation leaves old content available and releases the lock', async (t) => {
  const root = await fixture(t);
  const lock = join(root, 'publication.lock');
  const live = join(root, 'content');
  await mkdir(live);
  await writeFile(join(live, 'index.json'), 'old');
  await assert.rejects(
    withRuntimePublicationLock(lock, async () => {
      throw new Error('generation failed');
    }),
    /generation failed/,
  );
  assert.equal(await readFile(join(live, 'index.json'), 'utf8'), 'old');
  await withRuntimePublicationLock(lock, async () => {});
});

test('publication installs the complete stage and removes obsolete assets', async (t) => {
  const root = await fixture(t);
  const live = join(root, 'content');
  const stage = join(root, 'stage');
  await mkdir(live);
  await mkdir(stage);
  await writeFile(join(live, 'private-old.json'), 'old');
  await writeFile(join(stage, 'index.json'), 'complete');
  await publishRuntimeDirectory(stage, live, join(root, 'previous'));
  assert.equal(await readFile(join(live, 'index.json'), 'utf8'), 'complete');
  await assert.rejects(readFile(join(live, 'private-old.json')), { code: 'ENOENT' });
});

test('publication failure restores the old runtime tree', async (t) => {
  const root = await fixture(t);
  const live = join(root, 'content');
  await mkdir(live);
  await writeFile(join(live, 'index.json'), 'old');
  await assert.rejects(
    publishRuntimeDirectory(join(root, 'missing-stage'), live, join(root, 'previous')),
    { code: 'ENOENT' },
  );
  assert.equal(await readFile(join(live, 'index.json'), 'utf8'), 'old');
});

test('an occupied lock times out without deleting another owner', async (t) => {
  const root = await fixture(t);
  const lock = join(root, 'publication.lock');
  await writeFile(lock, '{"pid":12345}');
  await assert.rejects(
    withRuntimePublicationLock(lock, async () => {}, { timeoutMs: 5 }),
    /still locked/,
  );
  assert.equal(await readFile(lock, 'utf8'), '{"pid":12345}');
});

test('independent sync processes share the same destination lock', async (t) => {
  const root = await fixture(t);
  const lock = join(root, 'publication.lock');
  const log = join(root, 'events.txt');
  const helper = new URL('./runtime-content-publication.mjs', import.meta.url).href;
  const child = `import {withRuntimePublicationLock} from ${JSON.stringify(helper)};
    import {appendFile} from 'node:fs/promises';
    import {setTimeout} from 'node:timers/promises';
    await withRuntimePublicationLock(process.argv[1], async () => {
      await appendFile(process.argv[2], 'start' + process.argv[3] + '\\n');
      await setTimeout(80);
      await appendFile(process.argv[2], 'end' + process.argv[3] + '\\n');
    });`;
  await Promise.all(
    ['A', 'B'].map((id) =>
      promisify(execFile)(process.execPath, ['--input-type=module', '-e', child, lock, log, id]),
    ),
  );
  const events = (await readFile(log, 'utf8')).trim().split('\n');
  assert.equal(events.length, 4);
  assert.equal(events[0].slice(5), events[1].slice(3));
  assert.equal(events[2].slice(5), events[3].slice(3));
});
