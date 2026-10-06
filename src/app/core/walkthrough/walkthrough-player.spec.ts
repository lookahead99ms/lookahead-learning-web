import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { WalkthroughPlayer } from './walkthrough-player';
import { WalkthroughCode } from './walkthrough-code';
import {
  WalkthroughCodeLine,
  codeScrollTop,
  exampleLabel,
  firstSentence,
  walkthroughKey,
} from './walkthrough.model';

const lines = (current: number): WalkthroughCodeLine[] =>
  Array.from({ length: 40 }, (_, index) => ({
    id: `l${index + 1}`,
    number: index + 1,
    html: `line ${index + 1}`,
    current: index + 1 === current,
    ran: index + 1 < current,
  }));

function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(WalkthroughPlayer);
  const all = { language: 'java', count: 5, code: lines(1), ...inputs };
  for (const [name, value] of Object.entries(all)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const emitted: { step: number[]; toggle: number; everyLine: boolean[] } = { step: [], toggle: 0, everyLine: [] };
  fixture.componentInstance.step.subscribe((value) => emitted.step.push(value));
  fixture.componentInstance.toggle.subscribe(() => emitted.toggle++);
  fixture.componentInstance.everyLineChange.subscribe((value) => emitted.everyLine.push(value));
  return { fixture, element, emitted };
}

describe('walkthroughKey', () => {
  const press = (key: string, target: Element, init: KeyboardEventInit = {}) => {
    let action: unknown = 'none';
    target.addEventListener('keydown', (event) => (action = walkthroughKey(event as KeyboardEvent)), { once: true });
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    return action;
  };
  it('maps arrows, Home, End and Space; ignores fields, code, tabs, buttons for Space, and modifiers', () => {
    const host = document.createElement('div');
    host.innerHTML = `<div class="stage"></div><select></select><input type="range"><pre></pre>
      <button role="tab"></button><button class="plain"></button><textarea></textarea>`;
    document.body.append(host);
    const stage = host.querySelector('.stage')!;
    expect(press('ArrowLeft', stage)).toBe('previous');
    expect(press('ArrowRight', stage)).toBe('next');
    expect(press('Home', stage)).toBe('first');
    expect(press('End', stage)).toBe('last');
    expect(press(' ', stage)).toBe('toggle');
    expect(press('Enter', stage)).toBeNull();
    for (const selector of ['select', 'input', 'pre', '[role="tab"]', 'textarea'])
      expect(press('ArrowRight', host.querySelector(selector)!), selector).toBeNull();
    expect(press(' ', host.querySelector('.plain')!)).toBeNull();
    expect(press('ArrowRight', host.querySelector('.plain')!)).toBe('next');
    expect(press('ArrowRight', stage, { shiftKey: true })).toBeNull();
    expect(press('ArrowRight', stage, { metaKey: true })).toBeNull();
    host.remove();
  });
});

describe('walkthrough text helpers', () => {
  it('keeps the first sentence and a short example label', () => {
    expect(firstSentence('Two pointers from both ends. Then more.')).toBe('Two pointers from both ends.');
    expect(firstSentence('No full stop')).toBe('No full stop');
    expect(firstSentence('x'.repeat(200)).length).toBe(158);
    expect(exampleLabel({ id: 'a', label: 'A', input: 'n = 2', expectedOutput: 'true' })).toBe('n = 2 → true');
    expect(exampleLabel({ id: 'a', label: 'A', input: 'v'.repeat(100), expectedOutput: '1' })).toHaveLength(88);
  });

  it('scrolls the code box only when the current line leaves it', () => {
    const box = { scrollTop: 0, clientHeight: 300 };
    expect(codeScrollTop(box, 120, 24)).toBeNull();
    expect(codeScrollTop(box, 290, 24)).toBe(190);
    expect(codeScrollTop({ scrollTop: 400, clientHeight: 300 }, 100, 24)).toBe(0);
  });
});

