import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GuidedTraceEvent,
  GuidedTracePathStep,
  GuidedTraceVariable,
  PatternProblemV1,
} from '../../content/content.models';
import { traceSnapshot } from './trace-model';
import { TracePlayer, traceArrowKey } from './trace-player';
import { TraceStatePanel } from './trace-state-panel';
import { parseConditionHeader, stepNarration, traceVisual, visualPlanKind } from './trace-visual';

type Step = [anchor: string, variables?: GuidedTraceVariable[], result?: string];

const int = (name: string, value: string, changed = false): GuidedTraceVariable => ({
  name,
  type: 'integer',
  value,
  ...(changed ? { changed: true } : {}),
});

/** A target-runtime trace whose Java path carries the recorded state, like published content. */
function problemFrom(
  id: string,
  lines: string[],
  steps: Step[],
  args: Record<string, unknown>,
): PatternProblemV1 & { fixtures: { id: string; arguments: Record<string, unknown> }[] } {
  const anchors = lines.map((_, index) => `java-${index + 1}`);
  const events: GuidedTraceEvent[] = steps.map(([anchor], index) => ({
    id: `${id}-${index}`,
    label: `Line ${anchor}`,
    phase: 'Update',
    timing: 'after',
    sourceAnchor: { java: anchor, python: anchor, go: anchor },
    what: `Execute line ${anchor}.`,
    why: 'Control flow.',
    variables: [],
    rows: [],
  }));
  const path: GuidedTracePathStep[] = steps.map(([anchor, variables, result], index) => ({
    sourceAnchor: anchor,
    eventIndex: index,
    ...(variables ? { variables } : {}),
    ...(result !== undefined ? { result } : {}),
  }));
  const terminal = steps.at(-1)?.[2];
  if (terminal !== undefined) events[events.length - 1].result = terminal;
  return {
    id,
    title: id,
    description: '',
    difficulty: 'Intermediate',
    variation: '',
    invariantAdaptation: '',
    complexity: { time: 'O(n)', space: 'O(1)', why: '' },
    fixtures: [
      { id: 'standard', label: 'Standard', input: '', expectedOutput: '', arguments: args },
    ] as never,
    implementations: (['java', 'python', 'go'] as const).map((language) => ({
      language,
      title: language,
      lines: lines.map((text, index) => ({ id: anchors[index], text })),
    })),
    trace: {
      schemaVersion: 'guided-trace/v1',
      id: `${id}-trace`,
      fixtureId: 'standard',
      invariant: '',
      legend: [],
      events,
      stateSemantics: 'target-runtime/v1',
      stateTiming: 'after',
      languagePaths: { java: path, python: path, go: path },
    },
  } as never;
}

const twoPointer = () =>
  problemFrom(
    'two-pointer',
    [
      'static int[] findPair(int[] values, int target) {',
      '  int left = 0, right = values.length - 1;',
      '  while (left < right) {',
      '    int total = values[left] + values[right];',
      '    if (total == target) {',
      '      return new int[] { left + 1, right + 1 };',
      '    }',
      '    if (total < target)',
      '      left++;',
      '    else',
      '      right--;',
      '  }',
      '  return new int[0];',
      '}',
    ],
    [
      [
        'java-2',
        [
          { name: 'values', type: 'array', value: '[1,3,4,6]' },
          int('target', '7'),
          int('left', '0'),
          int('right', '3'),
        ],
      ],
      ['java-3'],
      ['java-4', [int('total', '7')]],
      ['java-5'],
      ['java-6', [{ name: 'returned', type: 'result', value: '[1,4]' }], '[1,4]'],
    ],
    { values: [1, 3, 4, 6], target: 7 },
  );

const listNode = (values: (number | string)[], end: 'cycle' | 'truncated' | 'null'): string => {
  let next: unknown = end === 'null' ? null : end === 'cycle' ? '<cycle>' : '<Solution$ListNode>';
  for (const value of [...values].reverse()) next = { next, value };
  return JSON.stringify(next);
};

