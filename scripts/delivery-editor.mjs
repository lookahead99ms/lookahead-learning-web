import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { renderDeliveryReport, reportContentSecurityPolicy } from './delivery-report.mjs';

const editableFields = [
  'title',
  'summary',
  'type',
  'stageId',
  'statusId',
  'priorityId',
  'labels',
  'acceptanceCriteria',
  'dependencies',
  'blockedBy',
  'notes',
];
const types = new Set(['epic', 'story', 'task', 'bug', 'spike', 'decision']);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

function validateItem(item, plan, id) {
  if (!item || typeof item !== 'object' || Array.isArray(item))
    fail(422, 'A work item is required.');
  if (Object.keys(item).some((key) => !editableFields.includes(key)))
    fail(422, 'Unexpected work item field.');
  for (const [field, limit] of [
    ['title', 200],
    ['summary', 10000],
    ['type', 30],
    ['stageId', 100],
    ['statusId', 100],
    ['priorityId', 100],
  ]) {
    if (typeof item[field] !== 'string' || !item[field].trim() || item[field].length > limit)
      fail(422, `${field} is required and must be at most ${limit} characters.`);
  }
  if (!types.has(item.type)) fail(422, 'Unknown work item type.');
  for (const [field, collection] of [
    ['stageId', 'stages'],
    ['statusId', 'workflow'],
    ['priorityId', 'priorities'],
  ]) {
    if (!plan[collection].some((entry) => entry.id === item[field])) fail(422, `Unknown ${field}.`);
  }
  for (const field of ['labels', 'acceptanceCriteria', 'dependencies', 'blockedBy', 'notes']) {
    if (
      !Array.isArray(item[field]) ||
      item[field].length > 100 ||
      item[field].some((value) => typeof value !== 'string' || !value.trim() || value.length > 4000)
    )
      fail(422, `${field} must contain at most 100 non-empty text entries.`);
    if (new Set(item[field]).size !== item[field].length)
      fail(422, `${field} contains duplicate entries.`);
  }
  if (!item.acceptanceCriteria.length) fail(422, 'Add at least one acceptance criterion.');
  for (const relatedId of [...item.dependencies, ...item.blockedBy]) {
    if (relatedId === id || !plan.workItems.some((entry) => entry.id === relatedId))
      fail(422, `Invalid related work item: ${relatedId}.`);
  }
  const candidate = plan.workItems.map((entry) =>
    entry.id === id ? { ...entry, ...item } : entry,
  );
  if (!candidate.some((entry) => entry.id === id)) candidate.push({ ...item, id });
  const byId = new Map(candidate.map((entry) => [entry.id, entry]));
  const visiting = new Set();
  const visited = new Set();
  function visit(itemId) {
    if (visiting.has(itemId)) fail(422, 'Dependencies and blockers must not create a cycle.');
    if (visited.has(itemId)) return;
    visiting.add(itemId);
    const entry = byId.get(itemId);
    for (const next of [...entry.dependencies, ...entry.blockedBy]) visit(next);
    visiting.delete(itemId);
    visited.add(itemId);
  }
  visit(id);
}

async function readPlan(file) {
  if (!(await lstat(file)).isFile())
    fail(500, 'The delivery plan must be a regular file, not a symlink.');
  const bytes = await readFile(file);
  let plan;
  try {
    plan = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(500, 'The private delivery JSON is invalid. Repair it before saving.');
  }
  if (
    plan.schemaVersion !== 'delivery-plan/v1' ||
    !['workItems', 'stages', 'workflow', 'priorities'].every((key) => Array.isArray(plan[key]))
  )
    fail(500, 'The private delivery plan has an unsupported structure.');
  return { plan, revision: digest(bytes) };
}

async function readBody(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json')
    fail(415, 'Use application/json.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) fail(413, 'The work item is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(400, 'Invalid JSON request.');
  }
}

async function readEvidence(file, itemId, evidenceId) {
  const { plan } = await readPlan(file);
  const evidence = plan.workItems
    .find((item) => item.id === itemId)
    ?.evidence?.find((report) => report.id === evidenceId);
  if (
    !evidence ||
    typeof evidence.path !== 'string' ||
    !/^docs\/evidence\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/.test(evidence.path)
  )
    fail(404, 'Attached Markdown report not found.');

  const contentRoot = resolve(dirname(file), '../..');
  const root = resolve(contentRoot, 'docs/evidence');
  const candidate = resolve(contentRoot, evidence.path);
  try {
    // Only attached Markdown under the private evidence directory is readable.
    // Resolve parent symlinks as well as rejecting a symlink for the file itself.
    if (
      !(await lstat(candidate)).isFile() ||
      !(await realpath(candidate)).startsWith(`${root}${sep}`)
    )
      fail(404, 'Attached Markdown report not found.');
    const handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) fail(404, 'Attached Markdown report not found.');
      if (stat.size > 1024 * 1024) fail(413, 'The report exceeds the 1 MiB viewing limit.');
      const bytes = await handle.readFile();
      if (bytes.length > 1024 * 1024) fail(413, 'The report exceeds the 1 MiB viewing limit.');
      return { bytes, filename: basename(candidate), title: evidence.title };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES'].includes(error.code))
      fail(404, 'Attached Markdown report not found.');
    throw error;
  }
}

