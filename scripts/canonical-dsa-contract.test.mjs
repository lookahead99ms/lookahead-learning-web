import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  materializeCanonicalReferences,
  readCanonicalDsaProblems,
} from './canonical-dsa-contract.mjs';

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
