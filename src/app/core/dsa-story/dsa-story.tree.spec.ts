import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ReferenceLanguageService } from '../reference-language';
import { DsaStory } from './dsa-story';
import { PatternProblemV1 } from '../../content/content.models';
import {
  DsaStoryV1,
  StoryStep,
  callTimeline,
  callsModel,
  languageLines,
  treeModel,
  variableRows,
  viewSummary,
} from './dsa-story.model';
import { twoSumProblem } from './dsa-story.fixture';

/**
 * Max depth of the tree 3 -> left 9, run by `return 1 + max(max_depth(root.left), max_depth(root.right))`.
 * As the runtime records it: each node's line carries the value its call returns after the calls
 * below it, and the None calls return 0 on their own line.
 */
function depthStory(): DsaStoryV1 {
  const heap = {
    n1: { $type: 'TreeNode', val: 3, left: { $ref: 'n2' }, right: null },
    n2: { $type: 'TreeNode', val: 9, left: null, right: null },
  };
  const frame = (ref: string) => ({ fn: 'max_depth', state: { root: { $ref: ref } } });
  const step = (root: string | null, calls: string[], returns: number, extra: Partial<StoryStep> = {}): StoryStep => ({
    lines: root ? ['i2', 'i4'] : ['i2', 'i3'],
    say: '',
    idea: 0,
    state: { root: root ? { $ref: root } : null },
    fn: 'max_depth',
    calls: calls.map(frame),
    heap,
    returns,
    ...extra,
  });
  return {
    schemaVersion: 'dsa-story/v1',
    problemId: 'algorithmic-maximum-depth-binary-tree',
    fixtureId: 'standard',
    approach: { variant: 'Recursive DFS, post-order.', why: 'A node needs both children first.' },
    ideas: ['Ask the children.', 'Add one.'],
    views: [
      { id: 'tree', kind: 'tree', title: 'Binary tree', var: 'root', pointers: [{ var: 'root' }], returned: { var: 'root', label: 'depth' } },
      { id: 'calls', kind: 'calls', title: 'Call stack', show: ['root'] },
    ],
    variables: ['root'],
    steps: [
      step('n1', [], 2),
      step('n2', ['n1'], 1),
      step(null, ['n1', 'n2'], 0),
      step(null, ['n1', 'n2'], 0),
      step(null, ['n1'], 0, { result: 2 }),
    ],
  };
}

