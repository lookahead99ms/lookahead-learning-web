import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DsaProblemV2 } from '../../content/content.models';
import { FocusStudio } from './focus-studio';
import { complexityVerdict, leadingBigO } from './practice-tools';
import { StudioEditor } from './studio-editor';
import { of } from 'rxjs';
import { DsaStoryLoader } from '../dsa-story/dsa-story-loader';
import { REFERENCE_LANGUAGE_KEY, ReferenceLanguageService } from '../reference-language';
import { PracticeProgressService } from '../practice-progress/practice-progress';

// Preferences belong to one synthetic browser per test, not the worker's shared storage.
let storageDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    },
  });
});
afterEach(() => {
  if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
  else Reflect.deleteProperty(window, 'localStorage');
});

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

async function setup(problem: DsaProblemV2 = sample) {
  TestBed.overrideComponent(StudioEditor, { set: { template: '' } });
  const fixture = TestBed.createComponent(FocusStudio);
  fixture.componentRef.setInput('problem', structuredClone(problem));
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
  it('keeps Your code, the reference solution and the walkthrough on one language', async () => {
    const { fixture, root, click } = await setup();
    const languages = TestBed.inject(ReferenceLanguageService);
    languages.select('java');
    fixture.detectChanges();
    await click('Show solution');
    const selects = () =>
      [...root.querySelectorAll<HTMLSelectElement>('.draft-header select, .reference-header select')]
        .filter((select) => [...select.options].some((option) => option.value === 'python'))
        .map((select) => select.value);
    expect(selects()).toEqual(['java', 'java']);
    const draft = root.querySelector<HTMLSelectElement>('.draft-header select')!;
    draft.value = 'python';
    draft.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(languages.selected()).toBe('python');
    expect(selects()).toEqual(['python', 'python']);
    // A change made elsewhere on the page (the visual walkthrough) reaches both selectors too.
    languages.select('go');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(selects()).toEqual(['go', 'go']);
  });
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
    await click('Show hints panel');
    expect(root.querySelector('.hints-panel')).not.toBeNull();
    await click('Show solution');
    expect(root.querySelector('.hints-panel')).toBeNull();
    expect(root.querySelector('.studio-context app-studio-examples')).toBeNull();
    await click('Close solution');
    expect(root.querySelector('.hints-panel')).not.toBeNull();
    await click('Close hints');
    expect(root.querySelector('.hints-panel')).toBeNull();
    // The side column keeps the examples once the hints close.
    expect(root.querySelector('.studio-context')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.studio-context app-studio-examples')).not.toBeNull();
    await click('Show solution');
    await click('Close solution');
    expect(root.querySelector('.hints-panel')).toBeNull();
    expect(root.querySelector('[aria-label="Show hints panel"]')).not.toBeNull();
  });
  it('reveals one hint at a time and retains the count after closing', async () => {
    const { root, click } = await setup();
    await click('Show hints panel');
    await click('Reveal hint');
    expect(root.querySelectorAll('.hint')).toHaveLength(1);
    expect(root.querySelector('.hints-panel')?.textContent).toContain('Show next hint');
    await click('Close hints');
    await click('Show hints panel');
    expect(root.querySelectorAll('.hint')).toHaveLength(1);
    await click('Show next hint');
    expect(root.querySelectorAll('.hint')).toHaveLength(2);
    expect(root.querySelector('.hints-complete')?.getAttribute('role')).toBe('status');
    expect(root.querySelector('.hints-complete')?.textContent).toBe('All hints revealed');
    expect(root.querySelectorAll('.hints-panel button')).toHaveLength(1);
    expect(root.querySelector('.hints-panel button')?.getAttribute('aria-label')).toBe(
      'Close hints',
    );
    await click('Close hints');
    await click('Show hints panel');
    expect(root.querySelectorAll('.hint')).toHaveLength(2);
  });
  it('hands Approach to the walkthrough, steps every line there and returns from the handoff', async () => {
    const { root, click } = await setup();
    const count = () => root.querySelector('.story-panel .step-count')?.textContent?.trim();
    await click('Approach');
    await click('Visualize solution');
    expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain(
      'Visual walkthrough',
    );
    // The handoff opens the walkthrough's steps; "Every line" is the old guided debugger.
    expect(root.querySelector('.story-panel .mode-switch [aria-pressed=true]')?.textContent?.trim()).toBe('Steps');
    await click('Every line');
    expect(count()).toBe('Step 1 of 2');
    await click('Next step');
    expect(count()).toBe('Step 2 of 2');
    await click('Previous step');
    await click('Next step');
    await click('Close visualization');
    expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain(
      'Approach',
    );
    // The walkthrough remembers its line for this example and language.
    await click('Visualize solution');
    await click('Every line');
    expect(count()).toBe('Step 2 of 2');
  });
  it('closes a Visualize handoff with Escape, except in a field, the problem peek or a dialog', async () => {
    const { fixture, root, click } = await setup();
    const selected = () => root.querySelector('.mode-tabs [aria-selected=true]')?.getAttribute('data-studio-mode');
    const escape = async (target: EventTarget) => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      fixture.detectChanges();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return event;
    };
    const tab = (mode: string) => root.querySelector<HTMLButtonElement>(`[data-studio-mode="${mode}"]`)!;
    await click('Approach');
    await click('Visualize solution');
    expect(root.querySelector('.workspace-actions button')?.getAttribute('aria-keyshortcuts')).toBe('Escape');
    // Not while focus is in a field: the walkthrough's example select or the step-size select.
    const selects = root.querySelectorAll<HTMLSelectElement>('.story-panel select');
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects)
      expect((await escape(select)).defaultPrevented).toBe(false);
    expect(selected()).toBe('visual');
    // Not while a dialog is open (the pattern help is a modal dialog outside the studio).
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    try {
      await escape(tab('visual'));
      expect(selected()).toBe('visual');
    } finally {
      dialog.remove();
    }
    // The problem peek keeps its own Escape: it closes the peek and leaves the walkthrough open.
    const problem = root.querySelector<HTMLButtonElement>('.problem-toggle')!;
    if (problem.getAttribute('aria-pressed') === 'true') await click('Problem');
    problem.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(root.querySelector<HTMLElement>('.problem-rail')!.hidden).toBe(false);
    await escape(root.querySelector('.problem-rail')!);
    expect(root.querySelector<HTMLElement>('.problem-rail')!.hidden).toBe(true);
    expect(selected()).toBe('visual');
    // On the walkthrough itself (here its Visual tab) Escape returns to Approach, focus on its tab.
    const event = await escape(tab('visual'));
    expect(event.defaultPrevented).toBe(true);
    expect(selected()).toBe('approach');
    expect(document.activeElement).toBe(tab('approach'));
    expect([...root.querySelectorAll('.workspace-actions button')].map((button) => button.textContent?.trim())).toEqual([
      'Visualize solution',
    ]);
    // Without a handoff Escape does nothing on the walkthrough.
    await click('Visual walkthrough');
    expect((await escape(tab('visual'))).defaultPrevented).toBe(false);
    expect(selected()).toBe('visual');
    // From Recall too, with Escape pressed inside the walkthrough's controls.
    await click('Recall');
    await click('Visualize solution');
    await escape(root.querySelector('.story-panel .controls button')!);
    expect(selected()).toBe('recall');
  });
  it('steps every recorded line with one player: buttons, Play and the arrow keys', async () => {
    const { fixture, root, click } = await setup();
    await click('Visual walkthrough');
    const panel = root.querySelector<HTMLElement>('.story-panel')!;
    expect(panel.querySelector('app-guided-algorithm-trace')).toBeNull();
    const labels = [...panel.querySelectorAll('.controls > button')].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent?.trim(),
    );
    expect(labels).toEqual(['Previous step', 'Play', 'Next step', 'Restart from the first step']);
    await click('Every line');
    const status = () => panel.querySelector('.step-count')?.textContent;
    const walkthrough = panel.querySelector('.walkthrough')!;
    walkthrough.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(status()).toContain('Step 2 of 2');
    walkthrough.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(status()).toContain('Step 1 of 2');
    // Arrow keys inside a form field keep their normal meaning.
    panel
      .querySelector('.example select')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(status()).toContain('Step 1 of 2');
    vi.useFakeTimers();
    try {
      await click('Play');
      expect(panel.querySelector('.play')?.textContent?.trim()).toBe('Pause');
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      expect(status()).toContain('Step 2 of 2');
      expect(panel.querySelector('.play')?.textContent?.trim()).toBe('Play');
    } finally {
      vi.useRealTimers();
    }
    // Lines already executed are marked while the current one is highlighted.
    expect(panel.querySelector('app-walkthrough-code .line.current')?.textContent).toContain('return result');
    expect(panel.querySelector('app-walkthrough-code .line.ran')?.textContent).toContain('read input');
    expect(panel.querySelector('.caption')?.getAttribute('aria-live')).toBe('polite');
  });
  it('gives both compare headers the same title-then-controls structure', async () => {
    const { root, click } = await setup();
    await click('Show solution');
    for (const header of ['.draft-header', '.reference-header']) {
      const children = [...root.querySelector(header)!.children].map((child) => child.className);
      expect(children.slice(0, 2), header).toEqual([
        expect.stringContaining('code-identity'),
        'code-controls',
      ]);
    }
    expect(
      root.querySelector('.reference-panel > .reference-header + .reference-body'),
    ).not.toBeNull();
  });
  it('shows cost chips, the invariant and both rationale cards full width under both panels', async () => {
    const { root, click } = await setup();
    await click('Show solution');
    // Compare mode: the reasoning leaves the reference column for one section under both panels.
    expect(root.querySelector('.reference-panel .reference-rationale')).toBeNull();
    const rationale = root.querySelector('.working-grid.compare > .compare-rationale')!;
    expect(rationale).not.toBeNull();
    const chips = [...rationale.querySelectorAll('.complexity-chips > div')].map((chip) => [
      chip.querySelector('dt')?.textContent?.trim(),
      chip.querySelector('dd code')?.textContent?.trim(),
    ]);
    expect(chips).toEqual([
      ['Time', 'O(n)'],
      ['Space', 'O(1)'],
    ]);
    expect(rationale.querySelector('.invariant-callout')?.textContent).toBe(
      'InvariantSynthetic invariant.',
    );
    const [approach, mistakes] = [...rationale.querySelectorAll<HTMLDetailsElement>('details')];
    // Open by default: the section is there to be read next to the code.
    expect(approach.open).toBe(true);
    expect(mistakes.open).toBe(true);
    expect(approach.querySelector('summary')?.textContent?.trim()).toBe('Why this approach');
    expect([...approach.querySelectorAll('p b')].map((label) => label.textContent)).toEqual([
      'Why it works',
      "Why it's optimal",
      'When it changes',
    ]);
    expect(approach.textContent).toContain('Alternative contract.');
    expect(mistakes.classList).toContain('mistakes-card');
    expect(mistakes.querySelector('summary')?.textContent?.trim()).toBe('Common mistakes');
    expect(mistakes.querySelector('summary svg')?.getAttribute('aria-hidden')).toBe('true');
    expect([...mistakes.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'A mistake',
    ]);
  });
  it('shortens a mistake that restates the invariant shown above it', async () => {
    const problem = structuredClone(sample);
    problem.invariantAdaptation = 'At most k zeroes stay in the window.';
    problem.practice.commonMistakes = [
      'Breaking this invariant: At most k zeroes stay in the window.',
      'Returning the wrong length.',
    ];
    const { root, click } = await setup(problem);
    await click('Show solution');
    expect(root.querySelector('.invariant-callout')?.textContent).toContain(
      'At most k zeroes stay in the window.',
    );
    expect([...root.querySelectorAll('.mistakes-card li')].map((item) => item.textContent)).toEqual(
      ['Breaking the invariant above.', 'Returning the wrong length.'],
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
  it('keeps the rendered language consistent when the walkthrough sets it', async () => {
    const { fixture, root, click } = await setup();
    await click('Approach');
    await click('Visualize solution');
    await click('Every line');
    await click('Python');
    expect(TestBed.inject(ReferenceLanguageService).selected()).toBe('python');
    expect(root.querySelector('.story-panel [role=tab][aria-selected=true]')?.textContent?.trim()).toBe('Python');
    expect(root.querySelector('.story-panel pre code')?.getAttribute('data-code-language')).toBe('python');
    expect(root.querySelector('.story-panel .essential-state')?.textContent).toContain(
      'published python reference state',
    );
    await click('Close visualization');
    await click('Try it yourself');
    await click('Show solution');
    fixture.detectChanges();
    expect(root.querySelector<HTMLSelectElement>('.reference-header select')?.value).toBe('python');
    expect(root.querySelector<HTMLSelectElement>('.draft-header select')?.value).toBe('python');
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
    // "Every line" in the walkthrough replaced "Open guided debugger".
    expect(actions()).toEqual(['Visualize solution']);
    expect(
      root.querySelector('[aria-label="Understand the approach"]')?.closest('[hidden]'),
    ).toBeNull();
    await click('Visual walkthrough');
    expect(actions()).toEqual([]);
    const controls = root.querySelector('.story-panel .controls')!;
    expect(
      [...controls.children].map((child) => child.getAttribute('aria-label') ?? child.textContent!.trim()),
    ).toEqual([
      'Previous step',
      'Play',
      'Next step',
      expect.stringContaining('Step'),
      'Step 1 of 2',
      'Restart from the first step',
      'Step size',
    ]);
    await click('Recall');
    expect(actions()).toEqual(['Visualize solution']);
    await click('Visualize solution');
    expect(actions()).toEqual(['Close visualization']);
  });
  it('shows numbered tabs, a guide line with one action, and the problem title when the panel is hidden', async () => {
    const { root, click } = await setup();
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.studio-heading .mode-tabs [role=tab]')];
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Try it yourself',
      'Approach',
      'Visual walkthrough',
      'Recall',
    ]);
    expect(tabs.map((tab) => tab.querySelector('.mode-step')?.textContent)).toEqual(['1', '2', '3', '4']);
    expect(root.querySelector('.studio-heading h2')?.classList.contains('visually-hidden')).toBe(true);
    const guide = () => root.querySelector('.mode-guide')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(guide()).toBe('Step 1 of 4 Write your solution, then trace it through each example.');
    await click('Recall');
    expect(guide()).toContain('Step 4 of 4');
    expect(root.querySelectorAll('.workspace-actions button')).toHaveLength(1);
    expect(root.querySelector('.heading-problem-title')).toBeNull();
    expect(root.querySelector('.problem-rail h2')?.textContent).toBe(root.querySelector('.studio')?.getAttribute('aria-label')?.replace(' Focus Studio', ''));
    await click('Problem');
    expect(root.querySelector('.heading-problem-title')).toBeNull();
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
  it('retains the shared Problem state across tabs, debugger and visual handoffs', async () => {
    const { root, click } = await setup();
    const button = root.querySelector<HTMLButtonElement>('.problem-toggle')!;
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    await click('Approach');
    await click('Problem');
    for (const tab of ['Visual walkthrough', 'Recall', 'Try it yourself', 'Approach']) {
      await click(tab);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(root.querySelector<HTMLElement>('.problem-rail')!.hidden).toBe(true);
    }
    await click('Visualize solution');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await click('Close visualization');
    await click('Problem');
    await click('Visualize solution');
    await click('Close visualization');
    await click('Recall');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector<HTMLElement>('.problem-rail')!.hidden).toBe(false);
  });
  it('keeps a semantic reveal style on the solution disclosure', async () => {
    const { root, click } = await setup();
    const reveal = root.querySelector<HTMLButtonElement>('.workspace-actions .reveal')!;
    expect(reveal.textContent).toContain('Show solution');
    expect(reveal.getAttribute('aria-expanded')).toBe('false');
    await click('Show solution');
    expect(reveal.getAttribute('aria-expanded')).toBe('true');
    expect(reveal.classList.contains('reveal')).toBe(true);
  });
  it('pairs authored recall questions with descriptive revealable answers', async () => {
    const { fixture, root, click } = await setup();
    fixture.componentRef.setInput('problem', {
      ...structuredClone(sample),
      teaching: {
        schemaVersion: 'dsa-teaching/v1',
        problemFraming: 'Synthetic framing',
        startingApproach: {
          title: 'Starting idea',
          theory: ['Synthetic explanation'],
          pseudocode: ['inspect input'],
          complexity: { time: 'O(n)', space: 'O(1)' },
        },
        selectedApproach: {
          title: 'Selected idea',
          theory: ['Synthetic explanation'],
          pseudocode: ['inspect input'],
          complexity: { time: 'O(n)', space: 'O(1)' },
        },
        keyDifference: 'Synthetic distinction',
        recall: [
          {
            id: 'invariant',
            label: 'Preserve the invariant',
            question: 'What must stay true?',
            answer: ['The recorded condition holds.'],
            steps: ['Initialize the condition.', 'Preserve it during the update.'],
          },
        ],
      },
    });
    fixture.detectChanges();
    await click('Recall');
    const card = root.querySelector('app-studio-recall-grid .card')!;
    expect(card.querySelector('h4')?.textContent).toBe('What must stay true?');
    expect(card.querySelector('.answer')).toBeNull();
    const reveal = card.querySelector<HTMLButtonElement>('.reveal')!;
    expect(reveal.getAttribute('aria-expanded')).toBe('false');
    expect(reveal.textContent).toContain('Reveal answer');
    expect(reveal.querySelector('.visually-hidden')?.textContent).toContain('Preserve the invariant');
    reveal.click();
    fixture.detectChanges();
    const answer = card.querySelector('.answer')!;
    expect(reveal.getAttribute('aria-expanded')).toBe('true');
    expect(reveal.getAttribute('aria-controls')).toBe(answer.id);
    expect(answer.textContent).toContain('The recorded condition holds.');
    expect(answer.querySelectorAll('li')).toHaveLength(2);
    expect(root.textContent).not.toContain('Check answer 1');
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

describe('Option B story in Focus Studio', () => {
  const story = (problemId: string, fixtureId: string) => ({
    schemaVersion: 'dsa-story/v1',
    problemId,
    fixtureId,
    approach: { variant: 'Synthetic heap walk.', why: 'Synthetic reason.' },
    ideas: ['Read the input.', 'Return the result.'],
    views: [{ id: 'values', kind: 'array', title: 'values', var: 'values' }],
    variables: ['values'],
    steps: [
      { lines: ['start'], say: 'Read {values}.', idea: 0, state: { values: [1, 2] } },
      { lines: ['end'], say: 'Return 2.', idea: 1, state: { values: [1, 2] }, returns: 2, result: 2 },
    ],
  });
  async function withLoader(value: unknown, problem: DsaProblemV2 = sample) {
    TestBed.configureTestingModule({
      providers: [{ provide: DsaStoryLoader, useValue: { load: () => of(value) } }],
    });
    return setup(problem);
  }
  /** The sample with a recorded trace for its second example too. */
  const tracedSecond = {
    ...sample,
    fixtureTraces: [{ ...structuredClone(sample.trace), fixtureId: 'second', events: [structuredClone(sample.trace.events[1])],
      languagePaths: Object.fromEntries(['java', 'python', 'go'].map((language) => [language, [{ sourceAnchor: 'end', eventIndex: 0 }]])) }],
  } as unknown as DsaProblemV2;

  it('replaces the visual walkthrough with the story and drops the debugger action', async () => {
    const { root, click, fixture } = await withLoader(story(sample.id, 'first'));
    expect(root.querySelector('.studio')?.hasAttribute('data-option-b')).toBe(true);
    await click('Approach');
    expect(root.querySelector('.action-debugger')).toBeNull();
    expect(root.querySelector('.workspace-actions .action-visualize')?.textContent?.trim()).toBe('Visualize solution');
    await click('Visual walkthrough');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('.story-panel')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.working-grid')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.visual-controls')).toBeNull();
    expect(root.querySelector('app-dsa-story .approach-sum')?.textContent).toContain('Synthetic heap walk.');
    expect(root.querySelector('app-dsa-story .caption')?.textContent?.trim()).toBe('Read [1, 2].');
    expect(root.querySelectorAll(`[id="${sample.id}-studio-panel-visual"]`)).toHaveLength(1);
    // The guide line no longer repeats the example; the walkthrough's selector shows it.
    expect(root.querySelector('.mode-guide')?.textContent).toContain('Watch the reference solution run');
    expect(root.querySelector('.mode-guide')?.textContent).not.toContain('values = [1,2]');
  });

  describe('Every line inside the story player', () => {
    const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    async function openStory(value = story(sample.id, 'first'), problem: DsaProblemV2 = sample) {
      const result = await withLoader(value, problem);
      await result.click('Visual walkthrough');
      await settle(result.fixture);
      const panel = result.root.querySelector<HTMLElement>('.story-panel')!;
      return { ...result, panel };
    }

    it('has one player and no separate debugger below the story', async () => {
      const { root, panel } = await openStory();
      expect(root.querySelector('.line-debugger')).toBeNull();
      expect(root.querySelector('.line-debugger-toggle')).toBeNull();
      expect(panel.querySelector('app-guided-algorithm-trace')).toBeNull();
      expect(panel.querySelectorAll('.controls')).toHaveLength(1);
      expect(panel.querySelectorAll('[role=tablist]')).toHaveLength(1);
      expect(panel.querySelectorAll('.example select')).toHaveLength(1);
      expect(
        [...panel.querySelectorAll('.mode-switch button')].map((button) => button.textContent?.trim()),
      ).toEqual(['Steps', 'Every line']);
      // Switches are native buttons: Enter and Space work and they are in the tab order.
      for (const button of panel.querySelectorAll<HTMLButtonElement>('.mode-switch button')) {
        expect(button.type).toBe('button');
        expect(button.hasAttribute('tabindex')).toBe(false);
      }
    });

    it('steps the recorded lines of the same example, marks the problem started and keeps the switch', async () => {
      const { root, panel, click, fixture } = await openStory();
      const progress = TestBed.inject(PracticeProgressService);
      expect(progress.records()[sample.id]).toBeUndefined();
      await click('Every line');
      await settle(fixture);
      expect(progress.records()[sample.id]?.status).toBe('started');
      expect(panel.querySelector('.step-count')?.textContent?.trim()).toBe('Step 1 of 2');
      expect(panel.querySelector('.caption-line')?.textContent?.trim()).toBe('Line 1: read input');
      expect(panel.querySelector('app-walkthrough-code .line.current')?.textContent).toContain('read input');
      await click('Next step');
      expect(panel.querySelector('.step-count')?.textContent?.trim()).toBe('Step 2 of 2');
      expect(panel.querySelector('app-walkthrough-code .line.current')?.textContent).toContain('return result');
      // The switch belongs to the walkthrough: other tabs do not reset it.
      await click('Recall');
      await click('Visual walkthrough');
      await settle(fixture);
      expect(panel.querySelector('.mode-switch [aria-pressed=true]')?.textContent?.trim()).toBe('Every line');
      await click('Steps');
      expect(root.querySelector('app-dsa-story .caption')?.textContent?.trim()).toBe('Read [1, 2].');
    });

    it('opens on the animated example, and Visualize carries a chosen example and returns', async () => {
      const { root, panel, click, fixture } = await openStory(story(sample.id, 'second'));
      const select = () => panel.querySelector<HTMLSelectElement>('.example select')!;
      // The story animates the second example, not the problem's default first one.
      expect(select().value).toBe('second');
      expect(panel.querySelector('.notice')).toBeNull();
      await click('Approach');
      const rail = root.querySelector<HTMLSelectElement>('.problem-example select')!;
      rail.value = 'first';
      rail.dispatchEvent(new Event('change'));
      await settle(fixture);
      // Kept default: Visualize opens the animated example.
      await click('Visualize solution');
      await settle(fixture);
      expect(select().value).toBe('second');
      await click('Close visualization');
      expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain('Approach');
    });

    it('Visualize from Recall opens a chosen example line by line and returns to Recall', async () => {
      const { root, panel, click, fixture } = await openStory(story(sample.id, 'first'), tracedSecond);
      await click('Recall');
      const rail = root.querySelector<HTMLSelectElement>('.problem-example select')!;
      rail.value = 'second';
      rail.dispatchEvent(new Event('change'));
      await settle(fixture);
      await click('Visualize solution');
      await settle(fixture);
      expect(panel.querySelector<HTMLSelectElement>('.example select')!.value).toBe('second');
      expect(panel.querySelector('.notice')?.textContent).toContain('This example runs line by line');
      expect(panel.querySelector('.mode-switch [aria-pressed=true]')?.textContent?.trim()).toBe('Every line');
      expect(panel.querySelector('.step-count')?.textContent?.trim()).toBe('Step 1 of 1');
      await click('Close visualization');
      expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain('Recall');
    });

    /** Picks an example in the Problem panel, as the learner does: a change on its select. */
    const pick = async (root: HTMLElement, fixture: Parameters<typeof settle>[0], id: string) => {
      const rail = root.querySelector<HTMLSelectElement>('.problem-example select')!;
      rail.value = id;
      rail.dispatchEvent(new Event('change'));
      await settle(fixture);
    };

    it('Visualize from Approach keeps the chosen first example, line by line, over the animated one', async () => {
      // The story animates the second example; the learner picks the second, then the first.
      const { root, panel, click, fixture } = await openStory(story(sample.id, 'second'), tracedSecond);
      await click('Approach');
      await pick(root, fixture, 'second');
      await pick(root, fixture, 'first');
      await click('Visualize solution');
      await settle(fixture);
      expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain('Visual walkthrough');
      expect(panel.querySelector<HTMLSelectElement>('.example select')!.value).toBe('first');
      // Not the animated example: the player's line-by-line mode and its notice.
      expect(panel.querySelector('.notice')?.textContent).toContain('This example runs line by line');
      expect(panel.querySelector('.mode-switch [aria-pressed=true]')?.textContent?.trim()).toBe('Every line');
      expect(panel.querySelector('.step-count')?.textContent?.trim()).toBe('Step 1 of 2');
      await click('Close visualization');
      expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain('Approach');
      expect(root.querySelector<HTMLSelectElement>('.problem-example select')!.value).toBe('first');
    });

    it('Visualize from Recall opens the animated example until the learner picks one, then keeps it', async () => {
      const { root, panel, click, fixture } = await openStory(story(sample.id, 'second'), tracedSecond);
      const select = () => panel.querySelector<HTMLSelectElement>('.example select')!;
      await click('Recall');
      // No pick yet: today's default, the story's animated example.
      await click('Visualize solution');
      await settle(fixture);
      expect(select().value).toBe('second');
      expect(panel.querySelector('.notice')).toBeNull();
      await click('Close visualization');
      expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain('Recall');
      // A pick in Recall wins over the animated example.
      await pick(root, fixture, 'second');
      await pick(root, fixture, 'first');
      await click('Visualize solution');
      await settle(fixture);
      expect(select().value).toBe('first');
      expect(panel.querySelector('.notice')?.textContent).toContain('This example runs line by line');
      // Approach never picked one, so its handoff still opens the animated example.
      await click('Close visualization');
      await click('Approach');
      await click('Visualize solution');
      await settle(fixture);
      expect(select().value).toBe('second');
    });

    it('restores a saved Python preference in the walkthrough', async () => {
      window.localStorage.setItem(REFERENCE_LANGUAGE_KEY, 'python');
      const { panel } = await openStory();
      expect(panel.querySelector('[role=tab][aria-selected="true"]')?.textContent?.trim()).toBe('Python');
      expect(panel.querySelector('pre code')?.getAttribute('data-code-language')).toBe('python');
    });

    it('follows the page-wide language and sets it, with Your code, from its own tabs', async () => {
      const { root, panel, fixture } = await openStory();
      const languages = TestBed.inject(ReferenceLanguageService);
      const selectedTab = () => panel.querySelector('[role=tab][aria-selected="true"]')?.textContent?.trim();
      expect(selectedTab()).toBe('Java');
      languages.select('go');
      await settle(fixture);
      expect(selectedTab()).toBe('Go');
      expect(panel.querySelector('pre code')?.getAttribute('data-code-language')).toBe('go');
      [...panel.querySelectorAll<HTMLButtonElement>('[role=tab]')]
        .find((tab) => tab.textContent?.trim() === 'Python')!
        .click();
      await settle(fixture);
      expect(languages.selected()).toBe('python');
      expect(selectedTab()).toBe('Python');
      expect(root.querySelector<HTMLSelectElement>('.draft-header select')?.value).toBe('python');
    });
  });

  it('keeps a walkthrough, with Every line, without a usable story', async () => {
    for (const value of [null, story(sample.id, 'missing-fixture'), { schemaVersion: 'other' }]) {
      TestBed.resetTestingModule();
      const { root, click } = await withLoader(value);
      expect(root.querySelector('.studio')?.hasAttribute('data-option-b')).toBe(false);
      await click('Approach');
      expect(root.querySelector<HTMLButtonElement>('.action-visualize')?.hidden).toBe(false);
      expect(root.querySelector('app-dsa-story')).toBeNull();
      expect(root.querySelector('.line-debugger')).toBeNull();
      await click('Visual walkthrough');
      const fallback = root.querySelector('.story-panel app-studio-fallback-walkthrough')!;
      expect(fallback).not.toBeNull();
      expect(fallback.querySelectorAll('.controls')).toHaveLength(1);
      expect(fallback.querySelector('.mode-switch')).not.toBeNull();
      expect(fallback.querySelector('app-studio-diagram')).not.toBeNull();
    }
  });

  /** The shape the studio kept before "Code beside": the guided debugger open in Approach. */
  const savedBeforeRedesign = (mode: 'visual' | 'approach') =>
    JSON.parse(
      JSON.stringify({
        mode,
        problemExpanded: false,
        visualizationOrigin: mode === 'visual' ? 'approach' : null,
        modes: Object.fromEntries(
          ['practice', 'approach', 'visual', 'recall'].map((item) => [
            item,
            {
              fixtureId: 'first',
              language: 'java',
              positions: item === 'approach' || (mode === 'visual' && item === 'visual') ? { 'first/java': 1 } : {},
              revealed: item === 'approach' || (mode === 'visual' && item === 'visual'),
              debugger: item === 'approach' || (mode === 'visual' && item === 'visual'),
              support: true,
            },
          ]),
        ),
      }),
    );
  async function restore(saved: unknown, value: unknown = story(sample.id, 'first')) {
    const result = await withLoader(value);
    (result.fixture.componentInstance as unknown as { state: { set(value: unknown): void } }).state.set(saved);
    result.fixture.detectChanges();
    await result.fixture.whenStable();
    result.fixture.detectChanges();
    const actions = () =>
      [...result.root.querySelectorAll<HTMLButtonElement>('.workspace-actions button')].map((button) =>
        button.textContent?.trim(),
      );
    return { ...result, actions, panel: result.root.querySelector<HTMLElement>('.story-panel')! };
  }

  it('moves a guided debugger saved before the redesign to Every line in the walkthrough', async () => {
    // Saved on the Approach debugger: it opens as the walkthrough's Every line. The walkthrough
    // without a story takes the recorded line too (the story player keeps its own position).
    const fallback = await restore(savedBeforeRedesign('approach'), null);
    expect(fallback.panel.querySelector('app-studio-fallback-walkthrough')).not.toBeNull();
    expect(fallback.panel.querySelector('.mode-switch [aria-pressed=true]')?.textContent?.trim()).toBe('Every line');
    expect(fallback.panel.querySelector('.step-count')?.textContent?.trim()).toBe('Step 2 of 2');
    TestBed.resetTestingModule();
    const { root, panel, click, actions } = await restore(savedBeforeRedesign('approach'));
    expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain('Visual walkthrough');
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('.mode-switch [aria-pressed=true]')?.textContent?.trim()).toBe('Every line');
    expect(actions()).toEqual(['Close visualization']);
    await click('Close visualization');
    // Back on Approach, which shows the approach again and its one handoff.
    expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain('Approach');
    expect(root.querySelector('app-studio-approach')?.closest('section')?.hidden).toBe(false);
    expect(root.querySelector('.reference-panel')).toBeNull();
    expect(actions()).toEqual(['Visualize solution']);
  });

  it('keeps a walkthrough handoff saved before the redesign and closes the debugger behind it', async () => {
    const { root, panel, click, actions } = await restore(savedBeforeRedesign('visual'));
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('.mode-switch [aria-pressed=true]')?.textContent?.trim()).toBe('Every line');
    expect(actions()).toEqual(['Close visualization']);
    await click('Close visualization');
    expect(root.querySelector('.mode-tabs [aria-selected=true]')?.textContent).toContain('Approach');
    expect(root.querySelector('.reference-panel')).toBeNull();
    expect(actions()).toEqual(['Visualize solution']);
  });
});

