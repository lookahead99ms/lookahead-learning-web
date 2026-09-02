import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  GuidedTraceCellState,
  PatternProblemFixture,
  PatternProblemV1,
} from '../../content/content.models';
import { GuidedAlgorithmTrace } from './guided-algorithm-trace';

const states: GuidedTraceCellState[] = ['active', 'boundary', 'changed'];

function problem(id: string, title: string, rowLabel: string): PatternProblemV1 {
  const fixtures: PatternProblemFixture[] = [
    { id: 'standard', label: 'Baseline', input: `${rowLabel} = [1,2,3]`, expectedOutput: '3' },
    { id: 'edge', label: 'Edge input', input: `${rowLabel} = []`, expectedOutput: '0' },
  ];
  const source = (language: 'java' | 'python' | 'go') => ({
    language,
    title: `${title} ${language}`,
    lines: [
      { id: 'initialize', text: 'initialize state' },
      { id: 'advance', text: 'advance boundary' },
      { id: 'return', text: 'return result' },
    ],
  });
  const anchor = { java: 'initialize', python: 'initialize', go: 'initialize' };
  const advance = { java: 'advance', python: 'advance', go: 'advance' };
  const finish = { java: 'return', python: 'return', go: 'return' };

  return {
    id,
    title,
    description: `Exercise ${title}.`,
    difficulty: 'Intermediate',
    variation: 'Compatibility proof',
    invariantAdaptation: `${rowLabel} remains valid after every move.`,
    complexity: { time: 'O(n)', space: 'O(1)', why: 'Each position is visited once.' },
    fixtures,
    implementations: [source('java'), source('python'), source('go')],
    trace: {
      schemaVersion: 'guided-trace/v1',
      id: `${id}-trace`,
      fixtureId: 'standard',
      invariant: `${rowLabel} records the complete semantic state.`,
      legend: states.map((state) => ({ state, label: `${state} state` })),
      events: [
        {
          id: 'start',
          label: 'Initialize',
          phase: 'Initialize',
          timing: 'after',
          sourceAnchor: anchor,
          what: 'Create the initial state.',
          why: 'The scan needs an explicit starting boundary.',
          variables: [{ name: 'index', type: 'int', value: '0', changed: true }],
          rows: [{ id: rowLabel, label: rowLabel, cells: [{ value: '1', states: ['active'] }] }],
        },
        {
          id: 'move',
          label: 'Advance',
          phase: 'Move',
          timing: 'after',
          sourceAnchor: advance,
          what: 'Advance the maintained boundary.',
          why: 'The discarded candidate cannot improve the answer.',
          variables: [{ name: 'index', type: 'int', value: '1', changed: true }],
          rows: [{ id: rowLabel, label: rowLabel, cells: [{ value: '2', states: ['boundary'] }] }],
        },
        {
          id: 'finish',
          label: 'Return',
          phase: 'Return',
          timing: 'after',
          sourceAnchor: finish,
          what: 'Return the completed answer.',
          why: 'Every candidate has been classified.',
          variables: [{ name: 'answer', type: 'int', value: '3', changed: true }],
          rows: [{ id: rowLabel, label: rowLabel, cells: [{ value: '3', states: ['changed'] }] }],
          result: 'Answer = 3',
        },
      ],
    },
  };
}

@Component({
  imports: [GuidedAlgorithmTrace],
  template: `<app-guided-algorithm-trace
    [problem]="activeProblem()"
    [selectedFixture]="selectedFixture()"
  />`,
})
class TraceHost {
  readonly activeProblem = signal(problem('prefix', 'Prefix Sums', 'prefix boundaries'));
  readonly selectedFixture = signal(this.activeProblem().fixtures[0]);
}

function normalizedText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('GuidedAlgorithmTrace shared interaction contract', () => {
  let fixture: ComponentFixture<TraceHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TraceHost] }).compileComponents();
    fixture = TestBed.createComponent(TraceHost);
    fixture.detectChanges();
  });

  it.each([
    ['prefix', 'Prefix Sums', 'prefix boundaries'],
    ['window', 'Sliding Window', 'window boundaries'],
    ['stack', 'Monotonic Stack', 'stack indices'],
  ])('renders complete transcript context for the %s state model', async (id, title, rowLabel) => {
    const activeProblem = problem(id, title, rowLabel);
    fixture.componentInstance.activeProblem.set(activeProblem);
    fixture.componentInstance.selectedFixture.set(activeProblem.fixtures[0]);
    fixture.detectChanges();
    await fixture.whenStable();

    const transcript = fixture.nativeElement.querySelector('.trace-transcript') as HTMLElement;
    const text = normalizedText(transcript);
    expect(text).toContain(`Input: ${rowLabel} = [1,2,3]`);
    expect(text).toContain('Expected output: 3');
    expect(text).toContain('Complexity: O(n) time · O(1) space');
    expect(text).toContain('Why:');
    expect(text).toContain('State:');
    expect(text).toContain('Result: Answer = 3');
  });

  it('preserves the semantic step when language changes and supports keyboard tabs', () => {
    const root = fixture.nativeElement.querySelector('.guided-trace') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('2 of 3');

    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('2 of 3');
    expect(fixture.nativeElement.querySelector('.sr-status').textContent).toContain(
      'python selected. Still on Advance.',
    );
  });

  it('resets and announces an independently selected edge fixture', async () => {
    const next = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.trace-controls .primary',
    )!;
    next.click();
    next.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('3 of 3');

    fixture.componentInstance.selectedFixture.set(
      fixture.componentInstance.activeProblem().fixtures[1],
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('1 of 3');
    expect(fixture.nativeElement.querySelector('.fixture-note').textContent).toContain(
      'independent dry-run practice',
    );
    expect(fixture.nativeElement.querySelector('.sr-status').textContent).toContain(
      'Guided trace reset to Baseline, step 1.',
    );
  });

  it('documents disabled boundaries and ignores trace shortcuts from interactive descendants', () => {
    const previous = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.trace-controls button:first-child',
    )!;
    expect(previous.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.boundary-status').textContent).toContain(
      'Previous is unavailable',
    );

    const source = fixture.nativeElement.querySelector('pre') as HTMLElement;
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('1 of 3');
  });
});
