import { afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';
import { StudyPlanPage } from './study-plan';
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
        provideRouter([
          { path: 'study-plan', component: StudyPlanPage },
          { path: 'exit', component: PlannerExit },
        ]),
        { provide: ContentService, useValue: service },
      ],
    }).compileComponents();
  });

  it('starts with a realistic hour and a single published-offering checklist', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    const controls = harness.routeNativeElement!.querySelectorAll('select');
    expect(controls[0].value).toBe('30');
    expect(controls[1].value).toBe('1');
    expect(harness.routeNativeElement!.querySelectorAll('fieldset')).toHaveLength(1);
    const checkboxes =
      harness.routeNativeElement!.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].disabled).toBe(false);
    expect(checkboxes[1].disabled).toBe(true);
  });

  it('restores URL settings without granting access from a forged access parameter', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/study-plan?days=120&hours=3&topics=learn:modern-java&access=learn:modern-java',
      StudyPlanPage,
    );
    harness.detectChanges();
    const controls = harness.routeNativeElement!.querySelectorAll('select');
    expect(controls[0].value).toBe('120');
    expect(controls[1].value).toBe('3');
    const build = harness.routeNativeElement!.querySelector<HTMLButtonElement>('button.primary')!;
    expect(build.disabled).toBe(true);
    expect(window.localStorage.getItem('look-ahead.study-plan.v1')).toBeNull();
  });

  it('pins its snapshot, saves completion explicitly, and preserves work during recovery and replanning', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await (page as any).generatePlan();
    harness.detectChanges();
    let saved = JSON.parse(window.localStorage.getItem('look-ahead.study-plan.v1')!);
    expect(saved.rankingVersion).toBe('rank-v1');
    expect(saved.completedIds).toEqual([]);
    const assignment = saved.snapshot.days[0].assignments[0];
    (page as any).toggleCompletion(assignment);
    (page as any).shiftSchedule();
    saved = JSON.parse(window.localStorage.getItem('look-ahead.study-plan.v1')!);
    expect(saved.completedIds).toEqual(['available-lesson']);
    expect(saved.shiftedDays).toBe(1);
    expect(saved.snapshot.days[0].assignments[0].id).toBe('available-lesson');
    await (page as any).generatePlan();
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
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan?topics=learn:modern-java', StudyPlanPage);
    harness.detectChanges();
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('button.primary')!.disabled,
    ).toBe(true);
    accessStatus.set('ready');
    harness.detectChanges();
    await (page as any).generatePlan();
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
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await (page as any).generatePlan();
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
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await (page as any).generatePlan();
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
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/study-plan?topics=learn:algorithmic-patterns',
      StudyPlanPage,
    );
    await (page as any).generatePlan();
    expect((page as any).saved()).toBeNull();
    expect((page as any).canGenerate()).toBe(false);
    ranking.error(new Error('offline'));
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Retry DSA order');
    (page as any).loadRanking();
    await (page as any).generatePlan();
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
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/study-plan?topics=learn:algorithmic-patterns',
      StudyPlanPage,
    );
    await (page as any).generatePlan();
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
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/study-plan?topics=learn:core-java&hours=2',
      StudyPlanPage,
    );
    await (page as any).generatePlan();
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

  it('does not describe a catalog-only offering as an entitlement restriction', async () => {
    const tool: SearchDocument = {
      ...document('catalog-only', 'future-workspace', 'free'),
      discoveryKind: 'tool',
    };
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of([tool]) },
    });
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
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('The saved plan could not be read');
  });

  it('shows a retry path when the published index fails', async () => {
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => throwError(() => new Error('offline')) },
    });
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
    const harness = await RouterTestingHarness.create();
    let page: any = await harness.navigateByUrl(
      '/study-plan?days=7&hours=1&topics=learn:core-java&approach=interview',
      StudyPlanPage,
    );
    await page.generatePlan();
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
    const noteField = harness.routeNativeElement!.querySelector('textarea')!;
    noteField.value = 'Check duplicate-key behavior.';
    noteField.dispatchEvent(new Event('input'));
    expect(page.reviewNote(exercise)).toBe('Check duplicate-key behavior.');
    expect(page.completedIds().has('exercise')).toBe(false);
    expect(page.saved().needsReviewContentIds).toEqual(['exercise']);
    expect(page.canOpen(recall)).toBe(true);
    page.shiftSchedule();
    expect(JSON.stringify(page.plan())).toBe(original);
    await harness.navigateByUrl('/exit');
    page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    expect(JSON.stringify(page.plan())).toBe(original);
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
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl(
      '/study-plan?days=7&topics=learn:core-java&approach=interview',
      StudyPlanPage,
    );
    page.setFamiliarity('learn:core-java', 'new');
    await page.generatePlan();
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
});
