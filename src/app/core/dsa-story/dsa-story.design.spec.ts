import { describe, expect, it } from 'vitest';
import {
  DsaStoryV1,
  StoryStep,
  StoryView,
  callsModel,
  linkedListModel,
  sentinelNames,
  sequenceModel,
  variableRows,
  viewSummary,
} from './dsa-story.model';
import { twoSumStory } from './dsa-story.fixture';

// Design problems (classes and helper functions): an LRU-style recency list whose nodes move,
// with dummy head/tail nodes, back links, and helpers that run above the driver's frame.
const entry = (key: number, value: number, prev: string | null, next: string | null) => ({
  $type: 'Entry',
  key,
  value,
  prev: prev ? { $ref: prev } : null,
  next: next ? { $ref: next } : null,
});
const driver = (node: string | null, extra: Record<string, unknown> = {}) =>
  ({
    operations: ['put', 'put', 'get'],
    op: 2,
    head: { $ref: 'n1' },
    tail: { $ref: 'n2' },
    node: node ? { $ref: node } : null,
    ...extra,
  }) as StoryStep['state'];

// 1) driver frame: head <-> 1 <-> 2 <-> tail
const before: StoryStep = {
  lines: ['a'],
  say: '',
  idea: 0,
  fn: 'run_lru',
  state: driver('n3'),
  heap: {
    n1: entry(0, 0, null, 'n3'),
    n3: entry(1, 10, 'n1', 'n4'),
    n4: entry(2, 20, 'n3', 'n2'),
    n2: entry(0, 0, 'n4', null),
  },
};
// 2) remove(node) running: key 1 is unlinked but still points at its old neighbours
const unlinked: StoryStep = {
  lines: ['b'],
  say: '',
  idea: 0,
  fn: 'remove',
  state: { node: { $ref: 'n3' } },
  calls: [{ fn: 'run_lru', state: driver('n3', { evicted: { $ref: 'n3' } }) }],
  heap: {
    n1: entry(0, 0, null, 'n4'),
    n3: entry(1, 10, 'n1', 'n4'),
    n4: entry(2, 20, 'n1', 'n2'),
    n2: entry(0, 0, 'n4', null),
  },
  returns: null,
};
// 3) add_recent(node) done: head <-> 2 <-> 1 <-> tail
const after: StoryStep = {
  lines: ['c'],
  say: '',
  idea: 0,
  fn: 'add_recent',
  state: { node: { $ref: 'n3' }, tail: { $ref: 'n2' } },
  calls: [{ fn: 'run_lru', state: driver('n3') }],
  heap: {
    n1: entry(0, 0, null, 'n4'),
    n4: entry(2, 20, 'n1', 'n3'),
    n3: entry(1, 10, 'n4', 'n2'),
    n2: entry(0, 0, 'n3', null),
  },
  marks: { list: { new: ['@node'] } },
  returns: null,
};
const story = {
  ...twoSumStory(),
  variables: ['operations', 'op', 'head', 'tail', 'node', 'evicted'],
  views: [
    { id: 'ops', kind: 'array', title: 'operations', var: 'operations', frame: 'bottom', pointers: [{ var: 'op' }] },
    {
      id: 'list',
      kind: 'linked-list',
      title: 'recency list',
      var: 'head',
      follow: true,
      prevField: 'prev',
      fields: ['key', 'value'],
      sentinels: ['head', 'tail'],
      pointers: [{ var: 'node' }, { var: 'evicted' }],
    },
    { id: 'calls', kind: 'calls', title: 'call stack' },
  ],
  steps: [before, unlinked, after],
} as DsaStoryV1;
const listView = story.views[1];
const xOf = (index: number) =>
  Object.fromEntries(linkedListModel(listView, story, index, 'python').nodes.map((node) => [node.text, node.x]));

