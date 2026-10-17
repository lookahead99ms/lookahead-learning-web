import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import {
  applyHandsOnPreparationPlan,
  applyHandsOnRankingPlan,
  approachFamilySummaries,
  buildHandsOnDsaIndex,
} from './generate-hands-on-dsa-index.mjs';

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
  assert.equal(index.schemaVersion, 'hands-on-dsa-index/v2');
  assert.equal(index.ranking.status, 'unranked');
  assert.equal(index.groups[0].problems[0].id, 'sample');
  assert.equal(index.groups[0].problems[0].interviewRank, 1);
  assert.equal(index.groups[0].problems[0].studyOrder, 1);
  assert.equal(index.groups[0].preparationOrder, 1);
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

test('applies a complete ranking manifest as a compact problem projection', () => {
  const groups = [
    {
      id: 'one',
      problems: [{ id: 'alpha' }, { id: 'beta' }],
    },
  ];
  const plan = {
    schemaVersion: 'hands-on-dsa-ranking/v1',
    rankingVersion: '2026.09-candidate.1',
    status: 'candidate',
    catalogTarget: 730,
    publishedProblemCount: 2,
    lastReviewedAt: '2026-09-06',
    methodology: 'Synthetic test methodology.',
    sourceRegistry: [
      {
        id: 'editorial',
        kind: 'first-party-editorial',
        includedInRanking: true,
        accessPolicy: 'owned',
        automationPolicy: 'allowed',
        agePolicy: 'Review before release.',
        limitations: 'Synthetic evidence only.',
        contribution: 'Exercises validation.',
        description: 'Owned evidence.',
      },
    ],
    problems: [
      {
        problemId: 'alpha',
        interviewRank: 2,
        studyOrder: 1,
        rankingVersion: '2026.09-candidate.1',
        lastReviewedAt: '2026-09-06',
        evidenceConfidence: 'low',
        rankingReasons: ['Prerequisite order.'],
        sourceSignals: [
          {
            sourceId: 'editorial',
            signalType: 'curriculum-placement',
            observedAt: '2026-09-06',
            contribution: 'Exercises the projection.',
          },
        ],
      },
      {
        problemId: 'beta',
        interviewRank: 1,
        studyOrder: 2,
        rankingVersion: '2026.09-candidate.1',
        lastReviewedAt: '2026-09-06',
        evidenceConfidence: 'medium',
        rankingReasons: ['Interview relevance.'],
        sourceSignals: [
          {
            sourceId: 'editorial',
            signalType: 'curriculum-placement',
            observedAt: '2026-09-06',
            contribution: 'Exercises the projection.',
          },
        ],
      },
    ],
  };

  const ranked = applyHandsOnRankingPlan(groups, plan);

  const published = JSON.stringify(ranked);
  for (const privateField of ['evidenceConfidence', 'rankingReasons', 'sourceSignals', 'editorialEvaluation', 'semanticFamily']) {
    assert(!published.includes(privateField), `Private field leaked: ${privateField}`);
  }
  assert.deepEqual(ranked.ranking, {
    status: 'candidate',
    rankingVersion: '2026.09-candidate.1',
    catalogTarget: 730,
    rankedProblems: 2,
    lastReviewedAt: '2026-09-06',
  });
  assert.deepEqual(
    ranked.groups[0].problems.map(
      ({ id, interviewRank, studyOrder, tier, rankingVersion }) => ({
        id,
        interviewRank,
        studyOrder,
        tier,
        rankingVersion,
      }),
    ),
    [
      {
        id: 'alpha',
        interviewRank: 2,
        studyOrder: 1,
        tier: 'universal-must-do',
        rankingVersion: '2026.09-candidate.1',
      },
      {
        id: 'beta',
        interviewRank: 1,
        studyOrder: 2,
        tier: 'universal-must-do',
        rankingVersion: '2026.09-candidate.1',
      },
    ],
  );
});

