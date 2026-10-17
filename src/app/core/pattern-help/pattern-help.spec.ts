import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { describe, expect, it } from 'vitest';
import { PatternHelp } from './pattern-help';

const MAP = [
  {
    sections: [
      {
        table: { rows: [['1', '<strong>Two pointers</strong>'], ['2', 'Sliding window']] },
        patternMap: {
          signals: [
            {
              key: 'sorted input',
              intro: 'A sorted array or list',
              candidates: [{ unit: 1, when: 'when you compare two ends' }],
              check: 'Is the input really sorted?',
            },
          ],
        },
      },
    ],
  },
];

@Component({
  imports: [PatternHelp],
  template: `<app-pattern-help
    [open]="open()"
    problemTitle="Pair Sum"
    statement="Find two numbers that add up to a target."
    patternName="Two Pointers"
    [revealed]="revealed()"
    [lessonRoute]="['/', 'learn', 'algorithmic-patterns', 'two-pointers']"
    (revealPattern)="revealed.set(true)"
    (closed)="open.set(false)"
  />`,
})
class Host {
  readonly open = signal(false);
  readonly revealed = signal(false);
}

describe('PatternHelp', () => {
  async function setup(fail = false) {
    const content = {
      getCourseOutline: () => of({ questions: [{ id: 'algorithmic-pattern-foundations' }] }),
      getContentItem: (summary: { id: string }) =>
        fail || summary.id !== 'algorithmic-pattern-foundations'
          ? throwError(() => new Error('missing'))
          : of(MAP[0]),
    };
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([]), { provide: ContentService, useValue: content }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    fixture.componentInstance.open.set(true);
    // The dialog opens from an effect and its content loads asynchronously; under a busy full-suite run one
    // change-detection pass is not always enough, so settle until the dialog is open and the load has finished.
    const root = fixture.nativeElement as HTMLElement;
    for (let attempt = 0; attempt < 20; attempt++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      const dialog = root.querySelector('dialog');
      if (dialog?.hasAttribute('open') && (root.querySelector('.chip') || root.textContent?.includes('did not load'))) break;
    }
    fixture.detectChanges();
    return { fixture, root };
  }

  it('opens with the problem and lets the learner pick a signal without choosing for them', async () => {
    const { fixture, root } = await setup();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(root.querySelector('h2')?.textContent).toBe('Pair Sum');
    expect(root.querySelector('.statement')?.textContent).toContain('Find two numbers');
    const chip = root.querySelector<HTMLButtonElement>('.chip')!;
    expect(chip.textContent).toBe('sorted input');
    chip.click();
    fixture.detectChanges();
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.cands strong')?.textContent).toBe('Two pointers');
    expect(root.querySelector('.cands span')?.textContent).toBe('when you compare two ends');
    expect(root.querySelector('.answer')).toBeNull();
  });

  it('reveals the pattern with its lesson in a new tab and reports the reveal', async () => {
    const { fixture, root } = await setup();
    root.querySelector<HTMLButtonElement>('.reveal')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.revealed()).toBe(true);
    // One compact row (user, 2026-10-16): the name once, then a small "Learn more" button.
    const answer = root.querySelector<HTMLElement>('.answer')!;
    expect(answer.querySelector('h4')).toBeNull();
    expect(answer.querySelector('.answer-name')?.textContent).toBe("This problem's pattern: Two Pointers");
    const visibleText = (element: Element): string =>
      [...element.childNodes]
        .filter((node) => !(node instanceof HTMLElement && node.classList.contains('visually-hidden')))
        .map((node) => (node instanceof HTMLElement ? visibleText(node) : (node.textContent ?? '')))
        .join('');
    expect(visibleText(answer).match(/Two Pointers/g)).toHaveLength(1);
    const link = root.querySelector<HTMLAnchorElement>('.lesson-link')!;
    expect(visibleText(link).trim()).toBe('Learn more');
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Learn more about Two Pointers (opens in a new tab)');
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(link.classList).not.toContain('action-link');
    expect(link.getAttribute('href')).toBe('/learn/algorithmic-patterns/two-pointers');
    expect(link.getAttribute('target')).toBe('_blank');
    // Focus moves from the vanished button to the answer row.
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();
    expect(document.activeElement).toBe(answer);
    // Hiding the pattern in the header hides it here too.
    fixture.componentInstance.revealed.set(false);
    fixture.detectChanges();
    expect(root.querySelector('.answer')).toBeNull();
  });

  it('locks the page behind the dialog while it is open', async () => {
    const { fixture, root } = await setup();
    const { ScrollLockService } = await import('../scroll-lock/scroll-lock');
    const lock = TestBed.inject(ScrollLockService);
    expect(lock.locked()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    root.querySelector<HTMLButtonElement>('.close')!.click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    expect(lock.locked()).toBe(false);
  });

  it('still offers the reveal when the signals do not load', async () => {
    const { root } = await setup(true);
    expect(root.textContent).toContain('The signals did not load');
    expect(root.querySelector('.reveal')).not.toBeNull();
  });
});
