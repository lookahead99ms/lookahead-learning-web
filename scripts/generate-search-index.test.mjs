import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { generateSearchIndex } from './generate-search-index.mjs';

async function writeJson(root, path, value) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value));
}

async function testRoot(context) {
  const scratch = join(import.meta.dirname, '../.codex-scratch');
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, 'search-index-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('uses canonical DSA identity and metadata without indexing stale placeholder guidance', async (context) => {
  const root = await testRoot(context);
  await writeJson(root, 'learn/catalog.json', [
    { id: 'algorithmic-patterns', title: 'Algorithmic Patterns', available: true },
  ]);
  await writeJson(root, 'learn/algorithmic-patterns/course.json', {
    id: 'algorithmic-patterns',
    path: 'learn',
    title: 'Algorithmic Patterns',
    modules: [
      { id: 'practice-sample', order: 1, title: 'Practice Sample' },
      { id: 'practice-transfer', order: 2, title: 'Practice Transfer' },
    ],
  });
  await writeJson(root, 'learn/algorithmic-patterns/modules/practice-sample.json', [
    {
      id: 'legacy-route',
      moduleId: 'practice-sample',
      title: 'Stale Placeholder Title',
      contentType: 'dsa-problem',
      difficulty: 'Advanced',
      tags: ['Legacy Placement'],
      followUps: [{ question: 'STALE ALTERNATIVE QUESTION', answer: 'STALE ALTERNATIVE ANSWER' }],
      canonicalProblemRef: { problemId: 'canonical-problem' },
    },
  ]);
  await writeJson(root, 'learn/algorithmic-patterns/modules/practice-transfer.json', [
    {
      id: 'second-placement',
      moduleId: 'practice-transfer',
      title: 'Another stale placement title',
      contentType: 'dsa-problem',
      difficulty: 'Advanced',
      tags: ['Another placement'],
      canonicalProblemRef: { problemId: 'canonical-problem' },
    },
  ]);
  await writeJson(root, 'learn/dsa-problems/canonical-problem.json', {
    schemaVersion: 'dsa-problem/v2',
    id: 'canonical-problem',
    title: 'Canonical Problem',
    difficulty: 'Beginner',
    tags: ['Canonical Pattern'],
    variation: 'Canonical variation',
    invariantAdaptation: 'Canonical invariant',
    practice: { statement: { prompt: 'Canonical complete prompt.' } },
    implementations: [{ language: 'java' }, { language: 'python' }, { language: 'go' }],
    placements: [],
  });

  await generateSearchIndex(root);
  const manifest = JSON.parse(await readFile(join(root, 'content-index-manifest.json'), 'utf8'));
  const shard = JSON.parse(await readFile(join(root, 'indexes/learn.json'), 'utf8'));
  const [document] = shard.documents;

  assert.equal(manifest.schemaVersion, 'content-index-manifest/v1');
  assert.equal(manifest.totals.searchDocuments, 1);
  assert.equal(manifest.totals.practiceDocuments, 1);
  assert.equal(shard.schemaVersion, 'content-index-shard/v1');
  assert.equal(document.id, 'dsa:canonical-problem');
  assert.equal(document.contentId, 'legacy-route');
  assert.equal(document.canonicalContentId, 'canonical-problem');
  assert.equal(document.title, 'Canonical Problem');
  assert.equal(document.difficulty, 'Beginner');
  assert.deepEqual(document.languages, ['java', 'python', 'go']);
  assert.equal(document.detailRef.kind, 'canonical-dsa');
  assert.equal(document.searchableText, undefined);
  assert.equal(document.filterTags, undefined);
  assert.doesNotMatch(JSON.stringify(shard), /stale alternative/);
  const locator = JSON.parse(
    await readFile(join(root, 'learn/algorithmic-patterns/content-locator.json'), 'utf8'),
  );
  assert.equal(locator.schemaVersion, 'course-content-locator/v1');
  assert.equal(locator.items.length, 2);
  assert.equal(locator.items[0].canonicalProblemRef.problemId, 'canonical-problem');
  const [overview] = JSON.parse(await readFile(join(root, 'learn/catalog-overview.json'), 'utf8'));
  assert.equal(overview.moduleCount, 2);
});

