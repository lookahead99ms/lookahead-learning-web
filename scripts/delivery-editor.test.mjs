import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { startDeliveryEditor } from './delivery-editor.mjs';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(
  await readFile(resolve(root, 'demo-content/runtime/delivery/delivery-plan.json'), 'utf8'),
);

async function fixture(t) {
  const base = resolve(root, '.angular/delivery-editor/tests');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(`${base}/run-`);
  await mkdir(resolve(directory, 'runtime/delivery'), { recursive: true });
  const file = resolve(directory, 'runtime/delivery/delivery-plan.json');
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
    return {
      status: response.status,
      headers: response.headers,
      body: response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text(),
    };
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
  return { request, item, file, directory };
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
  existing.evidence = [{ id: 'report', title: 'Review report', path: 'docs/evidence/report.md' }];
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
  assert.deepEqual(updated.evidence, existing.evidence);
  assert.deepEqual(updated.customMetadata, { owner: 'test' });
});

async function evidenceFixture(t) {
  const fixtureData = await fixture(t);
  const { directory, file } = fixtureData;
  await mkdir(resolve(directory, 'docs/evidence'), { recursive: true });
  const markdown = '# Route report\n\n<script>not executable</script>\n';
  await writeFile(resolve(directory, 'docs/evidence/report.md'), markdown);
  const plan = structuredClone(source);
  plan.workItems[0].evidence = [
    { id: 'report', title: 'Review report', path: 'docs/evidence/report.md' },
  ];
  await writeFile(file, JSON.stringify(plan));
  return {
    ...fixtureData,
    plan,
    markdown,
    path: `/evidence/${plan.workItems[0].id}/report`,
  };
}