describe('Focus Studio practice tools', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });
  const text = (root: HTMLElement, selector: string) =>
    root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const buttons = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => !button.closest('[hidden]'))
      .map((button) => button.textContent?.trim() || button.getAttribute('aria-label'));
  const hintsShown = (root: HTMLElement) => {
    const panel = root.querySelector('.hints-panel');
    return !!panel && !panel.closest('[hidden]');
  };
  const selectedTab = (root: HTMLElement) =>
    root.querySelector('.mode-tabs [aria-selected=true]')?.getAttribute('data-studio-mode');
  const press = (target: EventTarget, key: string, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

  it('runs a timed attempt that locks hints and the solution until it stops', async () => {
    const { root, fixture, click } = await setup();
    const tick = (seconds: number) => {
      vi.advanceTimersByTime(seconds * 1000);
      fixture.detectChanges();
    };
    const length = root.querySelector<HTMLSelectElement>('app-studio-timer select')!;
    expect(length.value).toBe('25');
    expect([...length.options].map((option) => option.value)).toEqual(['15', '25', '45']);
    length.value = '15';
    length.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await click('Show hints panel');
    expect(hintsShown(root)).toBe(true);
    // Starting closes open hints and an open solution.
    await click('Show solution');
    expect(root.querySelector('.reference-panel')).not.toBeNull();
    vi.useFakeTimers();
    await click('Start timed attempt');
    const clock = () => root.querySelector('app-studio-timer [role=timer]');
    expect(clock()?.textContent?.trim()).toBe('15:00');
    expect(clock()?.getAttribute('aria-label')).toBe('Time left');
    expect(root.querySelector('.reference-panel')).toBeNull();
    expect(hintsShown(root)).toBe(false);
    expect(root.querySelector('[aria-label="Show hints panel"]')).toBeNull();
    expect(root.querySelector('app-studio-prediction')).toBeNull();
    // The examples are part of the problem, so they stay beside the editor during the attempt.
    expect(root.querySelector('.studio-context app-studio-examples')).not.toBeNull();
    expect(text(root, '.workspace-actions')).toBe(
      'Hints and the solution unlock when you stop the timer.',
    );
    expect(buttons(root)).not.toContain('Show solution');
    tick(1);
    expect(clock()?.textContent?.trim()).toBe('14:59');

    // Other tabs ask first; the timer keeps running and their actions stay locked.
    await click('Approach');
    expect(root.querySelector('app-studio-timer-gate')?.textContent).toContain(
      'Approach reveals the approach',
    );
    expect(root.querySelector<HTMLElement>('app-studio-approach')!.closest('section')!.hidden).toBe(true);
    await click('Continue anyway');
    expect(root.querySelector('app-studio-timer-gate')).toBeNull();
    expect(root.querySelector<HTMLElement>('app-studio-approach')!.closest('section')!.hidden).toBe(false);
    expect(buttons(root)).not.toContain('Open guided debugger');
    expect(root.querySelector('.timer-lock')).not.toBeNull();
    await click('Recall');
    expect(root.querySelector('app-studio-timer-gate')).not.toBeNull();
    expect(root.querySelector<HTMLElement>('.working-grid')!.hidden).toBe(true);
    await click('Back to Try it yourself');
    expect(selectedTab(root)).toBe('practice');
    tick(1);
    expect(clock()?.textContent?.trim()).toBe('14:58');

    await click('Stop');
    expect(buttons(root)).toEqual(expect.arrayContaining(['Resume', 'Reset', 'Show solution']));
    tick(5);
    expect(clock()?.textContent?.trim()).toBe('14:58');
    expect(hintsShown(root)).toBe(false);
    await click('Show hints panel');
    expect(hintsShown(root)).toBe(true);

    await click('Resume');
    expect(hintsShown(root)).toBe(false);
    tick(2);
    expect(clock()?.textContent?.trim()).toBe('14:56');
    await click('Stop');
    await click('Reset');
    expect(clock()).toBeNull();
    expect(buttons(root)).toContain('Start timed attempt');

    // Amber under five minutes; at zero everything unlocks and a polite region says so.
    await click('Start timed attempt');
    tick(10 * 60);
    expect(clock()?.classList.contains('low')).toBe(false);
    tick(1);
    expect(clock()?.textContent?.trim()).toBe('04:59');
    expect(clock()?.classList.contains('low')).toBe(true);
    const live = root.querySelector('app-studio-timer [aria-live=polite]')!;
    expect(live.textContent?.trim()).toBe('');
    tick(5 * 60);
    expect(clock()?.textContent?.trim()).toBe('00:00');
    expect(live.textContent).toContain('Time is up');
    expect(buttons(root)).toEqual(expect.arrayContaining(['Reset', 'Show solution']));
    expect(buttons(root)).not.toContain('Resume');
    expect(root.querySelector('.timer-lock')).toBeNull();
    await click('Approach');
    expect(root.querySelector('app-studio-timer-gate')).toBeNull();
  });
  it('keeps the attempt per problem in session storage and starts only from Try it yourself', async () => {
    const first = await setup();
    await first.click('Approach');
    expect(first.root.querySelector('app-studio-timer button')).toBeNull();
    await first.click('Try it yourself');
    vi.useFakeTimers();
    await first.click('Start timed attempt');
    vi.advanceTimersByTime(3000);
    await first.click('Stop');
    first.fixture.destroy();
    vi.useRealTimers();
    TestBed.resetTestingModule();
    const second = await setup();
    expect(text(second.root, 'app-studio-timer [role=timer]')).toBe('24:57');
    expect(buttons(second.root)).toEqual(expect.arrayContaining(['Resume', 'Reset']));
    await second.click('Approach');
    // A started attempt stays visible on every tab.
    expect(text(second.root, 'app-studio-timer [role=timer]')).toBe('24:57');
  });
  it('saves a complexity prediction and marks the reference chips match or miss', async () => {
    const { root, fixture, click } = await setup();
    const box = root.querySelector('app-studio-prediction')!;
    const [time, space] = [...box.querySelectorAll('select')];
    expect([...time.options].map((option) => option.value)).toEqual([
      'O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)',
    ]);
    expect([...space.options].map((option) => option.value)).toEqual(['O(1)', 'O(log n)', 'O(n)', 'O(n²)']);
    space.value = 'O(n)';
    space.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await click('Save my prediction');
    expect(text(root, 'app-studio-prediction [role=status]')).toBe('Saved: O(n) time, O(n) space');
    await click('Show solution');
    expect(root.querySelector('app-studio-prediction')).toBeNull();
    const chips = [...root.querySelectorAll('.compare-rationale .complexity-chips > div')];
    expect(chips.map((chip) => chip.getAttribute('data-verdict'))).toEqual(['match', 'miss']);
    expect(chips[0].querySelector('dd code')?.textContent).toBe('O(n)');
    expect(chips[1].textContent).toContain('differs from your prediction');
    expect(text(root, '.compare-rationale .prediction-result')).toBe(
      'Your prediction: O(n) time, O(n) space. Time matches; space misses.',
    );
    fixture.destroy();
    TestBed.resetTestingModule();
    // Restored for the same problem in this tab session.
    const again = await setup();
    expect(text(again.root, 'app-studio-prediction [role=status]')).toBe('Saved: O(n) time, O(n) space');
  });
  it('compares by the leading O(...) term', () => {
    expect(leadingBigO('O(n log n) average, O(n²) worst')).toBe('nlogn');
    expect(leadingBigO('O(n·log(n))')).toBe('nlogn');
    expect(leadingBigO('Linear')).toBeNull();
    expect(complexityVerdict('O(n^2) for the table', 'O(n²)')).toBe('match');
    expect(complexityVerdict('O(2^n)', 'O(2ⁿ)')).toBe('match');
    expect(complexityVerdict('O(N)', 'O(n)')).toBe('match');
    expect(complexityVerdict('O(h) recursion stack', 'O(n)')).toBe('miss');
  });
  it('switches tabs, the Problem panel and hints from the keyboard', async () => {
    const { root, fixture, click } = await setup();
    const studio = root.querySelector('.studio')!;
    press(document.body, '2');
    fixture.detectChanges();
    expect(selectedTab(root)).toBe('approach');
    expect(document.activeElement?.getAttribute('data-studio-mode')).toBe('approach');
    // On a focused tab, digits still switch and the arrows keep their own handling (modeKeys).
    press(document.activeElement!, '4');
    fixture.detectChanges();
    expect(selectedTab(root)).toBe('recall');
    press(document.activeElement!, 'ArrowRight');
    fixture.detectChanges();
    expect(selectedTab(root)).toBe('practice');
    expect(studio.classList.contains('problem-pinned')).toBe(true);
    press(document.body, 'P');
    fixture.detectChanges();
    expect(studio.classList.contains('problem-pinned')).toBe(false);
    press(document.body, 'p');
    fixture.detectChanges();
    expect(studio.classList.contains('problem-pinned')).toBe(true);
    expect(hintsShown(root)).toBe(false);
    press(document.body, 'h');
    fixture.detectChanges();
    expect(hintsShown(root)).toBe(true);
    press(document.body, 'h');
    fixture.detectChanges();
    expect(hintsShown(root)).toBe(false);
    press(document.body, 'h');
    fixture.detectChanges();
    expect(hintsShown(root)).toBe(true);
    expect(root.querySelector('[aria-keyshortcuts="2"]')?.textContent).toContain('Approach');
    expect(
      [...root.querySelectorAll('.draft-panel app-studio-shortcuts > span')].map((item) => item.textContent),
    ).toEqual(['Shortcuts outside the editor', '1–4 tabs', 'P problem', 'H hints']);
    expect(root.querySelectorAll('app-studio-shortcuts kbd')).toHaveLength(4);
    // H belongs to Try it yourself and waits for the timer.
    vi.useFakeTimers();
    await click('Start timed attempt');
    press(document.body, 'h');
    fixture.detectChanges();
    expect(hintsShown(root)).toBe(false);
  });
  it('ignores shortcuts while typing, with a modifier, or outside the studio', async () => {
    const { root, fixture } = await setup();
    const editor = document.createElement('div');
    editor.className = 'cm-content';
    editor.setAttribute('contenteditable', 'true');
    root.querySelector('.draft-panel')!.append(editor);
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      for (const [target, init] of [
        [editor, {}],
        [root.querySelector('.draft-header select')!, {}],
        [root.querySelector('app-studio-prediction select')!, {}],
        [document.body, { ctrlKey: true }],
        [document.body, { metaKey: true }],
        [document.body, { altKey: true }],
        [outside, {}],
      ] as [Element, KeyboardEventInit][]) {
        for (const key of ['2', 'p', 'h']) expect(press(target, key, init), key).toBe(true);
        fixture.detectChanges();
        expect(selectedTab(root)).toBe('practice');
        expect(root.querySelector('.studio')?.classList.contains('problem-pinned')).toBe(true);
        expect(hintsShown(root)).toBe(false);
      }
    } finally {
      outside.remove();
    }
  });
});

