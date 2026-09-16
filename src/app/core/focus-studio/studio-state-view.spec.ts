import { describe, expect, it } from 'vitest';
import { DsaProblemFixtureV2, PatternProblemV1 } from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import {
  currentInputIndices,
  parseRecordedValue,
  recordedMapEntries,
  sourceOrderedLocals,
} from './studio-state-view';

const problem = {
  id: 'algorithmic-kth-largest-element-array',
  implementations: [
    {
      language: 'python',
      lines: [
        { id: 'signature', text: 'def example(nums, k):' },
        { id: 'init', text: '    heap = []' },
        { id: 'loop', text: '    for value in nums:' },
        { id: 'body', text: '        observe(value)' },
        { id: 'return', text: '    return heap[0]' },
      ],
    },
  ],
} as unknown as PatternProblemV1;
const fixture = { arguments: { nums: [3, 3], k: 2 } } as unknown as DsaProblemFixtureV2;
const snapshot = {
  step: 2,
  unavailable: null,
  events: ['loop', 'body', 'loop'].map((anchor) => ({ sourceAnchor: { python: anchor } })),
  event: { sourceAnchor: { python: 'loop' } },
  variables: [
    { name: 'value', value: '3' },
    { name: 'heap', value: '[3]' },
    { name: 'k', value: '2' },
    { name: 'nums', value: '[3,3]' },
    { name: 'heapq', value: '"module"' },
  ],
  rows: [],
} as unknown as TraceSnapshot;

describe('recorded state presentation', () => {
  it('distinguishes duplicate input positions using recorded loop entries', () => {
    expect(currentInputIndices(problem, fixture, snapshot, 'python', 'nums')).toEqual([1]);
    expect(
      currentInputIndices(
        problem,
        fixture,
        {
          ...snapshot,
          event: {
            ...snapshot.event!,
            sourceAnchor: { ...snapshot.event!.sourceAnchor, python: 'return' },
          },
        },
        'python',
        'nums',
      ),
    ).toEqual([]);
  });
  it('does not highlight unavailable or unrelated input indexes', () => {
    expect(
      currentInputIndices(
        problem,
        fixture,
        { ...snapshot, unavailable: 'Missing state' },
        'python',
        'nums',
      ),
    ).toEqual([]);
    expect(
      currentInputIndices(
        { ...problem, id: 'algorithmic-number-connected-components-graph' },
        fixture,
        { ...snapshot, variables: [{ name: 'i', type: 'integer', value: '1' }] },
        'python',
        'nums',
      ),
    ).toEqual([]);
  });
  it('shows inputs separately and keeps locals in source order', () => {
    expect(
      sourceOrderedLocals(problem, fixture, snapshot, 'python').map((item) => item.name),
    ).toEqual(['heap', 'value']);
  });
  it('parses recorded numeric maps without interpreting arbitrary text', () => {
    expect(parseRecordedValue('{2: 0, 3: 1}')).toEqual({ '2': 0, '3': 1 });
    expect(parseRecordedValue('{2=0, 3=1}')).toEqual({ '2': 0, '3': 1 });
    expect(parseRecordedValue('{2: execute()}')).toBe('{2: execute()}');
  });
  it('parses runtime maps with recorded node objects as keys', () => {
    expect(
      recordedMapEntries(
        '{{"value":5,"left":"<Node>"}:{"value":3,"left":"<cycle>"},{"value":1}:{"value":3}}',
      ),
    ).toEqual([
      { key: { value: 5, left: '<Node>' }, value: { value: 3, left: '<cycle>' } },
      { key: { value: 1 }, value: { value: 3 } },
    ]);
  });
});
