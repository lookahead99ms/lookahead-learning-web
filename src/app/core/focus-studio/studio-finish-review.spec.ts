import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentService } from '../../content/content.service';
import { HandsOnDsaIndex } from '../../content/hands-on-dsa';
import {
  PRACTICE_CLOCK,
  PRACTICE_PROGRESS_KEY,
  PracticeProgressService,
} from '../practice-progress/practice-progress';
import { NOTES_SAVE_DELAY_MS, StudioFinishReview } from './studio-finish-review';
import { RecallCheckStore } from './recall-check';

function problem(id: string, studyOrder: number, difficulty: 'Beginner' | 'Intermediate' = 'Beginner') {
  return {
    id,
    title: `Problem ${id}`,
    description: '',
    difficulty,
    variation: '',
    invariantAdaptation: '',
    version: 'v1',
    questionId: id,
    route: ['/learn', 'algorithmic-patterns', id],
    studyOrder,
  };
}

function index(): HandsOnDsaIndex {
  const group = (id: string, title: string, problems: ReturnType<typeof problem>[]) => ({
    id,
    preparationOrder: 1,
    courseId: 'algorithmic-patterns',
    courseTitle: 'Patterns',
    title,
    description: '',
    unitId: id,
    practiceModuleId: `${id}-practice`,
    lessonId: `${id}-lesson`,
    lessonTitle: title,
    tags: [],
    hasGuidedLesson: true,
    problems,
  });
  return {
    schemaVersion: 'hands-on-dsa-index/v2',
    totals: { groups: 2, problemPlacements: 7, distinctProblems: 6 },
    groups: [
      // Authored out of learning order on purpose.
      group('arrays', 'Array Fundamentals', [
        problem('p5', 5, 'Intermediate'),
        problem('p1', 1),
        problem('p3', 3),
        problem('p2', 2),
        problem('p4', 4, 'Intermediate'),
        problem('p6', 6),
      ]),
      group('two-pointers', 'Two Pointers', [problem('p2', 2), problem('p9', 9)]),
    ],
  };
}

@Component({
  imports: [StudioFinishReview],
  template: `<app-studio-finish-review
    [problemId]="problemId()"
    [patternId]="patternId()"
    [patternRevealed]="revealed()"
  />`,
})
class Host {
  readonly problemId = signal('p2');
  readonly patternId = signal('arrays');
  readonly revealed = signal(false);
}