async function addCourse(root, path, chips) {
  await writeJson(root, `${path}/catalog.json`, [
    { id: 'sample', title: 'Sample course', available: true },
    { id: 'unavailable', title: 'Unavailable course', available: false },
  ]);
  await writeJson(root, `${path}/sample/course.json`, {
    id: 'sample',
    path,
    title: 'Sample course',
    chips,
    modules: [{ id: 'intro', title: 'Introduction', order: 1 }],
  });
  await writeJson(root, `${path}/sample/modules/intro.json`, [
    {
      id: 'sample-question',
      moduleId: 'intro',
      title: 'Explain the contract',
      difficulty: 'Beginner',
      tags: [],
      interviewAnswer: 'Describe the contract.',
      followUps: [],
    },
  ]);
}

test('Grow previews use normalized authored topics without fetching full courses in the browser', async (context) => {
  const root = await testRoot(context);
  await addCourse(root, 'grow', [' REST ', 'GraphQL', 'rest', '', 'CSRF', 'Rate limiting']);
  await generateSearchIndex(root);
  const [course, unavailable] = JSON.parse(
    await readFile(join(root, 'grow/catalog-overview.json')),
  );
  assert.deepEqual(course.topicPreview, ['REST', 'GraphQL', 'CSRF', 'Rate limiting']);
  assert.equal(course.moduleCount, 1);
  assert.equal(course.questionCount, 1);
  assert.deepEqual(unavailable.topicPreview, []);
  const detail = JSON.parse(
    await readFile(join(root, 'details/grow/sample/intro/sample-question.json'), 'utf8'),
  );
  assert.equal(detail.interviewAnswer, 'Describe the contract.');
  const shardText = await readFile(join(root, 'indexes/grow.json'), 'utf8');
  assert.match(shardText, /Describe the contract/);
  assert.doesNotMatch(shardText, /followUps|explanation|solutions/);
  await assert.rejects(readFile(join(root, 'search-index.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(root, 'interview-question-index.json')), { code: 'ENOENT' });
});

test('Grow falls back to real module titles when authored topics are absent', async (context) => {
  const root = await testRoot(context);
  await addCourse(root, 'grow');
  await generateSearchIndex(root);
  const [course] = JSON.parse(await readFile(join(root, 'grow/catalog-overview.json')));
  assert.deepEqual(course.topicPreview, ['Introduction']);
});

test('counts lessons and questions separately from lesson/practice module containers and topic highlights', async (context) => {
  const root = await testRoot(context);
  await addCourse(root, 'grow');
  await writeJson(root, 'grow/sample/course.json', {
    id: 'sample',
    path: 'grow',
    title: 'Sample course',
    chips: ['Contracts', 'State', 'Recovery'],
    modules: [
      { id: 'intro', title: 'Introduction', order: 1 },
      { id: 'intro-practice', title: 'Introduction Practice', order: 2 },
    ],
  });
  const base = { difficulty: 'Beginner', tags: [], followUps: [] };
  await writeJson(root, 'grow/sample/modules/intro.json', [
    {
      ...base,
      id: 'lesson',
      moduleId: 'intro',
      title: 'Read the lesson',
      contentType: 'theory',
      sections: [{ heading: 'Contracts', body: ['State the invariant.'] }],
    },
    {
      ...base,
      id: 'interview',
      moduleId: 'intro',
      title: 'Explain the invariant',
      contentType: 'q-and-a',
    },
  ]);
  await writeJson(root, 'grow/sample/modules/intro-practice.json', [
    { ...base, id: 'practice', moduleId: 'intro-practice', title: 'Apply the invariant' },
  ]);
  await generateSearchIndex(root);
  const [course] = JSON.parse(await readFile(join(root, 'grow/catalog-overview.json')));
  assert.equal(course.lessonCount, 1);
  assert.equal(course.questionCount, 2);
  assert.equal(course.moduleCount, 2);
  assert.deepEqual(course.topicPreview, ['Contracts', 'State', 'Recovery']);
});

test('Learn and Look Ahead keep their existing module previews', async (context) => {
  const root = await testRoot(context);
  for (const path of ['learn', 'look-ahead'])
    await addCourse(root, path, ['Do not replace modules']);
  await generateSearchIndex(root);
  for (const path of ['learn', 'look-ahead']) {
    const [course] = JSON.parse(await readFile(join(root, path, 'catalog-overview.json')));
    assert.deepEqual(course.topicPreview, ['Introduction']);
  }
});
