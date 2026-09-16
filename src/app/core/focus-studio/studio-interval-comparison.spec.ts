import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DsaProblemV2 } from '../../content/content.models';
import { TraceSnapshot } from '../guided-algorithm-trace/trace-model';
import { intervalComparison, StudioIntervalComparison } from './studio-interval-comparison';
const problem = {
  implementations: ['python', 'java', 'go'].map((language) => ({
    language,
    lines: [
      { id: 'check', text: 'if (currentStart < previousEnd)' },
      { id: 'return', text: 'return false' },
    ],
  })),
} as DsaProblemV2;
function snapshot(values: Record<string, unknown>, result?: string): TraceSnapshot {
  return {
    step: 0,
    events: [],
    rows: [],
    unavailable: null,
    event: {
      id: 'event', label: 'Compare endpoints', phase: 'Compare', timing: 'after', what: 'Compare endpoints', why: 'Detect overlap', variables: [], rows: [],
      sourceAnchor: { python: 'check', java: 'check', go: 'check' },
      ...(result === undefined ? {} : { result }),
    },
    variables: Object.entries(values).map(([name, value]) => ({
      name,
      type: 'state',
      value: JSON.stringify(value),
    })),
  } as TraceSnapshot;
}
describe('recorded interval comparison', () => {
  it.each(['python', 'java', 'go'] as const)(
    'uses only %s recorded endpoints for touching and overlap',
    (language) => {
      const touching = intervalComparison(
        problem,
        snapshot({
          ordered: [
            [0, 5],
            [5, 10],
          ],
          index: 1,
          previousEnd: 5,
          currentStart: 5,
        }),
        language,
      )!;
      expect(touching.relationship).toBe('Touching — allowed');
      expect(touching.compared).toBe(true);
      const overlap = intervalComparison(
        problem,
        snapshot(
          {
            ordered: [
              [0, 30],
              [5, 10],
            ],
            index: 1,
            previousEnd: 30,
            currentStart: 5,
          },
          'false',
        ),
        language,
      )!;
      expect(overlap.relationship).toBe('Overlap');
      expect(overlap.phase).toBe('Return false');
    },
  );
  it('does not invent endpoints before locals are recorded or reuse stale pair values', () => {
    expect(
      intervalComparison(
        problem,
        snapshot({
          ordered: [
            [0, 5],
            [5, 10],
          ],
          index: 1,
        }),
        'python',
      )?.currentStart,
    ).toBeNull();
    expect(
      intervalComparison(
        problem,
        snapshot({
          ordered: [
            [0, 5],
            [5, 10],
            [12, 20],
          ],
          index: 2,
          previousEnd: 5,
          currentStart: 5,
        }),
        'python',
      )?.currentStart,
    ).toBeNull();
    expect(
      intervalComparison(problem, { ...snapshot({}), unavailable: 'not captured' }, 'go'),
    ).toBeNull();
    expect(intervalComparison(problem, snapshot({ ordered: [] }, 'true'), 'python')?.phase).toBe(
      'Return true',
    );
  });
  it('renders original and recorded order, highlights the pair and explains equality', () => {
    const fixture = TestBed.createComponent(StudioIntervalComparison);
    fixture.componentRef.setInput('problem', problem);
    fixture.componentRef.setInput('language', 'python');
    fixture.componentRef.setInput('fixture', {
      arguments: {
        intervals: [
          [5, 10],
          [0, 5],
        ],
      },
    });
    fixture.componentRef.setInput(
      'snapshot',
      snapshot({
        ordered: [
          [0, 5],
          [5, 10],
        ],
        index: 1,
        previousEnd: 5,
        currentStart: 5,
      }),
    );
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.interval-lanes section code')?.textContent).toBe('[5, 10)');
    expect(root.querySelector('.previous code')?.textContent).toBe('[0, 5)');
    expect(root.querySelector('.current code')?.textContent).toBe('[5, 10)');
    expect(root.querySelector('.comparison')?.textContent).toContain('5 < 5 is false');
    expect(root.querySelector('.phase')?.getAttribute('role')).toBe('status');
  });
});
