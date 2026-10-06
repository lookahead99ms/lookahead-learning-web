import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatternProblemV1 } from '../../content/content.models';
import { ReferenceLanguageService } from '../reference-language';
import { DsaStory } from './dsa-story';
import { twoSumProblem, twoSumStory } from './dsa-story.fixture';

function render(problem: PatternProblemV1 = twoSumProblem()) {
  const fixture = TestBed.createComponent(DsaStory);
  fixture.componentRef.setInput('story', twoSumStory());
  fixture.componentRef.setInput('problem', problem);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
    );
  const click = (label: string) => {
    const target = button(label);
    expect(target, label).toBeDefined();
    target!.click();
    fixture.detectChanges();
  };
  const key = (key: string, target: Element = element.querySelector('.walkthrough')!) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const text = (selector: string) => element.querySelector(selector)?.textContent?.trim();
  const names = () => [...element.querySelectorAll('.values .variable dt')].map((node) => node.textContent?.trim());
  return { fixture, element, click, button, key, text, names };
}

/** The Two Sum fixture with a second example whose recorded Python trace has state. */
function withSecondExample(): PatternProblemV1 {
  const problem = twoSumProblem();
  const event = (id: string, anchor: string, variables: { name: string; value: string; changed?: boolean; type?: string }[], result?: string) => ({
    id,
    label: anchor,
    phase: 'Run',
    timing: 'after',
    sourceAnchor: { python: anchor, java: 'j-1', go: 'g-1' },
    what: `Execute two_sum at source line 2: ${anchor}`,
    why: "This is the next instruction reached by the implementation's actual control flow.",
    variables: variables.map((item) => ({ type: 'integer', changed: false, ...item })),
    rows: [],
    ...(result !== undefined ? { result } : {}),
  });
  return {
    ...problem,
    fixtures: [
      ...problem.fixtures,
      {
        id: 'pair',
        label: 'Pair',
        input: 'values = [3,3], target = 6',
        expectedOutput: '[0,1]',
        explanation: 'Two equal values make the pair.',
      },
    ],
    fixtureTraces: [
      {
        schemaVersion: 'guided-trace/v1',
        id: 'pair-trace',
        fixtureId: 'pair',
        invariant: 'seen holds every earlier value.',
        legend: [],
        events: [
          event('p0', 'py-2', [{ name: 'seen', value: '{}', changed: true }]),
          event('p1', 'py-3', [
            { name: 'index', value: '0', changed: true },
            { name: 'values', value: '[3, 3]', type: 'int[]' },
          ]),
          event('p2', 'py-7', [], '[0, 1]'),
        ],
        languagePaths: {
          python: ['py-2', 'py-3', 'py-7'].map((sourceAnchor, eventIndex) => ({ sourceAnchor, eventIndex })),
        },
      },
    ],
  } as unknown as PatternProblemV1;
}

afterEach(() => vi.useRealTimers());

