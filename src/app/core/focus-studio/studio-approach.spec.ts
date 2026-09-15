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
    complexity: { time: 'O(n²)', space: 'O(1)' },
  },
  selectedApproach: {
    title: 'Selected idea',
    theory: ['Selected explanation'],
    pseudocode: ['keep state', 'return result'],
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
  it('renders authored bands and literal pseudocode with compact disclosure choices', () => {
    const fixture = TestBed.createComponent(StudioApproach);
    fixture.componentRef.setInput('problem', { ...problem, teaching });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.approach-card')).toHaveLength(2);
    expect(root.querySelector('pre')?.textContent).toBe('if a < b\n  inspect a');
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