/** A loopback-only companion for start:private, never part of the published app. */
export async function startDeliveryEditor({ file, origins }) {
  const token = randomBytes(32).toString('hex');
  let pending = Promise.resolve();
  async function mutate(payload, requestedId) {
    if (!payload || Object.keys(payload).some((key) => !['revision', 'item'].includes(key)))
      fail(422, 'Invalid save request.');
    if (typeof payload.revision !== 'string') fail(428, 'A plan revision is required.');
    const current = await readPlan(file);
    if (payload.revision !== current.revision)
      fail(409, 'The plan changed since you opened this item. Your draft has not been saved.');
    const existing = requestedId
      ? current.plan.workItems.find((item) => item.id === requestedId)
      : null;
    if (requestedId && !existing) fail(404, 'Work item not found.');
    const highest = Math.max(
      0,
      ...current.plan.workItems.map((item) => Number(/^DLV-(\d+)$/.exec(item.id)?.[1] ?? 0)),
    );
    const id = requestedId ?? `DLV-${highest + 1}`;
    validateItem(payload.item, current.plan, id);
    const updatedAt = new Date().toISOString();
    const item = { ...existing, ...payload.item, id, updatedAt };
    item.title = item.title.trim();
    item.summary = item.summary.trim();
    const plan = {
      ...current.plan,
      lastUpdated: updatedAt,
      workItems: existing
        ? current.plan.workItems.map((entry) => (entry.id === id ? item : entry))
        : [...current.plan.workItems, item],
    };
    const bytes = `${JSON.stringify(plan, null, 2)}\n`;
    const temporary = join(dirname(file), `.delivery-plan-${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Recheck after validation and disk I/O to catch ordinary external-editor races.
      if ((await readPlan(file)).revision !== current.revision)
        fail(
          409,
          'The private JSON changed during this save. Reload the latest item before retrying.',
        );
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
    return { plan, revision: digest(bytes), workItemId: id };
  }

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const provided = Buffer.from(String(request.headers['x-delivery-token'] ?? ''));
      const expected = Buffer.from(token);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
        fail(403, 'Local editor access required.');
      const forwarded = String(request.headers['x-forwarded-for'] ?? '127.0.0.1')
        .split(',')
        .map((value) => value.trim());
      if (forwarded.some((address) => !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)))
        fail(403, 'Only loopback clients may use the editor.');
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      if (request.method === 'GET' && path === '/__local/delivery/plan') {
        response.end(JSON.stringify(await readPlan(file)));
        return;
      }
      if (request.method === 'GET' && path.startsWith('/__local/delivery/evidence/')) {
        if (
          request.headers['sec-fetch-site'] === 'cross-site' ||
          (request.headers.origin && !origins.includes(request.headers.origin))
        )
          fail(403, 'Reports must be opened from the local board.');
        const match =
          /^\/__local\/delivery\/evidence\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)(?:\.md)?$/.exec(path);
        if (!match) fail(404, 'Attached Markdown report not found.');
        const report = await readEvidence(file, match[1], match[2]);
        const download = url.searchParams.get('download') === '1';
        const raw = download || url.searchParams.get('raw') === '1';
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        response.setHeader('Referrer-Policy', 'no-referrer');
        if (raw) {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.setHeader(
            'Content-Disposition',
            `${download ? 'attachment' : 'inline'}; filename="${report.filename}"`,
          );
          response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
          response.end(report.bytes);
        } else {
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.setHeader('Content-Security-Policy', reportContentSecurityPolicy);
          response.end(
            renderDeliveryReport({
              markdown: report.bytes.toString('utf8'),
              title: report.title,
              itemId: match[1],
              evidenceId: match[2],
            }),
          );
        }
        return;
      }
      if (!['POST', 'PUT'].includes(request.method)) fail(405, 'Method not allowed.');
      if (
        !origins.includes(request.headers.origin) ||
        request.headers['sec-fetch-site'] === 'cross-site' ||
        request.headers['x-delivery-request'] !== '1'
      )
        fail(403, 'Save requests must come from the local board.');
      const match = /^\/__local\/delivery\/work-items(?:\/([A-Za-z0-9_-]+))?$/.exec(path);
      if (
        !match ||
        (request.method === 'POST' && match[1]) ||
        (request.method === 'PUT' && !match[1])
      )
        fail(404, 'Unknown editor route.');
      const body = await readBody(request);
      // Serialize our writes; revisions additionally protect separate tabs and external edits.
      const operation = pending.then(() => mutate(body, match[1]));
      pending = operation.catch(() => {});
      const result = await operation;
      response.statusCode = request.method === 'POST' ? 201 : 200;
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = error.status ?? 500;
      response.end(
        JSON.stringify({
          message: error.status
            ? error.message
            : 'Unable to read or save the private plan. Check the local server terminal.',
        }),
      );
      if (!error.status) console.error('Delivery editor:', error.message);
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    target: `http://127.0.0.1:${server.address().port}`,
    token,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
