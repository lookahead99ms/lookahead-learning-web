import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DsaProblemV2 } from '../../content/content.models';
import { FocusStudio } from './focus-studio';
import { StudioEditor } from './studio-editor';
import { of } from 'rxjs';
import { DsaStoryLoader } from '../dsa-story/dsa-story-loader';
import { ReferenceLanguageService } from '../reference-language';

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
    await click('Close hints');
    expect(root.querySelector('.studio-context')?.hasAttribute('hidden')).toBe(true);
    await click('Show solution');
    await click('Close solution');
    expect(root.querySelector('.studio-context')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('[aria-label="Show hints panel"]')).not.toBeNull();
  });
  it('reveals one hint at a time and retains the count after closing', async () => {
    const { root, click } = await setup();
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
  it('loads the debugger on demand, plays it and steps with arrow keys', async () => {
    const { fixture, root, click } = await setup();
    await click('Approach');
    expect(root.querySelector('app-guided-algorithm-trace')).toBeNull();
    await click('Open guided debugger');
    expect(root.querySelector('app-guided-algorithm-trace')).not.toBeNull();
    const labels = [...root.querySelectorAll('.reference-navigation button')].map((button) =>
      button.textContent?.trim(),
    );
    expect(labels).toEqual(['Previous', 'Play', 'Next', 'Restart']);
    const status = () => root.querySelector('.reference-navigation [role=status]')?.textContent;
    const next = root.querySelector<HTMLButtonElement>('[aria-label="Next instruction"]')!;
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(status()).toContain('Instruction 2 of 2');
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(status()).toContain('Instruction 1 of 2');
    // Arrow keys inside a form field keep their normal meaning.
    root
      .querySelector('.reference-header select')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(status()).toContain('Instruction 1 of 2');
    vi.useFakeTimers();
    try {
      await click('Play');
      expect(root.querySelector('.play-toggle')?.textContent?.trim()).toBe('Pause');
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      expect(status()).toContain('Instruction 2 of 2');
      expect(root.querySelector('.play-toggle')?.textContent?.trim()).toBe('Play');
    } finally {
      vi.useRealTimers();
    }
    // Lines already executed are dimmed while the current one is highlighted.
    expect(root.querySelector('app-studio-trace-body .source-line.current')).not.toBeNull();
    expect(root.querySelector('app-studio-trace-body .source-line.executed')).not.toBeNull();
    expect(root.querySelector('app-trace-state-panel .explain')?.getAttribute('aria-live')).toBe(
      'polite',
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
    await click('Open guided debugger');
    expect(button.getAttribute('aria-expanded')).toBe('false');
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
  it('pairs authored recall questions with descriptive expandable answers', async () => {
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
    const question = root.querySelector('.recall-question')!;
    expect(question.querySelector('h4')?.textContent).toBe('What must stay true?');
    const answer = question.querySelector<HTMLDetailsElement>('details')!;
    expect(answer.open).toBe(false);
    expect(answer.querySelector('summary')?.textContent).toContain('Preserve the invariant');
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
  async function withLoader(value: unknown) {
    TestBed.configureTestingModule({
      providers: [{ provide: DsaStoryLoader, useValue: { load: () => of(value) } }],
    });
    return setup();
  }

  it('replaces the visual walkthrough with the story and drops the debugger action', async () => {
    const { root, click, fixture } = await withLoader(story(sample.id, 'first'));
    expect(root.querySelector('.studio')?.hasAttribute('data-option-b')).toBe(true);
    await click('Approach');
    const debuggerButton = root.querySelector<HTMLButtonElement>('.action-debugger');
    expect(debuggerButton?.hidden).toBe(true);
    await click('Visual walkthrough');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('.story-panel')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.working-grid')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.visual-controls')).toBeNull();
    expect(root.querySelector('app-dsa-story .approach-box')?.textContent).toContain('Synthetic heap walk.');
    expect(root.querySelector('app-dsa-story .caption')?.textContent?.trim()).toBe('Read [1, 2].');
    expect(root.querySelectorAll(`[id="${sample.id}-studio-panel-visual"]`)).toHaveLength(1);
  });

  describe('line-by-line debugger below the story', () => {
    const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    async function openStory() {
      const result = await withLoader(story(sample.id, 'first'));
      await result.click('Visual walkthrough');
      await settle(result.fixture);
      const toggle = result.root.querySelector<HTMLButtonElement>('.story-panel .line-debugger-toggle')!;
      const body = result.root.querySelector<HTMLElement>('.story-panel .line-debugger-body')!;
      return { ...result, toggle, body };
    }

    it('sits below the story, collapsed and not loaded', async () => {
      const { root, toggle, body } = await openStory();
      const panel = root.querySelector('.story-panel')!;
      const parts = Array.from(panel.children).map((child) => child.localName + '.' + child.className);
      expect(parts.indexOf('app-dsa-story.')).toBeLessThan(parts.indexOf('section.line-debugger'));
      expect(toggle.localName).toBe('button');
      expect(toggle.type).toBe('button');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-controls')).toBe(body.id);
      expect(toggle.textContent?.trim()).toBe('Step through the code line by line');
      expect(toggle.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(toggle.querySelector('svg')?.classList).not.toContain('open');
      expect(body.hidden).toBe(true);
      expect(root.querySelector('.line-debugger app-guided-algorithm-trace')).toBeNull();
      expect(
        root.querySelector('.line-debugger')?.getAttribute('aria-labelledby'),
      ).toBe(toggle.id);
    });

    it('opens the shared guided debugger for the same reference solution, and closes it again', async () => {
      const { root, fixture, toggle, body } = await openStory();
      toggle.click();
      await settle(fixture);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.textContent?.trim()).toBe('Hide the line-by-line debugger');
      expect(toggle.querySelector('svg')?.classList).toContain('open');
      expect(body.hidden).toBe(false);
      const trace = body.querySelector('app-guided-algorithm-trace .guided-trace');
      expect(trace).not.toBeNull();
      expect(trace?.getAttribute('aria-label')).toBe(`${sample.title} guided trace`);
      expect(body.querySelector('.trace-summary-values')?.textContent).toContain('values = [1,2]');
      const lines = [...body.querySelectorAll('.source-panel .source-line .line-code')].map((line) =>
        line.textContent,
      );
      expect(lines).toEqual(['read input', 'return result']);
      // The debugger steps on its own; the story stays where it was.
      const next = [...body.querySelectorAll<HTMLButtonElement>('.trace-controls button')].find(
        (button) => button.textContent?.trim() === 'Next',
      )!;
      next.click();
      await settle(fixture);
      expect(body.querySelector('.step-status')?.textContent).toContain('Step 2 of 2');
      expect(root.querySelector('app-dsa-story .caption')?.textContent?.trim()).toBe('Read [1, 2].');

      // Closing hides it but keeps its place; focus stays on the toggle.
      toggle.focus();
      toggle.click();
      await settle(fixture);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.textContent?.trim()).toBe('Step through the code line by line');
      expect(body.hidden).toBe(true);
      expect(document.activeElement).toBe(toggle);
      toggle.click();
      await settle(fixture);
      expect(body.querySelector('.step-status')?.textContent).toContain('Step 2 of 2');
    });

    it('is a native button, so Enter and Space work and it is in the tab order', async () => {
      const { toggle } = await openStory();
      expect(toggle.hasAttribute('tabindex')).toBe(false);
      expect(toggle.disabled).toBe(false);
      expect(toggle.closest('h3')).not.toBeNull();
      // Native buttons turn Enter and Space into a click; the handler is on click.
      expect(toggle.getAttribute('role')).toBeNull();
    });

    it('follows the page-wide language and sets it from its own tabs', async () => {
      const { fixture, toggle, body } = await openStory();
      const languages = TestBed.inject(ReferenceLanguageService);
      toggle.click();
      await settle(fixture);
      const selectedTab = () =>
        body.querySelector('.language-tabs [aria-selected="true"]')?.textContent?.trim();
      expect(selectedTab()).toBe('java');

      languages.select('go');
      await settle(fixture);
      expect(selectedTab()).toBe('go');
      expect(body.querySelector('.guided-trace')?.getAttribute('data-language')).toBe('go');

      [...body.querySelectorAll<HTMLButtonElement>('.language-tabs button')]
        .find((tab) => tab.textContent?.trim() === 'python')!
        .click();
      await settle(fixture);
      expect(languages.selected()).toBe('python');
      expect(selectedTab()).toBe('python');
    });
  });

  it('keeps the shared walkthrough and debugger without a usable story', async () => {
    for (const value of [null, story(sample.id, 'missing-fixture'), { schemaVersion: 'other' }]) {
      TestBed.resetTestingModule();
      const { root, click } = await withLoader(value);
      expect(root.querySelector('.studio')?.hasAttribute('data-option-b')).toBe(false);
      await click('Approach');
      expect(root.querySelector<HTMLButtonElement>('.action-debugger')?.hidden).toBe(false);
      expect(root.querySelector('.story-panel')).toBeNull();
      expect(root.querySelector('.line-debugger')).toBeNull();
    }
  });
});
