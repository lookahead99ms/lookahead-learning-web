import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  auditContent,
  auditDsa,
  codeLanguages,
  normalizeProblemTitle,
  parseOptions,
  practiceContractGaps,
} from './audit-content.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const code = ['java', 'python', 'go'].map((language) => ({
  language,
  source: 'reference implementation',
}));
const problem = () => ({
  id: 'fixture-problem',
  title: 'Fixture Problem',
  contentType: 'dsa-problem',
  moduleId: 'practice-fixture',
  relatedArticleId: 'fixture-lesson',
  difficulty: 'Intermediate',
  solutions: code,
  complexity: { time: 'O(n)', space: 'O(1)', note: 'One pass.' },
  practiceProblem: {
    implementationStatus: 'complete',
    objective: 'Compute the result.',
    constraints: ['Non-empty input.'],
    examples: [{ input: '[1]', output: '1' }],
    testCases: ['representative', 'boundary', 'failure'].map((category) => ({
      category,
      input: '[1]',
      expectedOutput: '1',
    })),
    hints: ['Inspect the input.', 'Keep a running result.'],
    externalUrl: 'https://example.com/problem',
  },
});
const guided = () => ({
  id: 'fixture-guided',
  title: 'Fixture Problem',
  difficulty: 'Intermediate',
  description: 'Walk the input.',
  invariantAdaptation: 'Processed prefix is accounted for.',
  complexity: { time: 'O(n)', space: 'O(1)', why: 'One pass.' },
  fixtures: ['standard', 'boundary', 'failure'].map((id) => ({
    id,
    input: '[1]',
    expectedOutput: '1',
  })),
  implementations: code,
  trace: { schemaVersion: 'guided-trace/v1', fixtureId: 'standard', events: [{ id: 'step' }] },
});
const course = () => ({
  id: 'algorithmic-patterns',
  path: 'learn',
  title: 'Synthetic patterns',
  modules: [
    { id: 'theory-fixture', title: 'Fixture' },
    { id: 'practice-fixture', title: 'Practice' },
  ],
  learningUnits: [
    {
      id: 'fixture',
      theoryModuleId: 'theory-fixture',
      practiceModuleId: 'practice-fixture',
      title: 'Fixture',
      description: 'Fixture',
    },
  ],
  questions: [
    {
      id: 'fixture-lesson',
      title: 'Fixture lesson',
      moduleId: 'theory-fixture',
      contentType: 'theory',
      schemaVersion: 'pattern-lesson/v1',
      essentialProblems: [guided()],
      practice: [],
      tags: [],
    },
    problem(),
  ],
});

test('language notes do not count as code; nested solutions and line blocks do', () => {
  assert.deepEqual(
    codeLanguages({ languageNotes: [{ language: 'Python', note: 'Use a dictionary.' }] }),
    [],
  );
  assert.deepEqual(
    codeLanguages({
      sections: [{ solutions: code }],
      template: { implementations: [{ language: 'Java', lines: [{ text: 'return;' }] }] },
    }),
    ['go', 'java', 'python'],
  );
  assert.deepEqual(codeLanguages({ code: { language: 'java', source: '   ' } }), []);
});

test('a complete label alone does not satisfy the independent practice contract', () => {
  assert.equal(practiceContractGaps(problem()).length, 0);
  assert.equal(
    practiceContractGaps({ practiceProblem: { implementationStatus: 'complete' } }).length,
    8,
  );
});

test('tests must include all categories and nonempty expected outputs', () => {
  const item = problem();
  item.practiceProblem.testCases[2].category = 'boundary';
  assert.deepEqual(practiceContractGaps(item), ['tests']);
  item.practiceProblem.testCases[2].category = 'failure';
  item.practiceProblem.testCases[0].expectedOutput = '';
  assert.deepEqual(practiceContractGaps(item), ['tests']);
});

test('guided and practice-ready titles overlap without inflating the total', () => {
  const data = course();
  data.questions.push({
    ...problem(),
    id: 'starter-copy',
    practiceProblem: { implementationStatus: 'starter' },
  });
  const result = auditDsa([data]);
  assert.equal(result.summary.normalizedTitles, 1);
  assert.equal(result.summary.appearances, 3);
  assert.equal(result.summary.guidedAndPracticeReady, 1);
  assert.equal(result.summary.catalogOnly, 0);
  assert.equal(result.summary.executableSolutionsVerifiedByThisAudit, 0);
});

