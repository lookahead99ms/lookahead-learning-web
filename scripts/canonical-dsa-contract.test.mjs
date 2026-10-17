import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  approachFamilyErrors,
  canonicalFixtureCoverageErrors,
  materializeCanonicalReferences,
  readCanonicalDsaProblems,
} from './canonical-dsa-contract.mjs';

function fixtureCoverageProblem(categories = ['representative', 'boundary', 'failure']) {
  const fixtures = categories.map((category, index) => ({ id: `fixture-${index}`, category }));
  const traces = fixtures.map((fixture) => ({ fixtureId: fixture.id }));
  return { fixtures, trace: traces[0], fixtureTraces: traces.slice(1) };
}

test('canonical fixture coverage accepts additional fully traced boundary cases', () => {
  assert.deepEqual(canonicalFixtureCoverageErrors(fixtureCoverageProblem()), []);
  assert.deepEqual(
    canonicalFixtureCoverageErrors(
      fixtureCoverageProblem(['representative', 'boundary', 'failure', 'boundary', 'boundary']),
    ),
    [],
  );
});

test('canonical fixture coverage rejects missing or invented categories', () => {
  assert.match(
    canonicalFixtureCoverageErrors(fixtureCoverageProblem(['representative', 'boundary']))[0],
    /at least three/,
  );
  assert.match(
    canonicalFixtureCoverageErrors(
      fixtureCoverageProblem(['representative', 'boundary', 'invented']),
    )[0],
    /all and only/,
  );
  assert.match(
    canonicalFixtureCoverageErrors(
      fixtureCoverageProblem(['representative', 'boundary', 'boundary']),
    )[0],
    /all and only/,
  );
});

test('canonical fixture coverage rejects duplicate identities and missing extra traces', () => {
  const duplicate = fixtureCoverageProblem();
  duplicate.fixtures[2].id = duplicate.fixtures[1].id;
  assert.match(canonicalFixtureCoverageErrors(duplicate).join('; '), /nonempty and unique/);
  const missingTrace = fixtureCoverageProblem([
    'representative',
    'boundary',
    'failure',
    'boundary',
  ]);
  missingTrace.fixtureTraces.pop();
  assert.match(canonicalFixtureCoverageErrors(missingTrace).join('; '), /exactly one guided trace/);
  const repeatedTrace = fixtureCoverageProblem();
  repeatedTrace.fixtureTraces.push(repeatedTrace.fixtureTraces[0]);
  assert.match(
    canonicalFixtureCoverageErrors(repeatedTrace).join('; '),
    /exactly one guided trace/,
  );
});

