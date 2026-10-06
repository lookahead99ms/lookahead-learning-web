import { describe, expect, it } from 'vitest';
import {
  DsaStoryV1,
  StoryStep,
  callsModel,
  fillSay,
  formatValue,
  graphModel,
  gridModel,
  isDsaStory,
  languageLines,
  linkedListModel,
  mapModel,
  resolveSelector,
  sequenceModel,
  stepRanges,
  treeModel,
  variableRows,
  viewSummary,
  viewTones,
} from './dsa-story.model';
import { twoSumProblem, twoSumStory } from './dsa-story.fixture';
import { diagramFrame } from './dsa-story';

describe('Option B story model', () => {
  it('accepts a well-formed story and rejects anything else', () => {
    expect(isDsaStory(twoSumStory(), 'algorithmic-two-sum')).toBe(true);
    expect(isDsaStory(twoSumStory(), 'another-problem')).toBe(false);
    expect(isDsaStory({ ...twoSumStory(), schemaVersion: 'dsa-story/v2' })).toBe(false);
    expect(isDsaStory({ ...twoSumStory(), steps: [] })).toBe(false);
    expect(isDsaStory({ ...twoSumStory(), views: [{ id: 'x', kind: 'hologram' }] })).toBe(false);
    expect(isDsaStory(null)).toBe(false);
  });

  it('formats typed values in the selected language', () => {
    const heap = { n1: { $type: 'ListNode', val: 3, next: null } };
    expect(formatValue(null, 'python')).toBe('None');
    expect(formatValue(null, 'java')).toBe('null');
    expect(formatValue(null, 'go')).toBe('nil');
    expect(formatValue(true, 'python')).toBe('True');
    expect(formatValue(true, 'go')).toBe('true');
    expect(formatValue({ $map: [[2, 0], [7, 1]] }, 'java')).toBe('{2: 0, 7: 1}');
    expect(formatValue({ $set: [] }, 'java')).toBe('empty set');
    expect(formatValue({ $tuple: [1, 'a'] }, 'python')).toBe('(1, "a")');
    expect(formatValue({ $num: 'inf' }, 'python')).toBe('∞');
    // List nodes print language-neutrally: the Python reference may name its class Node.
    expect(formatValue({ $ref: 'n1' }, 'java', heap)).toBe('node 3');
    expect(formatValue({ $ref: 'n1' }, 'python', heap)).toBe('node 3');
    const others = {
      t1: { $type: 'TreeNode', val: 9, left: null, right: null, next: null },
      e1: { $type: 'Entry', key: 1, value: 10, prev: null, next: null },
    };
    expect(formatValue({ $ref: 't1' }, 'python', others)).toBe('TreeNode(9)');
    expect(formatValue({ $ref: 'e1' }, 'go', others)).toBe('Entry(1)');
    expect(formatValue(undefined, 'java')).toBe('—');
    expect(formatValue(Array.from({ length: 200 }, (_, i) => i), 'java', {}, 20)).toHaveLength(20);
  });

  it('resolves mark selectors with the checker grammar', () => {
    const state = { i: 2, j: 1, key: 'a' };
    expect(resolveSelector('@i', state)).toEqual([2]);
    expect(resolveSelector('@i+1', state)).toEqual([3]);
    expect(resolveSelector('..@i-1', state)).toEqual([0, 1]);
    expect(resolveSelector('@i..', state, 4)).toEqual([2, 3]);
    expect(resolveSelector('@i,@j', state)).toEqual(['2,1']);
    expect(resolveSelector('@key', state)).toEqual(['a']);
    expect(resolveSelector('"x"', state)).toEqual(['x']);
    expect(resolveSelector('n3', state)).toEqual(['n3']);
    expect(resolveSelector(5, state)).toEqual([5]);
    expect(resolveSelector('@missing', state)).toEqual([]);
  });

  it('resolves a local offset such as dp[i - coin]', () => {
    const state = { i: 7, coin: 5, j: 1, key: 'a' };
    expect(resolveSelector('@i-@coin', state)).toEqual([2]);
    expect(resolveSelector('@j+@j..', state, 4)).toEqual([2, 3]);
    expect(resolveSelector('@i-@coin,@j', state)).toEqual(['2,1']);
    expect(resolveSelector('@i-@key', state)).toEqual([]);
    expect(resolveSelector('@i-@missing', state)).toEqual([]);
  });

  it('draws the array with its pointer and tones from the step marks', () => {
    const story = twoSumStory();
    const step = story.steps[4];
    const model = sequenceModel(story.views[0], step, 'java');
    expect(model.cells.map((cell) => cell.text)).toEqual(['2', '7', '11', '15']);
    expect(model.cells[0].tones).toEqual(['done']);
    expect(model.cells[1].tones).toEqual(['active']);
    expect(model.pointers).toEqual([{ label: 'index', index: 1, slot: 1, past: false, row: 0 }]);
    expect(sequenceModel(story.views[0], story.steps[0], 'java').pointers).toEqual([]);
  });

  it('shows map entries, the lookup miss and the found key', () => {
    const story = twoSumStory();
    const miss = mapModel(story.views[1], story.steps[2], 'python');
    expect(miss.entries).toEqual([]);
    expect(miss.misses).toEqual(['7']);
    const found = mapModel(story.views[1], story.steps[4], 'python');
    expect(found.entries).toEqual([{ key: '2', value: '0', tones: ['found'] }]);
    expect(found.misses).toEqual([]);
    expect(viewTones(story.steps[3], 'seen').get('2')).toEqual(['new']);
  });

  it('fills caption placeholders from the real state', () => {
    const story = twoSumStory();
    expect(fillSay(story.steps[1], 'java')).toBe('value = 2, need = 7.');
    expect(fillSay(story.steps[5], 'java')).toBe('return [0, 1].');
    expect(fillSay({ ...story.steps[0], say: 'keep {unknown}' }, 'java')).toBe('keep {unknown}');
  });

  it('lists every local, highlights changes and ends with the result', () => {
    const story = twoSumStory();
    const first = variableRows(story, 0, 'python');
    expect(first.map((row) => row.name)).toEqual([
      'values', 'target', 'seen', 'index', 'value', 'need', 'result',
    ]);
    expect(first.find((row) => row.name === 'index')).toMatchObject({ value: 'not set yet', unset: true });
    expect(first.find((row) => row.name === 'result')?.value).toBe('not returned yet');
    const third = variableRows(story, 3, 'python');
    expect(third.filter((row) => row.changed).map((row) => row.name)).toEqual(['seen']);
    const last = variableRows(story, story.steps.length - 1, 'go');
    expect(last.at(-1)).toMatchObject({ name: 'result', value: '[0, 1]', changed: true });
    const renamed = variableRows({ ...story, names: { java: { seen: 'seenIndex' } } }, 0, 'java');
    expect(renamed[2].name).toBe('seenIndex');
  });

  it('names the returned value "returned" when the code has a local named result', () => {
    const story = twoSumStory();
    story.variables = [...story.variables, 'result'];
    story.steps = story.steps.map((step) => ({ ...step, state: { ...step.state, result: [] } }));
    const names = variableRows(story, story.steps.length - 1, 'python').map((row) => row.name);
    expect(names.slice(-2)).toEqual(['result', 'returned']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('maps each step to the lines that ran in every language', () => {
    const story = twoSumStory();
    const problem = twoSumProblem();
    expect(stepRanges(story)).toEqual([[0, 0], [1, 3], [4, 4], [5, 5], [6, 9], [10, 10]]);
    expect(languageLines(problem, story, 'python')[1]).toEqual({
      current: 'py-5',
      ran: ['py-3', 'py-4', 'py-5'],
    });
    const java = languageLines(problem, story, 'java');
    // The second native line of event 4 moves to the store step instead of swallowing it.
    expect(java[2]).toEqual({ current: 'j-6', ran: ['j-6'] });
    expect(java[3]).toEqual({ current: 'j-9', ran: ['j-9'] });
    expect(java[4].ran).toEqual(['j-3', 'j-4', 'j-5', 'j-6']);
    expect(java[5]).toEqual({ current: 'j-7', ran: ['j-7'] });
  });

  it('gives a text alternative for every view', () => {
    const story = twoSumStory();
    expect(viewSummary(story.views[0], story, 4, 'java')).toBe(
      'values: 2, 7, 11, 15. index at index 1. current: index 1; done: index 0.',
    );
    expect(viewSummary(story.views[1], story, 2, 'java')).toBe(
      'seen: empty. Looked up 7: not present.',
    );
  });
});

describe('Option B node and frame views', () => {
  const listStep: StoryStep = {
    lines: ['a'],
    say: '',
    idea: 0,
    state: { head: { $ref: 'n1' }, previous: { $ref: 'n1' }, current: { $ref: 'n2' } },
    heap: {
      n1: { $type: 'ListNode', val: 1, next: null },
      n2: { $type: 'ListNode', val: 2, next: { $ref: 'n3' } },
      n3: { $type: 'ListNode', val: 3, next: null },
    },
    marks: { list: { active: ['@current'] } },
  };
  const firstStep: StoryStep = {
    ...listStep,
    state: { head: { $ref: 'n1' }, previous: null, current: { $ref: 'n1' } },
    heap: {
      n1: { $type: 'ListNode', val: 1, next: { $ref: 'n2' } },
      n2: { $type: 'ListNode', val: 2, next: { $ref: 'n3' } },
      n3: { $type: 'ListNode', val: 3, next: null },
    },
    marks: {},
  };
  const listStory = {
    ...twoSumStory(),
    views: [
      {
        id: 'list',
        kind: 'linked-list',
        title: 'list',
        var: 'head',
        pointers: [{ var: 'previous' }, { var: 'current' }],
      },
    ],
    steps: [firstStep, listStep],
  } as DsaStoryV1;

  it('frames a node drawing so wide labels are never cut, and never shrinks text below 12 px', () => {
    const model = linkedListModel(listStory.views[0], listStory, 0, 'java');
    const plain = diagramFrame(model);
    expect(plain.viewBox.split(' ').map(Number).slice(0, 2)).toEqual([0, -34]);
    // A long pointer name over the first node widens the box to the left.
    const named = diagramFrame({
      ...model,
      nodes: model.nodes.map((node, index) => (index ? node : { ...node, pointers: ['greater_dummy'] })),
    });
    const [left, , width] = named.viewBox.split(' ').map(Number);
    expect(left).toBeLessThan(0);
    expect(left).toBeLessThanOrEqual(40 - ('greater_dummy'.length * 14 * 0.62) / 2);
    expect(width).toBeGreaterThan(plain.width);
    // 14 px labels at no less than 12/14 scale.
    expect(named.min).toBe(Math.ceil((named.width * 12) / 14));
  });

  it('keeps list nodes in place and follows the real next fields', () => {
    const start = linkedListModel(listStory.views[0], listStory, 0, 'java');
    expect(start.nodes.map((node) => node.text)).toEqual(['1', '2', '3']);
    expect(start.nullPointers).toEqual(['previous']);
    const later = linkedListModel(listStory.views[0], listStory, 1, 'java');
    expect(later.nodes.map((node) => node.x)).toEqual(start.nodes.map((node) => node.x));
    expect(later.edges.find((edge) => edge.from === 'n1')?.to).toBe('null');
    expect(later.nodes[0].pointers).toEqual(['previous']);
    expect(later.nodes[1]).toMatchObject({ pointers: ['current'], tones: ['active'] });
  });

  it('draws a reversed link as a straight left arrow and names list pointers per language', () => {
    const flipped: StoryStep = {
      ...listStep,
      state: { head: { $ref: 'n1' }, previous: { $ref: 'n2' }, current: { $ref: 'n3' }, nxt: { $ref: 'n3' } },
      heap: {
        n1: { $type: 'ListNode', val: 1, next: null },
        n2: { $type: 'ListNode', val: 2, next: { $ref: 'n1' } },
        n3: { $type: 'ListNode', val: 3, next: null },
      },
    };
    const story = {
      ...listStory,
      views: [{ ...listStory.views[0], pointers: [{ var: 'previous' }, { var: 'nxt' }] }],
      names: { java: { nxt: 'next' }, go: { nxt: 'next' } },
      steps: [firstStep, flipped],
    } as DsaStoryV1;
    const java = linkedListModel(story.views[0], story, 1, 'java');
    const back = java.edges.find((edge) => edge.from === 'n2')!;
    expect(back).toMatchObject({ to: 'n1', directed: true });
    expect(back.path).toBe('M102 70H66');
    expect(java.nodes[2].pointers).toEqual(['next']);
    expect(linkedListModel(story.views[0], story, 1, 'python').nodes[2].pointers).toEqual(['nxt']);
    // Two nodes that point at each other keep a curve, so the arrows never overlap.
    const loop = { ...flipped, heap: { ...flipped.heap, n1: { $type: 'ListNode', val: 1, next: { $ref: 'n2' } } } };
    const cycle = linkedListModel(story.views[0], { ...story, steps: [firstStep, loop] }, 1, 'java');
    expect(cycle.edges.find((edge) => edge.from === 'n2')?.path).toMatch(/^M124 92C/);
  });

  it('lays out a tree in order and reads the outermost call for the root', () => {
    const step: StoryStep = {
      lines: ['a'],
      say: '',
      idea: 0,
      fn: 'depth',
      state: { root: { $ref: 'n2' } },
      calls: [{ fn: 'depth', state: { root: { $ref: 'n1' } } }],
      heap: {
        n1: { $type: 'TreeNode', val: 3, left: { $ref: 'n2' }, right: { $ref: 'n3' } },
        n2: { $type: 'TreeNode', val: 9, left: null, right: null },
        n3: { $type: 'TreeNode', val: 20, left: null, right: null },
      },
      marks: { tree: { active: ['@root'] } },
    };
    const view = { id: 'tree', kind: 'tree' as const, title: 'tree', var: 'root', pointers: [{ var: 'root' }] };
    const model = treeModel(view, step, 'java');
    expect(model.nodes.map((node) => node.text)).toEqual(['9', '3', '20']);
    expect(model.nodes[0]).toMatchObject({ tones: ['active'], pointers: ['root'] });
    expect(model.edges).toHaveLength(2);
    const calls = callsModel({ id: 'calls', kind: 'calls', title: 'call stack' }, step, 'java');
    expect(calls.frames.map((frame) => frame.label)).toEqual([
      'depth(root=TreeNode(3))',
      'depth(root=TreeNode(9))',
    ]);
    expect(calls.frames[1].current).toBe(true);
  });

  it('draws graphs from adjacency maps and grids with a cursor', () => {
    const step: StoryStep = {
      lines: ['a'],
      say: '',
      idea: 0,
      state: {
        graph: { $map: [[0, [1, 2]], [1, [0]], [2, [0]]] },
        grid: [[1, 0], [0, 1]],
        r: 1,
        c: 0,
      },
      marks: { g: { done: [0] }, m: { active: ['@r,@c'] } },
    };
    const graph = graphModel({ id: 'g', kind: 'graph', title: 'g', var: 'graph' }, step, 'java');
    expect(graph.nodes.map((node) => node.text)).toEqual(['0', '1', '2']);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes[0].tones).toEqual(['done']);
    const grid = gridModel({ id: 'm', kind: 'grid', title: 'm', var: 'grid', cursor: ['r', 'c'] }, step, 'java');
    expect(grid.cursor).toEqual([1, 0]);
    expect(grid.rows[1][0].tones).toEqual(['active']);
  });

  it('splits string grid rows into cells and draws a grid as a graph of its land cells', () => {
    const step: StoryStep = {
      lines: ['a'],
      say: '',
      idea: 0,
      state: { grid: ['110', '011'], r: 0, c: 1, nr: 1, nc: 1 },
      marks: {
        m: { active: ['@r,@c'] },
        g: { active: ['@r,@c'], compare: ['@nr,@nc'], done: ['0,0'] },
      },
    };
    const grid = gridModel({ id: 'm', kind: 'grid', title: 'm', var: 'grid' }, step, 'java');
    expect(grid.rows.map((row) => row.map((cell) => cell.text))).toEqual([
      ['1', '1', '0'],
      ['0', '1', '1'],
    ]);
    expect(grid.rows[0][1].tones).toEqual(['active']);

    const view = { id: 'g', kind: 'graph' as const, title: 'g', var: 'grid', gridNodes: ['1'] };
    const graph = graphModel(view, step, 'java');
    expect(graph.nodes.map((node) => node.text)).toEqual(['0,0', '0,1', '1,1', '1,2']);
    // Only up/down/left/right land neighbours are joined: 0,0-0,1, 0,1-1,1, 1,1-1,2.
    expect(graph.edges.map((edge) => `${edge.from}|${edge.to}`)).toEqual([
      '"0,0"|"0,1"',
      '"0,1"|"1,1"',
      '"1,1"|"1,2"',
    ]);
    const byText = new Map(graph.nodes.map((node) => [node.text, node]));
    expect(byText.get('0,1')!.tones).toEqual(['active']);
    expect(byText.get('1,1')!.tones).toEqual(['compare']);
    expect(byText.get('0,0')!.tones).toEqual(['done']);
    // Nodes sit in grid position, rows down and columns across.
    expect(byText.get('1,2')!.x).toBeGreaterThan(byText.get('1,1')!.x);
    expect(byText.get('1,1')!.y).toBeGreaterThan(byText.get('0,1')!.y);
    expect(byText.get('1,1')!.x).toBe(byText.get('0,1')!.x);
    expect(viewSummary(view, { ...twoSumStory(), views: [view], steps: [step] }, 0, 'java')).toContain('4 nodes');
  });
});
