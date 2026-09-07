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
    modules: [{ id: 'practice-sample', order: 1, title: 'Practice Sample' }],
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
  const documents = JSON.parse(await readFile(join(root, 'search-index.json'), 'utf8'));
  const [document] = documents;

  assert.equal(document.contentId, 'legacy-route');
  assert.equal(document.canonicalContentId, 'canonical-problem');
  assert.equal(document.title, 'Canonical Problem');
  assert.equal(document.difficulty, 'Beginner');
  assert.deepEqual(document.languages, ['java', 'python', 'go']);
  assert.deepEqual(document.route, ['/', 'learn', 'algorithmic-patterns', 'legacy-route']);
  assert.match(document.searchableText, /canonical complete prompt/);
  assert.match(document.searchableText, /canonical invariant/);
  assert.doesNotMatch(document.searchableText, /stale alternative/);
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
