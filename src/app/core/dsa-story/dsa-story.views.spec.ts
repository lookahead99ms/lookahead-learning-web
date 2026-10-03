import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DsaStory } from './dsa-story';
import {
  DsaStoryV1,
  StoryStep,
  StoryView,
  bitsModel,
  fillSay,
  graphModel,
  isDsaStory,
  linkedListModel,
  mapModel,
  nodeLabel,
  numberLineModel,
  outOfScope,
  sequenceModel,
  shownStep,
  trieModel,
  variableRows,
  viewSummary,
} from './dsa-story.model';
import { twoSumProblem, twoSumStory } from './dsa-story.fixture';

// Views added for the last Option B problems: strings walked by index, very long (sparse)
// tables, number lines, bits, tries, graphs and lists of objects (cycles, random pointers),
// instance fields (self.heap), map values shown as chains, and midline steps.
const step = (state: StoryStep['state'], extra: Partial<StoryStep> = {}): StoryStep => ({
  lines: ['py-1'],
  say: '',
  idea: 0,
  state,
  ...extra,
});
const storyWith = (views: StoryView[], steps: StoryStep[], variables: string[]): DsaStoryV1 => ({
  ...twoSumStory(),
  views,
  variables,
  steps,
});

describe('Option B string view', () => {
  const view: StoryView = { id: 's', kind: 'string', title: 'text', var: 'text', pointers: [{ var: 'i' }, { var: 'j' }] };

  it('draws one cell per character, a space as a visible mark, and index pointers', () => {
    const model = sequenceModel(view, step({ text: 'ab c', i: 1, j: 4 }, { marks: { s: { active: ['@i'] } } }), 'python');
    expect(model.missing).toBe(false);
    expect(model.cells.map((cell) => cell.text)).toEqual(['a', 'b', '␣', 'c']);
    expect(model.cells[1].tones).toEqual(['active']);
    expect(model.pointers.map((p) => [p.label, p.slot, p.past])).toEqual([
      ['i', 1, false],
      ['j', 4, true],
    ]);
  });

  it('draws an empty string as empty and a missing local as not created', () => {
    expect(sequenceModel(view, step({ text: '' }), 'go').cells).toEqual([]);
    expect(sequenceModel(view, step({}), 'go').missing).toBe(true);
    // A string is never read as an array of cells by the other sequence views.
    expect(sequenceModel({ ...view, kind: 'array' }, step({ text: 'ab' }), 'go').missing).toBe(true);
  });

  it('reads characters in the text alternative', () => {
    const story = storyWith([view], [step({ text: 'abc', i: 0, j: 3 })], ['text', 'i', 'j']);
    expect(viewSummary(view, story, 0, 'python')).toBe('text: abc. i at index 0, j at the end.');
  });
});

describe('Option B windowed array (a sparse 100,001-cell table)', () => {
  const view: StoryView = { id: 'count', kind: 'array', title: 'count', var: 'count', window: true, pointers: [{ var: 'lower' }, { var: 'target' }] };
  const count = { $sparse: { length: 100001, fill: 0, items: [[1, 1], [2, 1], [4, 1]] as [number, number][] } };

  it('draws only the cells in use, with gaps for the hidden runs and pointers on the shown cells', () => {
    const model = sequenceModel(view, step({ count, lower: 1, target: 3 }, { marks: { count: { new: ['@target'] } } }), 'java');
    expect(model.cells.map((cell) => (cell.gap ? `…${cell.gap}` : `${cell.index}:${cell.text}`))).toEqual([
      '0:0',
      '1:1',
      '2:1',
      '3:0',
      '4:1',
      '…99996',
    ]);
    expect(model.cells[3].tones).toEqual(['new']);
    expect(model.pointers.map((p) => [p.label, p.index, p.slot])).toEqual([
      ['lower', 1, 1],
      ['target', 3, 3],
    ]);
    expect(model.note).toBe('window of 100,001 cells');
  });

  it('collapses a long hidden run between two cells in use', () => {
    const far = { $sparse: { length: 50, fill: 0, items: [[2, 5], [40, 1]] as [number, number][] } };
    const model = sequenceModel(view, step({ count: far }), 'java');
    expect(model.cells.map((cell) => (cell.gap ? `…${cell.index}+${cell.gap}` : String(cell.index)))).toEqual([
      '0',
      '1',
      '2',
      '…3+37',
      '40',
      '…41+9',
    ]);
  });
});

