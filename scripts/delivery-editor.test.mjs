import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { startDeliveryEditor } from './delivery-editor.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(
  await readFile(resolve(root, 'demo-content/runtime/delivery/delivery-plan.json'), 'utf8'),
);

async function fixture(t) {
  const base = resolve(root, '.angular/delivery-editor/tests');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(`${base}/run-`);
  const file = resolve(directory, 'delivery-plan.json');
  await writeFile(file, JSON.stringify(source));
  const api = await startDeliveryEditor({ file, origins: ['http://localhost:4300'] });
  t.after(async () => {
    await api.close();
    await rm(directory, { recursive: true, force: true });
  });
  const headers = {
    'x-delivery-token': api.token,
    'x-delivery-request': '1',
    origin: 'http://localhost:4300',
    'content-type': 'application/json',
  };
  const request = async (method = 'GET', path = '/plan', body, overrides = {}) => {
    const response = await fetch(`${api.target}/__local/delivery${path}`, {
      method,
      headers: { ...headers, ...overrides },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const item = {
    title: 'Test a persisted story',
    summary: 'Write and reload the same local JSON.',
    type: 'story',
    stageId: source.currentStageId,
    statusId: source.workflow[0].id,
    priorityId: 'P2',
    labels: ['test'],
    acceptanceCriteria: ['A refreshed board retains the saved story.'],
    dependencies: [],
    blockedBy: [],
    notes: [],
  };
  return { request, item, file };
}

test('creates, edits, moves status and stage, and persists while preserving plan metadata', async (t) => {
  const { request, item, file } = await fixture(t);
  const initial = (await request()).body;
  const created = await request('POST', '/work-items', { revision: initial.revision, item });
  assert.equal(created.status, 201);
  const id = created.body.workItemId;
  assert.ok(created.body.plan.workItems.some((entry) => entry.id === id));
  const changed = {
    ...item,
    title: 'Updated title',
    statusId: 'review',
    stageId: source.stages.at(-1).id,
  };
  const saved = await request('PUT', `/work-items/${id}`, {
    revision: created.body.revision,
    item: changed,
  });
  assert.equal(saved.status, 200);
  const disk = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(disk.workItems.at(-1).title, changed.title);
  assert.equal(disk.workItems.at(-1).statusId, 'review');
  assert.equal(disk.workItems.at(-1).stageId, changed.stageId);
  assert.deepEqual(disk.decisions, source.decisions);
  assert.deepEqual(disk.deliverySequence, source.deliverySequence);
  assert.deepEqual(disk.workItems.slice(0, -1), source.workItems);
  assert.equal((await request()).body.revision, saved.body.revision);
});

test('rejects stale saves and preserves external JSON edits', async (t) => {
  const { request, item, file } = await fixture(t);
  const initial = (await request()).body;
  const external = { ...source, summary: 'Changed outside the browser' };
  await writeFile(file, JSON.stringify(external));
  assert.equal(
    (await request('POST', '/work-items', { revision: initial.revision, item })).status,
    409,
  );
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), external);
});

test('serializes competing saves so only one same-revision edit wins', async (t) => {
  const { request, item } = await fixture(t);
  const { revision } = (await request()).body;
  const first = request('POST', '/work-items', { revision, item });
  const second = request('POST', '/work-items', {
    revision,
    item: { ...item, title: 'Other draft' },
  });
  assert.deepEqual([(await first).status, (await second).status].sort(), [201, 409]);
});

test('validates required fields, references, types, and unexpected properties without writes', async (t) => {
  const { request, item } = await fixture(t);
  const { revision } = (await request()).body;
  for (const invalid of [
    { title: '' },
    { stageId: 'missing' },
    { statusId: 'missing' },
    { priorityId: 'missing' },
    { type: 'arbitrary' },
    { acceptanceCriteria: [] },
    { labels: [12] },
    { dependencies: ['missing'] },
    { secret: 'no' },
  ]) {
    assert.equal(
      (await request('POST', '/work-items', { revision, item: { ...item, ...invalid } })).status,
      422,
    );
  }
  assert.equal((await request('POST', '/work-items', { item })).status, 428);
  assert.equal((await request('PUT', '/work-items/not-found', { revision, item })).status, 404);
  assert.equal((await request()).body.revision, revision);
});

test('rejects missing local capability, cross-origin and non-loopback requests, and other methods', async (t) => {
  const { request, item } = await fixture(t);
  const { revision } = (await request()).body;
  const body = { revision, item };
  assert.equal((await request('GET', '/plan', undefined, { 'x-delivery-token': '' })).status, 403);
  for (const override of [
    { origin: 'https://untrusted.example' },
    { origin: '' },
    { 'sec-fetch-site': 'cross-site' },
    { 'x-delivery-request': '' },
    { 'x-forwarded-for': '192.0.2.10' },
  ])
    assert.equal((await request('POST', '/work-items', body, override)).status, 403);
  assert.equal(
    (await request('POST', '/work-items', body, { 'content-type': 'text/plain' })).status,
    415,
  );
  assert.equal((await request('DELETE', '/work-items/test')).status, 405);
  assert.equal(
    (
      await request('POST', '/work-items', {
        revision,
        item: { ...item, summary: 'x'.repeat(66000) },
      })
    ).status,
    413,
  );
});

test('rejects self-dependency and cycles', async (t) => {
  const { request, item } = await fixture(t);
  let snapshot = (
    await request('POST', '/work-items', { revision: (await request()).body.revision, item })
  ).body;
  const first = snapshot.workItemId;
  const self = await request('PUT', `/work-items/${first}`, {
    revision: snapshot.revision,
    item: { ...item, dependencies: [first] },
  });
  assert.equal(self.status, 422);
  snapshot = (
    await request('POST', '/work-items', {
      revision: snapshot.revision,
      item: { ...item, dependencies: [first] },
    })
  ).body;
  assert.equal(
    (
      await request('PUT', `/work-items/${first}`, {
        revision: snapshot.revision,
        item: { ...item, blockedBy: [snapshot.workItemId] },
      })
    ).status,
    422,
  );
});

test('does not overwrite malformed private JSON', async (t) => {
  const { request, file } = await fixture(t);
  await writeFile(file, '{broken');
  assert.equal((await request()).status, 500);
  assert.equal(await readFile(file, 'utf8'), '{broken');
});

test('preserves review routes and unknown metadata when editing an existing item', async (t) => {
  const { request, item, file } = await fixture(t);
  const plan = structuredClone(source);
  const existing = plan.workItems[0];
  existing.reviewRoutes = ['/delivery-plan'];
  existing.customMetadata = { owner: 'test' };
  await writeFile(file, JSON.stringify(plan));
  const snapshot = (await request()).body;
  const saved = await request('PUT', `/work-items/${existing.id}`, {
    revision: snapshot.revision,
    item,
  });
  assert.equal(saved.status, 200);
  const updated = saved.body.plan.workItems.find((entry) => entry.id === existing.id);
  assert.deepEqual(updated.reviewRoutes, ['/delivery-plan']);
  assert.deepEqual(updated.customMetadata, { owner: 'test' });
});
