import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DsaProblemV2 } from '../../content/content.models';
import { FocusStudio } from './focus-studio';
import { StudioEditor } from './studio-editor';

const sample = {
  schemaVersion: 'dsa-problem/v2',
  id: 'algorithmic-kth-largest-element-array',
  title: 'Synthetic state fixture',
  complexity: { time: 'O(n)', space: 'O(1)', why: 'Test fixture only.' },
  fixtures: [
    {
      id: 'first',
      label: 'First',
      input: 'values = [1,2]',
      expectedOutput: '2',
      arguments: { values: [1, 2] },
      expected: 2,
    },
    {
      id: 'second',
      label: 'Second',
      input: 'values = [3]',
      expectedOutput: '3',
      arguments: { values: [3] },
      expected: 3,
    },
  ],
  implementations: ['java', 'python', 'go'].map((language) => ({
    language,
    title: language,
    lines: [
      { id: 'start', text: 'read input' },
      { id: 'end', text: 'return result' },
    ],
  })),
  practice: {
    statement: {
      prompt: 'Synthetic contract.',
      inputs: ['values'],
      output: 'result',
      constraints: ['Valid input'],
      edgeCases: ['Single item'],
    },
    starters: { java: 'class Draft {}', python: 'pass', go: 'package main' },
    hints: ['First hint', 'Second hint'],
    canonicalApproach: {
      whyThisApproach: 'Reason.',
      whyOptimal: 'Bound.',
      whenAssumptionChanges: 'Alternative contract.',
    },
    commonMistakes: ['A mistake'],
    checks: [{ kind: 'explain', prompt: 'Explain it.', expected: 'An explanation.' }],
  },
  trace: {
    fixtureId: 'first',
    invariant: 'Synthetic invariant.',
    stateSemantics: 'target-runtime/v1',
    stateTiming: 'after',
    events: ['start', 'end'].map((id) => ({
      id,
      label: id,
      phase: 'Update',
      timing: 'after',
      what: id,
      why: 'Reason.',
      sourceAnchor: { java: id, python: id, go: id },
      variables: [],
      rows: [],
    })),
    languagePaths: Object.fromEntries(
      ['java', 'python', 'go'].map((language) => [
        language,
        ['start', 'end'].map((id, index) => ({
          sourceAnchor: id,
          eventIndex: index,
          variables: [{ name: 'heap', type: 'array', value: '[]' }],
        })),
      ]),
    ),
  },
} as unknown as DsaProblemV2;