describe('Option B tree recursion', () => {
  it('moves each return to the step after which its call really leaves the stack', () => {
    const moments = callTimeline(depthStory());
    expect(moments.map((moment) => moment.inProgress)).toEqual([true, true, false, false, false]);
    expect(moments.map((moment) => moment.unwinds.map((item) => [item.depth, item.value]))).toEqual([
      [],
      [],
      [[2, 0]],
      [[2, 0], [1, 1]],
      [[1, 0], [0, 2]],
    ]);
    expect(moments.map((moment) => moment.ordinal)).toEqual([0, 0, 0, 1, 1]);
  });

  it('does not show a return value while the line is still calling down', () => {
    const story = depthStory();
    const view = story.views[1];
    const first = callsModel(view, story.steps[0], 'java', callTimeline(story)[0]);
    expect(first.returns).toBeNull();
    expect(first.frames[0]).toMatchObject({ label: 'maxDepth(root=TreeNode(3))', returns: null });
    expect(variableRows(story, 0, 'java').find((row) => row.kind === 'returns')).toMatchObject({ value: '—', unset: true });
    const unwinding = callsModel(view, story.steps[3], 'python', callTimeline(story)[3]);
    expect(unwinding.frames.map((frame) => [frame.label, frame.returns])).toEqual([
      ['max_depth(root=TreeNode(3))', null],
      ['max_depth(root=TreeNode(9))', '1'],
      ['max_depth(root=None)', '0'],
    ]);
    expect(viewSummary(view, story, 3, 'python')).toContain(
      'Then max_depth(root=None) returns 0, then max_depth(root=TreeNode(9)) returns 1.',
    );
  });

  it('draws a None call at the empty child slot of its caller and labels finished calls', () => {
    const story = depthStory();
    const view = story.views[0];
    const at = (index: number) => treeModel(view, story.steps[index], 'java', { story, index });
    const nine = at(2).nodes.find((node) => node.id === 'n2')!;
    const three = at(2).nodes.find((node) => node.id === 'n1')!;
    expect(at(2)).toMatchObject({ nullPointers: ['root'], nullAt: { x: nine.x - 28, y: nine.y + 78 } });
    expect(at(3).nullAt).toEqual({ x: nine.x + 28, y: nine.y + 78 });
    expect(at(4).nullAt).toEqual({ x: three.x + 28, y: three.y + 78 });
    expect(at(2).edges.find((edge) => edge.ghost)?.from).toBe('n2');
    expect(at(2).nodes.map((node) => node.badge)).toEqual([undefined, undefined]);
    expect(at(3).nodes.find((node) => node.id === 'n2')?.badge).toBe('depth 1');
    expect(at(4).nodes.map((node) => node.badge)).toEqual(['depth 1', 'depth 2']);
    expect(at(4).height).toBeGreaterThanOrEqual(three.y + 78 + 28);
    expect(viewSummary(view, story, 4, 'java')).toContain('3 returned depth 2');
    // Without the story history the plain layout is unchanged.
    expect(treeModel(view, story.steps[2], 'java').nullAt).toBeNull();
  });

  it('shows a frame\'s locals from before a line that calls down, as in left = height(node.left)', () => {
    // height(3 -> left 9): lines i2 `if node is None`, i3 `return 0`, i4 `left = height(node.left)`,
    // i5 `right = height(node.right)`, i6 `return 1 + max(left, right)`. State is after each line.
    const heap = {
      n1: { $type: 'TreeNode', val: 3, left: { $ref: 'n2' }, right: null },
      n2: { $type: 'TreeNode', val: 9, left: null, right: null },
    };
    const n = (ref: string | null) => (ref ? { $ref: ref } : null);
    const step = (line: string, state: Record<string, unknown>, calls: Record<string, unknown>[], extra: Partial<StoryStep> = {}): StoryStep =>
      ({ lines: [line], say: '', idea: 0, fn: 'height', state, calls: calls.map((s) => ({ fn: 'height', state: s })), heap, ...extra }) as StoryStep;
    const top = { node: n('n1') };
    const story = {
      ...depthStory(),
      variables: ['node', 'left', 'right'],
      steps: [
        step('i2', top, []),
        step('i4', { ...top, left: 1 }, []),
        step('i2', { node: n('n2') }, [top]),
        step('i4', { node: n('n2'), left: 0 }, [top]),
        step('i2', { node: null }, [top, { node: n('n2') }]),
        step('i3', { node: null }, [top, { node: n('n2') }], { returns: 0 }),
        step('i5', { node: n('n2'), left: 0, right: 0 }, [top]),
        step('i2', { node: null }, [top, { node: n('n2'), left: 0 }]),
        step('i3', { node: null }, [top, { node: n('n2'), left: 0 }], { returns: 0 }),
        step('i6', { node: n('n2'), left: 0, right: 0 }, [top], { returns: 1 }),
        step('i5', { ...top, left: 1, right: 0 }, []),
        step('i2', { node: null }, [{ ...top, left: 1 }]),
        step('i3', { node: null }, [{ ...top, left: 1 }], { returns: 0 }),
        step('i6', { ...top, left: 1, right: 0 }, [], { returns: 2, result: 2 }),
      ],
    } as DsaStoryV1;
    const row = (index: number, name: string) => variableRows(story, index, 'python').find((item) => item.name === name)!;
    expect(row(1, 'left')).toMatchObject({ value: 'not set yet', unset: true });
    expect(row(3, 'left').value).toBe('not set yet');
    expect([row(6, 'left').value, row(6, 'right').value]).toEqual(['0', 'not set yet']);
    expect([row(9, 'left').value, row(9, 'right').value]).toEqual(['0', '0']);
    expect(row(9, 'right').changed).toBe(true);
    // Back in the root's call: left came back as 1, right is still on its way.
    expect([row(10, 'left').value, row(10, 'right').value]).toEqual(['1', 'not set yet']);
    expect(row(13, 'right').value).toBe('0');
    expect(callTimeline(story).filter((moment) => moment.inProgress)).toHaveLength(4);
  });

  it('pairs Java and Go lines with Python call by call in recursive code', () => {
    const story = depthStory();
    const lines = (language: 'python' | 'go', ids: string[], texts: string[]) => ({
      language,
      title: language,
      lines: ids.map((id, index) => ({ id, text: texts[index] })),
    });
    const goPath = ['i2', 'i5', 'i2', 'i5', 'i2', 'i3', 'i2', 'i3', 'i6', 'i9', 'i2', 'i3', 'i6', 'i9'];
    const problem = (go: string[]) =>
      ({
        implementations: [
          lines('python', ['i1', 'i2', 'i3', 'i4'], ['def max_depth(root):', '    if root is None:', '        return 0', '    return 1 + max(max_depth(root.left), max_depth(root.right))']),
          lines(
            'go',
            ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9', 'i10'],
            ['func maxDepth(root *TreeNode) int {', '\tif root == nil {', '\t\treturn 0', '\t}', '\tleft, right := maxDepth(root.Left), maxDepth(root.Right)', '\tif left > right {', '\t\treturn left + 1', '\t}', '\treturn right + 1', '}'],
          ),
        ],
        trace: {
          fixtureId: 'standard',
          events: [],
          languagePaths: {
            // The published event indices can be clumped; the call split must not depend on them.
            python: story.steps.flatMap((step) => step.lines).map((sourceAnchor) => ({ sourceAnchor, eventIndex: 0 })),
            go: go.map((sourceAnchor) => ({ sourceAnchor, eventIndex: 0 })),
          },
        },
      }) as unknown as PatternProblemV1;
    expect(languageLines(problem(goPath), story, 'go')).toEqual([
      { current: 'i5', ran: ['i2', 'i5'] },
      { current: 'i5', ran: ['i2', 'i5'] },
      { current: 'i3', ran: ['i2', 'i3'] },
      { current: 'i3', ran: ['i2', 'i3', 'i6', 'i9'] },
      { current: 'i3', ran: ['i2', 'i3', 'i6', 'i9'] },
    ]);
    // A native path with a different number of calls keeps the event alignment.
    const fallback = languageLines(problem(['i2', 'i5', 'i9']), story, 'go');
    expect(fallback.flatMap((step) => step.ran)).toEqual(['i2', 'i5', 'i9']);
    expect(fallback[0]).toEqual({ current: 'i5', ran: ['i2', 'i5'] });
  });

  it('renders the badges, the empty slot and one return tag per ending frame', () => {
    TestBed.inject(ReferenceLanguageService).select('python');
    const fixture = TestBed.createComponent(DsaStory);
    fixture.componentRef.setInput('story', depthStory());
    fixture.componentRef.setInput('problem', twoSumProblem());
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.frame .tag')).toHaveLength(0);
    expect(element.querySelector('.variable[data-kind="returns"] dd')?.textContent).toBe('—');
    const range = element.querySelector<HTMLInputElement>('input[type="range"]')!;
    range.value = '4';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect([...element.querySelectorAll('.frame .tag')].map((tag) => tag.textContent?.trim())).toEqual([
      'returns 0',
      'returns 1',
    ]);
    expect(element.querySelector('.diagram .badge')?.textContent).toBe('depth 1');
    expect(element.querySelector('.diagram .edge.ghost')).not.toBeNull();
    expect(element.querySelector('.null-slot .pointer-label')?.textContent).toBe('root');
    expect(element.querySelector('.null-slot text')?.textContent).toBe('None');
  });
});
