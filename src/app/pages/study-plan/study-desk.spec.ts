import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { StudyDesk } from './study-desk';
import { StudyDeskEntry } from './study-desk-model';

const entry = (id: string, extra: Partial<StudyDeskEntry> = {}): StudyDeskEntry => ({
  assignment: {
    id,
    sourceContentId: id,
    title: id,
    activity: 'Understand',
    kind: 'new',
    topicId: 'java',
    topicTitle: 'Java foundations',
    courseTitle: 'Java',
    contentType: 'theory',
    route: ['/learn', 'java', id],
    minutes: 20,
  },
  day: 1,
  outsideWindow: false,
  sourceId: id,
  route: ['/learn', 'java', id],
  query: { plan: 'saved-plan', day: 1, activity: id },
  unavailableReason: '',
  completed: false,
  outcome: '',
  note: '',
  refreshLinks: [],
  ...extra,
});

const recall = (id: string, sourceId: string, day: number): StudyDeskEntry => {
  const result = entry(id, { sourceId, day, query: { plan: 'saved-plan', day, activity: id } });
  result.assignment = {
    ...result.assignment,
    id,
    sourceContentId: sourceId,
    title: sourceId,
    activity: 'Recall',
    kind: 'review',
  };
  return result;
};

describe('Study Desk', () => {
  async function setup(entries = [entry('first'), entry('second')], day = 1) {
    await TestBed.configureTestingModule({
      imports: [StudyDesk],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(StudyDesk);
    fixture.componentRef.setInput('planKey', 'account:plan');
    fixture.componentRef.setInput('entries', entries);
    fixture.componentRef.setInput('resume', entries[0]);
    fixture.componentRef.setInput('selectedDay', day);
    fixture.componentInstance.selectDay.subscribe((selectedDay) => {
      fixture.componentRef.setInput('selectedDay', selectedDay);
      fixture.detectChanges();
    });
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('renders every actual activity for the selected day as a card with its full strategy', async () => {
    const first = entry('first');
    const entries = [
      first,
      entry('second'),
      entry('third'),
      entry('fourth'),
      recall('first-r3', 'first', 3),
      recall('first-r9', 'first', 9),
      recall('first-r18', 'first', 18),
      recall('first-r31', 'first', 31),
    ];
    const fixture = await setup(entries);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.activity-card')).toHaveLength(4);
    expect(root.querySelector('.activity-sheet')).toBeNull();
    const firstCard = root.querySelector<HTMLElement>('[data-desk-activity="first"]')!;
    expect(firstCard.textContent).toContain('Understand · Day 1');
    expect(firstCard.textContent).toContain('Recall · Day 3');
    expect(firstCard.textContent).toContain('Recall · Day 9');
    expect(firstCard.textContent).toContain('Recall · Day 18');
    expect(firstCard.textContent).toContain('Recall · Day 31');
    expect(firstCard.querySelector('.content-action')?.textContent).toContain('Open lesson');
    expect(firstCard.querySelector('[data-desk-action="complete-first"]')).not.toBeNull();
  });

  it('keeps the derived recommendation out of the activity UI without writing progress', async () => {
    const first = entry('first');
    const next = recall('first-r3', 'first', 3);
    const fixture = await setup([first, next], 1);
    fixture.componentRef.setInput('resume', next);
    fixture.detectChanges();
    const completed = vi.fn();
    const recorded = vi.fn();
    fixture.componentInstance.complete.subscribe(completed);
    fixture.componentInstance.record.subscribe(recorded);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.resume-row')).toBeNull();
    expect(root.querySelector('#desk-day-heading')?.textContent).toContain('1 scheduled activity');
    expect(root.querySelector('[data-desk-activity="first"]')).not.toBeNull();
    expect(completed).not.toHaveBeenCalled();
    expect(recorded).not.toHaveBeenCalled();
  });

  it('browses an interactive strategy occurrence without moving Resume or writing progress', async () => {
    const first = entry('first');
    const review = recall('first-r3', 'first', 3);
    const fixture = await setup([first, review]);
    const completed = vi.fn();
    fixture.componentInstance.complete.subscribe(completed);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.resume-row')).toBeNull();
    const occurrence = [...root.querySelectorAll<HTMLButtonElement>('.occurrence-link')].find(
      (button) => button.textContent?.includes('Day 3'),
    )!;
    occurrence.click();
    await fixture.whenStable();
    expect(root.querySelector('[data-desk-activity="first-r3"]')).toBe(document.activeElement);
    expect(root.querySelector('.occurrence-link[aria-current="true"]')?.textContent).toContain(
      'Day 3',
    );
    expect(root.querySelector('.resume-row')).toBeNull();
    expect(completed).not.toHaveBeenCalled();
  });

  it('keeps completion explicit and restores focus after an asynchronous save changes Resume', async () => {
    const first = entry('first');
    const second = entry('second');
    const fixture = await setup([first, second]);
    const root = fixture.nativeElement as HTMLElement;
    const complete = vi.fn(() => fixture.componentRef.setInput('locked', true));
    fixture.componentInstance.complete.subscribe(complete);
    const button = root.querySelector<HTMLButtonElement>('[data-desk-action="complete-first"]')!;
    button.focus();
    button.click();
    fixture.detectChanges();
    expect(complete).toHaveBeenCalledWith(first);
    expect(button.disabled).toBe(true);
    button.blur();
    fixture.componentRef.setInput('entries', [{ ...first, completed: true }, second]);
    fixture.componentRef.setInput('resume', second);
    fixture.componentRef.setInput('locked', false);
    fixture.detectChanges();
    await fixture.whenStable();
    const restored = root.querySelector<HTMLButtonElement>('[data-desk-action="complete-first"]')!;
    expect(restored.textContent).toContain('Undo completion');
    expect(document.activeElement).toBe(restored);
  });

  it('keeps the topics disclosure on one stable accessible control', async () => {
    const fixture = await setup();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>('.path-toggle')!;
    expect(root.querySelector('#desk-topics-heading')?.textContent).toBe('Topics in your plan');
    expect(root.querySelector('#desk-plan-topics')?.classList).toContain('topic-list');
    expect(button.textContent).toContain('Hide');
    expect(button.getAttribute('aria-controls')).toBe('desk-plan-topics');
    button.focus();
    button.click();
    fixture.detectChanges();
    expect(root.querySelector<HTMLElement>('#desk-plan-topics')!.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Show topics in your plan');
    expect(button.getAttribute('data-tooltip')).toBe('Show topics in your plan');
    expect(button.textContent?.trim()).toBe('⌄');
    expect(root.querySelector('#desk-topics-heading')).toBeNull();
    expect(root.querySelector('.learning-path > .small')).toBeNull();
    expect(root.querySelector('.desk-layout')?.classList).toContain('path-hidden');
    expect(document.activeElement).toBe(button);
  });

  it('uses content-aware canonical actions without emitting completion', async () => {
    const question = entry('question');
    question.assignment = { ...question.assignment, contentType: 'q-and-a' };
    const problem = entry('problem');
    problem.assignment = { ...problem.assignment, contentType: 'dsa-problem' };
    const fixture = await setup([question, problem]);
    const complete = vi.fn();
    fixture.componentInstance.complete.subscribe(complete);
    const root = fixture.nativeElement as HTMLElement;
    const actions = root.querySelectorAll<HTMLAnchorElement>('.content-action');
    expect(actions[0].textContent).toContain('Open question');
    expect(actions[1].textContent).toContain('Open problem');
    expect(complete).not.toHaveBeenCalled();
  });

  it('shows access errors without material or completion actions', async () => {
    const restricted = entry('first', {
      unavailableReason: 'Access expired. History is preserved.',
    });
    const fixture = await setup([restricted]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.unavailable')?.textContent).toContain('Access expired');
    expect(root.querySelector('.content-action')).toBeNull();
    expect(root.querySelector('[data-desk-action]')).toBeNull();
  });

  it('restores reader context to the correct day card without rendering a separate Resume strip', async () => {
    const first = entry('first');
    const second = entry('second', { day: 2, query: { plan: 'saved-plan', day: 2, activity: 'second' } });
    const fixture = await setup([first, second], 2);
    fixture.componentRef.setInput('initialActivity', 'second');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-desk-activity="second"]')?.classList).toContain('current');
    expect(root.querySelector('.resume-row')).toBeNull();
  });
});
