import assert from 'node:assert/strict';
import test from 'node:test';

import { includesBaselineSolutionLanguages } from './solution-language-contract.mjs';

const solution = (language) => ({ language });

test('requires the Java, Python, and Go baseline', () => {
  assert.equal(
    includesBaselineSolutionLanguages([solution('Java'), solution('Python'), solution('Go')]),
    true,
  );
  assert.equal(includesBaselineSolutionLanguages([solution('Java'), solution('Python')]), false);
});

test('allows an additional project-specific language', () => {
  assert.equal(
    includesBaselineSolutionLanguages([
      solution('Java'),
      solution('Python'),
      solution('Go'),
      solution('Vue'),
    ]),
    true,
  );
});
