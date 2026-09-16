import { describe, expect, it } from 'vitest';
import { semanticState } from './studio-semantic-state';
import type { PatternLanguage, PatternProblemV1 } from '../../content/content.models';
import type { TraceSnapshot } from '../guided-algorithm-trace/trace-model';

function state(
  source: string,
  variables: Array<{ name: string; value: string; type?: string }>,
  language: PatternLanguage = 'python',
  id = 'test',
) {
  return semanticState(
    {
      id,
      variation: '',
      implementations: [{ language, lines: [{ id: 'line', text: source }] }],
    } as PatternProblemV1,
    { variables, unavailable: null } as TraceSnapshot,
    language,
  );
}

describe('recorded algorithm structure semantics', () => {
  it('renders differently named FIFO queues from actual operations and preserves order', () => {
    const fields = state('node = frontier.popleft()', [
      { name: 'frontier', type: 'array', value: '[4,2,7]' },
    ]);
    expect(fields[0].kind).toBe('queue');
    expect(fields[0].value).toEqual([4, 2, 7]);
  });
  it('does not label a head-indexed queue backing array as an active FIFO sequence', () => {
    expect(
      state('node = buffer[head]; head += 1', [
        { name: 'buffer', value: '[9,2,7]' },
        { name: 'head', value: '1' },
      ])[0],
    ).toMatchObject({ kind: 'queue-storage', markers: [{ name: 'head', index: 1 }] });
  });
  it('distinguishes Java front-pop deques from end-pop stacks', () => {
    expect(
      state(
        'Deque<Integer> pending = new ArrayDeque<>(); pending.push(1); pending.pop();',
        [{ name: 'pending', value: '[2,1]' }],
        'java',
      )[0],
    ).toMatchObject({ kind: 'stack', topIndex: 0 });
    expect(state('pending.pop()', [{ name: 'pending', value: '[1,2]' }])[0]).toMatchObject({
      kind: 'stack',
      topIndex: 1,
    });
  });
  it('never invents a Java PriorityQueue heap shape or sorts its recorded entries', () => {
    const field = state(
      'PriorityQueue<Integer> candidates = new PriorityQueue<>(); candidates.poll();',
      [{ name: 'candidates', value: '[1,5,2]' }],
      'java',
    )[0];
    expect(field.kind).toBe('priority-queue');
    expect(field.value).toEqual([1, 5, 2]);
  });
  it('recognizes heap operations on variables beyond the pilot heap name', () => {
    expect(
      state('heappush(pending, (cost, node))', [{ name: 'pending', value: '[[1,3],[5,2]]' }])[0]
        .kind,
    ).toBe('heap');
  });
  it('does not confuse a DFS graph placement with disjoint-set parent arrays', () => {
    expect(
      state(
        'for v in graph[u]:',
        [{ name: 'graph', value: '[[1],[0,2],[1]]' }],
        'python',
        'graph-traversal',
      )[0].kind,
    ).toBe('adjacency');
    expect(
      state('def find(x): return parent[x]', [{ name: 'parent', value: '[0,0,2]' }])[0].kind,
    ).toBe('parents');
  });
  it('retains bounded node references without inferring unrecorded children', () => {
    const node = state('node = node.left', [
      { name: 'node', type: 'object', value: '{"val":5,"left":"<cycle>","right":null}' },
    ])[0];
    expect(node.kind).toBe('node');
    expect(node.value).toEqual({ val: 5, left: '<cycle>', right: null });
  });
  it('highlights only explicit recorded source indexes, including duplicate-valued inputs', () => {
    const fields = state('answer += data[index]', [
      { name: 'data', value: '[2,2,2]' },
      { name: 'index', value: '1' },
      { name: 'value', value: '2' },
    ]);
    expect(fields[0].markers).toEqual([{ name: 'index', index: 1 }]);
    expect(
      state('answer += data[index]', [
        { name: 'data', value: '[2]' },
        { name: 'index', value: '-1' },
      ])[0].markers,
    ).toEqual([]);
  });
  it('handles actual table cells and interval geometry separately', () => {
    const table = state('answer = dp[row][column]', [
      { name: 'dp', value: '[[0,1],[2,3]]' },
      { name: 'row', value: '1' },
      { name: 'column', value: '0' },
    ])[0];
    expect(table.kind).toBe('matrix');
    expect(table.matrixMarkers).toEqual([{ row: 1, column: 0, label: 'row, column' }]);
    expect(
      state(
        'merged.append([start, end])',
        [{ name: 'merged', value: '[[1,3],[4,7]]' }],
        'python',
        'merge-intervals',
      )[0].kind,
    ).toBe('intervals');
  });
  it('preserves all relevant locals, changed inputs, empty collections and null values', () => {
    const variables = Array.from({ length: 15 }, (_, index) => ({
      name: `local${index}`,
      value: String(index),
    }));
    variables.push({ name: 'counts', value: '{}' }, { name: 'next', value: 'null' });
    expect(state('', variables)).toHaveLength(17);
    expect(state('', variables).at(-1)?.value).toBeNull();
  });
  it('distinguishes missing collection contents from an empty queue', () => {
    expect(
      state('queue.popleft()', [{ name: 'queue', type: 'queue', value: '"deque"' }])[0].kind,
    ).toBe('opaque');
    expect(
      state('queue.popleft()', [{ name: 'queue', type: 'queue', value: '[]' }])[0],
    ).toMatchObject({ kind: 'queue', value: [] });
  });
  it('does not emit stale values when a runtime snapshot is unavailable', () => {
    expect(
      semanticState(
        {} as PatternProblemV1,
        { unavailable: 'Not recorded' } as TraceSnapshot,
        'java',
      ),
    ).toEqual([]);
  });
});