describe('Focus Studio device progress', () => {
  it('marks the problem started on the first hint and ticks the Recall tab once solved', async () => {
    const { fixture, root, click } = await setup();
    const progress = TestBed.inject(PracticeProgressService);
    expect(progress.record(sample.id)).toBeUndefined();
    await click('Show hints panel');
    // Opening the panel is not engagement yet; the first hint is.
    expect(progress.record(sample.id)).toBeUndefined();
    await click('Reveal hint');
    expect(progress.record(sample.id)?.status).toBe('started');

    const recallTab = () => root.querySelector<HTMLButtonElement>('[data-studio-mode="recall"]')!;
    expect(recallTab().querySelector('.mode-step')!.textContent!.trim()).toBe('4');
    progress.rate(sample.id, 'Solved on my own');
    fixture.detectChanges();
    expect(recallTab().querySelector('.mode-step')!.textContent!.trim()).toBe('✓');
    expect(recallTab().querySelector('.mode-step')!.getAttribute('aria-hidden')).toBe('true');
    expect(recallTab().getAttribute('aria-label')).toBe('Recall, solved');
  });

  it('marks the problem started when the solution opens', async () => {
    const { click } = await setup();
    const progress = TestBed.inject(PracticeProgressService);
    await click('Show solution');
    expect(progress.record(sample.id)?.status).toBe('started');
  });

  it('marks the problem started on the first draft edit', async () => {
    const { fixture } = await setup();
    const progress = TestBed.inject(PracticeProgressService);
    expect(progress.record(sample.id)).toBeUndefined();
    (fixture.componentInstance as unknown as { updateDraft(code: string): void }).updateDraft('class Edited {}');
    expect(progress.record(sample.id)?.status).toBe('started');
  });

  it('places the problem page finish section under the recall cards', async () => {
    @Component({
      imports: [FocusStudio],
      template: `<app-focus-studio [problem]="problem"><p studioFinish class="finish-slot">Finish</p></app-focus-studio>`,
    })
    class Host {
      readonly problem = structuredClone(sample);
    }
    TestBed.overrideComponent(StudioEditor, { set: { template: '' } });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const slot = (fixture.nativeElement as HTMLElement).querySelector('.finish-slot')!;
    const panel = slot.closest('.recall-panel')!;
    expect(panel).not.toBeNull();
    expect(panel.lastElementChild).toBe(slot);
  });
});

