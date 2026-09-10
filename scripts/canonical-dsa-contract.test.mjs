import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
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