describe('WalkthroughPlayer', () => {
  it('pins one control bar at the top of the drawing column', () => {
    const { element } = render();
    const left = element.querySelector('.wt-left')!;
    const controls = left.firstElementChild!;
    expect(controls.classList).toContain('controls');
    expect(controls.getAttribute('role')).toBe('group');
    expect(controls.getAttribute('aria-label')).toBe('Walkthrough controls');
    const parts = [...controls.children].map(
      (child) => child.getAttribute('aria-label') ?? child.className.split(' ')[0] ?? child.localName,
    );
    expect(parts).toEqual(['Previous step', 'play', 'Next step', 'scrubber', 'step-count', 'Restart from the first step']);
    expect(element.querySelectorAll('.controls')).toHaveLength(1);
    // Pinned under the page header while the column scrolls: the bar computes as sticky.
    expect(getComputedStyle(controls).position).toBe('sticky');
    // The drawing, the caption and the values follow the controls in the same column, then the
    // host's extra detail (hidden with the drawing on the narrow Code pane).
    expect([...left.children].map((child) => child.className.split(' ')[0])).toEqual([
      'controls',
      'wt-stage',
      'caption-row',
      'wt-extra',
    ]);
    // The step count names the position.
    expect(element.querySelector('.step-count')?.textContent?.trim()).toBe('Step 1 of 5');
    expect(element.querySelector('input[type="range"]')?.getAttribute('aria-valuetext')).toBe('Step 1 of 5');
  });

  it('announces each step politely, and stays silent while playing', () => {
    const { fixture, element } = render({ index: 1 });
    const count = element.querySelector('.step-count')!;
    expect(count.getAttribute('role')).toBe('status');
    expect(count.getAttribute('aria-live')).toBe('polite');
    expect(count.textContent?.trim()).toBe('Step 2 of 5');
    fixture.componentRef.setInput('playing', true);
    fixture.detectChanges();
    expect(count.getAttribute('aria-live')).toBe('off');
    expect(element.querySelector('.caption')?.getAttribute('aria-live')).toBe('off');
  });

  it('keeps the stage from pushing the caption away: "+N more views below" scrolls to the next', () => {
    const { fixture, element } = render();
    const stage = element.querySelector<HTMLElement>('.wt-stage')!;
    const at = (top: number, height: number) => () => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height }) as DOMRect;
    const figures = [0, 200, 420, 640].map((top) => {
      const figure = document.createElement('figure');
      figure.getBoundingClientRect = at(top, 180);
      return figure;
    });
    stage.prepend(...figures);
    stage.getBoundingClientRect = at(0, 300);
    Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(stage, 'scrollHeight', { configurable: true, value: 820 });
    const scrolled: number[] = [];
    stage.scrollTo = ((options: ScrollToOptions) => scrolled.push(options.top ?? -1)) as typeof stage.scrollTo;
    stage.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    const more = element.querySelector<HTMLButtonElement>('.more-below')!;
    expect(more.textContent?.trim()).toBe('+2 more views below');
    more.click();
    // The second view is cut at the stage's bottom edge: it scrolls to its top.
    expect(scrolled).toEqual([192]);
    // Everything in view: the cue goes.
    Object.defineProperty(stage, 'scrollHeight', { configurable: true, value: 300 });
    stage.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(element.querySelector('.more-below')).toBeNull();
    figures.forEach((figure) => figure.remove());
  });

  it('reports steps, play and the mode switch, and hides the switch without a trace', () => {
    const { fixture, element, emitted } = render({ index: 2 });
    expect(element.querySelector('.mode-switch')).toBeNull();
    const button = (label: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label,
      )!;
    button('Next step').click();
    button('Previous step').click();
    button('Restart from the first step').click();
    button('Play').click();
    expect(emitted.step).toEqual([3, 1, 0]);
    expect(emitted.toggle).toBe(1);
    fixture.componentRef.setInput('everyLineAvailable', true);
    fixture.detectChanges();
    button('Every line').click();
    button('Steps').click();
    expect(emitted.everyLine).toEqual([true, false]);
  });

  it('keeps the current code line in view as the step changes', () => {
    const { fixture, element } = render({ code: lines(1) });
    const box = element.querySelector<HTMLElement>('app-walkthrough-code pre')!;
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 240 });
    Object.defineProperty(box, 'offsetTop', { configurable: true, value: 0 });
    for (const line of box.querySelectorAll<HTMLElement>('[data-line]')) {
      const number = Number(line.dataset['line']);
      Object.defineProperty(line, 'offsetTop', { configurable: true, value: (number - 1) * 24 });
      Object.defineProperty(line, 'offsetHeight', { configurable: true, value: 24 });
    }
    fixture.componentRef.setInput('code', lines(30));
    fixture.detectChanges();
    expect(box.querySelector('.line.current')?.getAttribute('data-line')).toBe('30');
    expect(box.querySelectorAll('.line.current')).toHaveLength(1);
    expect(box.scrollTop).toBe(Math.round(29 * 24 - 240 / 3));
    // Already in view: the box does not move.
    const before = box.scrollTop;
    fixture.componentRef.setInput('code', lines(31));
    fixture.detectChanges();
    expect(box.scrollTop).toBe(before);
  });

  it('folds the values already drawn behind "+N drawn above"', () => {
    const { fixture, element } = render({
      values: [
        { name: 'heights', value: '[1, 8]', drawn: true },
        { name: 'left', value: '1', changed: true },
        { name: 'right', value: '8', drawn: true },
      ],
    });
    const names = () => [...element.querySelectorAll('.variable dt')].map((node) => node.textContent?.trim());
    expect(names()).toEqual(['left']);
    const toggle = element.querySelector<HTMLButtonElement>('.drawn-toggle')!;
    expect(toggle.textContent?.trim()).toBe('+2 drawn above');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(names()).toEqual(['heights', 'left', 'right']);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fixture.componentRef.setInput('values', [{ name: 'left', value: '1' }]);
    fixture.detectChanges();
    expect(element.querySelector('.drawn-toggle')).toBeNull();
  });

  it('keeps a local named result apart from the returned value', () => {
    // Rows are tracked by kind and name: no duplicate-key warning (NG0955) for two "result"s.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const values = (local: string) => [
      { name: 'result', value: local },
      { name: 'result', value: 'not returned yet', unset: true, kind: 'result' },
    ];
    const { fixture, element } = render({ values: values('[0]') });
    fixture.componentRef.setInput('values', values('[0, 1]'));
    fixture.detectChanges();
    const rows = [...element.querySelectorAll('.variable')];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.getAttribute('data-kind'))).toEqual([null, 'result']);
    expect(rows[0].querySelector('dd')?.textContent).toBe('[0, 1]');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('NG0955');
    warn.mockRestore();
  });

  it('offers one language choice and moves it with the arrow keys', async () => {
    const { fixture, element } = render();
    const chosen: string[] = [];
    fixture.componentInstance.languageChange.subscribe((value) => chosen.push(value));
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Java', 'Python', 'Go']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    tabs[2].click();
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(chosen).toEqual(['go', 'python']);
    expect(element.querySelectorAll('[role="tablist"]')).toHaveLength(1);
  });

  it('starts on the drawing and switches to the code on a narrow screen', () => {
    const { fixture, element } = render();
    const walkthrough = element.querySelector('.walkthrough')!;
    const switchButtons = [...element.querySelectorAll<HTMLButtonElement>('.pane-switch button')];
    expect(switchButtons.map((button) => button.textContent?.trim())).toEqual(['Drawing', 'Code']);
    expect(walkthrough.getAttribute('data-pane')).toBe('drawing');
    switchButtons[1].click();
    fixture.detectChanges();
    expect(walkthrough.getAttribute('data-pane')).toBe('code');
    expect(switchButtons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    const css = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
    expect(css).toContain('@container walkthrough (max-width: 760px)');
  });

  it('labels the code with its language and copies the source', () => {
    const fixture = TestBed.createComponent(WalkthroughCode);
    fixture.componentRef.setInput('lines', lines(3));
    fixture.componentRef.setInput('language', 'python');
    fixture.componentRef.setInput('source', 'print(1)');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('pre')?.getAttribute('aria-label')).toBe('Python reference solution');
    expect(element.querySelector('app-code-copy-button')).not.toBeNull();
    expect(element.querySelector('.sr-only')?.textContent?.trim()).toBe('Current line 3.');
  });
});
