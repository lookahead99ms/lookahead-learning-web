import { describe, expect, it } from 'vitest';
import { PatternProblemV1 } from '../../content/content.models';
import { codeScrollTop, compactRecorded, hasLineTrace, lineView } from './walkthrough.model';

const variable = (name: string, type: string, value: string, changed = false) => ({ name, type, value, changed });

/** A two-line trace with an array local, an index and a node, in Python only. */
function problem(): PatternProblemV1 {
  const events = [
    {
      id: 'e0',
      label: 'start',
      phase: 'Setup',
      timing: 'after',
      sourceAnchor: { python: 'p1', java: 'j1', go: 'g1' },
      what: 'Execute solve at source line 1: values = [4, 7]',
      why: "This is the next instruction reached by the implementation's actual control flow.",
      variables: [
        variable('values', 'array', '[4,7]', true),
        variable('i', 'integer', '1', true),
        variable('node', 'object', '{"val":9,"left":null,"right":{"val":3,"left":null,"right":null}}', true),
      ],
      rows: [],
    },
    {
      id: 'e1',
      label: 'end',
      phase: 'Return',
      timing: 'after',
      sourceAnchor: { python: 'p2', java: 'j2', go: 'g2' },
      what: 'Return the answer.',
      why: 'The loop has seen every value.',
      variables: [],
      rows: [],
      result: '7',
    },
  ];
  return {
    id: 'synthetic',
    title: 'Synthetic',
    description: '',
    difficulty: 'Beginner',
    variation: '',
    invariantAdaptation: '',
    complexity: { time: 'O(n)', space: 'O(1)', why: '' },
    fixtures: [{ id: 'first', label: 'First', input: 'values = [4,7]', expectedOutput: '7' }],
    implementations: [
      { language: 'python', title: 'Python', lines: [{ id: 'p1', text: 'values = [4, 7]' }, { id: 'p2', text: 'return 7' }] },
    ],
    trace: {
      schemaVersion: 'guided-trace/v1',
      id: 't',
      fixtureId: 'first',
      invariant: '',
      legend: [],
      events,
      languagePaths: { python: [{ sourceAnchor: 'p1', eventIndex: 0 }, { sourceAnchor: 'p2', eventIndex: 1 }] },
    },
  } as unknown as PatternProblemV1;
}

describe('walkthrough model', () => {
  it('reads tree and list nodes as their values, keeping other values', () => {
    expect(compactRecorded('{"val":9,"left":null,"right":null}')).toBe('node(9)');
    expect(compactRecorded('[{"Val":3,"Left":"<main.TreeNode>","Next":null},{"value":4}]')).toBe('[node(3), node(4)]');
    expect(compactRecorded('{"a":1,"b":[2,3]}')).toBe('{a: 1, b: [2, 3]}');
    expect(compactRecorded('["x","y"]')).toBe('["x", "y"]');
    expect(compactRecorded('42')).toBe('42');
    expect(compactRecorded('not json [')).toBe('not json [');
    expect(compactRecorded(`[${'1,'.repeat(100)}1]`).length).toBe(140);
  });

  it('builds one recorded line: caption, code line, values and drawn rows', () => {
    const view = lineView(problem(), problem().fixtures[0], 'python', 0);
    expect(view.count).toBe(2);
    expect(view.line).toBe('Line 1: values = [4, 7]');
    expect(view.current).toBe('p1');
    expect(view.ran).toEqual([]);
    // Without recorded rows, array locals are drawn, with the index locals marked.
    expect(view.rows.map((row) => row.label)).toEqual(['values']);
    expect(view.rows[0].cells.map((cell) => [cell.value, cell.states ?? []])).toEqual([
      ['4', []],
      ['7', ['active']],
    ]);
    expect(view.values.map((value) => [value.name, value.value, !!value.drawn])).toEqual([
      ['values', '[4, 7]', true],
      ['i', '1', false],
      ['node', 'node(9)', false],
      ['result', 'not returned yet', false],
    ]);
    // The generic "next instruction" reason is not repeated under the caption.
    expect(view.detail).toBeNull();
    const last = lineView(problem(), problem().fixtures[0], 'python', 1);
    expect(last.ran).toEqual(['p1']);
    expect(last.detail).toBe('The loop has seen every value.');
    expect(last.values.find((value) => value.kind === 'result')).toMatchObject({ value: '7', changed: true });
  });

  it('knows when an example has no line trace in a language', () => {
    expect(hasLineTrace(problem(), 'first', 'python')).toBe(true);
    expect(hasLineTrace(problem(), 'first', 'java')).toBe(false);
    expect(hasLineTrace(problem(), 'missing', 'python')).toBe(false);
  });

  it('keeps the current code line inside the part of the box that is on screen', () => {
    const box = { scrollTop: 0, clientHeight: 560 };
    // Only the top 300 px of the box are on screen: a line at 400 px must move up.
    expect(codeScrollTop(box, 400, 24)).toBeNull();
    expect(codeScrollTop(box, 400, 24, { top: 0, bottom: 300 })).toBe(300);
    // Hidden under the pinned header at the top: move down.
    expect(codeScrollTop({ scrollTop: 200, clientHeight: 560 }, 220, 24, { top: 100, bottom: 560 })).toBe(0);
  });
});
