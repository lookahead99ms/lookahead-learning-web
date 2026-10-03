import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DsaStory } from './dsa-story';
import {
  DsaStoryV1,
  StoryStep,
  StoryView,
  graphEdgeTone,
  graphModel,
  viewSummary,
} from './dsa-story.model';
import { twoSumProblem, twoSumStory } from './dsa-story.fixture';

// Graph pattern (exemplar: Course Schedule II, Kahn's algorithm). Edges carry no marks of their
// own: an edge takes its tone from the marks on its two ends, which the checker proves. Locals
// that hold a node key (`course`) label that node, renamed per language like any pointer.
const graphView: StoryView = {
  id: 'graph',
  kind: 'graph',
  title: 'graph',
  var: 'graph',
  directed: true,
  layout: { '0': [0, 50], '1': [50, 4], '2': [50, 96], '3': [100, 50] },
  pointers: [{ var: 'course' }],
};
const diamond = [[1, 2], [3], [3], []];

function kahnStep(marks: StoryStep['marks'], course = 1, nextCourse = 3): StoryStep {
  return {
    lines: ['py-1'],
    say: 'Course {course} unlocks course {next_course}.',
    idea: 0,
    marks,
    state: { graph: diamond, course, next_course: nextCourse, indegree: [0, 0, 0, 1] },
  };
}
function kahnStory(steps: StoryStep[]): DsaStoryV1 {
  return {
    ...twoSumStory(),
    views: [graphView, { id: 'indegree', kind: 'array', title: 'indegree', var: 'indegree' }],
    variables: ['graph', 'indegree', 'course', 'next_course'],
    names: { java: { next_course: 'next' }, go: { course: 'c' } },
    steps,
  };
}
const toneOf = (model: ReturnType<typeof graphModel>, id: string) =>
  model.edges.find((edge) => edge.id === id)?.tone;

describe('Option B graphs: edge tones and node pointers', () => {
  it('derives an edge tone from the marks on its two ends', () => {
    expect(graphEdgeTone(['active'], ['compare'], true)).toBe('compare');
    expect(graphEdgeTone(['active'], ['new'], true)).toBe('new');
    // A directed edge is followed from its source only; an undirected one either way round.
    expect(graphEdgeTone(['compare'], ['active'], true)).toBeUndefined();
    expect(graphEdgeTone(['compare'], ['active'], false)).toBe('compare');
    expect(graphEdgeTone(['found'], ['found'], true)).toBe('found');
    // Directed: every edge out of a finished node has been followed. Undirected: both ends done.
    expect(graphEdgeTone(['done'], [], true)).toBe('done');
    expect(graphEdgeTone(['done'], [], false)).toBeUndefined();
    expect(graphEdgeTone(['done'], ['done'], false)).toBe('done');
    expect(graphEdgeTone(['done'], ['active'], true)).toBe('done');
    expect(graphEdgeTone([], [], true)).toBeUndefined();
  });

  it('lights the edge being followed, dashes the edges already followed and labels the current node', () => {
    const step = kahnStep({ graph: { active: ['@course'], compare: ['@next_course'], done: [0] } });
    const model = graphModel(graphView, step, 'python', kahnStory([step]));
    expect(toneOf(model, '1>3')).toBe('compare');
    expect(toneOf(model, '0>1')).toBe('done');
    expect(toneOf(model, '0>2')).toBe('done');
    // 2 -> 3 is not being followed: course is 1, not 2.
    expect(toneOf(model, '2>3')).toBeUndefined();
    expect(model.nodes.find((node) => node.text === '1')?.pointers).toEqual(['course']);
    // The layout box keeps node 0 on the left edge and node 3 on the right edge.
    const x = (text: string) => model.nodes.find((node) => node.text === text)!.x;
    expect(x('0')).toBeLessThan(x('1'));
    expect(x('3')).toBeGreaterThan(x('2'));
  });

  it('renames pointer labels per language and skips a local that is not a node', () => {
    const step = kahnStep({});
    const story = kahnStory([step]);
    expect(graphModel(graphView, step, 'go', story).nodes[1].pointers).toEqual(['c']);
    const off = kahnStep({}, 9);
    expect(
      graphModel(graphView, off, 'python', story).nodes.every((node) => !node.pointers.length),
    ).toBe(true);
    // Without a story (older callers) the label is the Python name.
    expect(graphModel(graphView, step, 'go').nodes[1].pointers).toEqual(['course']);
  });

  it('greens the answer and tells screen readers which edge is lit', () => {
    const found = kahnStep({ graph: { found: [0, 1, 2, 3] } });
    expect(graphModel(graphView, found, 'java').edges.every((edge) => edge.tone === 'found')).toBe(
      true,
    );
    const pushed = kahnStep({ graph: { active: ['@course'], new: ['@next_course'] } }, 2);
    const summary = viewSummary(graphView, kahnStory([pushed]), 0, 'java');
    expect(summary).toContain('course at 2');
    expect(summary).toContain('just added: edge 2 → 3');
  });

  it('tones grid-as-graph edges the same way, in either direction', () => {
    const view: StoryView = {
      id: 'land',
      kind: 'graph',
      title: 'land',
      var: 'grid',
      gridNodes: ['1'],
    };
    const step: StoryStep = {
      lines: ['py-1'],
      say: '',
      idea: 0,
      marks: { land: { active: ['0,1'], compare: ['0,0'], done: ['1,1'] } },
      state: { grid: ['110', '011'] },
    };
    const model = graphModel(view, step, 'java');
    const edge = (from: string, to: string) =>
      model.edges.find(
        (item) => item.from === JSON.stringify(from) && item.to === JSON.stringify(to),
      );
    expect(edge('0,0', '0,1')?.tone).toBe('compare');
    // (0, 1) -> (1, 1): one end active, the other done: no tone of its own.
    expect(edge('0,1', '1,1')?.tone).toBeUndefined();
  });

  it('draws toned directed edges with a matching arrow head', () => {
    const step = kahnStep({ graph: { active: ['@course'], compare: ['@next_course'], done: [0] } });
    const fixture = TestBed.createComponent(DsaStory);
    fixture.componentRef.setInput('story', kahnStory([step]));
    fixture.componentRef.setInput('problem', twoSumProblem());
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg.diagram')!;
    const lit = svg.querySelector<SVGPathElement>('path.edge[data-tone="compare"]')!;
    expect(lit).not.toBeNull();
    expect(lit.getAttribute('marker-end')).toMatch(/-arrow-compare\)$/);
    expect(
      svg.querySelector(`marker[id="${lit.getAttribute('marker-end')!.slice(5, -1)}"]`),
    ).not.toBeNull();
    // Followed edges are dashed but keep the plain arrow head; untouched edges have no tone.
    const followed = svg.querySelectorAll('path.edge[data-tone="done"]');
    expect(followed).toHaveLength(2);
    expect(followed[0].getAttribute('marker-end')).toMatch(/-arrow\)$/);
    expect(svg.querySelectorAll('path.edge:not([data-tone])')).toHaveLength(1);
    expect(svg.textContent).toContain('course');
  });
});
