import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StudioApproach } from './studio-approach';

const problem = {
  id: 'synthetic-teaching',
  title: 'Synthetic contract',
  description: 'Description',
  variation: 'Decision',
  invariantAdaptation: 'Preserve state',
  trace: { invariant: 'Invariant' },
  complexity: { time: 'O(n)', space: 'O(1)', why: 'Existing rationale' },
  practice: {
    statement: { prompt: 'Find a result', output: 'A result' },
    canonicalApproach: {
      whyThisApproach: 'Existing choice',
      whyOptimal: 'Existing bound',
      whenAssumptionChanges: 'Changed contract',
    },
  },
};
const teaching = {
  schemaVersion: 'dsa-teaching/v1',
  problemFraming: 'Authored framing',
  startingApproach: {
    title: 'Starting idea',
    theory: ['Starting explanation'],
    pseudocode: ['if a < b', '  inspect a'],
    implementationShape: [
      'initialize result',
      'for each candidate',
      '  update result',
      'return result',
    ],
    complexity: { time: 'O(n²)', space: 'O(1)' },
  },
  selectedApproach: {
    title: 'Selected idea',
    theory: ['Selected explanation'],
    pseudocode: ['keep state', 'return result'],
    implementationShape: [
      'initialize state',
      'while work remains',
      '  update state',
      'return result',
    ],
    complexity: { time: 'O(n)', space: 'O(1)' },
  },
  keyDifference: 'Authored distinction',
  workedTransition: { input: '[1, 2]', steps: ['Read 1', 'Read 2'], outcome: '2' },
};
describe('authored Approach teaching', () => {
  it('keeps the two-card composition without inventing a starting algorithm when teaching is absent', () => {
    const fixture = TestBed.createComponent(StudioApproach);
    fixture.componentRef.setInput('problem', problem);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.approach-card')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('pre')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Existing choice');
  });
  it('shares four paired section tracks and restores natural mobile disclosure flow', () => {
    const fixture = TestBed.createComponent(StudioApproach);
    fixture.componentRef.setInput('problem', {
      ...problem,
      teaching: {
        ...teaching,
        selectedApproach: {
          ...teaching.selectedApproach,
          pseudocode: ['first', 'second', 'third', 'fourth', 'fifth'],
        },
      },
    });
    fixture.componentInstance['paired'].set(true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    for (const card of root.querySelectorAll('.approach-card')) {
      expect([...card.children].map((child) => child.className)).toEqual([
        'approach-explanation-band',
        'approach-cost-band',
        'approach-code-band approach-teaching-band',
        'approach-code-band approach-implementation-band',
      ]);
    }
    expect(root.querySelectorAll('.implementation-shape')).toHaveLength(2);
    expect(root.querySelectorAll('.teaching-pseudocode li')).toHaveLength(7);
    expect(root.querySelector('details.approach-code-band')).toBeNull();
    fixture.componentInstance['paired'].set(false);
    fixture.componentInstance['compact'].set(true);
    fixture.detectChanges();
    const disclosure = root.querySelector<HTMLDetailsElement>('details.approach-code-band')!;
    expect(disclosure.open).toBe(false);
    expect(root.querySelector('.approach-implementation-band')).toBeNull();
    expect(disclosure.querySelector('.implementation-shape')?.textContent).toBe(
      teaching.startingApproach.implementationShape.join('\n'),
    );
    disclosure.querySelector('summary')!.click();
    fixture.detectChanges();
    expect(disclosure.open).toBe(true);
    fixture.componentInstance['paired'].set(true);
    fixture.componentInstance['compact'].set(false);
    fixture.detectChanges();
    fixture.componentInstance['paired'].set(false);
    fixture.componentInstance['compact'].set(true);
    fixture.detectChanges();
    expect(root.querySelector<HTMLDetailsElement>('details.approach-code-band')?.open).toBe(true);
  });
  it('renders authored bands and literal pseudocode with compact disclosure choices', () => {
    const fixture = TestBed.createComponent(StudioApproach);
    fixture.componentRef.setInput('problem', { ...problem, teaching });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.approach-card')).toHaveLength(2);
    expect(
      Array.from(root.querySelectorAll('.teaching-pseudocode:first-of-type li code'))
        .slice(0, 2)
        .map((step) => step.textContent),
    ).toEqual(['if a < b', '  inspect a']);
    expect(root.querySelector('.teaching-pseudocode')?.tagName).toBe('OL');
    expect(root.querySelectorAll('.implementation-shape')).toHaveLength(2);
    expect(root.querySelector<HTMLPreElement>('.implementation-shape')?.tabIndex).toBe(0);
    expect(root.querySelector('.implementation-shape')?.getAttribute('aria-label')).toBe(
      'Starting idea: implementation shape',
    );
    expect(root.querySelector('.implementation-shape')?.textContent).toBe(
      'initialize result\nfor each candidate\n  update result\nreturn result',
    );
    expect(root.querySelector('.worked-transition')?.textContent).toContain('Read 2');
    fixture.componentInstance['compact'].set(true);
    fixture.detectChanges();
    const code = root.querySelector<HTMLDetailsElement>('details.approach-code-band')!;
    expect(code.open).toBe(false);
    code.querySelector('summary')!.click();
    fixture.detectChanges();
    expect(code.open).toBe(true);
    fixture.componentInstance['compact'].set(false);
    fixture.detectChanges();
    fixture.componentInstance['compact'].set(true);
    fixture.detectChanges();
    expect(code.open).toBe(true);
  });
});