describe('Option B number line and bits', () => {
  it('places int locals on a number line between two bounds', () => {
    const view: StoryView = { id: 'roots', kind: 'number-line', title: 'roots', min: 0, max: '@right', pointers: [{ var: 'left' }, { var: 'right' }] };
    const model = numberLineModel(view, step({ left: 1, right: 2 }, { marks: { roots: { found: ['@left', '@right'] } } }));
    expect(model.cells.map((cell) => cell.text)).toEqual(['0', '1', '2']);
    expect(model.cells.map((cell) => cell.tones)).toEqual([[], ['found'], ['found']]);
    expect(model.pointers.map((p) => [p.label, p.slot])).toEqual([
      ['left', 1],
      ['right', 2],
    ]);
    expect(numberLineModel(view, step({ left: 0 })).missing).toBe(true);
    // An open range runs to the last number on the line.
    const open = numberLineModel(view, step({ left: 0, right: 3 }, { marks: { roots: { dim: ['@left+2..'] } } }));
    expect(open.cells.filter((cell) => cell.tones.includes('dim')).map((cell) => cell.index)).toEqual([2, 3]);
  });

  it('says a local is no longer in scope once its call has returned', () => {
    const view: StoryView = { id: 'v', kind: 'array', title: 'values', var: 'values' };
    const story = storyWith(
      [view],
      [step({ k: 1 }), step({ values: [4, 5] }), step({ value: 3 })],
      ['values', 'k', 'value'],
    );
    expect(outOfScope(view, story, 0)).toBe(false);
    expect(outOfScope(view, story, 2)).toBe(true);
    expect(viewSummary(view, story, 0, 'python')).toBe('values: not created yet.');
    expect(viewSummary(view, story, 2, 'python')).toBe('values: no longer in scope.');
  });

  it('draws an int as binary digits, highest bit first, and a negative in two’s complement', () => {
    const view: StoryView = { id: 'a', kind: 'bits', title: 'a', var: 'a', width: 4 };
    const model = bitsModel(view, step({ a: 5 }, { marks: { a: { active: [0, 2] } } }));
    expect(model.cells.map((cell) => cell.text).join('')).toBe('0101');
    expect(model.cells.map((cell) => cell.index)).toEqual([3, 2, 1, 0]);
    expect(model.cells.filter((cell) => cell.tones.length).map((cell) => cell.index)).toEqual([2, 0]);
    expect(model.note).toBe('= 5');
    expect(bitsModel(view, step({ a: -1 })).cells.map((cell) => cell.text).join('')).toBe('1111');
    const story = storyWith([view], [step({ a: 5 })], ['a']);
    expect(viewSummary(view, story, 0, 'python')).toBe('a (highest bit first): 0, 1, 0, 1 = 5.');
  });
});