const node = (
  name: string,
  values: number[],
  end: 'cycle' | 'truncated' | 'null',
  changed = false,
) => ({
  name,
  type: 'array',
  value: listNode(values, end),
  ...(changed ? { changed: true } : {}),
});

const cycleList = () =>
  problemFrom(
    'list-cycle',
    [
      'static boolean hasCycle(ListNode head) {',
      '  ListNode slow = head, fast = head;',
      '  while (fast != null && fast.next != null) {',
      '    slow = slow.next;',
      '    fast = fast.next.next;',
      '    if (slow == fast) {',
      '      return true;',
      '    }',
      '  }',
      '  return false;',
      '}',
    ],
    [
      [
        'java-2',
        [
          node('head', [3, 2, 0], 'truncated'),
          node('slow', [3, 2, 0], 'truncated'),
          node('fast', [3, 2, 0], 'truncated'),
        ],
      ],
      ['java-3'],
      ['java-4', [node('slow', [2, 0, -4], 'cycle', true)]],
      ['java-5', [node('fast', [0, -4, 2], 'cycle', true)]],
      ['java-6'],
      ['java-3'],
      ['java-4', [node('slow', [0, -4, 2], 'cycle', true)]],
      ['java-5', [node('fast', [2, 0, -4], 'cycle', true)]],
      ['java-6'],
      ['java-3'],
      ['java-4', [node('slow', [-4, 2, 0], 'cycle', true)]],
      ['java-5', [node('fast', [-4, 2, 0], 'cycle', true)]],
      ['java-6'],
      ['java-7', [{ name: 'returned', type: 'result', value: 'true' }], 'true'],
    ],
    { values: [3, 2, 0, -4], cycleIndex: 1 },
  );

const tree = () =>
  problemFrom(
    'tree',
    ['int depth(TreeNode root) {', '  return root == null ? 0 : 1;', '}'],
    [
      ['java-1', [{ name: 'root', type: 'object', value: '{"left":null,"right":null,"val":1}' }]],
      ['java-2', [{ name: 'returned', type: 'result', value: '1' }], '1'],
    ],
    { root: [1] },
  );

function state(problem: ReturnType<typeof problemFrom>, step: number) {
  const fixture = problem.fixtures[0];
  const snapshot = traceSnapshot(problem, fixture.id, 'java', step);
  const previous = step > 0 ? traceSnapshot(problem, fixture.id, 'java', step - 1) : null;
  return {
    fixture,
    snapshot,
    visual: traceVisual(problem, fixture, snapshot, 'java', previous),
    narration: stepNarration(problem, fixture, snapshot, 'java', previous),
  };
}

