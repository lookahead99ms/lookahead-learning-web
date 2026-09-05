import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { buildHandsOnDsaIndex } from './generate-hands-on-dsa-index.mjs';

async function writeJson(root, path, value) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value));
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hands-on-index-'));
  await writeJson(root, 'learn/dsa-problems/sample.json', {
    schemaVersion: 'dsa-problem/v2',
    id: 'sample',
    title: 'Sample Problem',
    description: 'Complete prompt.',
    difficulty: 'Beginner',
    variation: 'Reviewed variation',
    invariantAdaptation: 'Reviewed invariant',
    practice: { statement: { prompt: 'Complete prompt.' } },
    placements: [],
    implementations: [{ marker: 'FULL_SOLUTION_MUST_NOT_ENTER_INDEX' }],
    trace: { marker: 'FULL_TRACE_MUST_NOT_ENTER_INDEX' },
  });
  await writeJson(root, 'learn/algorithmic-patterns/course.json', {
    id: 'algorithmic-patterns',
    title: 'Algorithmic Patterns',
    modules: [
      { id: 'theory-sample', order: 1 },
      { id: 'practice-sample', order: 2 },
    ],
    learningUnits: [
      {
        id: 'sample-pattern',
        title: 'Sample Pattern',
        description: 'Pattern description.',
        theoryModuleId: 'theory-sample',
        practiceModuleId: 'practice-sample',
      },
    ],
  });
  await writeJson(root, 'learn/algorithmic-patterns/modules/theory-sample.json', [
    {
      id: 'sample-lesson',
      moduleId: 'theory-sample',
      contentType: 'theory',
      schemaVersion: 'pattern-lesson/v2',
      title: 'Sample Lesson',
      tags: ['sample'],
      essentialProblemRefs: [{ problemId: 'sample' }],
    },
  ]);
  await writeJson(root, 'learn/algorithmic-patterns/modules/practice-sample.json', [
    {
      id: 'sample-route',
      moduleId: 'practice-sample',
      order: 1,
      relatedArticleId: 'sample-lesson',
      canonicalProblemRef: { problemId: 'sample' },
    },
    {
      id: 'unfinished-route',
      moduleId: 'practice-sample',
      order: 2,
      relatedArticleId: 'sample-lesson',
      contentType: 'dsa-problem',
    },
  ]);
  return root;
}

test('builds a compact canonical-only Hands-On DSA index', async () => {
  const root = await fixture();
  const index = await buildHandsOnDsaIndex(root, ['learn/algorithmic-patterns']);

  assert.deepEqual(index.totals, { groups: 1, problemPlacements: 1, distinctProblems: 1 });
  assert.equal(index.groups[0].problems[0].id, 'sample');
  assert.deepEqual(index.groups[0].problems[0].route, [
    '/learn',
    'algorithmic-patterns',
    'sample-route',
  ]);
  const serialized = JSON.stringify(index);
  assert.doesNotMatch(serialized, /unfinished-route/);
  assert.doesNotMatch(serialized, /FULL_SOLUTION/);
  assert.doesNotMatch(serialized, /FULL_TRACE/);
});

test('rejects unresolved canonical references', async () => {
  const root = await fixture();
  const theoryPath = join(root, 'learn/algorithmic-patterns/modules/theory-sample.json');
  await writeFile(
    theoryPath,
    JSON.stringify([
      {
        id: 'sample-lesson',
        moduleId: 'theory-sample',
        contentType: 'theory',
        schemaVersion: 'pattern-lesson/v2',
        title: 'Sample Lesson',
        tags: [],
        essentialProblemRefs: [{ problemId: 'missing' }],
      },
    ]),
  );

  await assert.rejects(
    buildHandsOnDsaIndex(root, ['learn/algorithmic-patterns']),
    /unresolved canonical DSA problem missing/,
  );
});

test('keeps an explicitly linked transfer problem in the current pattern', async () => {
  const root = await fixture();
  await writeJson(root, 'learn/algorithmic-patterns/modules/theory-sample.json', [
    {
      id: 'sample-lesson',
      moduleId: 'theory-sample',
      contentType: 'theory',
      schemaVersion: 'pattern-lesson/v2',
      title: 'Sample Lesson',
      tags: ['sample'],
      practice: [{ questionId: 'sample-route', sourceLessonId: 'source-lesson' }],
    },
  ]);
  await writeJson(root, 'learn/algorithmic-patterns/modules/practice-sample.json', [
    {
      id: 'sample-route',
      moduleId: 'practice-sample',
      order: 1,
      relatedArticleId: 'source-lesson',
      canonicalProblemRef: { problemId: 'sample' },
    },
  ]);

  const index = await buildHandsOnDsaIndex(root, ['learn/algorithmic-patterns']);

  assert.deepEqual(index.totals, { groups: 1, problemPlacements: 1, distinctProblems: 1 });
  assert.equal(index.groups[0].problems[0].id, 'sample');
});

test('emits an empty index when the optional DSA courses are absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hands-on-index-empty-'));
  await mkdir(join(root, 'learn/dsa-problems'), { recursive: true });

  const index = await buildHandsOnDsaIndex(root, ['learn/algorithmic-patterns']);

  assert.deepEqual(index.totals, { groups: 0, problemPlacements: 0, distinctProblems: 0 });
  assert.deepEqual(index.groups, []);
});
