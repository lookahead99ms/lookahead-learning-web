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
      { id: 'insert', text: 'insert current value' },
      { id: 'fallback', text: 'return empty result' },
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

function signedTwoSumProblem(): PatternProblemV1 {
  const activeProblem = problem('two-sum', 'Two Sum', 'values');
  const signedFixture: PatternProblemFixture = {
    id: 'negative',
    label: 'Signed values',
    input: 'values = [-3,4,3,90], target = 0',
    expectedOutput: '[0,2]',
  };
  activeProblem.fixtures.push(signedFixture);

  const initialize = activeProblem.trace.events[0];
  const advance = activeProblem.trace.events[1];
  const finish = activeProblem.trace.events[2];
  const values = (active: number[] = [], discarded: number[] = []) => [
    {
      id: 'signed-values',
      label: 'values',
      cells: ['-3', '4', '3', '90'].map((value, index) => ({
        value,
        states: active.includes(index)
          ? (['active'] as GuidedTraceCellState[])
          : discarded.includes(index)
            ? (['discarded'] as GuidedTraceCellState[])
            : undefined,
        note: discarded.includes(index) ? 'not scanned after return' : undefined,
      })),
    },
  ];

  activeProblem.fixtureTraces = [
    {
      ...activeProblem.trace,
      id: 'two-sum-signed-trace',
      fixtureId: signedFixture.id,
      invariant: 'Seen contains only signed values from earlier indices.',
      events: [
        {
          ...initialize,
          id: 'signed-initialize',
          variables: [{ name: 'seen', type: 'map', value: '{}', changed: true }],
          rows: values(),
        },
        {
          ...advance,
          id: 'signed-lookup-minus-three',
          label: 'Index 0: look for 3',
          variables: [
            { name: 'index', type: 'int', value: '0', changed: true },
            { name: 'value', type: 'int', value: '-3', changed: true },
            { name: 'need', type: 'int', value: '3', changed: true },
            { name: 'map before lookup', type: 'map', value: '{}' },
            { name: 'lookup result', type: 'optional index', value: 'missing', changed: true },
          ],
          rows: values([0]),
        },
        {
          ...advance,
          id: 'signed-store-minus-three',
          label: 'Store -3',
          variables: [
            { name: 'index', type: 'int', value: '0' },
            { name: 'map after insertion', type: 'map', value: '{-3:0}', changed: true },
          ],
          rows: values([0]),
        },
        {
          ...advance,
          id: 'signed-lookup-four',
          label: 'Index 1: look for -4',
          variables: [
            { name: 'index', type: 'int', value: '1', changed: true },
            { name: 'value', type: 'int', value: '4', changed: true },
            { name: 'need', type: 'int', value: '-4', changed: true },
            { name: 'map before lookup', type: 'map', value: '{-3:0}' },
            { name: 'lookup result', type: 'optional index', value: 'missing', changed: true },
          ],
          rows: values([1]),
        },
        {
          ...advance,
          id: 'signed-store-four',
          label: 'Store 4',
          variables: [
            { name: 'index', type: 'int', value: '1' },
            { name: 'map after insertion', type: 'map', value: '{-3:0,4:1}', changed: true },
          ],
          rows: values([1]),
        },
        {
          ...advance,
          id: 'signed-lookup-three',
          label: 'Index 2: find -3',
          variables: [
            { name: 'index', type: 'int', value: '2', changed: true },
            { name: 'value', type: 'int', value: '3', changed: true },
            { name: 'need', type: 'int', value: '-3', changed: true },
            { name: 'map before lookup', type: 'map', value: '{-3:0,4:1}' },
            {
              name: 'lookup result',
              type: 'optional index',
              value: 'found index 0',
              changed: true,
            },
          ],
          rows: values([0, 2]),
        },
        {
          ...finish,
          id: 'signed-return',
          label: 'Return the signed-value pair',
          what: 'Return [0,2] without inserting 3 or scanning 90.',
          variables: [
            { name: 'result', type: 'int[]', value: '[0,2]', changed: true },
            {
              name: 'termination',
              type: 'control flow',
              value: 'return now; remaining input is not scanned',
            },
          ],
          rows: values([0, 2], [3]),
          result: '[0,2]',
        },
      ],
    },
  ];

  return activeProblem;
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

  it('keeps the editor and complete debugger state side by side without a permanent explanation panel', () => {
    const workspace = fixture.nativeElement.querySelector('.ide-workspace') as HTMLElement;
    expect(workspace.querySelector('.source-panel')).not.toBeNull();
    expect(workspace.querySelector('.debugger-panel')).not.toBeNull();
    expect(workspace.querySelector('.explanation-panel')).toBeNull();
    expect(getComputedStyle(workspace).gridTemplateColumns).toBe(
      'minmax(0, 7fr) minmax(300px, 3fr)',
    );

    const variables = [...workspace.querySelectorAll('.variables > div')].map(normalizedText);
    expect(variables).toEqual([
      expect.stringContaining('index intchanged0'),
      expect.stringContaining('answer int—'),
    ]);
    expect(workspace.querySelector('.debugger-output')?.textContent).toContain('Pending');
  });

  it('keeps pinned state and view controls visible while only the lower right pane changes', () => {
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.debugger-view-tabs button',
    );
    const workspace = fixture.nativeElement.querySelector('.ide-workspace') as HTMLElement;
    const source = fixture.nativeElement.querySelector('.source-panel') as HTMLElement;
    const shell = fixture.nativeElement.querySelector('.debugger-shell') as HTMLElement;
    const summary = shell.querySelector('.debugger-summary') as HTMLElement;
    const tabs = shell.querySelector('.debugger-view-tabs') as HTMLElement;
    const debuggerPanel = fixture.nativeElement.querySelector('.debugger-panel') as HTMLElement;
    expect(buttons).toHaveLength(4);
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(shell.contains(summary)).toBe(true);
    expect(shell.contains(tabs)).toBe(true);
    expect(debuggerPanel.contains(summary)).toBe(false);
    expect(debuggerPanel.contains(tabs)).toBe(false);
    expect(debuggerPanel.querySelector('.variable-inspector')).not.toBeNull();

    debuggerPanel.scrollTop = 120;
    buttons[1].click();
    fixture.detectChanges();
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(debuggerPanel.scrollTop).toBe(0);
    expect(debuggerPanel.querySelector('.why-view')).not.toBeNull();
    expect(debuggerPanel.querySelector('.variable-inspector')).toBeNull();
    expect(shell.querySelector('.debugger-summary')).toBe(summary);
    expect(shell.querySelector('.debugger-view-tabs')).toBe(tabs);
    expect(fixture.nativeElement.querySelector('.source-panel')).toBe(source);
    expect(fixture.nativeElement.querySelector('.debugger-panel')).toBe(debuggerPanel);
    expect(fixture.nativeElement.querySelector('.ide-workspace')).toBe(workspace);

    buttons[2].click();
    fixture.detectChanges();
    const prediction = debuggerPanel.querySelector('.predict-view') as HTMLElement;
    expect(prediction).not.toBeNull();
    expect(normalizedText(prediction)).toContain('index');
    const predictionOptions = prediction.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(predictionOptions).toHaveLength(3);
    predictionOptions[0].click();
    fixture.detectChanges();
    prediction.querySelector<HTMLButtonElement>('.learning-action')!.click();
    fixture.detectChanges();
    expect(normalizedText(prediction.querySelector('.prediction-feedback')!)).toContain('Correct.');
    expect(normalizedText(prediction.querySelector('.prediction-feedback')!)).toContain('Advance');

    buttons[3].click();
    fixture.detectChanges();
    expect(debuggerPanel.querySelector('.predict-view')).toBeNull();
    expect(debuggerPanel.querySelector('.complexity-view')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.complexity-feedback')).toBeNull();

    const root = fixture.nativeElement.querySelector('.guided-trace') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(debuggerPanel.querySelector('.variable-inspector')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.sr-status').textContent).toContain(
      'Debugger details opened',
    );
  });

  it('checks both complexity bounds before revealing algorithm-specific reasoning and resets it', () => {
    const activeProblem = problem('complexity', 'Complexity Exercise', 'values');
    activeProblem.complexity.caveat =
      'A fixed alphabet can bound the number of retained keys independently of input length.';
    fixture.componentInstance.activeProblem.set(activeProblem);
    fixture.componentInstance.selectedFixture.set(activeProblem.fixtures[0]);
    fixture.detectChanges();

    const complexity = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.debugger-view-tabs button',
    )[3];
    complexity.click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('#debugger-view-panel') as HTMLElement;
    expect(panel.querySelectorAll('fieldset')).toHaveLength(2);
    expect(panel.querySelector('.complexity-feedback')).toBeNull();
    const actions = panel.querySelectorAll<HTMLButtonElement>('.complexity-actions button');
    expect(actions[0].disabled).toBe(true);

    const select = (name: string, value: string) => {
      const option = panel.querySelector<HTMLInputElement>(
        `input[name="${name}"][value="${value}"]`,
      )!;
      option.click();
      fixture.detectChanges();
    };
    select('guided-complexity-time', 'O(n)');
    select('guided-complexity-space', 'O(1)');
    expect(actions[0].disabled).toBe(false);
    actions[0].click();
    fixture.detectChanges();

    const feedback = normalizedText(panel.querySelector('.complexity-feedback')!);
    expect(feedback).toContain('Correct: both bounds match');
    expect(feedback).toContain('Time: O(n) · Space: O(1)');
    expect(feedback).toContain('Each position is visited once.');
    expect(feedback).toContain('A fixed alphabet can bound');

    const reset = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.trace-controls button',
    )[1];
    reset.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.debugger-view-tabs button[aria-selected="true"]')
        .textContent,
    ).toContain('Debugger');
    complexity.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.complexity-feedback')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('input:checked')).toHaveLength(0);
  });

  it('reveals complexity without requiring a guess and resets the check on language change', () => {
    const complexity = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.debugger-view-tabs button',
    )[3];
    complexity.click();
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('.complexity-actions button')[1]
      .click();
    fixture.detectChanges();
    expect(normalizedText(fixture.nativeElement.querySelector('.complexity-feedback'))).toContain(
      'Answer revealed',
    );

    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('.language-tabs [role="tab"]')[1]
      .click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.debugger-view-tabs button[aria-selected="true"]')
        .textContent,
    ).toContain('Debugger');
    complexity.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.complexity-feedback')).toBeNull();
  });

  it('offers in-pane continuation only while debugger state overflows and is not at the bottom', () => {
    const panel = fixture.nativeElement.querySelector('.debugger-panel') as HTMLElement;
    Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 500 });
    Object.defineProperty(panel, 'scrollTop', { configurable: true, value: 0, writable: true });
    let requestedTop = 0;
    panel.scrollBy = (options?: ScrollToOptions | number, y?: number) => {
      requestedTop = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0);
    };

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
    const more = fixture.nativeElement.querySelector('.debugger-more button') as HTMLButtonElement;
    expect(more).not.toBeNull();
    more.click();
    expect(requestedTop).toBeGreaterThanOrEqual(180);

    panel.scrollTop = 300;
    panel.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.debugger-more button')).toBeNull();

    panel.scrollTop = 100;
    panel.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.debugger-more button')).not.toBeNull();

    Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 200 });
    panel.scrollTop = 0;
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.debugger-more button')).toBeNull();
  });

  it('updates trace state in the existing editor and debugger panes', () => {
    const editor = fixture.nativeElement.querySelector('.source-panel');
    const debuggerPanel = fixture.nativeElement.querySelector('.debugger-panel');
    const next = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.trace-controls .primary',
    )!;
    next.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.source-panel')).toBe(editor);
    expect(fixture.nativeElement.querySelector('.debugger-panel')).toBe(debuggerPanel);
    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('2 of 3');
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

  it('switches to a complete fixture-specific trace when one is available', async () => {
    const activeProblem = problem('prefix', 'Prefix Sums', 'prefix boundaries');
    activeProblem.fixtureTraces = [
      {
        ...activeProblem.trace,
        id: 'prefix-edge-trace',
        fixtureId: 'edge',
        invariant: 'The empty input begins and ends with the neutral prefix state.',
        events: [
          { ...activeProblem.trace.events[0], id: 'edge-start', label: 'Initialize empty input' },
          { ...activeProblem.trace.events[2], id: 'edge-finish', label: 'Return neutral result' },
        ],
      },
    ];
    fixture.componentInstance.activeProblem.set(activeProblem);
    fixture.componentInstance.selectedFixture.set(activeProblem.fixtures[1]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('1 of 2');
    expect(fixture.nativeElement.querySelector('.trace-context').textContent).toContain(
      'prefix boundaries = []',
    );
    expect(fixture.nativeElement.querySelector('.fixture-note')).toBeNull();
    expect(fixture.nativeElement.querySelector('.trace-transcript').textContent).toContain(
      'The empty input begins and ends with the neutral prefix state.',
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

    const debuggerPanel = fixture.nativeElement.querySelector('.debugger-panel') as HTMLElement;
    debuggerPanel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    debuggerPanel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('1 of 3');
  });

  it('terminates the signed-values trace at the successful return and keeps debugger state visible', async () => {
    const activeProblem = signedTwoSumProblem();
    fixture.componentInstance.activeProblem.set(activeProblem);
    fixture.componentInstance.selectedFixture.set(activeProblem.fixtures[2]);
    fixture.detectChanges();
    await fixture.whenStable();

    const next = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.trace-controls .primary',
    )!;
    for (let step = 1; step < 7; step += 1) next.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.step-status').textContent).toContain('7 of 7');
    expect(next.disabled).toBe(true);
    expect(normalizedText(fixture.nativeElement.querySelector('.terminal'))).toContain(
      'Execution returned [0,2]. Next is disabled because the successful return terminated execution.',
    );
    const variableRows = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.variables > div'),
    ].map(normalizedText);
    expect(variableRows).toContainEqual(expect.stringContaining('seen map{-3:0,4:1}'));
    expect(variableRows).toContainEqual(
      expect.stringContaining('lookup optional indexfound index 0'),
    );
    expect(variableRows).toContainEqual(expect.stringContaining('returned int[]changed[0,2]'));
    expect(normalizedText(fixture.nativeElement.querySelector('.debugger-output'))).toContain(
      '[0,2]',
    );
    expect(normalizedText(fixture.nativeElement.querySelector('.debugger-summary'))).toContain(
      'returned[0,2]',
    );
    const predict = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.debugger-view-tabs button',
    )[2];
    expect(predict.disabled).toBe(true);

    const activeLine = fixture.nativeElement.querySelector('.source-line.active') as HTMLElement;
    expect(activeLine.textContent).toContain('return result');
    expect(activeLine.getAttribute('aria-label')).toContain('current instruction');
    const unreachable = fixture.nativeElement.querySelectorAll('.source-line.unreachable');
    expect(unreachable).toHaveLength(2);
    expect(normalizedText(unreachable[0])).toContain('insert current value');
    expect(normalizedText(unreachable[1])).toContain('return empty result');
    expect(
      fixture.nativeElement.querySelector('[aria-label*="not scanned after return"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.sr-status').textContent).toContain(
      'Data state: values',
    );
  });
});