describe('Option B trie view', () => {
  // root -a-> n2 -t-> n3 (end), root -b-> n4 (end); node (in the caller) on n2; child null.
  const node = (children: [string, string][], end: boolean) => ({
    $type: 'Node',
    children: { $map: children.map(([char, ref]) => [char, { $ref: ref }]) },
    terminal: end,
  });
  const heap = {
    n1: node([['a', 'n2'], ['b', 'n4']], false),
    n2: node([['t', 'n3']], false),
    n3: node([], true),
    n4: node([], true),
    n5: node([], false),
  } as unknown as StoryStep['heap'];
  const view: StoryView = { id: 't', kind: 'trie', title: 'trie', var: 'root', pointers: [{ var: 'node' }, { var: 'child' }, { var: 'self' }] };

  it('lays the trie out from the children maps, with characters, word ends and pointers', () => {
    const at = step(
      { self: { $ref: 'n5' }, child: null },
      { fn: '__init__', calls: [{ fn: 'driver', state: { root: { $ref: 'n1' }, node: { $ref: 'n2' } } }], heap, marks: { t: { active: ['n2'] } } },
    );
    const model = trieModel(view, at, 'java');
    const byId = new Map(model.nodes.map((item) => [item.id, item]));
    expect(byId.get('n1')).toMatchObject({ text: 'root', sentinel: true });
    expect([byId.get('n2')!.text, byId.get('n3')!.text, byId.get('n4')!.text]).toEqual(['a', 't', 'b']);
    expect(byId.get('n3')!.end).toBe(true);
    expect(byId.get('n2')!.end).toBeUndefined();
    // Children sit one level down; a parent is centred over its children.
    expect(byId.get('n3')!.y).toBeGreaterThan(byId.get('n2')!.y);
    expect(byId.get('n2')!.x).toBe(byId.get('n3')!.x);
    expect(byId.get('n2')!.pointers).toEqual(['node']);
    expect(byId.get('n2')!.tones).toEqual(['active']);
    // A node built but not linked in yet is drawn apart with its pointer.
    expect(byId.get('n5')!.pointers).toEqual(['self']);
    expect(model.edges.map((edge) => `${edge.from}-${edge.to}`).sort()).toEqual(['n1-n2', 'n1-n4', 'n2-n3']);
    expect(model.nullPointers).toEqual(['child']);
    const story = storyWith([view], [at], ['root', 'node', 'child', 'self']);
    expect(viewSummary(view, story, 0, 'python')).toContain('a word ends at t, b');
  });

  it('reads a trie held in an instance field (dictionary.root)', () => {
    const fieldView: StoryView = { id: 't', kind: 'trie', title: 'trie', var: 'dictionary', field: 'root' };
    const withOwner = { ...heap, n9: { $type: 'WordDictionary', root: { $ref: 'n1' } } } as StoryStep['heap'];
    const model = trieModel(fieldView, step({ dictionary: { $ref: 'n9' } }, { heap: withOwner }), 'python');
    expect(model.nodes).toHaveLength(4);
  });
});