describe('Recall card grid', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());
  const recallProblem = (recall: object[]) =>
    ({
      ...structuredClone(sample),
      teaching: {
        schemaVersion: 'dsa-teaching/v1',
        problemFraming: 'Synthetic framing',
        startingApproach: { title: 'Start', theory: ['T'], pseudocode: ['p'], complexity: { time: 'O(n)', space: 'O(1)' } },
        selectedApproach: { title: 'Pick', theory: ['T'], pseudocode: ['p'], complexity: { time: 'O(n)', space: 'O(1)' } },
        keyDifference: 'Synthetic distinction',
        recall,
      },
    }) as unknown as DsaProblemV2;
  const card = (id: string, extra: object = {}) => ({
    id,
    label: `Label ${id}`,
    question: `Question ${id}?`,
    answer: [`Answer ${id}.`],
    ...extra,
  });
  const tags = (root: HTMLElement) =>
    [...root.querySelectorAll('app-studio-recall-grid .card')].map((item) => [
      item.querySelector('.tag')?.textContent?.trim(),
      item.getAttribute('data-kind'),
    ]);

  it('tags a rewritten card by its kind', async () => {
    const kinds = ['concept', 'state', 'correctness', 'complexity', 'trap', 'boundary', 'transfer'];
    const { root, click } = await setup(recallProblem(kinds.map((kind) => card(kind, { kind }))));
    await click('Recall');
    expect(tags(root)).toEqual([
      ['Concept', 'concept'],
      ['State', 'state'],
      ['Correctness', 'correctness'],
      ['Complexity', 'complexity'],
      ['Trap', 'trap'],
      ['Boundary', 'boundary'],
      ['Transfer', 'transfer'],
    ]);
    expect(
      [...root.querySelectorAll('app-studio-recall-grid .number')].map((item) => item.textContent?.trim()),
    ).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    // A kind wins over a template id with another tag.
    TestBed.resetTestingModule();
    const mixed = await setup(recallProblem([card('mistakes', { kind: 'transfer' })]));
    await mixed.click('Recall');
    expect(tags(mixed.root)).toEqual([['Transfer', 'transfer']]);
  });

  it('keeps the id-based tag, in a matching colour, for a template card without a kind', async () => {
    const ids = ['key-idea', 'recognize', 'flow', 'invariant', 'complexity', 'mistakes', 'failure-mode', 'contract-change', 'fixture-trace', 'problem-check-2', 'something-else'];
    const { root, click } = await setup(recallProblem(ids.map((id) => card(id))));
    await click('Recall');
    expect(tags(root)).toEqual([
      ['Key idea', 'concept'],
      ['Spot it', 'concept'],
      ['Flow', 'state'],
      ['Invariant', 'correctness'],
      ['Cost', 'complexity'],
      ['Avoid', 'trap'],
      ['Edge case', 'boundary'],
      ['What if', 'transfer'],
      ['Trace', 'state'],
      ['Check', 'correctness'],
      ['Recall', 'concept'],
    ]);
  });

  it('falls back to the practice checks when no recall is published', async () => {
    const { root, click } = await setup();
    await click('Recall');
    expect(tags(root)).toEqual([['Check', 'correctness']]);
    expect(root.querySelector('app-studio-recall-grid h4')?.textContent).toBe('Explain it.');
    root.querySelector<HTMLButtonElement>('app-studio-recall-grid .reveal')!.click();
    await click('Recall');
    expect(root.querySelector('app-studio-recall-grid .answer')?.textContent).toContain('An explanation.');
  });

  it('reveals, grades, counts and opens every answer without touching progress', async () => {
    const problem = recallProblem(['concept', 'state', 'trap'].map((kind) => card(kind, { kind })));
    const { fixture, root, click } = await setup(problem);
    const progress = TestBed.inject(PracticeProgressService);
    await click('Recall');
    const grid = root.querySelector('app-studio-recall-grid')!;
    const count = () => grid.querySelector('.count')?.textContent?.trim();
    const meter = () => grid.querySelector<HTMLElement>('.meter > span')!.style.width;
    const reveals = () => [...grid.querySelectorAll<HTMLButtonElement>('.reveal')];
    const press = async (button: HTMLButtonElement) => {
      button.click();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    expect(count()).toBe('0 of 3 checked');
    expect(grid.querySelector('.count')?.getAttribute('role')).toBe('status');
    expect(meter()).toBe('0%');
    expect(grid.querySelectorAll('.grade')).toHaveLength(0);

    await press(reveals()[0]);
    expect(reveals()[0].textContent).toContain('Hide answer');
    const group = grid.querySelector('.grade')!;
    expect(group.getAttribute('role')).toBe('group');
    const grades = () => [...grid.querySelectorAll<HTMLButtonElement>('.grade button')];
    expect(grades().map((item) => [item.textContent?.trim(), item.getAttribute('aria-pressed')])).toEqual([
      ['Got it', 'false'],
      ['Partly', 'false'],
      ['Missed', 'false'],
    ]);
    // Revealing alone is not a check; a grade is.
    expect(count()).toBe('0 of 3 checked');
    await press(grades()[0]);
    expect(grades()[0].getAttribute('aria-pressed')).toBe('true');
    expect(count()).toBe('1 of 3 checked');
    expect(meter()).toBe('33%');
    await press(grades()[2]);
    expect(grades().map((item) => item.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(count()).toBe('1 of 3 checked');
    // Pressing the same grade again takes it back.
    await press(grades()[2]);
    expect(count()).toBe('0 of 3 checked');
    await press(grades()[1]);

    const all = () => grid.querySelector<HTMLButtonElement>('.head .all')!;
    expect(all().textContent?.trim()).toBe('Show all answers');
    await press(all());
    expect(reveals().every((item) => item.getAttribute('aria-expanded') === 'true')).toBe(true);
    expect(grid.querySelectorAll('.answer')).toHaveLength(3);
    expect(all().textContent?.trim()).toBe('Hide all answers');
    await press(all());
    expect(grid.querySelectorAll('.answer')).toHaveLength(0);
    expect(all().textContent?.trim()).toBe('Show all answers');
    // Hiding keeps the grade.
    expect(count()).toBe('1 of 3 checked');
    expect(progress.record(sample.id)).toBeUndefined();

    // Kept per problem for this tab session.
    fixture.destroy();
    TestBed.resetTestingModule();
    const again = await setup(problem);
    await again.click('Recall');
    expect(again.root.querySelector('app-studio-recall-grid .count')?.textContent?.trim()).toBe('1 of 3 checked');
    again.fixture.destroy();
    TestBed.resetTestingModule();
    const other = await setup({ ...problem, id: 'algorithmic-other', tags: [] } as unknown as DsaProblemV2);
    await other.click('Recall');
    expect(other.root.querySelector('app-studio-recall-grid .count')?.textContent?.trim()).toBe('0 of 3 checked');
  });

  it('gives the recall grid and the finish section the full workspace width', async () => {
    @Component({
      imports: [FocusStudio],
      template: `<app-focus-studio [problem]="problem"><p studioFinish class="finish-slot">Finish</p></app-focus-studio>`,
    })
    class Host {
      readonly problem = structuredClone(sample);
    }
    TestBed.overrideComponent(StudioEditor, { set: { template: '' } });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-studio-mode="recall"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const panel = root.querySelector('.recall-panel')!;
    expect(panel.hasAttribute('hidden')).toBe(false);
    // One column: no side panel beside the cards and the finish section.
    expect(root.querySelector('.working-grid')!.classList.contains('editor-only')).toBe(true);
    expect(root.querySelector('.studio-context')!.hasAttribute('hidden')).toBe(true);
    expect([...panel.children].map((child) => child.tagName.toLowerCase() + (child.className ? '.' + child.className.split(' ')[0] : ''))).toEqual([
      'app-studio-recall-grid',
      'details.context-disclosure',
      'p.finish-slot',
    ]);
    expect(panel.querySelector('details.context-disclosure')!.hasAttribute('open')).toBe(false);
  });
});

describe('Try it yourself layout', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('lists every example beside the editor, with its explanation on expand', async () => {
    const problem = structuredClone(sample) as DsaProblemV2;
    problem.fixtures[0].explanation = 'The larger value wins.';
    const { root } = await setup(problem);
    const examples = root.querySelector('.studio-context app-studio-examples')!;
    expect(examples.closest('[hidden]')).toBeNull();
    expect(examples.getAttribute('aria-label')).toBe('Examples');
    const items = [...examples.querySelectorAll('li')];
    expect(items.map((item) => [...item.querySelectorAll('code')].map((code) => code.textContent))).toEqual([
      ['values = [1,2]', '2'],
      ['values = [3]', '3'],
    ]);
    expect(items[0].querySelector('.name')?.textContent).toContain('Example 1');
    expect(items[0].querySelector('.name')?.textContent).toContain('First');
    const details = items[0].querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('p')?.textContent).toBe('The larger value wins.');
    // Without an explanation the example is a plain row.
    expect(items[1].querySelector('details')).toBeNull();
    expect(items[1].querySelector('.plain')).not.toBeNull();
    // The side column is not the hints panel until the learner opens it.
    expect(root.querySelector('.hints-panel')).toBeNull();
    expect(root.querySelector('.working-grid')!.classList.contains('editor-only')).toBe(false);
  });

  it('keeps hints closed by default and opens them above the examples', async () => {
    const { fixture, root, click } = await setup();
    const open = root.querySelector<HTMLButtonElement>('[aria-label="Show hints panel"]')!;
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(open.getAttribute('aria-keyshortcuts')).toBe('H');
    expect(root.querySelector('.hints-panel')).toBeNull();
    await click('Show hints panel');
    const context = root.querySelector('.studio-context')!;
    const order = [...context.children].map((child) => child.tagName.toLowerCase() + (child.classList.length ? '.' + child.classList[0] : ''));
    expect(order).toEqual(['section.hints-panel', 'app-studio-examples']);
    expect(root.querySelector('[aria-label="Show hints panel"]')).toBeNull();
    // A new problem starts with the hints closed again.
    fixture.componentRef.setInput('problem', { ...structuredClone(sample), id: 'algorithmic-another', tags: [] });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('.hints-panel')).toBeNull();
    expect(root.querySelector('[aria-label="Show hints panel"]')).not.toBeNull();
  });

  it('styles Reset starter as a neutral button like Copy and Format code', async () => {
    const { root } = await setup();
    const actions = root.querySelector('.draft-header [aria-label="Your code actions"]')!;
    const reset = [...actions.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Reset starter')!;
    const format = [...actions.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Format code')!;
    expect([...reset.classList]).toEqual(['action-reset']);
    expect(reset.classList.contains('primary')).toBe(false);
    expect(reset.classList.contains('action-hint')).toBe(false);
    // No studio rule singles it out any more (it was dashed and tinted); it shares the plain button style.
    const selectors: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of [...rules]) {
        if (rule instanceof CSSStyleRule) selectors.push(rule.selectorText);
        else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of [...document.styleSheets]) walk(sheet.cssRules);
    expect(selectors.some((selector) => selector.includes("button[aria-label^='Restart']") || selector.includes('button[aria-label^="Restart"]'))).toBe(true);
    expect(selectors.filter((selector) => selector.includes('action-reset'))).toEqual([]);
    expect(format.className).toBe('');
  });

  it('puts the prediction box directly under the editor, then the shortcuts legend', async () => {
    const { root, click } = await setup();
    expect(root.querySelector('.draft-header app-studio-shortcuts')).toBeNull();
    const below = () =>
      [...root.querySelector('.draft-panel app-coding-solution-tabs')!.children].map((child) => child.tagName.toLowerCase());
    expect(below()).toEqual(['app-studio-editor', 'app-studio-prediction', 'app-studio-shortcuts']);
    const box = root.querySelector('app-studio-prediction')!;
    expect(box.getAttribute('role')).toBe('group');
    expect(box.getAttribute('aria-label')).toBe('Predict the complexity');
    // With the solution open the prediction leaves and the legend stays under the editor.
    await click('Show solution');
    expect(below()).toEqual(['app-studio-editor', 'app-studio-shortcuts']);
  });
});
