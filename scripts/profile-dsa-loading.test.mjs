import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loopbackOrigin,
  parseOptions,
  payloadShape,
  profileCourses,
  requirePrivateOutput,
  sampleHttp,
} from './profile-dsa-loading.mjs';

function fixture() {
  return {
    'learn/sample/course.json': {
      id: 'sample',
      modules: [{ id: 'one' }, { id: 'future', reviewStatus: 'planned' }],
      sections: [{ moduleIds: ['one', 'future'] }],
    },
    'learn/sample/modules/one.json': [{ id: 'first', title: 'A sample', code: 'return 1;' }],
  };
}
const loader = (files) => async (path) => {
  assert.ok(path in files, `Unexpected path: ${path}`);
  return Buffer.from(JSON.stringify(files[path]));
};

test('profiles only hydrated modules and counts bytes independently of records', async () => {
  const files = fixture();
  const result = await profileCourses(loader(files), ['learn/sample']);
  assert.equal(result.totals.requests, 2);
  assert.equal(result.totals.modules, 1);
  assert.equal(result.totals.records, 1);
  assert.equal(
    result.totals.sourceBytes,
    Object.values(files).reduce((sum, data) => sum + Buffer.byteLength(JSON.stringify(data)), 0),
  );
  assert.equal(result.browserHeapBytes, null);
  const hydrated = {
    ...files['learn/sample/course.json'],
    modules: [{ id: 'one' }],
    sections: [{ moduleIds: ['one'] }],
    questions: files['learn/sample/modules/one.json'],
  };
  assert.equal(
    result.courses[0].serializedHydratedBytes,
    Buffer.byteLength(JSON.stringify(hydrated)),
  );
});

test('fingerprints are deterministic and detect changes', async () => {
  const files = fixture();
  const before = await profileCourses(loader(files), ['learn/sample']);
  assert.equal(
    before.fingerprint,
    (await profileCourses(loader(files), ['learn/sample'])).fingerprint,
  );
  files['learn/sample/modules/one.json'][0].title = 'Changed';
  assert.notEqual(
    before.fingerprint,
    (await profileCourses(loader(files), ['learn/sample'])).fingerprint,
  );
});

test('payload shape measures serialized data, not heap estimates', () => {
  assert.deepEqual(payloadShape({ a: ['abc', { b: 'xy' }], c: 3 }), {
    objects: 2,
    arrays: 1,
    strings: 2,
    utf8StringBytes: 5,
  });
});

test('rejects traversal, duplicate modules and non-array payloads', async () => {
  await assert.rejects(profileCourses(loader({}), ['../sample']), /Invalid course/);
  const files = fixture();
  files['learn/sample/course.json'].modules = [{ id: '../escape' }];
  await assert.rejects(profileCourses(loader(files), ['learn/sample']), /invalid module/);
  files['learn/sample/course.json'].modules = [{ id: 'one' }, { id: 'one' }];
  await assert.rejects(profileCourses(loader(files), ['learn/sample']), /duplicate/);
  files['learn/sample/course.json'].modules = [{ id: 'one' }];
  files['learn/sample/modules/one.json'] = {};
  await assert.rejects(profileCourses(loader(files), ['learn/sample']), /expected an array/);
});

test('samples local HTTP with bounded concurrency, source checks and no redirects', async () => {
  const files = fixture();
  const report = await profileCourses(loader(files), ['learn/sample']);
  let active = 0;
  let maximum = 0;
  const sample = await sampleHttp(report.files, 'http://127.0.0.1:4300', {
    concurrency: 1,
    fetchImpl: async (url, options) => {
      active += 1;
      maximum = Math.max(maximum, active);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['Accept-Encoding'], 'identity');
      await new Promise((done) => setTimeout(done, 1));
      active -= 1;
      return new Response(JSON.stringify(files[new URL(url).pathname.slice('/content/'.length)]));
    },
  });
  assert.equal(maximum, 1);
  assert.equal(sample.requests, 2);
  assert.equal(sample.bodyBytes, report.totals.sourceBytes);
  assert.ok(sample.wallMs >= 0);
});

test('rejects HTTP failures and stale served content', async () => {
  const report = await profileCourses(loader(fixture()), ['learn/sample']);
  await assert.rejects(
    sampleHttp(report.files, 'http://localhost:4300', {
      fetchImpl: async () => new Response('', { status: 404 }),
    }),
    /HTTP 404/,
  );
  await assert.rejects(
    sampleHttp(report.files, 'http://localhost:4300', {
      fetchImpl: async () => new Response('{}'),
    }),
    /served\/source mismatch/,
  );
});

test('only accepts loopback origins without embedded credentials or paths', () => {
  for (const url of [
    'https://example.com',
    'http://localhost.evil.test',
    'http://user@localhost:4300',
    'http://localhost:4300/path',
    'http://localhost:4300/?q=x',
  ]) {
    assert.throws(() => loopbackOrigin(url));
  }
  assert.equal(loopbackOrigin('http://localhost:4300/'), 'http://localhost:4300');
  assert.equal(loopbackOrigin('http://[::1]:4300'), 'http://[::1]:4300');
});

test('requires an explicit source and validates sampling limits and arguments', () => {
  assert.throws(() => parseOptions([]), /root is required/);
  assert.throws(() => parseOptions(['--root']), /Missing value/);
  assert.throws(() => parseOptions(['--wat', 'x']), /Unknown option/);
  assert.throws(() => parseOptions(['--root', 'source', '--repeats', '0']), /between/);
  assert.equal(parseOptions(['--root', 'source']).courses.length, 3);
  assert.deepEqual(parseOptions(['--root', 'source', '--course', 'learn/sample']).courses, [
    'learn/sample',
  ]);
});

test('private reports cannot be written into the public checkout, including trailing-slash roots', () => {
  assert.throws(() => requirePrivateOutput('/workspace/web/report.json', '/workspace/web/'));
  assert.throws(() => requirePrivateOutput('/workspace/web', '/workspace/web/'));
  assert.throws(() =>
    requirePrivateOutput('/workspace/content/../web/report.json', '/workspace/web'),
  );
  assert.equal(
    requirePrivateOutput('/workspace/content/report.json', '/workspace/web/'),
    '/workspace/content/report.json',
  );
  assert.equal(
    requirePrivateOutput('/workspace/web-private/report.json', '/workspace/web/'),
    '/workspace/web-private/report.json',
  );
});