test('canonical ids, not matching titles, own migrated problem identity', () => {
  const data = course();
  const first = {
    ...guided(),
    id: 'canonical-first',
    schemaVersion: 'dsa-problem/v2',
    practice: {},
    placements: [],
  };
  const second = { ...first, id: 'canonical-second' };
  data.questions[0].schemaVersion = 'pattern-lesson/v2';
  data.questions[0].essentialProblems = [first, second];
  const result = auditDsa([data]);
  assert.equal(result.summary.normalizedTitles, 3);
  assert.deepEqual(
    result.problems
      .flatMap(({ appearances }) => appearances.map(({ canonicalId }) => canonicalId))
      .filter(Boolean)
      .sort(),
    ['canonical-first', 'canonical-second'],
  );
});

test('a structurally incomplete complete-labelled problem is reported honestly', () => {
  const data = course();
  data.questions[1].solutions = [];
  const result = auditDsa([data]);
  assert.equal(result.summary.practiceReady, 1);
  assert.equal(result.summary.structurallyPracticeReady, 0);
  assert.deepEqual(result.problems[0].appearances[1].structuralGaps, ['javaPythonGoSolutions']);
});

test('title normalization can merge variants and preserves numbered sequels', () => {
  assert.equal(normalizeProblemTitle('Find the Value (constant space)'), 'find value');
  assert.equal(normalizeProblemTitle('Problem II'), 'problem 2');
  assert.notEqual(normalizeProblemTitle('Problem II'), normalizeProblemTitle('Problem III'));
});

test('nested units are counted and repeated difficulty claims stay visible', () => {
  const data = course();
  data.learningUnits = [
    { id: 'parent', theoryModuleId: 'no-lesson', subUnits: data.learningUnits },
  ];
  data.questions[1].difficulty = 'Advanced';
  assert.equal(auditDsa([data]).summary.groupCount, 1);
  assert.equal(auditDsa([data]).summary.conflictingDifficultyGroups, 1);
});

