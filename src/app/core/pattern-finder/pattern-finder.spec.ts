import {
  EMPTY_ANSWERS,
  FINDER_SHAPES,
  FINDER_SIZES,
  FINDER_WANTS,
  FinderAnswers,
  RecognitionIndex,
  RecognitionProblem,
  featureWeights,
  hasAnswers,
  isRecognitionIndex,
  leaders,
  matchingUnits,
  optimalUnitsOf,
  phrasesIn,
  score,
} from './pattern-finder';

// Synthetic cards only: never real curriculum text in the public web repo.
function card(id: string, unit: number, input: RecognitionProblem['input'], wants: RecognitionProblem['wants'], size: RecognitionProblem['size'], phrases: string[] = []): RecognitionProblem {
  return { id, title: `Problem ${id}`, unit, href: `/learn/sample/${id}`, input, wants, size, phrases };
}

const index: RecognitionIndex = {
  schemaVersion: 'pattern-recognition-index/v1',
  units: [
    { n: 1, name: 'Lookup' },
    { n: 2, name: 'Window' },
    { n: 3, name: 'Branches' },
    { n: 4, name: 'Ways' },
  ],
  vocabulary: [
    { key: 'in a row', forms: ['subarray', 'substring'] },
    { key: 'seen before', forms: ['duplicate'] },
    { key: 'pair', forms: [] },
    { key: 'depth', forms: ['height'] },
    { key: 'how many ways', forms: ['number of ways'] },
  ],
  problems: [
    card('a', 1, ['array'], ['yes-no'], 'large', ['seen before']),
    card('b', 1, ['array'], ['count'], 'large', ['pair']),
    card('c', 2, ['string'], ['best'], 'large', ['in a row']),
    card('d', 2, ['string'], ['best'], 'large', ['in a row']),
    card('e', 2, ['array'], ['best'], 'large', ['in a row']),
    card('f', 3, ['tree'], ['best'], 'medium', ['depth']),
    card('g', 3, ['tree'], ['yes-no'], 'unknown'),
    card('h', 4, ['numbers'], ['count'], 'small', ['how many ways']),
    card('i', 4, ['string'], ['best'], 'large', ['in a row']),
  ],
};

const answers = (partial: Partial<FinderAnswers>): FinderAnswers => ({ ...EMPTY_ANSWERS, ...partial });
const order = (result: ReturnType<typeof score>) => result.ranked.map((unit) => unit.unit);