describe('DsaStory', () => {
  it('shows the approach in one line, every view, the values not drawn and the caption', () => {
    const { element, click, text, names } = render();
    // Approach is one line until opened.
    expect(element.querySelector('.approach-box')).toBeNull();
    expect(text('.approach-sum')).toContain('One pass with a hash map.');
    expect(text('.approach-sum')).toContain('Time O(n)');
    click('Approach');
    expect(element.querySelector('.approach-box')?.textContent).toContain('One pass with a hash map.');
    expect(element.querySelector('.approach-box')?.textContent).toContain('Unsorted input; O(1) lookups.');
    expect(element.querySelector('.approach-box')?.textContent).toContain('Time O(n)');
    const captions = [...element.querySelectorAll('.view figcaption')].map((node) => node.textContent?.trim());
    expect(captions[0]).toContain('values');
    expect(captions[1]).toContain('seen');
    expect(element.querySelector('.values')?.getAttribute('aria-label')).toBe('Values at this step');
    // values and seen are drawn above, so they fold behind "+2 drawn above".
    expect(names()).toEqual(['target', 'index', 'value', 'need', 'result']);
    click('+2 drawn above');
    expect(names()).toEqual(['values', 'target', 'seen', 'index', 'value', 'need', 'result']);
    expect(text('.drawn-toggle')).toBe('Hide drawn values');
    expect(text('.caption')).toBe('seen starts empty.');
    expect(text('.step-count')).toBe('Step 1 of 6');
  });

  it('steps forward: pointer, tones, changed values, text alternative and code line all move', () => {
    const { element, click, text } = render();
    click('Next step');
    click('Next step');
    expect(text('.step-count')).toBe('Step 3 of 6');
    expect(text('.caption')).toBe('Is 7 in seen? No.');
    expect(element.querySelector('.entry.tone-miss')?.textContent).toContain('7');
    expect(element.querySelector('.cell.tone-active .v')?.textContent).toBe('2');
    const summaries = [...element.querySelectorAll('.view .sr-only')].map((node) => node.textContent);
    expect(summaries[1]).toContain('Looked up 7: not present.');
    click('Next step');
    click('+2 drawn above');
    const changed = [...element.querySelectorAll('.variable.changed dt')].map((node) => node.textContent?.trim());
    expect(changed).toEqual(['seen']);
    expect(element.querySelector('.variable.changed')?.classList).toContain('drawn');
    expect(element.querySelector('.entry.tone-new .k')?.textContent).toBe('2');
  });

  it('highlights the lines the step ran in the page-wide language and switches languages', () => {
    const { element, click } = render();
    const language = TestBed.inject(ReferenceLanguageService);
    language.select('python');
    click('Next step');
    expect(element.querySelector('.line.current')?.textContent).toContain('py-5');
    expect([...element.querySelectorAll('.line.ran')].map((line) => line.textContent?.trim())).toEqual([
      '3# py-3',
      '4# py-4',
    ]);
    click('Java');
    expect(language.selected()).toBe('java');
    expect(element.querySelector('pre code')?.getAttribute('data-code-language')).toBe('java');
    expect(element.querySelector('.line.current')?.textContent).toContain('j-5');
    expect(element.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('Java');
  });

  it('keeps the code panel on the line of every step, in every language', () => {
    const { element, click, fixture } = render();
    const language = TestBed.inject(ReferenceLanguageService);
    language.select('python');
    fixture.detectChanges();
    const expected = ['py-2', 'py-5', 'py-6', 'py-8', 'py-6', 'py-7'];
    for (const [index, anchor] of expected.entries()) {
      const current = element.querySelectorAll('.line.current');
      expect(current, `step ${index + 1}`).toHaveLength(1);
      expect(current[0].textContent).toContain(anchor);
      expect(current[0].getAttribute('aria-current')).toBe('step');
      if (index < expected.length - 1) click('Next step');
    }
    // The same step in Java: the native path's line for that step.
    click('Java');
    expect(element.querySelector('.line.current')?.textContent).toContain('j-7');
  });

  it('ends on the result and lets the learner jump with the scrubber', () => {
    const { element, fixture, text } = render();
    const range = element.querySelector<HTMLInputElement>('input[type="range"]')!;
    range.value = '6';
    range.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(text('.caption')).toBe('return [0, 1].');
    const result = element.querySelector('.variable[data-kind="result"] dd');
    expect(result?.textContent).toBe('[0, 1]');
    expect(element.querySelectorAll('.cell.tone-found')).toHaveLength(2);
    expect((element.querySelector('button[aria-label="Next step"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('steps with the arrow keys and keeps the caption quiet while playing', () => {
    const { element, key, click, text } = render();
    key('ArrowRight');
    expect(text('.step-count')).toBe('Step 2 of 6');
    expect(element.querySelector('.caption')?.getAttribute('aria-live')).toBe('polite');
    click('Play');
    expect(element.querySelector('.caption')?.getAttribute('aria-live')).toBe('off');
    click('Pause');
  });

  it('never plays on its own; Play runs to the last step and stops', () => {
    vi.useFakeTimers();
    const { element, fixture, click, text } = render();
    vi.advanceTimersByTime(20_000);
    fixture.detectChanges();
    expect(text('.step-count')).toBe('Step 1 of 6');
    click('Play');
    expect(element.querySelector('.play')?.getAttribute('aria-pressed')).toBe('true');
    vi.advanceTimersByTime(350 + 4 * 1000);
    fixture.detectChanges();
    expect(text('.step-count')).toBe('Step 6 of 6');
    expect(text('.play')).toBe('Play');
    vi.advanceTimersByTime(20_000);
    fixture.detectChanges();
    expect(text('.step-count')).toBe('Step 6 of 6');
  });

  describe('keyboard', () => {
    it('Left/Right step, Home/End jump and Space plays or pauses', () => {
      const { element, key, text } = render();
      key('End');
      expect(text('.step-count')).toBe('Step 6 of 6');
      key('ArrowLeft');
      expect(text('.step-count')).toBe('Step 5 of 6');
      key('Home');
      expect(text('.step-count')).toBe('Step 1 of 6');
      key(' ');
      expect(element.querySelector('.play')?.getAttribute('aria-pressed')).toBe('true');
      key(' ');
      expect(element.querySelector('.play')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('leaves fields, the code box, tabs and buttons their own keys', () => {
      const { element, key, text } = render();
      for (const target of [
        element.querySelector('input[type="range"]')!,
        element.querySelector('pre')!,
        element.querySelector('[role="tab"]')!,
      ])
        key('ArrowRight', target);
      expect(text('.step-count')).toBe('Step 1 of 6');
      // Space on a button is that button's own activation, not Play.
      key(' ', element.querySelector('button[aria-label="Next step"]')!);
      expect(element.querySelector('.play')?.getAttribute('aria-pressed')).toBe('false');
      // A modifier keeps the browser's meaning.
      element
        .querySelector('.walkthrough')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
      expect(text('.step-count')).toBe('Step 1 of 6');
    });

    it('keeps focus on a usable control when Next or Previous becomes disabled', async () => {
      const { element, fixture, click } = render();
      const range = element.querySelector<HTMLInputElement>('input[type="range"]')!;
      range.value = '5';
      range.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const next = element.querySelector<HTMLButtonElement>('button[aria-label="Next step"]')!;
      next.focus();
      click('Next step');
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(next.disabled).toBe(true);
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Previous step');
    });
  });

  describe('Every line', () => {
    it('is hidden when the example has no recorded trace in the language', () => {
      const { element, fixture } = render();
      const languages = TestBed.inject(ReferenceLanguageService);
      // Python records the line trace: the switch shows.
      languages.select('python');
      fixture.detectChanges();
      expect(element.querySelector('.mode-switch')).not.toBeNull();
      // The fixture's Java and Go paths carry no runtime state, so there is no line trace.
      for (const language of ['java', 'go'] as const) {
        languages.select(language);
        fixture.detectChanges();
        expect(element.querySelector('.mode-switch'), language).toBeNull();
      }
    });

    it('draws the recorded state with the story\'s own cells, not a second drawing style', () => {
      const { element, fixture, click } = render(withSecondExample());
      TestBed.inject(ReferenceLanguageService).select('python');
      fixture.detectChanges();
      const select = element.querySelector<HTMLSelectElement>('.example select')!;
      select.value = 'pair';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      click('Next step');
      const stage = element.querySelector('.line-stage')!;
      expect(stage.querySelector('app-trace-state-panel')).toBeNull();
      expect(stage.textContent).not.toMatch(/\bSTATE\b/);
      const figure = stage.querySelector('figure.view[data-kind="array"]')!;
      expect(figure.querySelector('figcaption')?.textContent).toContain('values');
      expect(figure.querySelector('figcaption .kind')?.textContent?.trim()).toBe('recorded');
      // The same cell markup as the story's arrays; the cell `index` points at is marked.
      const cells = [...figure.querySelectorAll('.cells > .cell')];
      expect(cells.map((cell) => cell.querySelector('.v')?.textContent)).toEqual(['3', '3']);
      expect(cells[0].classList).toContain('tone-active');
      // Inside the player the state inspector uses the player's type sizes.
      expect(element.querySelector('app-studio-inspector')?.getAttribute('data-scale')).toBe('player');
      expect(element.querySelector('app-studio-essential-state')?.getAttribute('data-scale')).toBe('player');
    });

    it('steps the same player through the recorded lines of the same example', () => {
      const { element, fixture, click, text } = render();
      const story = fixture.componentInstance as unknown as { everyLine: () => boolean };
      TestBed.inject(ReferenceLanguageService).select('python');
      fixture.detectChanges();
      expect(element.querySelector('.mode-switch')).not.toBeNull();
      click('Next step');
      click('Every line');
      expect(story.everyLine()).toBe(true);
      expect(element.querySelector('.mode-switch [aria-pressed="true"]')?.textContent?.trim()).toBe('Every line');
      expect(text('.step-count')).toBe('Step 1 of 11');
      expect(text('.caption-line')).toBe('Line 2: # py-2');
      expect(element.querySelector('.line.current')?.textContent).toContain('py-2');
      // One player: the same controls, no second debugger.
      expect(element.querySelectorAll('button[aria-label="Next step"]')).toHaveLength(1);
      expect(element.querySelectorAll('input[type="range"]')).toHaveLength(1);
      expect(element.querySelector('app-guided-algorithm-trace')).toBeNull();
      click('Next step');
      expect(text('.step-count')).toBe('Step 2 of 11');
      expect(element.querySelector('.line.current')?.textContent).toContain('py-3');
      expect([...element.querySelectorAll('.line.ran')].map((line) => line.textContent?.trim())).toEqual(['2# py-2']);
      // The ideas stay as a jump list; choosing one returns to the story's steps.
      const ideas = [...element.querySelectorAll<HTMLButtonElement>('.ideas button')];
      expect(ideas.map((item) => item.getAttribute('aria-current'))).toEqual([null, null, null]);
      ideas[2].click();
      fixture.detectChanges();
      expect(ideas[2].getAttribute('aria-current')).toBe('step');
      expect(story.everyLine()).toBe(false);
      expect(text('.step-count')).toBe('Step 3 of 6');
      expect(text('.caption')).toBe('Is 7 in seen? No.');
    });

    it('runs another example line by line with its own trace, and Steps returns to the story', () => {
      const { element, fixture, click, text, names } = render(withSecondExample());
      TestBed.inject(ReferenceLanguageService).select('python');
      fixture.detectChanges();
      const select = element.querySelector<HTMLSelectElement>('.example select')!;
      expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
        'values = [2,7,11,15], target = 26 → [2,3]',
        'values = [3,3], target = 6 → [0,1] (line by line)',
      ]);
      select.value = 'pair';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(text('.notice')).toContain('Steps animate values = [2,7,11,15], target = 26.');
      expect(text('.notice')).toContain('Two equal values make the pair.');
      expect(text('.step-count')).toBe('Step 1 of 3');
      expect(names()).toEqual(['seen', 'result']);
      click('Next step');
      click('Next step');
      expect(element.querySelector('.variable[data-kind="result"] dd')?.textContent).toBe('[0, 1]');
      expect(text('.caption')).toContain('Returns [0, 1].');
      // The state inspector and the transcript are folded under the values.
      const details = [...element.querySelectorAll('app-walkthrough-line-detail > details > summary')].map((node) =>
        node.textContent?.trim(),
      );
      expect(details).toEqual(['State inspector and all recorded locals', 'Read every line as text']);
      expect(element.querySelector('app-walkthrough-line-detail .essential-state')).not.toBeNull();
      expect(element.querySelector('app-walkthrough-line-detail li[aria-current="step"]')?.textContent).toContain(
        'line 7: # py-7',
      );
      click('Steps');
      expect(select.value).toBe('standard');
      expect(text('.step-count')).toBe('Step 1 of 6');
      expect(element.querySelector('.notice')).toBeNull();
    });
  });

  it('switches between Drawing and Code on a narrow screen', () => {
    const { element, click } = render();
    const walkthrough = element.querySelector('.walkthrough')!;
    const pressed = () => element.querySelector('.pane-switch [aria-pressed="true"]')?.textContent?.trim();
    expect(walkthrough.getAttribute('data-pane')).toBe('drawing');
    expect(pressed()).toBe('Drawing');
    click('Code');
    expect(walkthrough.getAttribute('data-pane')).toBe('code');
    expect(pressed()).toBe('Code');
    // The caption and the controls are outside the halves the switch hides.
    expect(element.querySelector('.wt-left > .controls')).not.toBeNull();
    expect(element.querySelector('.wt-left > .caption-row')).not.toBeNull();
    expect(element.querySelector('.wt-right app-walkthrough-code')).not.toBeNull();
  });
});