test('rejects excluded evidence sources and incomplete rank sequences', () => {
  const groups = [{ id: 'one', problems: [{ id: 'alpha' }, { id: 'beta' }] }];
  const basePlan = {
    schemaVersion: 'hands-on-dsa-ranking/v1',
    rankingVersion: 'candidate',
    status: 'candidate',
    catalogTarget: 730,
    publishedProblemCount: 2,
    lastReviewedAt: '2026-09-06',
    methodology: 'Synthetic test methodology.',
    sourceRegistry: [
      {
        id: 'restricted',
        kind: 'restricted-reference',
        includedInRanking: false,
        accessPolicy: 'personal-noncommercial',
        automationPolicy: 'prohibited',
        agePolicy: 'Never refresh.',
        limitations: 'Excluded evidence.',
        contribution: 'None.',
        description: 'Excluded source.',
      },
    ],
    problems: [
      {
        problemId: 'alpha',
        interviewRank: 1,
        studyOrder: 1,
        rankingVersion: 'candidate',
        lastReviewedAt: '2026-09-06',
        evidenceConfidence: 'low',
        rankingReasons: ['Reason.'],
        sourceSignals: [
          {
            sourceId: 'restricted',
            signalType: 'report-count',
            observedAt: '2026-09-06',
            contribution: 'Must be rejected.',
          },
        ],
      },
      {
        problemId: 'beta',
        interviewRank: 2,
        studyOrder: 2,
        rankingVersion: 'candidate',
        lastReviewedAt: '2026-09-06',
        evidenceConfidence: 'low',
        rankingReasons: ['Reason.'],
        sourceSignals: [
          {
            sourceId: 'restricted',
            signalType: 'report-count',
            observedAt: '2026-09-06',
            contribution: 'Must be rejected.',
          },
        ],
      },
    ],
  };

  assert.throws(
    () => applyHandsOnRankingPlan(groups, basePlan),
    /excluded source restricted cannot rank alpha/,
  );

  const allowedPlan = structuredClone(basePlan);
  allowedPlan.sourceRegistry[0].includedInRanking = true;
  allowedPlan.problems[1].studyOrder = 3;
  assert.throws(
    () => applyHandsOnRankingPlan(groups, allowedPlan),
    /studyOrder values must be contiguous from 1/,
  );
  // DLV-965 (2026-10-17): a merged problem leaves a gap in the interview ranks, which is allowed.
  const gapPlan = structuredClone(basePlan);
  gapPlan.sourceRegistry[0].includedInRanking = true;
  gapPlan.problems[1].interviewRank = 3;
  assert.equal(applyHandsOnRankingPlan(groups, gapPlan).groups[0].problems[1].interviewRank, 3);
  // Two unrelated problems still cannot share a rank.
  const clashPlan = structuredClone(basePlan);
  clashPlan.sourceRegistry[0].includedInRanking = true;
  clashPlan.problems[1].interviewRank = 1;
  assert.throws(() => applyHandsOnRankingPlan(groups, clashPlan), /duplicate interviewRank 1/);
});

test('an Approach-N problem shares its original\'s interview rank and keeps its own study order (DLV-965)', () => {
  const groups = [{ id: 'one', problems: [{ id: 'alpha' }, { id: 'alpha-approach-2' }, { id: 'beta' }] }];
  const entry = (problemId, interviewRank, studyOrder) => ({
    problemId,
    interviewRank,
    studyOrder,
    rankingVersion: 'candidate',
    lastReviewedAt: '2026-09-06',
    evidenceConfidence: 'low',
    rankingReasons: ['Reason.'],
    sourceSignals: [
      { sourceId: 'owned', signalType: 'owned-editorial-rubric', observedAt: '2026-09-06', contribution: 'Rubric.' },
    ],
  });
  const plan = {
    schemaVersion: 'hands-on-dsa-ranking/v1',
    rankingVersion: 'candidate',
    status: 'candidate',
    catalogTarget: 730,
    publishedProblemCount: 3,
    lastReviewedAt: '2026-09-06',
    methodology: 'Synthetic test methodology.',
    sourceRegistry: [
      {
        id: 'owned',
        kind: 'owned-editorial',
        includedInRanking: true,
        accessPolicy: 'owned',
        automationPolicy: 'allowed',
        agePolicy: 'Refresh on release.',
        limitations: 'Editorial.',
        contribution: 'Rubric.',
        description: 'Owned source.',
      },
    ],
    problems: [entry('alpha', 1, 1), entry('alpha-approach-2', 1, 2), entry('beta', 2, 3)],
  };
  const ranked = applyHandsOnRankingPlan(groups, plan).groups[0].problems;
  assert.deepEqual(
    ranked.map(({ id, interviewRank, studyOrder }) => ({ id, interviewRank, studyOrder })),
    [
      { id: 'alpha', interviewRank: 1, studyOrder: 1 },
      { id: 'alpha-approach-2', interviewRank: 1, studyOrder: 2 },
      { id: 'beta', interviewRank: 2, studyOrder: 3 },
    ],
  );
});