test('renders evidence, accepts the .md alias, and preserves original source downloads', async (t) => {
  const { request, path, markdown } = await evidenceFixture(t);
  const opened = await request('GET', path);
  assert.equal(opened.status, 200);
  assert.equal(opened.headers.get('content-type'), 'text/html; charset=utf-8');
  const dom = new JSDOM(opened.body);
  t.after(() => dom.window.close());
  assert.equal(dom.window.document.querySelector('h1').textContent, 'Route report');
  assert.equal(dom.window.document.querySelector('script'), null);
  assert.match(
    dom.window.document.querySelector('main').textContent,
    /<script>not executable<\/script>/,
  );
  assert.equal(opened.headers.get('cache-control'), 'no-store');
  assert.equal(opened.headers.get('x-content-type-options'), 'nosniff');
  assert.match(opened.headers.get('content-security-policy'), /sandbox/);
  assert.match(opened.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(opened.headers.get('content-security-policy'), /allow-scripts|unsafe-inline/);
  assert.equal(opened.headers.get('referrer-policy'), 'no-referrer');
  const alias = await request('GET', `${path}.md`);
  assert.equal(alias.status, 200);
  assert.equal(alias.body, opened.body);
  const raw = await request('GET', `${path}?raw=1`);
  assert.equal(raw.body, markdown);
  assert.equal(raw.headers.get('content-type'), 'text/plain; charset=utf-8');
  const downloaded = await request('GET', `${path}?download=1`);
  assert.equal(downloaded.body, markdown);
  assert.equal(downloaded.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(downloaded.headers.get('content-disposition'), 'attachment; filename="report.md"');
  assert.equal((await request('GET', '/evidence/unknown/report')).status, 404);
  assert.equal((await request('GET', path.replace(/report$/, 'unknown'))).status, 404);
});

test('formats tables, lists, and code while keeping report-supplied HTML and unsafe links inert', async (t) => {
  const { request, path, directory, plan, file } = await evidenceFixture(t);
  plan.workItems[0].evidence[0].title = '<img src=x onerror=alert(1)>';
  await writeFile(file, JSON.stringify(plan));
  await writeFile(
    resolve(directory, 'docs/evidence/report.md'),
    [
      '# Report',
      '',
      '| Case | Result |',
      '| --- | --- |',
      '| R01 | **Passed** |',
      '',
      '- One check',
      '- Another check',
      '',
      '```html',
      '<script>alert(1)</script>',
      '```',
      '',
      '<img src="https://untrusted.example/pixel" onerror="alert(1)">',
      '',
      '<iframe src="https://untrusted.example"></iframe>',
      '',
      '<style>body { display: none }</style>',
      '',
      '![tracking](https://untrusted.example/image.png)',
      '',
      '[unsafe](javascript:alert%281%29)',
      '[encoded](jav&#x61;script:alert%281%29)',
      '[data](data:text/html,unsafe)',
      '[relative](//untrusted.example/path)',
      '[safe](https://example.com/report)',
      '[local](/delivery-plan)',
    ].join('\n'),
  );
  const response = await request('GET', path);
  assert.equal(response.status, 200);
  const dom = new JSDOM(response.body);
  t.after(() => dom.window.close());
  const document = dom.window.document;
  assert.equal(document.querySelectorAll('table tbody tr').length, 1);
  assert.equal(document.querySelector('td strong').textContent, 'Passed');
  assert.equal(document.querySelectorAll('main ul li').length, 2);
  assert.equal(document.querySelector('pre code').textContent.trim(), '<script>alert(1)</script>');
  assert.equal(
    document.querySelectorAll('script, img, iframe, object, embed, form, base').length,
    0,
  );
  assert.equal(document.querySelectorAll('style').length, 1);
  assert.equal(document.querySelectorAll('[onerror], [onclick], [onload]').length, 0);
  assert.ok(document.querySelector('meta[name="viewport"]'));
  const hrefs = [...document.querySelectorAll('a')].map((link) => link.getAttribute('href'));
  assert.ok(hrefs.includes('https://example.com/report'));
  assert.ok(hrefs.includes('/delivery-plan'));
  assert.ok(!hrefs.some((href) => /javascript|data:|untrusted/.test(href)));
});

test('restricts evidence to local authorized requests and approved Markdown paths', async (t) => {
  const { request, path, plan, file, directory } = await evidenceFixture(t);
  for (const override of [
    { 'x-delivery-token': '' },
    { 'sec-fetch-site': 'cross-site' },
    { origin: 'https://untrusted.example' },
    { 'x-forwarded-for': '192.0.2.10' },
  ]) {
    assert.equal((await request('GET', path, undefined, override)).status, 403);
  }
  for (const invalid of [
    '../../private.md',
    'docs/evidence/../../private.md',
    'docs/evidence/../evidence/report.md',
    '/etc/passwd',
    'docs/evidence/report.html',
    'docs/evidence/%2e%2e/private.md',
    'docs/evidence\\report.md',
  ]) {
    plan.workItems[0].evidence[0].path = invalid;
    await writeFile(file, JSON.stringify(plan));
    assert.equal((await request('GET', path)).status, 404, invalid);
  }
  await writeFile(resolve(directory, 'private.md'), 'Not attached');
  await symlink(resolve(directory, 'private.md'), resolve(directory, 'docs/evidence/escape.md'));
  plan.workItems[0].evidence[0].path = 'docs/evidence/escape.md';
  await writeFile(file, JSON.stringify(plan));
  assert.equal((await request('GET', path)).status, 404);
  await symlink(directory, resolve(directory, 'docs/evidence/outside'));
  plan.workItems[0].evidence[0].path = 'docs/evidence/outside/private.md';
  await writeFile(file, JSON.stringify(plan));
  assert.equal((await request('GET', path)).status, 404);
});

test('handles missing and oversized evidence without exposing private disk locations', async (t) => {
  const { request, path, directory } = await evidenceFixture(t);
  const file = resolve(directory, 'docs/evidence/report.md');
  await rm(file);
  const missing = await request('GET', path);
  assert.equal(missing.status, 404);
  assert.ok(!JSON.stringify(missing.body).includes(directory));
  await writeFile(file, 'x'.repeat(1024 * 1024 + 1));
  assert.equal((await request('GET', path)).status, 413);
});