describe('Finish and review', () => {
  let storageDescriptor: PropertyDescriptor | undefined;
  let values: Map<string, string>;

  beforeEach(async () => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
      },
    });
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRouter([]),
        { provide: ContentService, useValue: { getHandsOnDsaIndex: () => of(index()) } },
        // Monday 5 October 2026.
        { provide: PRACTICE_CLOCK, useValue: () => new Date(2026, 9, 5, 9, 0) },
      ],
    }).compileComponents();
  });
  afterEach(() => {
    vi.useRealTimers();
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(window, 'localStorage');
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent?.trim() === label,
      )!;
    const saved = () => JSON.parse(values.get(PRACTICE_PROGRESS_KEY) ?? 'null')?.problems ?? {};
    return { fixture, root, button, saved };
  }

  it('rates the attempt with pressed buttons and marks the problem solved', () => {
    const { fixture, root, button, saved } = render();
    const group = root.querySelector('[role="group"]')!;
    expect(root.querySelector(`#${group.getAttribute('aria-labelledby')}`)!.textContent).toBe(
      'How did it go?',
    );
    const options = [...group.querySelectorAll('button')];
    expect(options.map((item) => item.textContent?.trim())).toEqual([
      'Solved on my own',
      'Solved with hints',
      'Needed the solution',
    ]);
    expect(options.every((item) => item.getAttribute('aria-pressed') === 'false')).toBe(true);

    button('Solved with hints').click();
    fixture.detectChanges();
    expect(button('Solved with hints').getAttribute('aria-pressed')).toBe('true');
    expect(button('Solved on my own').getAttribute('aria-pressed')).toBe('false');
    expect(saved()['p2']).toMatchObject({ status: 'solved', rating: 'Solved with hints' });
    const status = root.querySelector('[role="status"]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Marked: Solved with hints.');
  });

  it('plans a review on a real date and can clear it', () => {
    const { fixture, root, button, saved } = render();
    button('In 3 days').click();
    fixture.detectChanges();
    expect(button('In 3 days').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.review-date')!.textContent).toBe('Review on Thursday 8 October');
    expect(saved()['p2'].reviewAt).toBe('2026-10-08');

    button('In 1 week').click();
    fixture.detectChanges();
    expect(root.querySelector('.review-date')!.textContent).toBe('Review on Monday 12 October');
    expect(button('In 3 days').getAttribute('aria-pressed')).toBe('false');

    button('No review needed').click();
    fixture.detectChanges();
    expect(root.querySelector('.review-date')!.textContent).toBe('No review planned.');
    expect(saved()['p2'].reviewAt).toBeNull();
  });

  it('saves notes as you type, after a short pause, and on leaving', () => {
    vi.useFakeTimers();
    const { fixture, root, saved } = render();
    const notes = root.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(root.querySelector(`label[for="${notes.id}"]`)!.textContent).toBe('My notes');
    notes.value = 'Loop stopped one short';
    notes.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saved()['p2']).toBeUndefined();
    vi.advanceTimersByTime(NOTES_SAVE_DELAY_MS);
    fixture.detectChanges();
    expect(saved()['p2']).toMatchObject({ status: 'started', notes: 'Loop stopped one short' });
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Notes saved on this device.');

    // Rating while typing keeps the text in the box.
    notes.value = 'Loop stopped one short of the end';
    notes.dispatchEvent(new Event('input'));
    TestBed.inject(PracticeProgressService).rate('p2', 'Solved on my own');
    fixture.detectChanges();
    expect(notes.value).toBe('Loop stopped one short of the end');

    fixture.destroy();
    expect(saved()['p2']).toMatchObject({
      status: 'solved',
      notes: 'Loop stopped one short of the end',
    });
  });

  it('restores saved notes and rating for the problem', () => {
    values.set(
      PRACTICE_PROGRESS_KEY,
      JSON.stringify({
        schemaVersion: 'dsa-practice-local/v1',
        problems: {
          p2: {
            status: 'solved',
            rating: 'Needed the solution',
            reviewAt: '2026-10-08',
            notes: 'Reset j after the skip.',
            updatedAt: '2026-10-04T10:00:00.000Z',
          },
        },
      }),
    );
    const { root, button } = render();
    expect(root.querySelector('textarea')!.value).toBe('Reset j after the skip.');
    expect(button('Needed the solution').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.review-date')!.textContent).toBe('Review on Thursday 8 October');
    // Saved before the review choice was kept: the date shows, no button is pressed.
    for (const label of ['In 3 days', 'In 1 week', 'No review needed'])
      expect(button(label).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the pressed review choice after a reload', () => {
    values.set(
      PRACTICE_PROGRESS_KEY,
      JSON.stringify({
        schemaVersion: 'dsa-practice-local/v1',
        problems: {
          p2: {
            status: 'solved',
            rating: 'Solved on my own',
            reviewAt: '2026-10-12',
            reviewChoice: '1w',
            notes: '',
            updatedAt: '2026-10-05T09:00:00.000Z',
          },
        },
      }),
    );
    const { button, root } = render();
    expect(button('In 1 week').getAttribute('aria-pressed')).toBe('true');
    expect(button('In 3 days').getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('.review-date')!.textContent).toBe('Review on Monday 12 October');
  });

  it('un-presses a rating chosen again, falling back to started', () => {
    const { fixture, root, button, saved } = render();
    button('Solved on my own').click();
    fixture.detectChanges();
    button('Solved on my own').click();
    fixture.detectChanges();
    expect(button('Solved on my own').getAttribute('aria-pressed')).toBe('false');
    expect(saved()['p2']).toMatchObject({ status: 'started', rating: null });
    expect(root.querySelector('[role="status"]')!.textContent).toBe(
      'Rating removed. This problem is marked as started.',
    );
  });

  it('clears progress in two steps inside the page, keeping notes unless chosen', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { fixture, root, button, saved } = render();
    expect(root.querySelector('.clear-trigger')).toBeNull();
    button('Solved with hints').click();
    button('In 3 days').click();
    const notes = root.querySelector<HTMLTextAreaElement>('textarea')!;
    notes.value = 'Keep this';
    notes.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    button('Clear progress for this problem').click();
    fixture.detectChanges();
    await fixture.whenStable();
    const group = root.querySelector('.clear-confirm')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(root.querySelector(`#${group.getAttribute('aria-labelledby')}`)!.textContent).toContain(
      'Clear the rating, review date and status',
    );
    expect(document.activeElement).toBe(button('Cancel'));
    button('Cancel').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('.clear-confirm')).toBeNull();
    expect(document.activeElement).toBe(button('Clear progress for this problem'));
    expect(saved()['p2'].status).toBe('solved');

    button('Clear progress for this problem').click();
    fixture.detectChanges();
    button('Clear progress').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(saved()['p2']).toMatchObject({ status: null, rating: null, reviewAt: null, notes: 'Keep this' });
    expect(notes.value).toBe('Keep this');
    expect(button('Solved with hints').getAttribute('aria-pressed')).toBe('false');
    expect(button('In 3 days').getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('.review-date')).toBeNull();
    expect(root.querySelector('.clear-trigger')).toBeNull();
    expect(root.querySelector('[role="status"]')!.textContent).toBe(
      'Progress cleared for this problem. Your notes are kept.',
    );
    expect(document.activeElement).toBe(root.querySelector('h3'));

    button('Solved on my own').click();
    fixture.detectChanges();
    button('Clear progress for this problem').click();
    fixture.detectChanges();
    root.querySelector<HTMLInputElement>('.clear-notes input')!.click();
    fixture.detectChanges();
    button('Clear progress').click();
    fixture.detectChanges();
    expect(saved()['p2']).toBeUndefined();
    expect(notes.value).toBe('');
    expect(root.querySelector('[role="status"]')!.textContent).toBe(
      'Progress and notes cleared for this problem.',
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it('lists the next three problems in this pattern by learning order without naming a hidden pattern', async () => {
    values.set(
      PRACTICE_PROGRESS_KEY,
      JSON.stringify({
        schemaVersion: 'dsa-practice-local/v1',
        problems: {
          p4: {
            status: 'solved',
            rating: 'Solved on my own',
            reviewAt: null,
            notes: '',
            updatedAt: '2026-10-04T10:00:00.000Z',
          },
        },
      }),
    );
    const { fixture, root } = render();
    await fixture.whenStable();
    const heading = () => root.querySelector(`#${root.querySelector('ol.next')!.getAttribute('aria-labelledby')}`)!;
    expect(heading().textContent!.trim()).toBe('Next problems');
    expect(root.textContent).not.toContain('Array Fundamentals');
    const items = [...root.querySelectorAll('ol.next li')];
    expect(items.map((item) => item.querySelector('.next-title')!.textContent)).toEqual([
      'Problem p3',
      'Problem p4',
      'Problem p5',
    ]);
    expect(items.map((item) => item.querySelector('.next-meta')!.textContent)).toEqual([
      'Beginner',
      'Intermediate',
      'Intermediate',
    ]);
    const link = items[0].querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/learn/algorithmic-patterns/p3?pattern=arrays');
    expect(items[1].querySelector('app-practice-status-mark')!.getAttribute('data-status')).toBe('solved');
    expect(items[0].querySelector('app-practice-status-mark')).toBeNull();

    fixture.componentInstance.revealed.set(true);
    fixture.detectChanges();
    expect(heading().textContent!.trim()).toBe('Next in Array Fundamentals');

    // The page's pattern context picks the group; the last problems list what is left.
    fixture.componentInstance.patternId.set('two-pointers');
    fixture.detectChanges();
    expect([...root.querySelectorAll('ol.next .next-title')].map((item) => item.textContent)).toEqual([
      'Problem p9',
    ]);
    fixture.componentInstance.problemId.set('p6');
    fixture.componentInstance.patternId.set('unknown');
    fixture.detectChanges();
    expect(root.querySelector('ol.next')).toBeNull();
  });

  it('says progress stays on this device', () => {
    const { root } = render();
    expect(root.querySelector('.device-note')!.textContent!.trim()).toBe(
      'Saved on this device. Progress does not sync to other devices yet.',
    );
  });
});

describe('Finish and review with the Recall card grid', () => {
  let storageDescriptor: PropertyDescriptor | undefined;
  let values: Map<string, string>;

  beforeEach(async () => {
    sessionStorage.clear();
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
      },
    });
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRouter([]),
        { provide: ContentService, useValue: { getHandsOnDsaIndex: () => of(index()) } },
        { provide: PRACTICE_CLOCK, useValue: () => new Date(2026, 9, 5, 9, 0) },
      ],
    }).compileComponents();
  });
  afterEach(() => {
    sessionStorage.clear();
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(window, 'localStorage');
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent?.trim() === label,
      );
    const saved = () => JSON.parse(values.get(PRACTICE_PROGRESS_KEY) ?? 'null')?.problems ?? {};
    const store = TestBed.inject(RecallCheckStore);
    const suggestion = () => root.querySelector('.suggestion')?.textContent?.replace(/\s+/g, ' ').trim();
    return { fixture, root, button, saved, store, suggestion };
  }

  it('lays out four short columns with the status, clear action and device note under them', async () => {
    const { fixture, root } = render();
    await fixture.whenStable();
    const finish = root.querySelector('.finish')!;
    const columns = finish.querySelector(':scope > .columns')!;
    expect([...columns.children].map((block) => block.querySelector('h4')?.textContent?.trim())).toEqual([
      'How did it go?',
      'Review again',
      'My notes',
      'Next problems',
    ]);
    expect([...columns.children].every((block) => block.classList.contains('block'))).toBe(true);
    const order = [...finish.children].map((child) => child.tagName.toLowerCase() + '.' + (child.classList[0] ?? ''));
    expect(order).toEqual(['header.', 'div.columns', 'p.status', 'p.device-note']);
    expect(columns.contains(root.querySelector('.device-note'))).toBe(false);
  });

  it('suggests a rating and review date from the grades and sets both only on Use this', () => {
    const { fixture, root, button, saved, store, suggestion } = render();
    expect(root.querySelector('.suggestion')).toBeNull();

    // All cards Got it: solved on my own, no review.
    store.grade('p2', 'a', 'got', 3);
    fixture.detectChanges();
    // A partial pass with only Got it has nothing to suggest yet.
    expect(root.querySelector('.suggestion')).toBeNull();
    store.grade('p2', 'b', 'got', 3);
    store.grade('p2', 'c', 'got', 3);
    fixture.detectChanges();
    expect(suggestion()).toBe('From your answers: solved on my own, no review needed. Use this');
    // Only a suggestion: nothing is saved or pressed yet.
    expect(saved()['p2']).toBeUndefined();
    expect(button('Solved on my own')!.getAttribute('aria-pressed')).toBe('false');
    button('Use this')!.click();
    fixture.detectChanges();
    expect(button('Solved on my own')!.getAttribute('aria-pressed')).toBe('true');
    expect(button('No review needed')!.getAttribute('aria-pressed')).toBe('true');
    expect(saved()['p2']).toMatchObject({ status: 'solved', rating: 'Solved on my own', reviewAt: null, reviewChoice: 'none' });
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Marked: Solved on my own. No review planned.');
    // Using it again keeps the rating instead of taking it back.
    button('Use this')!.click();
    fixture.detectChanges();
    expect(saved()['p2'].rating).toBe('Solved on my own');

    // Any Partly: solved with hints, review in 1 week.
    store.grade('p2', 'b', 'partly', 3);
    fixture.detectChanges();
    expect(suggestion()).toBe('From your answers: solved with hints, review in 1 week. Use this');
    expect(saved()['p2'].rating).toBe('Solved on my own');
    button('Use this')!.click();
    fixture.detectChanges();
    expect(button('Solved with hints')!.getAttribute('aria-pressed')).toBe('true');
    expect(button('In 1 week')!.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.review-date')!.textContent).toBe('Review on Monday 12 October');
    expect(root.querySelector('[role="status"]')!.textContent).toBe(
      'Marked: Solved with hints. Review on Monday 12 October.',
    );

    // Any Missed outranks Partly: needed the solution, review in 3 days.
    store.grade('p2', 'c', 'missed', 3);
    fixture.detectChanges();
    expect(suggestion()).toBe('From your answers: needed the solution, review in 3 days. Use this');
    button('Use this')!.click();
    fixture.detectChanges();
    expect(button('Needed the solution')!.getAttribute('aria-pressed')).toBe('true');
    expect(button('In 3 days')!.getAttribute('aria-pressed')).toBe('true');
    expect(saved()['p2']).toMatchObject({ rating: 'Needed the solution', reviewAt: '2026-10-08', reviewChoice: '3d' });

    // Grades belong to their problem.
    fixture.componentInstance.problemId.set('p3');
    fixture.detectChanges();
    expect(root.querySelector('.suggestion')).toBeNull();
  });
});