const problem = (id = 'sample-problem') => ({
  schemaVersion: 'dsa-problem/v2',
  id,
  placements: [
    {
      path: 'learn',
      courseId: 'algorithmic-patterns',
      role: 'practice',
      moduleId: 'practice-sample',
      questionId: id,
    },
  ],
});

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'canonical-dsa-'));
  await mkdir(resolve(root, 'learn/dsa-problems'), { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('canonical problems use stable filename-backed identities', async (t) => {
  const root = await fixture(t);
  await writeFile(
    resolve(root, 'learn/dsa-problems/sample-problem.json'),
    JSON.stringify(problem()),
  );
  const problems = await readCanonicalDsaProblems(root);
  const materialized = materializeCanonicalReferences(
    {
      id: 'sample-lesson',
      schemaVersion: 'pattern-lesson/v2',
      essentialProblemRefs: [{ problemId: 'sample-problem' }],
    },
    problems,
  );
  assert.equal(materialized.essentialProblems[0].id, 'sample-problem');
  assert.equal(materialized.essentialProblems[0].practiceQuestionId, 'sample-problem');
});

test('a missing canonical reference fails closed', () => {
  assert.throws(
    () =>
      materializeCanonicalReferences(
        {
          id: 'sample-lesson',
          schemaVersion: 'pattern-lesson/v2',
          essentialProblemRefs: [{ problemId: 'missing-problem' }],
        },
        new Map(),
      ),
    /unresolved canonical DSA problem missing-problem/,
  );
});

test('filename and canonical id must match', async (t) => {
  const root = await fixture(t);
  await writeFile(
    resolve(root, 'learn/dsa-problems/wrong-name.json'),
    JSON.stringify(problem('sample-problem')),
  );
  await assert.rejects(() => readCanonicalDsaProblems(root), /filename must match/);
});

function familyMember(id, title, approach, siblings, complexity = { time: 'O(n)', space: 'O(1)' }) {
  return {
    ...problem(id),
    title,
    complexity,
    approachFamily: { approach, bestProblemId: 'pair', siblings },
  };
}
function siblingOf(member, extra = {}) {
  return {
    problemId: member.id,
    approach: member.approachFamily.approach,
    title: member.title,
    path: 'learn',
    courseId: 'algorithmic-patterns',
    questionId: member.id,
    pattern: 'Pattern',
    complexity: member.complexity,
    whenToPrefer: 'When it fits.',
    ...extra,
  };
}
function family() {
  const first = familyMember('pair', 'Pair (Approach-1)', 1, []);
  const second = familyMember('pair-approach-2', 'Pair (Approach-2)', 2, []);
  first.approachFamily.siblings = [siblingOf(second)];
  second.approachFamily.siblings = [siblingOf(first)];
  return new Map([[first.id, first], [second.id, second]]);
}

test('approach families accept a consistent pair and ignore problems without one (DLV-965)', () => {
  const problems = family();
  for (const member of problems.values()) assert.deepEqual(approachFamilyErrors(member, problems), []);
  assert.deepEqual(approachFamilyErrors(problem('solo'), new Map([['solo', problem('solo')]])), []);
});

test('approach families reject stale copies, wrong names and unequal bounds', () => {
  const problems = family();
  const first = problems.get('pair');
  first.approachFamily.siblings[0].title = 'Old';
  first.approachFamily.siblings[0].questionId = 'moved';
  assert.match(approachFamilyErrors(first, problems).join('; '), /title is stale.*route is not its practice placement/);
  const renamed = family();
  renamed.get('pair-approach-2').title = 'Pair, second way';
  renamed.get('pair').approachFamily.siblings[0].title = 'Pair, second way';
  assert.match(approachFamilyErrors(renamed.get('pair-approach-2'), renamed).join('; '), /title must be "Pair \(Approach-2\)"/);
  const slower = family();
  slower.get('pair-approach-2').complexity = { time: 'O(n log n)', space: 'O(1)' };
  slower.get('pair').approachFamily.siblings[0].complexity = { time: 'O(n log n)', space: 'O(1)' };
  assert.match(approachFamilyErrors(slower.get('pair-approach-2'), slower).join('; '), /best approach's time and space/);
  const unnumbered = family();
  unnumbered.get('pair').title = 'Pair';
  unnumbered.get('pair-approach-2').approachFamily.siblings[0].title = 'Pair';
  assert.match(approachFamilyErrors(unnumbered.get('pair'), unnumbered).join('; '), /must be titled "Pair \(Approach-1\)"/);
  const orphan = new Map([['pair', problem('pair')], ['pair-approach-2', problem('pair-approach-2')]]);
  assert.deepEqual(approachFamilyErrors(orphan.get('pair-approach-2'), orphan), ['an Approach-N problem must carry approachFamily']);
  const gap = family();
  gap.get('pair-approach-2').approachFamily.approach = 3;
  gap.get('pair').approachFamily.siblings[0].approach = 3;
  assert.match(approachFamilyErrors(gap.get('pair'), gap).join('; '), /must run 1..2/);
});

test('approach families compare the stated bound term, not its wording (DLV-965 bulk)', () => {
  const problems = family();
  problems.get('pair').complexity = { time: 'O(26n) = O(n)', space: 'O(R × C)' };
  problems.get('pair-approach-2').complexity = { time: 'O(n)', space: 'O(R x C)' };
  problems.get('pair').approachFamily.siblings[0].complexity = { time: 'O(n)', space: 'O(R x C)' };
  problems.get('pair-approach-2').approachFamily.siblings[0].complexity = { time: 'O(26n) = O(n)', space: 'O(R × C)' };
  assert.deepEqual(approachFamilyErrors(problems.get('pair-approach-2'), problems), []);
  assert.deepEqual(approachFamilyErrors(problems.get('pair'), problems), []);
});