test('applies unique names and a contiguous preparation order without changing group ids', () => {
  const groups = [
    { id: 'algorithmic-patterns:linked-lists', title: 'Linked Lists' },
    { id: 'core-data-structures:linked-lists', title: 'Linked Lists' },
  ];
  const plan = {
    schemaVersion: 'hands-on-dsa-preparation/v1',
    groups: [
      {
        groupId: 'core-data-structures:linked-lists',
        preparationOrder: 1,
        displayTitle: 'Linked List Fundamentals',
      },
      {
        groupId: 'algorithmic-patterns:linked-lists',
        preparationOrder: 2,
        displayTitle: 'Linked List Interview Patterns',
      },
    ],
  };

  assert.deepEqual(
    applyHandsOnPreparationPlan(groups, plan).map(({ id, title, preparationOrder }) => ({
      id,
      title,
      preparationOrder,
    })),
    [
      {
        id: 'core-data-structures:linked-lists',
        title: 'Linked List Fundamentals',
        preparationOrder: 1,
      },
      {
        id: 'algorithmic-patterns:linked-lists',
        title: 'Linked List Interview Patterns',
        preparationOrder: 2,
      },
    ],
  );
});

test('rejects incomplete, duplicate, and non-contiguous preparation metadata', () => {
  const groups = [
    { id: 'one', title: 'Same' },
    { id: 'two', title: 'Same' },
  ];
  assert.throws(
    () =>
      applyHandsOnPreparationPlan(groups, {
        schemaVersion: 'hands-on-dsa-preparation/v1',
        groups: [{ groupId: 'one', preparationOrder: 1, displayTitle: 'One' }],
      }),
    /missing group two/,
  );
  assert.throws(
    () =>
      applyHandsOnPreparationPlan(groups, {
        schemaVersion: 'hands-on-dsa-preparation/v1',
        groups: [
          { groupId: 'one', preparationOrder: 1, displayTitle: 'One' },
          { groupId: 'two', preparationOrder: 1, displayTitle: 'Two' },
        ],
      }),
    /duplicate order 1/,
  );
  assert.throws(
    () =>
      applyHandsOnPreparationPlan(groups, {
        schemaVersion: 'hands-on-dsa-preparation/v1',
        groups: [
          { groupId: 'one', preparationOrder: 1, displayTitle: 'One' },
          { groupId: 'two', preparationOrder: 3, displayTitle: 'Two' },
        ],
      }),
    /orders must be contiguous/,
  );
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

test('carries approach families as sibling locations only, without patterns or bounds', () => {
  const sibling = (problemId, approach) => ({
    problemId,
    approach,
    title: `Grid Count (Approach-${approach})`,
    path: 'learn',
    courseId: 'algorithmic-patterns',
    questionId: `route-${problemId}`,
    pattern: 'SPOILER_PATTERN',
    complexity: { time: 'O(n)', space: 'O(1)' },
    whenToPrefer: 'SPOILER_REASON',
  });
  const problems = new Map([
    [
      'grid-count',
      { id: 'grid-count', approachFamily: { approach: 1, bestProblemId: 'grid-count', siblings: [sibling('grid-count-approach-3', 3), sibling('grid-count-approach-2', 2)] } },
    ],
    ['plain', { id: 'plain' }],
    ['broken', { id: 'broken', approachFamily: { approach: 1, bestProblemId: 'broken', siblings: [{ problemId: 'x' }] } }],
  ]);
  const families = approachFamilySummaries(problems);
  assert.deepEqual(Object.keys(families), ['grid-count']);
  assert.deepEqual(
    families['grid-count'].siblings.map(({ problemId, approach }) => [problemId, approach]),
    [
      ['grid-count-approach-2', 2],
      ['grid-count-approach-3', 3],
    ],
  );
  assert.equal(families['grid-count'].siblings[0].questionId, 'route-grid-count-approach-2');
  assert.doesNotMatch(JSON.stringify(families), /SPOILER|O\(n\)/);
});

test('the built index always carries an approachFamilies map', async () => {
  const root = await fixture();
  const index = await buildHandsOnDsaIndex(root, ['learn/algorithmic-patterns']);
  assert.deepEqual(index.approachFamilies, {});
});
