import { afterEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';
import { StudyPlanPage } from './study-plan';
import { ACCOUNT_FETCH, StudyPlanAccount } from './study-plan-account';
import { STUDY_PLAN_ACCESS } from './study-plan-access';

@Component({ template: '' })
class PlannerExit {}

const document = (id: string, courseId: string, tier: 'free' | 'premium'): SearchDocument => ({
  id,
  contentId: id,
  canonicalContentId: id,
  path: 'learn',
  courseId,
  courseTitle: courseId,
  moduleId: 'foundations',
  moduleTitle: 'Foundations',
  title: id,
  contentType: 'theory',
  discoveryKind: 'lesson',
  tags: [],
  filterTags: [],
  languages: [],
  preview: '',
  access: { tier },
  searchableText: id,
  route: ['/', 'learn', courseId, id],
});
const documents = [
  document('available-lesson', 'core-java', 'free'),
  document('restricted-lesson', 'modern-java', 'premium'),
];
const service = {
  getSearchIndex: () => of(documents),
  getHandsOnDsaIndex: () =>
    of({ groups: [], ranking: { status: 'released', rankingVersion: 'rank-v1' } }),
};

describe('StudyPlanPage', () => {
  let storageDescriptor: PropertyDescriptor | undefined;
  afterEach(() => {
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
  });
  beforeEach(async () => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
    await TestBed.configureTestingModule({
      providers: [
        { provide: ACCOUNT_FETCH, useValue: async () => new Response(null, { status: 401 }) },
        {
          provide: StudyPlanAccount,
          useFactory: () => {
            const account = new StudyPlanAccount();
            Object.defineProperty(account, 'enabled', { value: false, configurable: true });
            return account;
          },
        },
        provideRouter([
          { path: 'study-plan', component: StudyPlanPage },
          { path: 'exit', component: PlannerExit },
        ]),
        { provide: ContentService, useValue: service },
      ],
    }).compileComponents();
  });

  it('starts with a realistic hour and a single published-offering checklist', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    const controls =
      harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('.setup-panel select');
    expect(controls[0].value).toBe('30');
    expect(controls[1].value).toBe('1');
    expect(harness.routeNativeElement!.querySelectorAll('fieldset')).toHaveLength(1);
    const checkboxes =
      harness.routeNativeElement!.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].disabled).toBe(false);
    expect(checkboxes[1].disabled).toBe(true);
  });

  it('discloses every waiting session without completing work until explicitly requested', async () => {
    TestBed.overrideProvider(ContentService, {
      useValue: {
        ...service,
        getSearchIndex: () =>
          of(
            Array.from({ length: 10 }, (_, index) =>
              document(`waiting-lesson-${index}`, 'core-java', 'free'),
            ),
          ),
      },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    (page as any).selectedDay.set(30);
    harness.detectChanges();
    const panel = harness.routeNativeElement!.querySelector<HTMLElement>('.pending-panel')!;
    const count = (page as any).pendingSessions().length;
    expect(count).toBeGreaterThan(0);
    expect((panel as HTMLDetailsElement).open).toBe(false);
    expect(panel.querySelectorAll('.session-card')).toHaveLength(count);
    (panel as HTMLDetailsElement).open = true;
    expect((page as any).completedIds().size).toBe(0);
    const complete = panel.querySelector<HTMLButtonElement>(
      'button[aria-label^="Mark complete:"]',
    )!;
    const completedSessionId = (page as any).pendingSessions()[0].id;
    complete.click();
    harness.detectChanges();
    expect((page as any).completedIds().has(completedSessionId)).toBe(true);
    expect(
      (page as any)
        .pendingSessions()
        .some((item: { id: string }) => item.id === completedSessionId),
    ).toBe(false);
    expect((page as any).dailyQueue().spent).toBeGreaterThan(0);
    expect(
      (page as any).dailyQueue().spent + (page as any).dailyQueue().minutes,
    ).toBeLessThanOrEqual((page as any).dailyQueue().budget);
  });

  it('restores URL settings without granting access from a forged access parameter', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/study-plan?days=120&hours=3&topics=learn:modern-java&access=learn:modern-java',
      StudyPlanPage,
    );
    harness.detectChanges();
    const controls =
      harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('.setup-panel select');
    expect(controls[0].value).toBe('120');
    expect(controls[1].value).toBe('3');
    const build = harness.routeNativeElement!.querySelector<HTMLButtonElement>('button.primary')!;
    expect(build.disabled).toBe(true);
    expect(window.localStorage.getItem('look-ahead.study-plan.v1')).toBeNull();
  });

  it('pins its snapshot, saves completion explicitly, and preserves work during recovery and replanning', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    harness.detectChanges();
    let saved = JSON.parse(window.localStorage.getItem('look-ahead.study-plan.v1')!);
    expect(saved.rankingVersion).toBe('rank-v1');
    expect(saved.completedIds).toEqual([]);
    const assignment = saved.snapshot.days[0].assignments[0];
    (page as any).toggleCompletion(assignment);
    (page as any).shiftSchedule();
    saved = JSON.parse(window.localStorage.getItem('look-ahead.study-plan.v1')!);
    expect(saved.completedIds).toEqual(['available-lesson']);
    expect(saved.shiftedDays).toBe(0);
    expect(saved.snapshot.config.days).toBe(31);
    expect(saved.snapshot.days[0].assignments[0].id).toBe('available-lesson');
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    saved = JSON.parse(window.localStorage.getItem('look-ahead.study-plan.v1')!);
    expect(saved.revision).toBe(3);
    expect(saved.completedIds).toEqual(['available-lesson']);
    expect(saved.history).toHaveLength(3);
    expect(
      saved.snapshot.days
        .flatMap((day: any) => day.assignments)
        .some((item: any) => item.id === 'restricted-lesson'),
    ).toBe(false);
  });

  it('uses trusted access changes while keeping history on access loss', async () => {
    const accessStatus = signal<'ready' | 'loading' | 'error'>('loading');
    TestBed.overrideProvider(STUDY_PLAN_ACCESS, {
      useValue: { status: accessStatus, description: 'Account access', canSchedule: () => true },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan?topics=learn:modern-java', StudyPlanPage);
    harness.detectChanges();
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('button.primary')!.disabled,
    ).toBe(true);
    accessStatus.set('ready');
    harness.detectChanges();
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    const assignment = (page as any).plan().days[0].assignments[0];
    (page as any).toggleCompletion(assignment);
    accessStatus.set('error');
    harness.detectChanges();
    expect((page as any).canOpen(assignment)).toBe(false);
    expect((page as any).completedIds().has(assignment.id)).toBe(true);
    expect(harness.routeNativeElement!.textContent).toContain('Access could not be checked');
  });

  it('keeps an active snapshot when a new ranking arrives, and resumes browser progress', async () => {
    const index = new BehaviorSubject({
      groups: [],
      ranking: { status: 'released', rankingVersion: 'rank-v1' },
    });
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getHandsOnDsaIndex: () => index },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    const snapshot = JSON.stringify((page as any).plan());
    const assignment = (page as any).plan().days[0].assignments[0];
    (page as any).toggleCompletion(assignment);
    index.next({ groups: [], ranking: { status: 'released', rankingVersion: 'rank-v2' } });
    expect(JSON.stringify((page as any).plan())).toBe(snapshot);
    expect((page as any).saved().rankingVersion).toBe('rank-v1');
    await harness.navigateByUrl('/exit', PlannerExit);
    const resumed = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    expect((resumed as any).completedIds().has(assignment.id)).toBe(true);
    expect((resumed as any).saved().rankingVersion).toBe('rank-v1');
  });

  it('does not open a forged saved route even when its content ID is valid', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    const assignment = {
      ...(page as any).plan().days[0].assignments[0],
      route: ['https://untrusted.example'],
    };
    expect((page as any).currentRoute(assignment)).toEqual([
      '/',
      'learn',
      'core-java',
      'available-lesson',
    ]);
  });

  it('projects Hands-on DSA onto real canonical problems without duplicating source courses', async () => {
    const tool: SearchDocument = {
      ...document('tool:learn:hands-on-dsa', 'hands-on-dsa', 'free'),
      canonicalContentId: undefined,
      discoveryKind: 'tool',
      contentType: 'guide',
      courseTitle: 'Hands-on DSA Practice',
    };
    const problem: SearchDocument = {
      ...document('canonical-array', 'algorithmic-patterns', 'free'),
      contentType: 'dsa-problem',
      discoveryKind: 'practice',
    };
    TestBed.overrideProvider(ContentService, {
      useValue: {
        ...service,
        getSearchIndex: () => of([tool, problem]),
        getHandsOnDsaIndex: () =>
          of({
            groups: [{ problems: [{ id: 'canonical-array', studyOrder: 1 }] }],
            ranking: { status: 'released', rankingVersion: 'rank-v1' },
          }),
      },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/study-plan?topics=learn:hands-on-dsa,learn:algorithmic-patterns',
      StudyPlanPage,
    );
    harness.detectChanges();
    const handsOn = [...harness.routeNativeElement!.querySelectorAll('label.offering')].find(
      (label) => label.textContent?.includes('Hands-on DSA Practice'),
    )!;
    expect(handsOn.querySelector('input')!.disabled).toBe(false);
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    expect((page as any).plan().uniqueNewItems).toBe(1);
    expect((page as any).plan().days[0].assignments[0].id).toBe('canonical-array');
  });

  it('waits for the released DSA ordering and supports retry without changing an existing plan', async () => {
    const ranking = new Subject<any>();
    const problem = {
      ...document('canonical-array', 'algorithmic-patterns', 'free'),
      contentType: 'dsa-problem',
      discoveryKind: 'practice',
    };
    const getIndex = vi
      .fn()
      .mockReturnValueOnce(ranking)
      .mockReturnValue(
        of({
          groups: [{ problems: [{ id: 'canonical-array', studyOrder: 1 }] }],
          ranking: { status: 'released', rankingVersion: 'rank-v2' },
        }),
      );
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of([problem]), getHandsOnDsaIndex: getIndex },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/study-plan?topics=learn:algorithmic-patterns',
      StudyPlanPage,
    );
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    expect((page as any).saved()).toBeNull();
    expect((page as any).canGenerate()).toBe(false);
    ranking.error(new Error('offline'));
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Retry DSA order');
    (page as any).loadRanking();
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    expect((page as any).saved().rankingVersion).toBe('rank-v2');
    expect((page as any).plan().days[0].assignments[0].id).toBe('canonical-array');
  });

  it('rejects an incomplete released order for selected DSA instead of silently using fallback order', async () => {
    const problem = {
      ...document('missing-rank', 'algorithmic-patterns', 'free'),
      contentType: 'dsa-problem',
      discoveryKind: 'practice',
    };
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of([problem]) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/study-plan?topics=learn:algorithmic-patterns',
      StudyPlanPage,
    );
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    expect((page as any).saved()).toBeNull();
    expect((page as any).rankingStatus()).toBe('error');
  });

  it('requires explicit source completion for recall and prerequisite completion for practice', async () => {
    const lesson = document('lesson', 'core-java', 'free');
    const practice = {
      ...document('practice', 'core-java', 'free'),
      contentType: 'q-and-a',
      studyPrerequisiteIds: ['lesson'],
      discoveryKind: 'practice',
    };
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of([lesson, practice]) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/study-plan?topics=learn:core-java&hours=2',
      StudyPlanPage,
    );
    await (page as any).generatePlan();
    await (page as any).saveDraft();
    const assignments = (page as any).plan().days.flatMap((day: any) => day.assignments);
    const recall = assignments.find(
      (item: any) => item.kind === 'review' && item.sourceContentId === 'lesson',
    );
    const exercise = assignments.find((item: any) => item.id === 'practice');
    expect((page as any).canOpen(recall)).toBe(false);
    expect((page as any).canOpen(exercise)).toBe(false);
    (page as any).toggleCompletion(assignments.find((item: any) => item.id === 'lesson'));
    expect((page as any).canOpen(recall)).toBe(true);
    expect((page as any).canOpen(exercise)).toBe(true);
  });

  it('recommends overdue originals first and anchors recall to the actual completion day', async () => {
    const lesson = document('recall-source', 'core-java', 'free');
    const next = document('current-lesson', 'core-java', 'free');
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of([lesson, next]) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan?hours=2', StudyPlanPage);
    await page.generatePlan();
    await page.saveDraft();
    const saved = page.saved();
    const assignments = saved.snapshot.days.flatMap((day: any) => day.assignments);
    const original = assignments.find((item: any) => item.id === 'recall-source');
    const current = assignments.find((item: any) => item.id === 'current-lesson');
    const recall = assignments.find(
      (item: any) => item.kind === 'review' && item.sourceContentId === original.id,
    );
    const day = saved.snapshot.days[0];
    page.saved.set({
      ...saved,
      snapshot: {
        ...saved.snapshot,
        days: [
          { ...day, day: 1, assignments: [original], focusedMinutes: original.minutes },
          {
            ...day,
            day: 2,
            assignments: [current, recall],
            focusedMinutes: current.minutes + recall.minutes,
          },
        ],
      },
    });
    page.selectedDay.set(2);
    const beforeRender = JSON.stringify(page.saved());
    const beforeStorage = window.localStorage.getItem('look-ahead.study-plan.v1');
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    const sections = [...root.querySelectorAll('.day-session-group, .pending-panel')];
    expect(sections[0].querySelector('h3')?.textContent?.trim()).toBe('Continue learning');
    const pending = root.querySelector('.pending-panel')!;
    expect(pending.textContent).toContain(
      'Complete the original session before starting this recall.',
    );
    expect(pending.querySelectorAll('a, button')).toHaveLength(0);
    expect(root.querySelector('#day-sessions-recall')).toBeNull();
    expect(sections[0].querySelector('h4')?.textContent).toContain('recall-source');
    expect(page.canOpen(recall)).toBe(false);
    expect(JSON.stringify(page.saved())).toBe(beforeRender);
    expect(window.localStorage.getItem('look-ahead.study-plan.v1')).toBe(beforeStorage);
    expect(page.currentDay().assignments.map((item: any) => item.id)).toEqual([
      current.id,
      recall.id,
    ]);
    page.toggleCompletion(original);
    harness.detectChanges();
    expect(root.querySelector('#day-sessions-recall')).toBeNull();
    expect(page.saved().studyLog[0].day).toBe(2);
    page.selectedDay.set(3);
    harness.detectChanges();
    expect(page.dailyQueue().selected[0].kind).toBe('review');
  });

  it('recommends one recall per source before learning while preserving other due sessions', async () => {
    const docs = ['completed-source', 'unfinished-source', 'current-source'].map((id) =>
      document(id, 'core-java', 'free'),
    );
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of(docs) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan?hours=2', StudyPlanPage);
    await page.generatePlan();
    await page.saveDraft();
    const saved = page.saved();
    const all = saved.snapshot.days.flatMap((day: any) => day.assignments);
    const completed = all.find((item: any) => item.id === 'completed-source');
    const unfinished = all.find((item: any) => item.id === 'unfinished-source');
    const current = all.find((item: any) => item.id === 'current-source');
    const baseRecall = all.find(
      (item: any) => item.kind === 'review' && item.sourceContentId === completed.id,
    );
    const overlap = {
      ...baseRecall,
      id: 'completed-source:review:v2:3',
      title: 'Shared visible title',
      reviewDueDay: 2,
    };
    const independent = {
      ...baseRecall,
      id: 'completed-source:review:v2:7',
      title: 'Shared visible title',
      reviewDueDay: 2,
    };
    const blocked = {
      ...all.find((item: any) => item.kind === 'review' && item.sourceContentId === unfinished.id),
      requiredSessionId: unfinished.id,
    };
    const day = saved.snapshot.days[0];
    page.saved.set({
      ...saved,
      completedIds: [completed.id],
      snapshot: {
        ...saved.snapshot,
        futureReviews: [overlap],
        days: [
          {
            ...day,
            day: 1,
            assignments: [completed, unfinished],
            focusedMinutes: completed.minutes + unfinished.minutes,
          },
          {
            ...day,
            day: 2,
            assignments: [current, overlap, independent, blocked],
            focusedMinutes:
              current.minutes + overlap.minutes + independent.minutes + blocked.minutes,
          },
        ],
      },
    });
    page.selectedDay.set(2);
    const before = JSON.stringify(page.saved());
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    const sections = [...root.querySelectorAll('.day-session-group, .pending-panel')];
    expect(sections[0].querySelector('h3')?.textContent?.trim()).toBe('Recall first');
    expect(sections[1].querySelector('h3')?.textContent?.trim()).toBe('Continue learning');
    expect(page.dailyQueue().selected.filter((item: any) => item.kind === 'review')).toHaveLength(
      1,
    );
    const blockedCard = root.querySelector(`[data-session-id="${blocked.id}"]`)!;
    expect(blockedCard.textContent).toContain(
      'Record the earlier attempt or complete the original learning session',
    );
    expect(blockedCard.querySelectorAll('a, button')).toHaveLength(0);
    for (const assignment of [overlap, independent, blocked, current]) {
      expect(root.querySelectorAll(`[data-session-id="${assignment.id}"]`)).toHaveLength(1);
    }
    expect(
      [...root.querySelectorAll('.session-card h4, .pending-session h4')].filter(
        (node) => node.textContent === 'Shared visible title',
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(page.saved())).toBe(before);
    expect(page.completedIds().has(unfinished.id)).toBe(false);
  });

  it('does not describe a catalog-only offering as an entitlement restriction', async () => {
    const tool: SearchDocument = {
      ...document('catalog-only', 'future-workspace', 'free'),
      discoveryKind: 'tool',
    };
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of([tool]) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('No published study sessions yet');
    expect(harness.routeNativeElement!.textContent).not.toContain(
      'Not available with current access',
    );
  });

  it('recovers from malformed browser storage', async () => {
    window.localStorage.setItem('look-ahead.study-plan.v1', '{broken');
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('The saved plan could not be read');
  });

  it('shows a retry path when the published index fails', async () => {
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => throwError(() => new Error('offline')) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('The curriculum could not be loaded');
    expect(
      [...harness.routeNativeElement!.querySelectorAll('button')].some(
        (item) => item.textContent === 'Try again',
      ),
    ).toBe(true);
  });
  it('keeps revision attempts separate from canonical completion and restores the same sprint', async () => {
    const lesson = document('foundation', 'core-java', 'free');
    const practice = {
      ...document('exercise', 'core-java', 'free'),
      contentType: 'q-and-a',
      discoveryKind: 'practice',
      studyRelatedLessonIds: ['foundation'],
    };
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of([lesson, practice]) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    let page: any = await harness.navigateByUrl(
      '/study-plan?days=7&hours=1&topics=learn:core-java&approach=interview',
      StudyPlanPage,
    );
    await page.generatePlan();
    await page.saveDraft();
    const original = JSON.stringify(page.plan());
    const exercise = page
      .plan()
      .days.flatMap((d: any) => d.assignments)
      .find((a: any) => a.kind === 'new' && a.sourceContentId === 'exercise');
    const recall = page
      .plan()
      .days.flatMap((d: any) => d.assignments)
      .find((a: any) => a.kind === 'review' && a.sourceContentId === 'exercise');
    expect(exercise.timebox).toBe(true);
    expect(page.canOpen(exercise)).toBe(true);
    expect(page.canOpen(recall)).toBe(false);
    page.recordOutcome(exercise, 'needs-review');
    harness.detectChanges();
    const noteField = harness.routeNativeElement!.querySelector<HTMLTextAreaElement>(
      `[data-session-id="${exercise.id}"] textarea`,
    )!;
    noteField.value = 'Check duplicate-key behavior.';
    noteField.dispatchEvent(new Event('input'));
    expect(page.reviewNote(exercise)).toBe('Check duplicate-key behavior.');
    expect(page.completedIds().has('exercise')).toBe(false);
    expect(page.saved().needsReviewContentIds).toEqual(['exercise']);
    expect(page.canOpen(recall)).toBe(true);
    page.shiftSchedule();
    expect(page.plan().config.days).toBe(8);
    expect(page.plan().days.slice(0, 7)).toEqual(JSON.parse(original).days);
    const extended = JSON.stringify(page.plan());
    await harness.navigateByUrl('/exit');
    page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    expect(page.plan().days).toEqual(JSON.parse(extended).days);
    expect(page.plan().config.days).toBe(8);
    expect(page.saved().needsReviewContentIds).toEqual(['exercise']);
    expect(page.saved().rankingVersion).toBe('rank-v1');
    expect(page.reviewNote(exercise)).toBe('Check duplicate-key behavior.');
    page.recordOutcome(exercise, 'completed');
    expect(page.completedIds().has('exercise')).toBe(true);
    expect(page.saved().needsReviewContentIds).toEqual([]);
  });

  it('requires explicit learning completion for a novice and keeps related refresh separate from a hard prerequisite', async () => {
    const lesson = document('foundation', 'core-java', 'free');
    const practice = {
      ...document('exercise', 'core-java', 'free'),
      contentType: 'q-and-a',
      discoveryKind: 'practice',
      studyRelatedLessonIds: ['foundation'],
    };
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of([lesson, practice]) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl(
      '/study-plan?days=7&topics=learn:core-java&approach=interview',
      StudyPlanPage,
    );
    page.setFamiliarity('learn:core-java', 'new');
    await page.generatePlan();
    await page.saveDraft();
    const items = page.plan().days.flatMap((d: any) => d.assignments);
    const foundation = items.find(
      (a: any) => a.kind === 'new' && a.sourceContentId === 'foundation',
    );
    const exercise = items.find((a: any) => a.kind === 'new' && a.sourceContentId === 'exercise');
    expect(page.canOpen(exercise)).toBe(false);
    page.toggleCompletion(foundation);
    expect(page.completedIds().has('foundation')).toBe(true);
    expect(page.canOpen(exercise)).toBe(true);
  });
  it('saves account review notes on blur without requiring a change event', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = (await harness.navigateByUrl(
      '/study-plan?days=7&topics=learn:core-java&approach=interview',
      StudyPlanPage,
    )) as any;
    await page.generatePlan();
    await page.saveDraft();
    page.accountMode.set(true);
    const save = vi.spyOn(page, 'saveAccountActivity').mockResolvedValue(undefined);
    harness.detectChanges();
    const field = harness.routeNativeElement!.querySelector('textarea')!;
    expect(field).not.toBeNull();
    field.value = 'Explain the invariant before coding.';
    field.dispatchEvent(new Event('input'));
    expect(save).not.toHaveBeenCalled();
    field.dispatchEvent(new FocusEvent('blur'));
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'setNote', text: 'Explain the invariant before coding.' }),
    ]);
  });

  it('restores the in-memory anonymous plan after logout when browser storage is unavailable', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = (await harness.navigateByUrl('/study-plan', StudyPlanPage)) as any;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('Storage unavailable');
      },
    });
    await page.generatePlan();
    await page.saveDraft();
    const original = page.saved();
    expect(original).not.toBeNull();
    const accounts = TestBed.inject(StudyPlanAccount);
    vi.spyOn(accounts, 'login').mockImplementation(async () => {
      accounts.account.set({
        accountId: 'synthetic-a',
        username: 'synthetic-a',
        displayName: 'Synthetic A',
        topicGrants: ['learn:core-java'],
      });
      return true;
    });
    await page.login();
    expect(page.saved()).toBeNull();
    vi.spyOn(accounts, 'logout').mockImplementation(async () => {
      accounts.account.set(null);
      return true;
    });
    await page.logout();
    expect(page.saved()).toEqual(original);
    expect(page.accountMode()).toBe(false);
  });

  it('keeps session completion identifiers out of a generated plan’s canonical completion inputs', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page = (await harness.navigateByUrl('/study-plan', StudyPlanPage)) as any;
    await page.generatePlan();
    await page.saveDraft();
    page.saved.update((saved: any) => ({
      ...saved,
      completedIds: ['available-lesson', 'available-lesson:review:v2:3'],
    }));
    await page.generatePlan();
    await page.saveDraft();
    expect(page.plan().config.completedContentIds).toEqual(['available-lesson']);
  });
  it('keeps generation temporary until save and the weekly schedule closed by default', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await page.generatePlan();
    expect(page.draft()).not.toBeNull();
    expect(page.saved()).toBeNull();
    expect(localStorage.getItem('look-ahead.study-plan.v1')).toBeNull();
    page.closeDraft();
    expect(page.saved()).toBeNull();
    await page.generatePlan();
    await page.saveDraft();
    harness.detectChanges();
    expect(page.saved()).not.toBeNull();
    const schedule = harness.routeNativeElement!.querySelector(
      'dialog.schedule-dialog',
    ) as HTMLDialogElement;
    expect(schedule.open).toBe(false);
    expect(schedule.querySelector('details[open]')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.setup-panel')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.revision-panel')).toBeNull();
    expect(
      harness.routeNativeElement!.querySelector('.recovery-toggle[aria-haspopup="dialog"]')
        ?.textContent,
    ).toContain('Make Room for Real Life');
  });

  it('retains a failed recovery preview and the last saved plan', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await page.generatePlan();
    await page.saveDraft();
    const original = page.saved();
    page.previewRecovery();
    const preview = page.recoveryPreview();
    page.accountMode.set(true);
    vi.spyOn(TestBed.inject(StudyPlanAccount), 'save').mockResolvedValue(null);
    await page.confirmRecovery();
    expect(page.saved()).toBe(original);
    expect(page.recoveryPreview()).toBe(preview);
  });

  it('keeps creation visible but prevents saving when the account service is unavailable', async () => {
    const account = TestBed.inject(StudyPlanAccount);
    vi.spyOn(account, 'initialize').mockImplementation(async () => {
      account.error.set('Account unavailable');
    });
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.setupVisible()).toBe(true);
    expect(page.canGenerate()).toBe(false);
  });
  it('keeps a browser plan private and shows Create while signed out in account mode', async () => {
    const accounts = TestBed.inject(StudyPlanAccount);
    const harness = await RouterTestingHarness.create();
    const local: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await local.generatePlan();
    await local.saveDraft();
    const original = localStorage.getItem('look-ahead.study-plan.v1');
    await harness.navigateByUrl('/exit', PlannerExit);
    Object.defineProperty(accounts, 'enabled', { value: true });
    vi.spyOn(accounts, 'initialize').mockResolvedValue();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.setupVisible()).toBe(true);
    expect(page.progressVisible()).toBe(false);
    expect(page.saved()).toBeNull();
    expect(page.importAvailable()).toBe(true);
    expect(localStorage.getItem('look-ahead.study-plan.v1')).toBe(original);
    expect(harness.routeNativeElement!.querySelector('.account-panel')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.active-heading')).toBeNull();
    await page.generatePlan();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.draft-actions')?.textContent).toContain(
      'Continue to sign in',
    );
    expect(harness.routeNativeElement!.querySelector('.draft-actions')?.textContent).not.toContain(
      'Save on this browser',
    );
  });

  it('shows Create for an empty signed-in account, then Progress only after loading its saved plan', async () => {
    const accounts = TestBed.inject(StudyPlanAccount);
    const harness = await RouterTestingHarness.create();
    const local: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await local.generatePlan();
    await local.saveDraft();
    const saved = local.saved();
    await harness.navigateByUrl('/exit', PlannerExit);
    Object.defineProperty(accounts, 'enabled', { value: true });
    accounts.account.set({
      accountId: 'synthetic',
      username: 'synthetic',
      displayName: 'Synthetic',
      topicGrants: [],
    });
    vi.spyOn(accounts, 'initialize').mockResolvedValue();
    let page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.setupVisible()).toBe(true);
    expect(page.progressVisible()).toBe(false);
    expect(page.saved()).toBeNull();
    await harness.navigateByUrl('/exit', PlannerExit);
    accounts.active.set({
      planId: 'owned',
      versionId: 'v1',
      revision: 1,
      goal: saved.goal,
      snapshot: saved.snapshot,
      provenance: {
        algorithmVersion: null,
        catalogVersion: null,
        rankingVersion: saved.rankingVersion,
      },
      progress: {
        completedContentIds: [],
        completedSessionIds: [],
        attemptedContentIds: [],
        needsReviewContentIds: [],
        notes: {},
        sessionOutcomes: {},
      },
      recovery: { strategy: 'none', elapsedDays: 0, deadlineDays: 30, deferredContentIds: [] },
      createdAt: '',
      updatedAt: '',
    });
    page = await harness.navigateByUrl('/study-plan?day=8', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.progressVisible()).toBe(true);
    expect(page.setupVisible()).toBe(false);
    expect(page.selectedDay()).toBe(8);
    accounts.sessionExpired.set(true);
    harness.detectChanges();
    expect(page.progressVisible()).toBe(false);
    expect(harness.routeNativeElement!.querySelector('.active-heading')).toBeNull();
  });

  it('shows the selected week and bounds pagination including a partial final week', async () => {
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await page.generatePlan();
    await page.saveDraft();
    harness.detectChanges();
    page.selectedDay.set(9);
    page.openSchedule();
    harness.detectChanges();
    expect(page.schedulePage()).toBe(1);
    expect(page.scheduleDays().map((day: any) => day.day)).toEqual([8, 9, 10, 11, 12, 13, 14]);
    page.changeSchedulePage(100);
    harness.detectChanges();
    expect(page.scheduleDays().map((day: any) => day.day)).toEqual([29, 30]);
    expect(harness.routeNativeElement!.querySelectorAll('.schedule-day')).toHaveLength(2);
    page.changeSchedulePage(1);
    expect(page.schedulePage()).toBe(4);
    page.changeSchedulePage(-100);
    expect(page.schedulePage()).toBe(0);
    page.openScheduleDay(6);
    expect(page.selectedDay()).toBe(6);
    expect(
      harness.routeNativeElement!.querySelector('dialog.schedule-dialog')?.hasAttribute('open'),
    ).toBe(false);
    expect(harness.routeNativeElement!.querySelector('.compass-panel')?.textContent).toContain(
      'Your complete schedule',
    );
    expect(harness.routeNativeElement!.querySelector('details.complete-schedule')).toBeNull();
  });

  it('opens the requested owned plan before a different cached active plan', async () => {
    const accounts = TestBed.inject(StudyPlanAccount);
    vi.spyOn(accounts, 'initialize').mockResolvedValue();
    accounts.active.set({ planId: 'cached' } as any);
    accounts.plans.set([{ planId: 'requested' }, { planId: 'cached' }] as any);
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl(
      '/study-plan?plan=requested&day=2',
      StudyPlanPage,
    );
    const open = vi.spyOn(page, 'openAccountPlan').mockResolvedValue(undefined);
    const accept = vi.spyOn(page, 'acceptAccountPlan');
    await page.enterAccount();
    expect(open).toHaveBeenCalledWith('requested');
    expect(accept).not.toHaveBeenCalled();
    expect(page.selectedDay()).toBe(2);
  });

  it('does not auto-open author dialogs for an ordinary account with forged query parameters', async () => {
    const accounts = TestBed.inject(StudyPlanAccount);
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan?authorView=draft', StudyPlanPage);
    accounts.account.set({
      accountId: 'ordinary',
      username: 'author@lookahead.test',
      displayName: 'Author',
      topicGrants: [],
    });
    page.accountReady.set(true);
    const generate = vi.spyOn(page, 'generatePlan');
    page.queueAuthorView();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(generate).not.toHaveBeenCalled();
    expect(page.draft()).toBeNull();
  });

  it('restores sign-in draft selections without saving or importing a plan automatically', async () => {
    const accounts = TestBed.inject(StudyPlanAccount);
    Object.defineProperty(accounts, 'enabled', { value: true });
    vi.spyOn(accounts, 'initialize').mockResolvedValue();
    accounts.account.set({
      accountId: 'synthetic',
      username: 'synthetic',
      displayName: 'Synthetic',
      topicGrants: [],
    });
    const save = vi.spyOn(accounts, 'save');
    const importPlan = vi.spyOn(accounts, 'importLocal');
    sessionStorage.setItem(
      'look-ahead.study-plan-draft-intent.v1',
      JSON.stringify({
        goal: 'My draft focus',
        days: 30,
        dailyHours: 2,
        goalType: 'learning',
        topicIds: ['learn:core-java'],
        familiarity: {},
      }),
    );
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan?create=1', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.goal()).toBe('My draft focus');
    expect(page.dailyHours()).toBe(2);
    expect([...page.selectedTopicIds()]).toEqual(['learn:core-java']);
    expect(page.setupVisible()).toBe(true);
    expect(page.saved()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(importPlan).not.toHaveBeenCalled();
    sessionStorage.removeItem('look-ahead.study-plan-draft-intent.v1');
  });
  it('applies a career starting point as editable input without creating or saving a plan', async () => {
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    const before = page.goal();
    page.selectedPresetId.set('college-grad');
    harness.detectChanges();
    expect(page.goal()).toBe(before);
    expect(page.presetAvailability().unavailableIds.length).toBeGreaterThan(0);
    page.applyPreset();
    harness.detectChanges();
    expect(page.goal()).toBe('College graduate preparation');
    expect(page.days()).toBe(90);
    expect([...page.selectedTopicIds()]).toEqual(['learn:core-java']);
    expect(page.saved()).toBeNull();
    expect(page.draft()).toBeNull();
    expect(localStorage.getItem('look-ahead.study-plan.v1')).toBeNull();
    page.goal.set('My own goal');
    page.dailyHours.set(2);
    expect(page.goal()).toBe('My own goal');
    expect(page.dailyHours()).toBe(2);
  });
});