describe('Option B objects: graphs with cycles, random pointers, instance fields', () => {
  const graphNode = (val: number, neighbors: string[]) => ({ $type: 'GraphNode', val, neighbors: neighbors.map((ref) => ({ $ref: ref })) });

  it('draws a cyclic object graph once per node, keyed by heap label', () => {
    const heap = { n1: graphNode(1, ['n2', 'n3']), n2: graphNode(2, ['n1', 'n3']), n3: graphNode(3, ['n2', 'n1']) } as StoryStep['heap'];
    const view: StoryView = { id: 'g', kind: 'graph', title: 'input', var: 'node', neighbors: 'neighbors', pointers: [{ var: 'node' }] };
    const model = graphModel(view, step({ node: { $ref: 'n1' } }, { heap, marks: { g: { active: ['@node'], compare: ['n2'] } } }), 'python');
    expect(model.nodes.map((item) => item.text)).toEqual(['1', '2', '3']);
    expect(model.edges).toHaveLength(3);
    expect(model.nodes[0].pointers).toEqual(['node']);
    expect(model.edges.find((edge) => edge.tone)?.tone).toBe('compare');
  });

  it('draws the copies held as map values, with directed edges side by side when both exist', () => {
    const heap = {
      n1: graphNode(1, []),
      n4: graphNode(1, ['n5']),
      n5: graphNode(2, ['n4']),
      n6: graphNode(3, ['n4']),
    } as StoryStep['heap'];
    const view: StoryView = { id: 'c', kind: 'graph', title: 'clones', var: 'visited', roots: 'values', neighbors: 'neighbors', directed: true };
    const visited = { $map: [[{ $ref: 'n1' }, { $ref: 'n4' }], [{ $ref: 'n2' }, { $ref: 'n5' }], [{ $ref: 'n3' }, { $ref: 'n6' }]] };
    const model = graphModel(view, step({ visited } as unknown as StoryStep['state'], { heap }), 'python');
    expect(model.nodes.map((item) => item.id)).toEqual(['"n4"', '"n5"', '"n6"']);
    expect(model.edges).toHaveLength(3);
    const pair = model.edges.filter((edge) => [edge.from, edge.to].sort().join() === '"n4","n5"');
    expect(pair).toHaveLength(2);
    expect(pair[0].path).not.toBe(pair[1].path);
  });

  it('draws random pointers as extra dashed arrows, a self-link as a loop, and lists from map values', () => {
    const node = (val: number, next: string | null, random: string | null) => ({
      $type: 'RandomNode',
      val,
      next: next ? { $ref: next } : null,
      random: random ? { $ref: random } : null,
    });
    const heap = { n1: node(7, 'n2', null), n2: node(13, null, 'n2'), n3: node(7, 'n4', 'n4'), n4: node(13, null, null) } as StoryStep['heap'];
    const copies = { $map: [[null, null], [{ $ref: 'n1' }, { $ref: 'n3' }], [{ $ref: 'n2' }, { $ref: 'n4' }]] };
    const original: StoryView = { id: 'o', kind: 'linked-list', title: 'original', var: 'head', extra: ['random'] };
    const copy: StoryView = { id: 'c', kind: 'linked-list', title: 'copy', var: 'copies', roots: 'values', extra: ['random'] };
    const story = storyWith([original, copy], [step({ head: { $ref: 'n1' }, copies } as unknown as StoryStep['state'], { heap })], ['head', 'copies']);
    const first = linkedListModel(original, story, 0, 'python');
    expect(first.edges.filter((edge) => edge.kind === 'extra').map((edge) => `${edge.from}>${edge.to}`)).toEqual(['n2>n2']);
    const second = linkedListModel(copy, story, 0, 'python');
    expect(second.nodes.map((item) => item.id)).toEqual(['n3', 'n4']);
    expect(second.edges.filter((edge) => edge.kind === 'extra').map((edge) => `${edge.from}>${edge.to}`)).toEqual(['n3>n4']);
    expect(second.height).toBeGreaterThan(150);
  });

  it('draws an instance field (self.heap) and object items by their fields', () => {
    const heap = {
      n1: { $type: 'KthLargest', k: 3, heap: [4, 5, 8] },
      n2: { $type: 'Entry', word: 'love' },
    } as StoryStep['heap'];
    const view: StoryView = { id: 'h', kind: 'array', title: 'self.heap', var: 'self', field: 'heap' };
    // The helper frame has no self: the field view reads the caller's.
    const at = step({ value: 3 }, { fn: 'helper', calls: [{ fn: 'add', state: { self: { $ref: 'n1' } } }], heap, marks: { h: { found: [0] } } });
    const model = sequenceModel(view, at, 'python');
    expect(model.cells.map((cell) => cell.text)).toEqual(['4', '5', '8']);
    expect(model.cells[0].tones).toEqual(['found']);
    expect(nodeLabel('n2', heap!)).toBe('Entry("love")');
    expect(nodeLabel('n1', heap!)).toBe('KthLargest');
    const entries: StoryView = { id: 'e', kind: 'array', title: 'heap', var: 'items', fields: ['word'] };
    expect(sequenceModel(entries, step({ items: [{ $ref: 'n2' }] }, { heap }), 'python').cells[0].text).toBe('"love"');
  });

  it('shows a map value as the chain between its dummy ends, or by chosen fields', () => {
    const entry = (key: number, value: number, prev: string | null, next: string | null) => ({
      $type: 'Entry',
      key,
      value,
      frequency: 1,
      prev: prev ? { $ref: prev } : null,
      next: next ? { $ref: next } : null,
    });
    const heap = {
      b1: { $type: 'Bucket', head: { $ref: 'h' }, tail: { $ref: 't' } },
      h: entry(0, 0, null, 'e1'),
      e1: entry(1, 10, 'h', 'e2'),
      e2: entry(2, 20, 'e1', 't'),
      t: entry(0, 0, 'e2', null),
    } as unknown as StoryStep['heap'];
    const buckets: StoryView = { id: 'b', kind: 'map', title: 'buckets', var: 'buckets', chain: { from: 'head', to: 'tail', fields: ['key', 'value'] } };
    const at = step({ buckets: { $map: [[1, { $ref: 'b1' }]] }, entries: { $map: [[1, { $ref: 'e1' }]] } }, { heap });
    expect(mapModel(buckets, at, 'python').entries[0].value).toBe('1:10 ⇄ 2:20');
    const entries: StoryView = { id: 'e', kind: 'map', title: 'entries', var: 'entries', valueFields: ['value', 'frequency'] };
    expect(mapModel(entries, at, 'python').entries[0].value).toBe('value 10, frequency 1');
  });
});