describe('Option B design problems: a recency list that follows each step', () => {
  it('lays nodes out in the real order of each step, so a moved node is drawn where it now is', () => {
    expect(xOf(0)['1:10']).toBeLessThan(xOf(0)['2:20']);
    expect(xOf(2)['1:10']).toBeGreaterThan(xOf(2)['2:20']);
    expect(xOf(2)['tail']).toBeGreaterThan(xOf(2)['1:10']);
  });

  it('draws dummy nodes as named boxes, the back links, and a fixed frame size', () => {
    const model = linkedListModel(listView, story, 0, 'python');
    expect(model.nodes.filter((node) => node.sentinel).map((node) => node.text)).toEqual(['head', 'tail']);
    expect(model.edges.filter((edge) => edge.kind === 'prev').map((edge) => edge.id)).toEqual(['n3-prev', 'n4-prev', 'n2-prev']);
    expect(model.edges.filter((edge) => !edge.kind)).toHaveLength(3);
    expect(model.nullAt).toBeNull();
    const sizes = [0, 1, 2].map((index) => linkedListModel(listView, story, index, 'python'));
    expect(new Set(sizes.map((item) => `${item.width}x${item.height}`)).size).toBe(1);
  });

  it('parks an unlinked node in a second row under its old gap, with dashed links and caller pointers', () => {
    const model = linkedListModel(listView, story, 1, 'python');
    const off = model.nodes.find((node) => node.id === 'n3')!;
    const head = model.nodes.find((node) => node.id === 'n1')!;
    const two = model.nodes.find((node) => node.id === 'n4')!;
    expect(off.y).toBeGreaterThan(head.y);
    expect(off.x).toBe((head.x + two.x) / 2);
    expect(off.pointers).toEqual(['node', 'evicted']);
    expect(model.edges.filter((edge) => edge.from === 'n3').every((edge) => edge.kind === 'stale')).toBe(true);
    expect(viewSummary(listView, story, 1, 'python')).toContain('node and evicted at 1:10');
  });

  it('hangs an off-list node\'s pointer labels below it, clear of its stale links, and makes room for them', () => {
    const steps = [0, 1, 2].map((index) => linkedListModel(listView, story, index, 'python'));
    const off = steps[1].nodes.find((node) => node.id === 'n3')!;
    expect(off.labelsBelow).toBe(true);
    expect(steps[1].nodes.filter((node) => node.id !== 'n3').every((node) => !node.labelsBelow)).toBe(true);
    expect(steps[2].nodes.some((node) => node.labelsBelow)).toBe(false);
    // Two labels (node, evicted) under the parked node: the frame grows by one extra row, on every step.
    expect(steps[1].height).toBeGreaterThanOrEqual(off.y + 40 + 16 + 6);
    expect(new Set(steps.map((item) => item.height)).size).toBe(1);
  });

  it('keeps an outer-frame array pointer while a helper runs', () => {
    const model = sequenceModel(story.views[0], unlinked, 'python');
    expect(model.missing).toBe(false);
    expect(model.pointers.map((pointer) => [pointer.label, pointer.index])).toEqual([['op', 2]]);
  });

  it("shows the caller's locals in the Variables panel while a helper runs, tagged with the caller", () => {
    const rows = variableRows(story, 1, 'java');
    const op = rows.find((row) => row.name === 'op')!;
    expect(op).toMatchObject({ value: '2', unset: false, frame: 'run_lru' });
    expect(rows.find((row) => row.name === 'node')).toMatchObject({ value: 'Entry(1)' });
    expect(rows.find((row) => row.name === 'node')!.frame).toBeUndefined();
    // A recursive call never borrows its own caller's locals.
    const recursive = {
      ...story,
      steps: [{ ...unlinked, fn: 'run_lru', calls: [{ fn: 'run_lru', state: driver('n3') }] }],
    } as DsaStoryV1;
    expect(variableRows(recursive, 0, 'java').find((row) => row.name === 'op')).toMatchObject({ unset: true });
  });

  it('prints the dummy nodes by their sentinel name in the Variables panel and call-stack labels', () => {
    const rows = variableRows(story, 0, 'java');
    expect(rows.find((row) => row.name === 'head')).toMatchObject({ value: 'head' });
    expect(rows.find((row) => row.name === 'tail')).toMatchObject({ value: 'tail' });
    expect(rows.find((row) => row.name === 'node')).toMatchObject({ value: 'Entry(1)' });
    // While a helper runs, the dummies still come from the driver's frame.
    expect(sentinelNames(story, unlinked, 'python')).toEqual(new Map([['n1', 'head'], ['n2', 'tail']]));
    const calls = { id: 'calls', kind: 'calls', title: 'call stack', show: ['head', 'tail', 'node'] } as StoryView;
    const model = callsModel(calls, unlinked, 'java', undefined, sentinelNames(story, unlinked, 'java'));
    expect(model.frames.map((frame) => frame.label)).toEqual([
      'runLru(head=head, tail=tail, node=Entry(1))',
      'remove(node=Entry(1))',
    ]);
    // Without the names (no sentinels declared) a dummy prints like any other entry.
    expect(callsModel(calls, unlinked, 'java').frames[0].label).toContain('head=Entry(0)');
  });
});
