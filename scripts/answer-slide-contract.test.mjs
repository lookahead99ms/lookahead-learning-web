import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answerSlideDeckReference,
  buildAnswerSlideDeck,
  validateAnswerSlideDeck,
} from './answer-slide-contract.mjs';

const detailRef = {
  kind: 'content-item',
  href: '/content/details/learn/java/questions/concurrent-map.json',
  version: 'content-v1',
};

function question(overrides = {}) {
  return {
    id: 'concurrent-map',
    title: 'How does ConcurrentHashMap support concurrent access?',
    interviewAnswer: 'It combines volatile reads, CAS, and localized synchronization.',
    explanation: ['Reads usually avoid locking while updates coordinate at a bin.'],
    followUps: [],
    ...overrides,
  };
}

test('derives a deterministic ordinary deck and omits unsupported optional slides', () => {
  const deck = buildAnswerSlideDeck(question(), { detailRef });

  assert.equal(deck.schemaVersion, 'answer-slides/v1');
  assert.equal(deck.id, 'concurrent-map-answer');
  assert.equal(deck.mode, 'derived');
  assert.deepEqual(
    deck.slides.map(({ id, order, kind }) => ({ id, order, kind })),
    [
      {
        id: 'concurrent-map-answer-question',
        order: 1,
        kind: 'interview-question',
      },
      { id: 'concurrent-map-answer-mental-model', order: 2, kind: 'mental-model' },
      { id: 'concurrent-map-answer-answer', order: 3, kind: 'interview-answer' },
    ],
  );
  assert.ok(!deck.slides.some(({ kind }) => kind === 'visual-comparison'));
});

test('builds a reviewed curated anchor deck using canonical references and stable IDs', () => {
  const anchor = question({
    summary: 'A shared reference-data cache is read and refreshed by request threads.',
    visual: {
      type: 'comparison',
      assetPath: '/content/visuals/concurrent-map.svg',
      alt: 'Locking comparison',
    },
    answerSlides: {
      schemaVersion: 'answer-slide-plan/v1',
      audienceEmphasis: ['sde', 'fde'],
      slides: [
        { id: 'prompt', kind: 'interview-question', contentRefs: [{ field: 'title' }] },
        {
          id: 'production-cache',
          kind: 'real-world-scenario',
          contentRefs: [{ field: 'summary' }],
          annotation: {
            kind: 'scenario',
            reviewStatus: 'reviewed',
            text: 'Keep the scenario inside one JVM so the concurrency boundary stays explicit.',
          },
        },
        {
          id: 'map-comparison',
          kind: 'visual-comparison',
          contentRefs: [{ field: 'visual' }],
          audienceEmphasis: ['sde'],
        },
        {
          id: 'spoken-answer',
          kind: 'interview-answer',
          contentRefs: [{ field: 'interviewAnswer' }],
        },
      ],
    },
  });
  const deck = buildAnswerSlideDeck(anchor, { detailRef });
  const reference = answerSlideDeckReference(
    deck,
    '/content/answer-slides/learn/java/questions/concurrent-map.json',
  );

  assert.equal(deck.mode, 'curated');
  assert.deepEqual(deck.audienceEmphasis, ['sde', 'fde']);
  assert.deepEqual(
    deck.slides.map(({ id }) => id),
    [
      'concurrent-map-answer-prompt',
      'concurrent-map-answer-production-cache',
      'concurrent-map-answer-map-comparison',
      'concurrent-map-answer-spoken-answer',
    ],
  );
  assert.deepEqual(deck.slides[1].contentRefs, [{ contentId: 'concurrent-map', field: 'summary' }]);
  assert.equal(reference.kind, 'answer-slides');
  assert.equal(reference.sourceVersion, detailRef.version);
  assert.match(reference.version, /^[a-f0-9]{16}$/);
});

test('rejects a curated slide whose canonical target is missing', () => {
  const missing = question({
    answerSlides: {
      schemaVersion: 'answer-slide-plan/v1',
      slides: [
        { id: 'comparison', kind: 'visual-comparison', contentRefs: [{ field: 'visuals' }] },
      ],
    },
  });

  assert.throws(
    () => buildAnswerSlideDeck(missing, { detailRef }),
    /missing canonical target visuals/,
  );
});

test('rejects stale source versions, duplicate IDs, unsupported kinds, and empty decks', () => {
  const ordinary = question();
  const deck = buildAnswerSlideDeck(ordinary, { detailRef });
  assert.throws(
    () =>
      validateAnswerSlideDeck(
        { ...deck, source: { ...deck.source, version: 'stale-version' } },
        { question: ordinary, detailRef },
      ),
    /stale source content version/,
  );
  assert.throws(
    () =>
      buildAnswerSlideDeck(
        question({
          answerSlides: {
            schemaVersion: 'answer-slide-plan/v1',
            slides: [
              { id: 'same', kind: 'interview-question', contentRefs: [{ field: 'title' }] },
              { id: 'same', kind: 'interview-answer', contentRefs: [{ field: 'interviewAnswer' }] },
            ],
          },
        }),
        { detailRef },
      ),
    /duplicate slide id same/,
  );
  assert.throws(
    () =>
      buildAnswerSlideDeck(
        question({
          answerSlides: {
            schemaVersion: 'answer-slide-plan/v1',
            slides: [{ id: 'unknown', kind: 'marketing', contentRefs: [{ field: 'title' }] }],
          },
        }),
        { detailRef },
      ),
    /unsupported slide kind marketing/,
  );
  assert.throws(
    () =>
      buildAnswerSlideDeck(
        question({
          answerSlides: { schemaVersion: 'answer-slide-plan/v1', slides: [] },
        }),
        { detailRef },
      ),
    /empty deck/,
  );
});

test('derives a deck for a legacy answer with no authored slide metadata', () => {
  const legacy = question({ answerSlides: undefined });
  const deck = buildAnswerSlideDeck(legacy, { detailRef });

  assert.equal(deck.mode, 'derived');
  assert.equal(deck.sourceContentId, legacy.id);
  assert.equal(deck.source.version, detailRef.version);
});
