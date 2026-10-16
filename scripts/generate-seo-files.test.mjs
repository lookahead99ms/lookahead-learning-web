import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DISALLOWED_PATHS,
  collectSitemapPaths,
  isProtectedBuild,
  normalizeOrigin,
  readContentSamplesPolicy,
  readHiddenCourseIds,
  readIndexablePages,
  renderRobots,
  renderSitemap,
  resolveContentRoot,
  writeSeoFiles,
} from './generate-seo-files.mjs';

const SECRET = 'PROTECTED-LESSON-BODY';

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

/** A private-checkout-shaped fixture: <checkout>/runtime plus <checkout>/policies. */
async function fixtureCheckout() {
  const checkout = await mkdtemp(join(tmpdir(), 'lookahead-seo-'));
  const runtime = join(checkout, 'runtime');
  await writeJson(join(runtime, 'learn/catalog.json'), [
    { id: 'core-java', title: 'Java Foundations', available: true },
    { id: 'hands-on-dsa', title: 'Hands-on DSA Practice', available: true },
    { id: 'coming-soon', title: 'Later', available: false },
  ]);
  await writeJson(join(runtime, 'grow/catalog.json'), [{ id: 'api-design', title: 'API Design' }]);
  await writeJson(join(runtime, 'blaze/catalog.json'), [
    { id: 'design-systems', title: 'Design Systems' },
    { id: 'system-design', title: 'Retired from discovery' },
  ]);
  await writeJson(join(runtime, 'learn/core-java/course.json'), {
    id: 'core-java',
    modules: [
      { id: 'java-platform', order: 1 },
      { id: 'java-platform-questions', order: 2 },
      { id: 'generics', order: 3 },
      { id: 'future', order: 4, reviewStatus: 'planned' },
    ],
    learningUnits: [
      {
        id: 'java-platform',
        theoryModuleId: 'java-platform',
        questionModuleId: 'java-platform-questions',
        subUnits: [{ id: 'nested', theoryModuleId: 'future' }],
      },
      { id: 'generics', theoryModuleId: 'generics' },
    ],
  });
  await writeJson(join(runtime, 'learn/core-java/modules/java-platform.json'), [
    { id: 'java-platform-execution-model', contentType: 'theory', interviewAnswer: SECRET },
    { id: 'old-lesson', contentType: 'theory' },
    { id: 'raw-problem', contentType: 'dsa-problem' },
  ]);
  await writeJson(join(runtime, 'learn/core-java/modules/java-platform-questions.json'), [
    { id: 'compiled-or-interpreted', contentType: 'q-and-a', summary: SECRET },
  ]);
  await writeJson(join(runtime, 'learn/core-java/modules/generics.json'), [
    { id: 'generics-basics', contentType: 'theory' },
  ]);
  await writeJson(join(checkout, 'policies/content-samples.json'), {
    schemaVersion: 'content-samples/v1',
    publicUnits: [
      'learn/core-java/java-platform',
      'learn/core-java/missing-unit',
      'blaze/system-design/interview-method',
      '../etc/passwd',
    ],
    additionalFreeUnits: ['learn/core-java/generics'],
  });
  return { checkout, runtime };
}

const retiredCourses = [
  { path: 'learn', courseId: 'core-java', lessons: { 'old-lesson': 'java-platform-execution-model' } },
];
const hiddenCourseIds = new Set(['blaze:system-design']);

test('normalizes the site origin and rejects anything that is not a bare origin', () => {
  assert.equal(normalizeOrigin(undefined), null);
  assert.equal(normalizeOrigin('  '), null);
  assert.equal(normalizeOrigin('https://Learn.Example.com/'), 'https://learn.example.com');
  assert.equal(normalizeOrigin('http://127.0.0.1:4301'), 'http://127.0.0.1:4301');
  for (const value of [
    'learn.example.com',
    'ftp://example.com',
    'https://example.com/app',
    'https://example.com/?x=1',
    'https://user:secret@example.com',
  ]) {
    assert.throws(() => normalizeOrigin(value), /LOOKAHEAD_SITE_ORIGIN/, value);
  }
});

test('robots.txt allows public pages, blocks personal and internal ones, and names the sitemap only with an origin', () => {
  const withoutOrigin = renderRobots(null);
  assert.match(withoutOrigin, /^User-agent: \*$/m);
  assert.match(withoutOrigin, /^Allow: \/$/m);
  assert.doesNotMatch(withoutOrigin, /Sitemap:/);
  for (const path of ['/admin', '/delivery-plan', '/account', '/sign-in', '/sign-up', '/support', '/study-plan']) {
    assert.match(withoutOrigin, new RegExp(`^Disallow: ${path}$`, 'm'), path);
  }
  for (const path of ['/', '/learn', '/grow', '/blaze', '/content', '/search', '/assets']) {
    assert.ok(!DISALLOWED_PATHS.includes(path), path);
  }
  assert.match(renderRobots('https://example.test'), /^Sitemap: https:\/\/example\.test\/sitemap\.xml$/m);
});