describe('trace visual model', () => {
  it('draws an array with pointer variables that index it', () => {
    const { visual } = state(twoPointer(), 0);
    expect(visual.kind).toBe('array');
    if (visual.kind !== 'array') return;
    const [values] = visual.arrays;
    expect(values.name).toBe('values');
    expect(values.cells.map((cell) => cell.value)).toEqual(['1', '3', '4', '6']);
    expect(values.pointers.map(({ name, index }) => [name, index])).toEqual([
      ['left', 0],
      ['right', 3],
    ]);
    // target is an integer but never indexes the array, so it is not a pointer.
    expect(values.pointers.some((pointer) => pointer.name === 'target')).toBe(false);
    expect(visual.label).toContain('left at index 0 (1), right at index 3 (6)');
  });

  it('highlights cells read on the current line and the result cells at the return', () => {
    const read = state(twoPointer(), 2).visual;
    if (read.kind !== 'array') throw new Error('expected array');
    expect(read.arrays[0].cells.map((cell) => cell.tone)).toEqual([
      'compare',
      null,
      null,
      'compare',
    ]);
    const done = state(twoPointer(), 4).visual;
    if (done.kind !== 'array') throw new Error('expected array');
    expect(done.arrays[0].cells.map((cell) => cell.tone)).toEqual(['found', null, null, 'found']);
  });

  it('draws a linked list with a cycle back-edge and pointers on nodes', () => {
    const problem = cycleList();
    const first = state(problem, 0).visual;
    expect(first.kind).toBe('list');
    if (first.kind !== 'list') return;
    expect(first.list.nodes.map((item) => item.value)).toEqual(['3', '2', '0', '-4']);
    expect(first.list.cycleTo).toBe(1);
    expect(first.label).toContain('The last node links back to 2 (node 1).');

    // fast follows the cycle link from -4 back to 2.
    const wrapped = state(problem, 7);
    if (wrapped.visual.kind !== 'list') throw new Error('expected list');
    const at = Object.fromEntries(
      wrapped.visual.list.pointers.map((pointer) => [pointer.name, pointer.index]),
    );
    expect(at).toEqual({ head: 0, slow: 2, fast: 1 });
    expect(wrapped.narration?.text).toBe(
      'fast moves two nodes, onto 2, following the cycle link back.',
    );

    const met = state(problem, 13).visual;
    if (met.kind !== 'list') throw new Error('expected list');
    expect(met.list.nodes[3].tone).toBe('found');
  });

  it('falls back when the list links change or the state is a tree', () => {
    const mutated = cycleList();
    mutated.trace.languagePaths!.java[2].variables = [node('slow', [9, 9], 'null', true)];
    expect(
      visualPlanKind(
        mutated,
        mutated.fixtures[0],
        traceSnapshot(mutated, 'standard', 'java', 0),
        'java',
      ),
    ).toBe('none');
    const treeProblem = tree();
    const { visual, narration } = state(treeProblem, 0);
    expect(visual.kind).toBe('none');
    // The step line still renders; with no generated detail it keeps the trace's own text.
    expect(narration).toEqual({
      line: 'Line 1: int depth(TreeNode root) {',
      text: 'Execute line java-1.',
      generated: false,
    });
  });

  it('writes plain-English lines for pointer moves, conditions and returns', () => {
    const problem = twoPointer();
    expect(state(problem, 0).narration?.text).toBe(
      'left starts at index 0, onto 1. right starts at index 3, onto 6.',
    );
    expect(state(problem, 1).narration?.text).toBe(
      'Check left < right (0 < 3): true, so the loop body runs.',
    );
    expect(state(problem, 2).narration?.text).toBe('total is set to 7.');
    expect(state(problem, 3).narration?.text).toBe(
      'Check total == target (7 == 7): true, so the if body runs.',
    );
    expect(state(problem, 4).narration).toEqual({
      line: 'Line 6: return new int[] { left + 1, right + 1 };',
      text: 'Returns [1,4].',
      generated: true,
    });
    expect(state(cycleList(), 0).narration?.text).toContain(
      'The list is 3 → 2 → 0 → -4, and -4 links back to 2.',
    );
  });

  it('parses loop and branch headers without guessing at other lines', () => {
    expect(parseConditionHeader('  while (left < right) {', 'java')).toEqual({
      keyword: 'while',
      condition: 'left < right',
    });
    expect(parseConditionHeader('    if slow is fast:', 'python')).toEqual({
      keyword: 'if',
      condition: 'slow is fast',
    });
    expect(parseConditionHeader('    if x: return y', 'python')).toBeNull();
    expect(parseConditionHeader('  total = a + b;', 'java')).toBeNull();
  });
});

