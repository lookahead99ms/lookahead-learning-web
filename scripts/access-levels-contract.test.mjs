import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accessLevelErrors, learningUnitIds } from './access-levels-contract.mjs';

const units = new Map([
  ['learn/core-java', new Set(['java-platform', 'error-handling'])],
  ['blaze/system-design', new Set(['interview-method'])],
]);
const valid = {
  schemaVersion: 'content-access-levels/v1',
  policyVersion: 'samples-test-v1',
  defaultLevel: 'pro',
  units: {
    'learn/core-java/java-platform': 'open',
    'learn/core-java/error-handling': 'free',
    'blaze/system-design/interview-method': 'open',
  },
};

test('accepts unit IDs and levels for known learning units', () => {
  assert.deepEqual(accessLevelErrors(valid, units), []);
});

test('rejects extra fields so no title, route or body can ship', () => {
  assert.match(
    accessLevelErrors({ ...valid, titles: { 'learn/core-java/java-platform': 'Java' } }, units)[0],
    /unexpected field\(s\) titles/,
  );
});

test('rejects unknown units, bad IDs and levels other than open or free', () => {
  const errors = accessLevelErrors(
    {
      ...valid,
      units: {
        'learn/core-java/collections': 'open',
        'learn/core-java': 'free',
        'learn/core-java/error-handling': 'pro',
      },
    },
    units,
  );
  assert.deepEqual(errors, [
    'access-levels.json: learn/core-java/collections is not a learning unit of learn/core-java',
    'access-levels.json: invalid unit ID learn/core-java',
    'access-levels.json: learn/core-java/error-handling has invalid level pro',
  ]);
});

test('rejects a wrong schema, default level or units shape', () => {
  assert.equal(accessLevelErrors([], units).length, 1);
  assert.equal(
    accessLevelErrors({ ...valid, schemaVersion: 'v2', defaultLevel: 'free', units: [] }, units).length,
    3,
  );
});

test('collects sub-unit IDs with their parents', () => {
  assert.deepEqual(
    [...learningUnitIds({ learningUnits: [{ id: 'a', subUnits: [{ id: 'b' }] }, { id: 'c' }] })].sort(),
    ['a', 'b', 'c'],
  );
});