describe('pattern finder', () => {
  it('does not filter or reorder anything while nothing is answered', () => {
    const result = score(index, EMPTY_ANSWERS);
    expect(result.active).toBe(false);
    expect(order(result)).toEqual([1, 2, 3, 4]);
    expect(result.ranked.every((unit) => unit.score === 0 && unit.reasons.length === 0)).toBe(true);
    expect(matchingUnits(result)).toEqual([]);
    expect(leaders(result)).toEqual([]);
    expect(hasAnswers(EMPTY_ANSWERS)).toBe(false);
    // Words that name no known phrase do not filter either.
    expect(score(index, answers({ words: 'zebra' })).active).toBe(false);
    expect(hasAnswers(answers({ words: 'zebra' }))).toBe(true);
  });

  it('reads key phrases from typed words, by key or form, singular or plural', () => {
    expect(phrasesIn('longest substrings', index.vocabulary)).toEqual(['in a row']);
    expect(phrasesIn('Duplicate pairs', index.vocabulary)).toEqual(['seen before', 'pair']);
    expect(phrasesIn('  ', index.vocabulary)).toEqual([]);
    // A hyphen is a space between words (DLV-964): a statement's "in-a-row" wording still counts.
    expect(phrasesIn('seen-before', index.vocabulary)).toEqual(['seen before']);
    expect(phrasesIn('in a row', [{ key: 'in-a-row', forms: [] }])).toEqual(['in-a-row']);
  });

  it('ranks the unit whose problems agree with every check first, with the reasons and examples', () => {
    const result = score(index, answers({ input: ['string'], wants: ['best'], size: 'large', words: 'in a row' }));
    expect(result.active).toBe(true);
    expect(result.phrases).toEqual(['in a row']);
    const [first, second] = result.ranked;
    expect(first.unit).toBe(2);
    expect(second.unit).toBe(4);
    expect(first.reasons).toEqual([
      { check: 'input', value: 'string', matched: true },
      { check: 'wants', value: 'best', matched: true },
      { check: 'size', value: 'large', matched: true },
      { check: 'words', value: 'in a row', matched: true },
    ]);
    // Best matches first; title breaks ties so the examples never shuffle.
    expect(first.examples.map((example) => example.id)).toEqual(['c', 'd', 'e']);
    expect(first.examples[0]).toEqual({ id: 'c', title: 'Problem c', href: '/learn/sample/c' });
    expect(first.score).toBeGreaterThan(second.score);
    // Unit 4 has one problem just like these answers, so the answer shows both to tell apart.
    expect(leaders(result).map((unit) => unit.unit)).toEqual([2, 4]);
  });

  it('shows the top two when the runner-up is close', () => {
    const result = score(index, answers({ input: ['tree'] }));
    // Both tree problems sit in unit 3; nothing else has a tree.
    expect(leaders(result).map((unit) => unit.unit)).toEqual([3]);
    const close = score(index, answers({ wants: ['count'] }));
    expect(leaders(close).map((unit) => unit.unit)).toEqual([1, 4]);
    expect(leaders(close, 1.01)).toHaveLength(1);
  });

  it('marks a picked chip the unit lacks as not matched and ranks it lower', () => {
    const result = score(index, answers({ input: ['tree'], wants: ['count'] }));
    const branches = result.ranked.find((unit) => unit.unit === 3)!;
    expect(branches.reasons).toEqual([
      { check: 'input', value: 'tree', matched: true },
      { check: 'wants', value: 'count', matched: false },
    ]);
    expect(result.ranked[0].unit).toBe(3);
  });

  it('brings forward only units with a problem that agrees with every chip, or the best three when none does', () => {
    expect(matchingUnits(score(index, answers({ input: ['string'] })))).toEqual([2, 4]);
    expect(matchingUnits(score(index, answers({ wants: ['best'], size: 'large' })))).toEqual([2, 4]);
    // A tree that is also intervals: no card agrees, so the closest three come forward.
    const none = score(index, answers({ input: ['tree', 'intervals'] }));
    expect(none.ranked.some((unit) => unit.consistent)).toBe(false);
    expect(matchingUnits(none)).toHaveLength(3);
  });

  it('treats a size the problem does not state as neither a match nor a contradiction', () => {
    const medium = score(index, answers({ input: ['tree'], wants: ['yes-no'], size: 'medium' }));
    const branches = medium.ranked.find((unit) => unit.unit === 3)!;
    expect(branches.consistent).toBe(true);
    const notStated = score(index, answers({ size: 'unknown' }));
    expect(notStated.ranked[0].unit).toBe(3);
    expect(notStated.ranked[0].reasons).toEqual([{ check: 'size', value: 'unknown', matched: true }]);
  });

  it('weighs a feature found in few units more than one found in most', () => {
    const weights = featureWeights(index);
    expect(weights.input.get('tree')!).toBeGreaterThan(weights.input.get('string')!);
    expect(weights.wants.get('yes-no')!).toBeGreaterThan(0);
    expect(featureWeights(index)).toBe(weights); // cached per index
  });

  it('is deterministic for the same index and answers', () => {
    const picked = answers({ input: ['array'], wants: ['best', 'count'], size: 'large', words: 'subarray pair' });
    expect(score(index, picked)).toEqual(score(index, picked));
    expect(score({ ...index, problems: [...index.problems].reverse() }, picked).ranked.map((unit) => [unit.unit, unit.score])).toEqual(
      score(index, picked).ranked.map((unit) => [unit.unit, unit.score]),
    );
  });

  it('loads a v2 index: reviewed cards, derived optimal units and tell-apart notes are optional extras', () => {
    const reviewed: RecognitionProblem = { ...card('j', 4, ['intervals'], ['best'], 'large', ['in a row']), reviewed: true, optimalUnits: [4, 2], tellApart: 'Ways when the sum can reset.' };
    const v2: RecognitionIndex = { ...index, schemaVersion: 'pattern-recognition-index/v2', problems: [...index.problems, reviewed] };
    expect(isRecognitionIndex(v2)).toBe(true);
    expect(isRecognitionIndex({ ...v2, problems: [{ ...reviewed, optimalUnits: ['two'] }] })).toBe(false);
    expect(isRecognitionIndex({ ...v2, problems: [{ ...reviewed, reviewed: 'yes' }] })).toBe(false);
    expect(isRecognitionIndex({ ...v2, problems: [{ ...reviewed, tellApart: 7 }] })).toBe(false);
    // The problem's own unit always comes first and is never repeated.
    expect(optimalUnitsOf(reviewed)).toEqual([4, 2]);
    expect(optimalUnitsOf({ ...reviewed, optimalUnits: [2, 4, 2] })).toEqual([4, 2]);
    expect(optimalUnitsOf(index.problems[0])).toEqual([1]);
    // The scorer itself only lets each card vote for its own unit; the note travels with the best match.
    const result = score(v2, answers({ input: ['intervals'], wants: ['best'], size: 'large', words: 'subarray' }));
    expect(result.ranked[0].unit).toBe(4);
    expect(result.ranked[0].tellApart).toBe('Ways when the sum can reset.');
    expect(result.ranked.find((unit) => unit.unit === 2)?.tellApart).toBeUndefined();
    expect(score(v2, EMPTY_ANSWERS).ranked.every((unit) => unit.tellApart === undefined)).toBe(true);
  });

  it('scores the new wants like any other chip', () => {
    const v2: RecognitionIndex = {
      ...index,
      schemaVersion: 'pattern-recognition-index/v2',
      problems: [...index.problems, card('k', 1, ['linked-list'], ['changed'], 'medium'), card('l', 3, ['numbers'], ['value'], 'unknown')],
    };
    expect(score(v2, answers({ wants: ['changed'] })).ranked[0].unit).toBe(1);
    expect(score(v2, answers({ wants: ['value'] })).ranked[0].unit).toBe(3);
    expect(score(v2, answers({ wants: ['changed'] })).ranked[0].reasons).toEqual([{ check: 'wants', value: 'changed', matched: true }]);
  });

  it('accepts only a v1 or v2 index with well-formed cards', () => {
    expect(isRecognitionIndex(index)).toBe(true);
    expect(isRecognitionIndex(null)).toBe(false);
    expect(isRecognitionIndex({ ...index, schemaVersion: 'pattern-recognition-index/v0' })).toBe(false);
    expect(isRecognitionIndex({ ...index, problems: [{ ...index.problems[0], unit: 'one' }] })).toBe(false);
    expect(isRecognitionIndex({ ...index, vocabulary: undefined })).toBe(false);
  });

  it('offers every check in the agreed order with short labels', () => {
    expect(FINDER_SHAPES.map((item) => item.value)).toEqual(['string', 'array', 'grid', 'tree', 'linked-list', 'graph', 'intervals', 'numbers']);
    expect(FINDER_WANTS.map((item) => item.value)).toEqual(['count', 'best', 'yes-no', 'all', 'kth', 'order', 'structure', 'changed', 'value']);
    // The hints settle the blind-pilot look-alikes (DLV-964): a minimum count is "the best", a per-element count is "a count".
    expect(FINDER_WANTS.find((item) => item.value === 'best')?.hint).toContain('minimum number of');
    expect(FINDER_WANTS.find((item) => item.value === 'count')?.hint).toContain('per element');
    // "The k-th" is a rank by size or order; the symbol at position k of a generated row is one value.
    expect(FINDER_WANTS.find((item) => item.value === 'kth')?.hint).toContain('largest or smallest');
    expect(FINDER_SIZES.map((item) => item.label)).toEqual(['n ≤ 20', 'up to about 10⁴', '10⁵ and more', 'not stated']);
  });
});
