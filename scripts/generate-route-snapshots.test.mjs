import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectSitemapPaths } from './generate-seo-files.mjs';
import {
  collectSnapshotPages,
  metaText,
  readPublicPageText,
  renderSnapshot,
  writeRouteSnapshots,
} from './generate-route-snapshots.mjs';

const SECRET = 'PROTECTED-LESSON-BODY';
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>LookAhead | Learn. Grow. Blaze.</title>
    <!-- DLV-941: default for every page; PageTitleStrategy replaces it per route after start-up. -->
    <meta
      name="description"
      content="Default"
    />
    <meta property="og:site_name" content="LookAhead" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="LookAhead | Learn. Grow. Blaze." />
    <meta property="og:description" content="Default" />
    <meta name="twitter:card" content="summary" />
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <app-root></app-root>
    <script src="main-ABC123.js" type="module"></script>
  </body>
</html>
`;

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function fixture() {
  const checkout = await mkdtemp(join(tmpdir(), 'lookahead-snapshots-'));
  const runtime = join(checkout, 'runtime');
  await writeJson(join(runtime, 'learn/catalog.json'), [
    { id: 'core-java', title: 'Java Foundations', description: 'Learn Java from your <em>first</em> program.' },
  ]);
  await writeJson(join(runtime, 'grow/catalog.json'), []);
  await writeJson(join(runtime, 'blaze/catalog.json'), []);
  await writeJson(join(runtime, 'learn/core-java/course.json'), {
    id: 'core-java',
    modules: [{ id: 'java-platform' }, { id: 'generics' }],
    learningUnits: [
      { id: 'java-platform', title: 'Java Platform', description: 'How a Java file becomes a running program.', theoryModuleId: 'java-platform' },
      { id: 'generics', title: 'Generics', description: 'Typed collections.', theoryModuleId: 'generics' },
      { id: 'later', title: 'Later', planned: true },
    ],
  });
  await writeJson(join(runtime, 'learn/core-java/modules/java-platform.json'), [
    {
      id: 'java-platform-execution-model',
      title: 'How Java runs your code',
      contentType: 'theory',
      summary: SECRET,
      interviewAnswer: SECRET,
      code: SECRET,
    },
  ]);
  await writeJson(join(runtime, 'learn/core-java/modules/generics.json'), [
    { id: 'generics-basics', title: 'Generics basics', contentType: 'theory', summary: SECRET },
  ]);
  await writeJson(join(checkout, 'policies/content-samples.json'), {
    schemaVersion: 'content-samples/v1',
    publicUnits: ['learn/core-java/java-platform'],
    additionalFreeUnits: ['learn/core-java/generics'],
  });
  const output = join(checkout, 'browser');
  await mkdir(output);
  await writeFile(join(output, 'index.html'), SHELL);
  return { checkout, runtime, output };
}

test('cuts and strips text like the app', () => {
  assert.equal(metaText('Use <code>javac</code> &amp; the   JVM.'), 'Use javac & the JVM.');
  const long = metaText('word '.repeat(100), 40);
  assert.ok(long.length <= 40 && long.endsWith('word…'));
});

test('describes catalogs, courses and public lessons from public metadata only', async () => {
  const { checkout, runtime } = await fixture();
  try {
    const text = await readPublicPageText();
    const paths = await collectSitemapPaths(runtime, {
      policy: { publicUnits: ['learn/core-java/java-platform'] },
      indexablePages: { 'start-free': true, pricing: false },
    });
    const pages = await collectSnapshotPages(runtime, { text, paths, publicDir: join(checkout, 'none') });
    const byPath = Object.fromEntries(pages.map((page) => [page.path, page]));
    assert.deepEqual(Object.keys(byPath), ['/', '/learn', '/grow', '/blaze', '/start-free', '/learn/core-java', '/learn/core-java/java-platform-execution-model']);
    assert.equal(byPath['/learn/core-java'].title, 'Java Foundations | Learn | LookAhead');
    assert.deepEqual(byPath['/learn/core-java'].links.map((link) => link.label), ['Java Platform', 'Generics']);
    assert.deepEqual(byPath['/learn/core-java/java-platform-execution-model'], {
      path: '/learn/core-java/java-platform-execution-model',
      title: 'How Java runs your code | Java Foundations | LookAhead',
      description: 'Lesson from Java Foundations: How Java runs your code. How a Java file becomes a running program.',
      heading: 'How Java runs your code',
      image: undefined,
      type: 'article',
      links: [{ href: '/learn/core-java', label: 'Java Foundations course' }],
    });
    assert.ok(!JSON.stringify(pages).includes(SECRET));
    // A free-with-account lesson is not public, so it gets no page file.
    assert.ok(!byPath['/learn/core-java/generics-basics']);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});

test('renders one set of head tags and a summary inside app-root, escaping text', () => {
  const html = renderSnapshot(
    SHELL,
    { path: '/learn/x', title: 'A <b>"quoted"</b> lesson | LookAhead', description: 'Uses <em>&amp;</em> "quotes".', heading: 'A "quoted" lesson', image: '/assets/scenes/courses/learn-x.svg', links: [{ href: '/learn', label: 'Learn' }] },
    { origin: 'https://learn.example.test', siteName: 'LookAhead' },
  );
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/name="description"/g) ?? []).length, 1);
  assert.equal((html.match(/property="og:title"/g) ?? []).length, 1);
  assert.match(html, /<title>A &quot;quoted&quot; lesson \| LookAhead<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/learn\.example\.test\/learn\/x" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/learn\.example\.test\/assets\/scenes\/courses\/learn-x\.svg" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(html, /<app-root><main class="route-snapshot"><h1>A &quot;quoted&quot; lesson<\/h1><p>Uses &amp; &quot;quotes&quot;.<\/p><ul><li><a href="\/learn">Learn<\/a><\/li><\/ul><\/main><\/app-root>/);
  assert.match(html, /<script src="main-ABC123\.js" type="module"><\/script>/);
  const withoutOrigin = renderSnapshot(SHELL, { path: '/learn', title: 'Learn | LookAhead', description: 'D', heading: 'Learn', image: '/assets/scenes/landing/learn.svg' }, { origin: null, siteName: 'LookAhead' });
  assert.doesNotMatch(withoutOrigin, /canonical|og:url|og:image|twitter:image/);
  assert.match(withoutOrigin, /<meta name="twitter:card" content="summary" \/>/);
});

test('writes a page file per public route, leaves the shared shell generic and leaks no body', async () => {
  const { checkout, runtime, output } = await fixture();
  try {
    const { written } = await writeRouteSnapshots({ outputDir: output, origin: undefined, contentRoot: runtime, log: () => {}, warn: () => {} });
    assert.ok(written >= 5);
    assert.equal(await readFile(join(output, 'index.html'), 'utf8'), SHELL);
    const lesson = await readFile(join(output, 'learn/core-java/java-platform-execution-model/index.html'), 'utf8');
    assert.match(lesson, /<title>How Java runs your code \| Java Foundations \| LookAhead<\/title>/);
    assert.match(lesson, /<meta property="og:type" content="article" \/>/);
    assert.ok(!lesson.includes(SECRET));
    await assert.rejects(readFile(join(output, 'learn/core-java/generics-basics/index.html')));
    await assert.rejects(readFile(join(output, 'pricing/index.html')));
    const course = await readFile(join(output, 'learn/core-java/index.html'), 'utf8');
    assert.match(course, /<meta name="description" content="Learn Java from your first program\." \/>/);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});