async function setup() {
  TestBed.overrideComponent(StudioEditor, { set: { template: '' } });
  const fixture = TestBed.createComponent(FocusStudio);
  fixture.componentRef.setInput('problem', structuredClone(sample));
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const click = async (label: string) => {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) =>
        (item.getAttribute('aria-label') === label || item.textContent?.trim() === label) &&
        !item.closest('[hidden]'),
    );
    expect(button, label).toBeDefined();
    button!.click();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, root, click };
}
describe('production Focus Studio controls', () => {
  it('starts answer-hidden and exposes the complete contract', async () => {
    const { root } = await setup();
    expect(root.querySelector('.problem-rail')?.textContent).toContain('Boundary cases');
    expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain(
      'Try it yourself',
    );
    expect(root.querySelector('.reference-panel')).toBeNull();
    expect(root.querySelectorAll('.workspace-actions[role=group]')).toHaveLength(1);
  });
  it('restores hints visibility after opening and closing a reference', async () => {
    const { root, click } = await setup();
    await click('Show solution');
    expect(root.querySelector('.hints-panel')).toBeNull();
    await click('Close solution');
    expect(root.querySelector('.hints-panel')).not.toBeNull();
    await click('Hints');
    expect(root.querySelector('.studio-context')?.hasAttribute('hidden')).toBe(true);
    await click('Show solution');
    await click('Close solution');
    expect(root.querySelector('.studio-context')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('[aria-label="Show hints panel"]')).not.toBeNull();
  });
  it('keeps instruction controls with the reference and returns from a visual handoff', async () => {
    const { root, click } = await setup();
    await click('Approach');
    await click('Open guided debugger');
    await click('Next instruction');
    expect(root.querySelector('.reference-navigation')?.textContent).toContain(
      'Instruction 2 of 2',
    );
    await click('Visualize solution');
    expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain(
      'Visual walkthrough',
    );
    expect(root.querySelector('.reference-navigation')?.textContent).toContain(
      'Instruction 2 of 2',
    );
    await click('Previous instruction');
    await click('Close visualization');
    expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain(
      'Approach',
    );
    expect(root.querySelector('.reference-navigation')?.textContent).toContain(
      'Instruction 2 of 2',
    );
  });
  it('keeps first visits to other modes answer-hidden', async () => {
    const { root, click } = await setup();
    await click('Show solution');
    await click('Recall');
    expect(root.querySelector('.reference-panel')).toBeNull();
    await click('Visual walkthrough');
    expect(root.querySelector('.reference-panel')).toBeNull();
    await click('Try it yourself');
    expect(root.querySelector('.reference-panel')).not.toBeNull();
  });
  it('keeps the rendered language consistent when the reference header moves', async () => {
    const { fixture, root, click } = await setup();
    await click('Approach');
    await click('Open guided debugger');
    const language = root.querySelector<HTMLSelectElement>('.reference-header select')!;
    language.value = 'python';
    language.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await click('Visualize solution');
    expect(root.querySelector<HTMLSelectElement>('.reference-header select')?.value).toBe('python');
    expect(root.querySelector('.essential-state')?.textContent).toContain(
      'published python reference state',
    );
    await click('Close visualization');
    expect(root.querySelector<HTMLSelectElement>('.reference-header select')?.value).toBe('python');
  });
  it('keeps a mouse peek open while entering the contract and closes after leaving', async () => {
    const { fixture, root, click } = await setup();
    await click('Problem');
    const button = root.querySelector<HTMLButtonElement>('.problem-toggle')!;
    const rail = root.querySelector<HTMLElement>('.problem-rail')!;
    const enter = (element: HTMLElement, pointerType: string) => {
      const event = new Event('pointerenter');
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      element.dispatchEvent(event);
      fixture.detectChanges();
    };
    enter(button, 'touch');
    expect(rail.hidden).toBe(true);
    enter(button, 'mouse');
    expect(rail.hidden).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.dispatchEvent(new Event('pointerleave'));
    enter(rail, 'mouse');
    await new Promise((resolve) => setTimeout(resolve, 180));
    fixture.detectChanges();
    expect(rail.hidden).toBe(false);
    rail.dispatchEvent(new Event('pointerleave'));
    await new Promise((resolve) => setTimeout(resolve, 180));
    fixture.detectChanges();
    expect(rail.hidden).toBe(true);
  });
  it('enforces the four-mode action matrix even after a solution has been opened', async () => {
    const { root, click } = await setup();
    const actions = () =>
      [...root.querySelectorAll<HTMLButtonElement>('.workspace-actions button')]
        .filter((button) => !button.hidden)
        .map((button) => button.textContent!.trim());
    expect(actions()).toEqual(['Show solution']);
    await click('Show solution');
    expect(actions()).toEqual(['Close solution']);
    await click('Approach');
    expect(actions()).toEqual(['Show solution', 'Open guided debugger', 'Visualize solution']);
    await click('Open guided debugger');
    expect(
      root.querySelector('[aria-label="Understand the approach"]')?.closest('[hidden]'),
    ).not.toBeNull();
    await click('Close guided debugger');
    expect(
      root.querySelector('[aria-label="Understand the approach"]')?.closest('[hidden]'),
    ).toBeNull();
    await click('Visual walkthrough');
    expect(actions()).toEqual(['Open guided debugger']);
    const rail = root.querySelector('.visual-controls')!;
    expect([...rail.children].map((child) => child.textContent!.trim())).toEqual([
      'Previous',
      'Next',
      expect.stringContaining('Visual step'),
      'Restart',
    ]);
    await click('Recall');
    expect(actions()).toEqual(['Visualize solution']);
  });
  it('navigates all four tabs by keyboard without resetting mode state', async () => {
    const { root, fixture, click } = await setup();
    await click('Approach');
    const selected = () =>
      root.querySelector<HTMLButtonElement>('.mode-tabs [aria-selected=true]')!;
    selected().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(selected().textContent).toContain('Visual walkthrough');
    selected().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(selected().textContent).toContain('Recall');
    selected().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(selected().textContent).toContain('Try it yourself');
  });
  it('allows keyboard resizing within each panel boundary', async () => {
    const { fixture, root } = await setup();
    const divider = root.querySelector<HTMLElement>('[aria-label="Resize problem panel"]')!;
    for (const [key, expected] of [
      ['End', '32'],
      ['ArrowRight', '32'],
      ['Home', '18'],
      ['ArrowLeft', '18'],
      ['ArrowRight', '20'],
    ]) {
      divider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
      expect(divider.getAttribute('aria-valuenow')).toBe(expected);
    }
  });
});