describe('Option B midline steps (one-line statements that call down)', () => {
  // top = stack.pop(); insert_bottom(value); stack.append(top): state after the whole line is
  // [2, 1] with top = 1, but the page draws the moment of the call: popped, stack [].
  const view: StoryView = { id: 'stack', kind: 'stack', title: 'stack', var: 'stack' };
  const story: DsaStoryV1 = {
    ...storyWith(
      [view, { id: 'calls', kind: 'calls', title: 'call stack', show: ['value'] }],
      [
        step({ value: 2, stack: [1] }, { fn: 'insert_bottom', calls: [{ fn: 'reverse', state: {} }], say: 'stack {stack}' }),
        step(
          { value: 2, top: 1, stack: [2, 1] },
          {
            fn: 'insert_bottom',
            calls: [{ fn: 'reverse', state: {} }],
            returns: null,
            say: 'pops {top}, stack is {stack}',
            paused: { state: { value: 2, top: 1, stack: [] } },
          },
        ),
        step({ value: 2, stack: [] }, { fn: 'insert_bottom', calls: [{ fn: 'reverse', state: {} }, { fn: 'insert_bottom', state: { value: 2, top: 1, stack: [] } }] }),
      ],
      ['stack', 'value', 'top'],
    ),
    midline: true,
  };

  it('draws, captions and lists the paused state instead of the state after the whole line', () => {
    expect(shownStep(story.steps[1]).state['stack']).toEqual([]);
    expect(sequenceModel(view, story.steps[1], 'python').cells).toEqual([]);
    expect(fillSay(story.steps[1], 'python')).toBe('pops 1, stack is []');
    const rows = variableRows(story, 1, 'python');
    expect(rows.find((row) => row.name === 'top')?.value).toBe('1');
    expect(rows.find((row) => row.name === 'stack')?.value).toBe('[]');
    // A step without paused is unchanged.
    expect(fillSay(story.steps[0], 'python')).toBe('stack [1]');
  });

  it('accepts the new view kinds as a story (anything unknown falls back to the debugger)', () => {
    expect(isDsaStory(story)).toBe(true);
    for (const kind of ['string', 'trie', 'number-line', 'bits'] as const)
      expect(isDsaStory({ ...story, views: [{ id: 'x', kind, title: 'x' }] })).toBe(true);
    expect(isDsaStory({ ...story, views: [{ id: 'x', kind: 'heap', title: 'x' }] })).toBe(false);
  });
});

describe('Option B new views on the page', () => {
  function render(story: DsaStoryV1) {
    const fixture = TestBed.createComponent(DsaStory);
    fixture.componentRef.setInput('story', story);
    fixture.componentRef.setInput('problem', twoSumProblem());
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws a string, a windowed table, bits and a trie with a word-end ring', () => {
    const trieHeap = {
      n1: { $type: 'Node', children: { $map: [['a', { $ref: 'n2' }]] }, terminal: false },
      n2: { $type: 'Node', children: { $map: [] }, terminal: true },
    } as unknown as StoryStep['heap'];
    const story = storyWith(
      [
        { id: 's', kind: 'string', title: 'text', var: 'text', pointers: [{ var: 'i' }] },
        { id: 'c', kind: 'array', title: 'count', var: 'count', window: true },
        { id: 'b', kind: 'bits', title: 'a', var: 'a', width: 4 },
        { id: 't', kind: 'trie', title: 'trie', var: 'root' },
      ],
      [
        step(
          {
            text: 'hi there',
            i: 2,
            count: { $sparse: { length: 1001, fill: 0, items: [[3, 2]] } },
            a: 12,
            root: { $ref: 'n1' },
          },
          { heap: trieHeap },
        ),
      ],
      ['text', 'i', 'count', 'a', 'root'],
    );
    const element = render(story);
    const figure = (kind: string) => element.querySelector<HTMLElement>(`figure.view[data-kind="${kind}"]`)!;
    expect([...figure('string').querySelectorAll('.cell .v')].map((node) => node.textContent)).toEqual([...'hi␣there']);
    expect(figure('string').querySelector<HTMLElement>('.pointer')!.style.getPropertyValue('--i')).toBe('2');
    expect(figure('array').getAttribute('data-window')).toBe('true');
    expect(figure('array').querySelectorAll('.cell.gap')).toHaveLength(2);
    expect(figure('array').querySelector('.note')?.textContent).toContain('window of 1,001 cells');
    expect([...figure('bits').querySelectorAll('.cell .v')].map((node) => node.textContent).join('')).toBe('1100');
    expect(figure('bits').querySelector('figcaption .kind')?.textContent).toBe('binary');
    expect(figure('trie').querySelectorAll('.node')).toHaveLength(2);
    expect(figure('trie').querySelectorAll('circle.end-ring')).toHaveLength(1);
  });
});