describe('TraceStatePanel', () => {
  function render(problem: ReturnType<typeof problemFrom>, step: number) {
    const fixture = TestBed.createComponent(TraceStatePanel);
    fixture.componentRef.setInput('problem', problem);
    fixture.componentRef.setInput('fixture', problem.fixtures[0]);
    fixture.componentRef.setInput('language', 'java');
    fixture.componentRef.setInput('snapshot', traceSnapshot(problem, 'standard', 'java', step));
    fixture.detectChanges();
    return fixture;
  }

  it('renders an accessible SVG whose pointers slide by transform', () => {
    const problem = twoPointer();
    const fixture = render(problem, 0);
    const svg = fixture.nativeElement.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toContain('Array values: 1, 3, 4, 6.');
    expect(fixture.nativeElement.querySelectorAll('.cell')).toHaveLength(4);
    const right = () =>
      [...fixture.nativeElement.querySelectorAll('.ptr')].find(
        (pointer) => (pointer as Element).textContent?.trim() === 'right',
      ) as SVGGElement;
    const element = right();
    const before = element.style.transform;
    const moved = { ...problem };
    moved.trace = {
      ...problem.trace,
      languagePaths: {
        ...problem.trace.languagePaths!,
        java: [
          ...problem.trace.languagePaths!.java,
          { sourceAnchor: 'java-11', eventIndex: 4, variables: [int('right', '2', true)] },
        ],
      },
    };
    fixture.componentRef.setInput('problem', moved);
    fixture.componentRef.setInput('snapshot', traceSnapshot(moved, 'standard', 'java', 5));
    fixture.detectChanges();
    // The same element is reused, so the CSS transform transition can animate it.
    expect(right()).toBe(element);
    expect(element.style.transform).not.toBe(before);
    const explain = fixture.nativeElement.querySelector('.explain') as HTMLElement;
    expect(explain.getAttribute('aria-live')).toBe('polite');
    expect(explain.textContent).toContain('right moves from 3 to 2, onto 4.');
  });

  it('draws the cycle edge and keeps the HTML fallback for trees', () => {
    const list = render(cycleList(), 0);
    expect(list.nativeElement.querySelector('.edge.cycle')).not.toBeNull();
    expect(list.nativeElement.querySelector('.note').textContent).toContain('-4.next = 2');
    expect(list.nativeElement.querySelectorAll('.node')).toHaveLength(4);
    const fallback = render(tree(), 0);
    expect(fallback.nativeElement.querySelector('svg')).toBeNull();
    expect(fallback.nativeElement.querySelector('.explain')).not.toBeNull();
  });

  it('turns transitions off for reduced motion', () => {
    const styles = (
      (TraceStatePanel as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles ?? []
    ).join('');
    expect(styles).toMatch(/prefers-reduced-motion:\s*reduce[^}]*\.ptr[^}]*transition:\s*none/);
  });
});

describe('TracePlayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function player(count: number) {
    let step = 0;
    const instance = new TracePlayer(
      () => ({ step, count }),
      (next) => (step = next),
    );
    return { instance, step: () => step, set: (value: number) => (step = value) };
  }

  it('advances about once a second and stops at the end', () => {
    const { instance, step } = player(3);
    instance.toggle();
    expect(instance.playing()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(step()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(step()).toBe(2);
    expect(instance.playing()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(step()).toBe(2);
  });

  it('pauses on request and restarts from the beginning at the end', () => {
    const { instance, step, set } = player(4);
    instance.toggle();
    vi.advanceTimersByTime(1000);
    instance.pause();
    vi.advanceTimersByTime(3000);
    expect(step()).toBe(1);
    set(3);
    instance.toggle();
    expect(step()).toBe(0);
    expect(instance.playing()).toBe(true);
    instance.pause();
  });

  it('plays the same way when reduced motion is requested', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
    })) as never;
    const { instance, step } = player(2);
    instance.toggle();
    vi.advanceTimersByTime(1000);
    expect(step()).toBe(1);
    window.matchMedia = original;
  });

  it('maps arrow keys only outside form fields and code', () => {
    const key = (key: string, target: Element) =>
      traceArrowKey({
        key,
        target,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      } as never);
    const button = document.createElement('button');
    const select = document.createElement('select');
    const pre = document.createElement('pre');
    expect(key('ArrowRight', button)).toBe(1);
    expect(key('ArrowLeft', button)).toBe(-1);
    expect(key('ArrowRight', select)).toBe(0);
    expect(key('ArrowRight', pre)).toBe(0);
    expect(key('Enter', button)).toBe(0);
  });
});