test('the sitemap lists catalogs, available visible courses and public-unit lessons only', async () => {
  const { checkout, runtime } = await fixtureCheckout();
  try {
    const warnings = [];
    const policy = await readContentSamplesPolicy(runtime);
    assert.ok(policy, 'policy next to the runtime root is found');
    const paths = await collectSitemapPaths(runtime, {
      hiddenCourseIds,
      retiredCourses,
      policy,
      indexablePages: { 'start-free': true, pricing: false },
      warn: (message) => warnings.push(message),
    });
    assert.deepEqual(paths, [
      '/',
      '/learn',
      '/grow',
      '/blaze',
      '/start-free',
      '/learn/core-java',
      '/learn/hands-on-dsa',
      '/grow/api-design',
      '/blaze/design-systems',
      '/learn/core-java/java-platform-execution-model',
      '/learn/core-java/compiled-or-interpreted',
    ]);
    // Registered-free (additionalFreeUnits) lessons need an account, so they are not listed.
    assert.ok(!paths.includes('/learn/core-java/generics-basics'));
    assert.equal(warnings.length, 2);
    assert.ok(!paths.some((path) => DISALLOWED_PATHS.some((prefix) => path.startsWith(prefix))));
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});

test('without a samples policy only catalog and course pages are listed', async () => {
  const { checkout, runtime } = await fixtureCheckout();
  try {
    await rm(join(checkout, 'policies'), { recursive: true });
    assert.equal(await readContentSamplesPolicy(runtime), null);
    const paths = await collectSitemapPaths(runtime, { hiddenCourseIds, retiredCourses });
    assert.ok(paths.includes('/learn/core-java'));
    assert.ok(!paths.some((path) => path.split('/').length > 3));
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});

test('writes robots.txt only, and removes an old sitemap, when the origin is unset', async () => {
  const { checkout, runtime } = await fixtureCheckout();
  const output = join(checkout, 'public');
  try {
    await mkdir(output);
    await writeFile(join(output, 'sitemap.xml'), 'stale');
    const result = await writeSeoFiles({
      outputDir: output,
      origin: undefined,
      contentRoot: runtime,
      hiddenCourseIds,
      retiredCourses,
      log: () => {},
    });
    assert.equal(result.sitemapPath, null);
    await assert.rejects(readFile(join(output, 'sitemap.xml')));
    assert.doesNotMatch(await readFile(join(output, 'robots.txt'), 'utf8'), /Sitemap:/);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});

test('writes an absolute sitemap with no lesson bodies when the origin is set', async () => {
  const { checkout, runtime } = await fixtureCheckout();
  const output = join(checkout, 'public');
  try {
    const result = await writeSeoFiles({
      outputDir: output,
      origin: 'https://learn.example.test/',
      contentRoot: runtime,
      hiddenCourseIds,
      retiredCourses,
      log: () => {},
      warn: () => {},
    });
    const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(
      sitemap,
      /<loc>https:\/\/learn\.example\.test\/learn\/core-java\/java-platform-execution-model<\/loc>/,
    );
    assert.equal((sitemap.match(/<url>/g) ?? []).length, result.paths.length);
    assert.ok(!sitemap.includes(SECRET));
    assert.ok(!sitemap.includes(checkout), 'no local paths');
    assert.match(
      await readFile(join(output, 'robots.txt'), 'utf8'),
      /^Sitemap: https:\/\/learn\.example\.test\/sitemap\.xml$/m,
    );
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});

test('escapes sitemap locations', () => {
  assert.match(renderSitemap('https://e.test', ['/a&b']), /<loc>https:\/\/e\.test\/a&amp;b<\/loc>/);
});

test('prefers the private content root for protected builds and the synced copy otherwise', async () => {
  const { checkout, runtime } = await fixtureCheckout();
  try {
    const root = join(checkout, 'web');
    await writeJson(join(root, 'public/content/learn/catalog.json'), []);
    const env = { LOOKAHEAD_CONTENT_ROOT: runtime };
    assert.equal(await resolveContentRoot({ protectedBuild: true, env, root }), runtime);
    assert.equal(
      await resolveContentRoot({ protectedBuild: false, env, root }),
      join(root, 'public/content'),
    );
    assert.equal(
      await resolveContentRoot({ protectedBuild: true, env: {}, root }),
      join(root, 'public/content'),
    );
    assert.equal(await resolveContentRoot({ protectedBuild: true, env: {}, root: checkout }), null);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});

test('reads the app hidden-course list and recognizes protected build arguments', async () => {
  const hidden = await readHiddenCourseIds();
  assert.ok(hidden.has('blaze:system-design'));
  assert.ok([...hidden].every((id) => /^(learn|grow|blaze):[a-z0-9-]+$/.test(id)));
  assert.equal(isProtectedBuild(['--configuration', 'production,protected']), true);
  assert.equal(isProtectedBuild(['--configuration=protected']), true);
  assert.equal(isProtectedBuild(['--configuration', 'production']), false);
  assert.equal(isProtectedBuild([]), false);
});

test('the shared page flags list start-free and keep sample pricing out of the sitemap', async () => {
  const pages = await readIndexablePages();
  assert.equal(pages['start-free'], true);
  assert.equal(pages.pricing, false);
  const paths = await collectSitemapPaths(null, { indexablePages: pages });
  assert.ok(paths.includes('/start-free'));
  assert.ok(!paths.includes('/pricing'));
});
