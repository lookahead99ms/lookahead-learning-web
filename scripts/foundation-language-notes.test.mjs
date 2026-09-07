import assert from 'node:assert/strict';
import test from 'node:test';
import { foundationLanguageNoteErrors } from './foundation-language-notes.mjs';

test('Grow accepts a relevant platform note without invented language equivalents', () => {
  assert.deepEqual(
    foundationLanguageNoteErrors(
      [{ language: 'SQL', note: 'Check affected rows inside the transaction.' }],
      'grow',
    ),
    [],
  );
});

test('Learn and unknown paths retain the comparative-language contract', () => {
  const notes = ['Java', 'Python', 'Go'].map((language) => ({
    language,
    note: 'A runtime-specific boundary.',
  }));
  assert.deepEqual(foundationLanguageNoteErrors(notes, 'learn'), []);
  assert.notEqual(foundationLanguageNoteErrors(notes.slice(0, 1), 'learn').length, 0);
  assert.notEqual(foundationLanguageNoteErrors(notes.slice(0, 1), undefined).length, 0);
});

test('Grow rejects absent, empty, malformed and duplicate notes', () => {
  for (const notes of [
    undefined,
    [],
    [null],
    [{ language: 'SQL', note: ' ' }],
    [
      { language: 'SQL', note: 'first' },
      { language: ' sql ', note: 'second' },
    ],
  ]) {
    assert.notEqual(foundationLanguageNoteErrors(notes, 'grow').length, 0);
  }
});
