import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { generateSearchIndex } from './generate-search-index.mjs';

async function writeJson(root, path, value) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value));
}

test('uses canonical DSA identity and metadata without indexing stale placeholder guidance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'search-index-'));
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