test('derived DSA counts match the real frontend helper on synthetic content', async () => {
  // Compile the pure frontend helpers in memory, without changing source or
  // pulling private curriculum into tests or CI.
  const { transpileModule, ModuleKind, ScriptTarget } = await import('typescript');
  const urls = new Map();
  for (const name of ['content.models', 'learning-units', 'hands-on-dsa']) {
    let source = await readFile(resolve(repositoryRoot, `src/app/content/${name}.ts`), 'utf8');
    for (const [dependency, url] of urls)
      source = source.replaceAll(`'./${dependency}'`, `'${url}'`);
    const compiled = transpileModule(source, {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
    }).outputText;
    urls.set(name, `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  }
  const ui = await import(urls.get('hands-on-dsa'));
  const data = course();
  data.questions.push({
    ...problem(),
    id: 'only-catalog',
    title: 'A Second Problem',
    practiceProblem: { implementationStatus: 'starter' },
  });
  const groups = ui.buildHandsOnDsaGroups(data);
  const counts = ui.handsOnReadinessCounts(groups);
  const audited = auditDsa([data]).summary;
  assert.equal(audited.groupCount, groups.length);
  assert.equal(audited.guided, counts.guided);
  assert.equal(audited.practiceReady, counts.practiceReady);
  assert.equal(audited.catalogOnly, counts.catalogued);
  assert.equal(audited.normalizedTitles, ui.uniqueHandsOnProblemCount(groups));
});

test('CLI defaults to public demo content; external content must be explicit', () => {
  assert.equal(
    parseOptions([], { LOOKAHEAD_CONTENT_ROOT: '/not-selected' }).root,
    resolve(repositoryRoot, 'demo-content/runtime'),
  );
  assert.equal(
    parseOptions(['--external'], { LOOKAHEAD_CONTENT_ROOT: '/selected' }).root,
    '/selected',
  );
  assert.equal(
    parseOptions(['test-fixtures/content', '--output', '../report.json']).output,
    resolve(repositoryRoot, '../report.json'),
  );
  assert.throws(() => parseOptions(['--unknown']), /Usage/);
  assert.throws(() => parseOptions(['--output']), /Usage/);
});

test('the real public demo audits successfully without inventing an absent path', async () => {
  const report = await auditContent(resolve(repositoryRoot, 'demo-content/runtime'));
  assert.deepEqual(report.absentPaths, ['look-ahead']);
  assert.equal(report.paths.find((path) => path.path === 'look-ahead').present, false);
  assert.equal(report.paths[0].courses, 1);
  assert.deepEqual(report.issues, []);
});

async function fixture(t) {
  const parent = resolve(repositoryRoot, '.angular');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(resolve(parent, 'content-audit-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(file, value) {
    const target = resolve(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value));
  }
  for (const path of ['learn', 'grow', 'look-ahead']) await put(`${path}/catalog.json`, []);
  const data = course();
  await put('learn/catalog.json', [{ id: data.id }, { id: 'hands-on-dsa' }]);
  await put('learn/algorithmic-patterns/course.json', { ...data, questions: [] });
  await put('learn/algorithmic-patterns/modules/theory-fixture.json', [data.questions[0]]);
  await put('learn/algorithmic-patterns/modules/practice-fixture.json', [data.questions[1]]);
  return { root, put, data };
}

test('file audit is deterministic, excludes delivery, and recognizes the composed catalog route', async (t) => {
  const { root, put } = await fixture(t);
  const first = await auditContent(root);
  await put('delivery/delivery-plan.json', { arbitrary: 'outside curriculum scope' });
  assert.deepEqual(await auditContent(root), first);
  assert.equal(first.paths[0].courses, 1);
  assert.equal(first.paths[0].catalogs, 2);
  assert.equal(first.paths[0].items, 2);
  assert.deepEqual(first.issues, []);
  await put('learn/catalog.json', [{ id: 'algorithmic-patterns' }]);
  assert.notEqual((await auditContent(root)).sourceFingerprint, first.sourceFingerprint);
});

test('planned module records are counted on disk but excluded from active items', async (t) => {
  const { root, put, data } = await fixture(t);
  data.modules[1].reviewStatus = 'planned';
  await put('learn/algorithmic-patterns/course.json', { ...data, questions: [] });
  const report = await auditContent(root);
  assert.equal(report.paths[0].plannedModules, 1);
  assert.equal(report.paths[0].items, 1);
  assert.equal(report.modules.find((item) => item.id === 'practice-fixture').recordsOnDisk, 1);
});

test('missing related articles, visual files, modules, and orphan files are reported', async (t) => {
  const { root, put, data } = await fixture(t);
  data.modules.push({ id: 'missing-module' });
  await put('learn/algorithmic-patterns/course.json', data);
  await put('learn/algorithmic-patterns/modules/practice-fixture.json', [
    {
      ...problem(),
      relatedArticleId: 'missing-lesson',
      visual: { assetPath: '/content/learn/missing.html?mode=a' },
    },
  ]);
  await put('learn/algorithmic-patterns/modules/orphan.json', []);
  const kinds = (await auditContent(root)).issues.map((issue) => issue.kind);
  for (const kind of [
    'unresolved-related-article',
    'missing-visual-file',
    'missing-module',
    'unreferenced-module-file',
  ])
    assert.ok(kinds.includes(kind));
});

test('an exact repeated answer is a review signal, not discarded content', async (t) => {
  const { root, put } = await fixture(t);
  await put('learn/algorithmic-patterns/modules/practice-fixture.json', [
    { ...problem(), interviewAnswer: 'Same answer.' },
    { ...problem(), id: 'another-item', interviewAnswer: 'Same   answer.' },
  ]);
  const report = await auditContent(root);
  assert.equal(report.paths[0].items, 3);
  assert.equal(report.duplicateAnswerGroups.length, 1);
});

test('lesson code counts exclude code found only inside its embedded guided problems', async (t) => {
  const { root } = await fixture(t);
  const report = await auditContent(root);
  assert.equal(report.paths[0].lessonsWithCode, 0);
  assert.equal(report.paths[0].itemsWithCode, 2);
});

test('legacy theory tags alone do not count as article payloads', async (t) => {
  const { root, put, data } = await fixture(t);
  await put('learn/algorithmic-patterns/modules/theory-fixture.json', [
    data.questions[0],
    { id: 'tag-only', contentType: 'theory', title: 'Legacy question', solutions: code },
    {
      id: 'legacy-article',
      contentType: 'theory',
      title: 'Legacy article',
      sections: [{ body: ['Explanation.'] }],
    },
  ]);
  const report = await auditContent(root);
  assert.equal(report.paths[0].theoryTaggedRecords, 3);
  assert.equal(report.paths[0].theoryTagOnlyRecords, 1);
  assert.equal(report.paths[0].lessons, 2);
  assert.equal(report.paths[0].lessonsWithCode, 0);
});

test('detached legacy traces are not mistaken for inline versioned traces', async (t) => {
  const { root, put } = await fixture(t);
  await put('learn/algorithmic-patterns/traces/legacy.json', [
    {
      id: 'old-trace',
      steps: [{ state: 'start' }],
      code: { java: 'return;', python: 'pass', go: 'return' },
    },
  ]);
  const report = await auditContent(root);
  assert.equal(report.paths[0].inlineTraces, 1);
  assert.equal(report.detachedTraceFiles[0].versionedTraces, 0);
  assert.equal(report.detachedTraceFiles[0].legacyTraceProblems, 1);
  assert.deepEqual(report.detachedTraceFiles[0].legacyProblems[0].languages, [
    'java',
    'python',
    'go',
  ]);
});
