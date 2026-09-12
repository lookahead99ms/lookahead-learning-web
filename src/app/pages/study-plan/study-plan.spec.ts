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
  getReadyMadeStudyPlans: () =>
    of({
      schemaVersion: 'study-plan-picker/v1',
      catalogVersion: 'test-v1',
      availabilityUnit: 'hours-per-day',
      durationOptions: [],
      paths: [],
      pendingOptions: [],
    }),
  getReadyMadeStudyPlan: () => throwError(() => new Error('No ready-made test template')),
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

  it('shows a scroll cue only while review content remains and keeps the draft temporary', async () => {
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan?days=7&hours=1', StudyPlanPage);
    await page.generatePlan();
    harness.detectChanges();
    const body = harness.routeNativeElement!.querySelector<HTMLElement>('.draft-scroll-body')!;
    const firstDay = body.querySelector<HTMLElement>('[data-draft-day="1"]')!;
    Object.defineProperties(body, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 400 } as DOMRect);
    vi.spyOn(firstDay, 'getBoundingClientRect').mockReturnValue({ top: 700 } as DOMRect);
    const draftBefore = JSON.stringify(page.draft());
    body.dispatchEvent(new Event('scroll'));
    harness.detectChanges();
    expect(
      harness.routeNativeElement!.querySelector('.draft-scroll-button')!.textContent,
    ).toContain('View daily schedule');
    expect(harness.routeNativeElement!.querySelector('.has-more-below')).not.toBeNull();

    body.scrollTop = 300;
    vi.mocked(firstDay.getBoundingClientRect).mockReturnValue({ top: 100 } as DOMRect);
    body.dispatchEvent(new Event('scroll'));
    harness.detectChanges();
    expect(
      harness.routeNativeElement!.querySelector('.draft-scroll-button')!.textContent,
    ).toContain('Continue reviewing');

    body.scrollTop = 600;
    body.dispatchEvent(new Event('scroll'));
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.draft-scroll-button')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.has-more-below')).toBeNull();

    // Expanding a day at the end reveals more content and restores the cue.
    Object.defineProperty(body, 'scrollHeight', { value: 1200 });
    firstDay.parentElement!.dispatchEvent(new Event('toggle'));
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.draft-scroll-button')).not.toBeNull();
    expect(JSON.stringify(page.draft())).toBe(draftBefore);
    expect(page.saved()).toBeNull();
    expect(localStorage.getItem('look-ahead.study-plan.v1')).toBeNull();
  });

  it('scrolls to the schedule with keyboard focus and honors reduced motion', async () => {
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan?days=7&hours=1', StudyPlanPage);
    await page.generatePlan();
    harness.detectChanges();
    const body = harness.routeNativeElement!.querySelector<HTMLElement>('.draft-scroll-body')!;
    const firstDay = body.querySelector<HTMLElement>('[data-draft-day="1"]')!;
    Object.defineProperties(body, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTo: { configurable: true, value: vi.fn() },
    });
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 400 } as DOMRect);
    vi.spyOn(firstDay, 'getBoundingClientRect').mockReturnValue({ top: 700 } as DOMRect);
    const focus = vi.spyOn(firstDay, 'focus');
    const motion = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', motion);
    page.updateDraftScroll();
    harness.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.draft-scroll-button')!.click();
    expect(body.scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'instant' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(motion).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    vi.unstubAllGlobals();
    expect(page.saved()).toBeNull();
  });

  async function adjustmentPage() {
    TestBed.overrideProvider(ContentService, {
      useValue: {
        ...service,
        getSearchIndex: () =>
          of([document('execution', 'core-java', 'free'), document('java', 'core-java', 'free')]),
      },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl(
      '/study-plan?hours=1&days=7&day=4',
      StudyPlanPage,
    );
    await page.generatePlan();
    await page.saveDraft();
    const saved = page.saved();
    const original = saved.snapshot.days
      .flatMap((day: any) => day.assignments)
      .find((a: any) => a.kind === 'new');
    const execution = { ...original, id: 'execution', title: 'Execution', minutes: 45 };
    const java = { ...original, id: 'java', title: 'Java practice', minutes: 50 };
    const recall = (a: any, from: number, interval: number) => ({
      ...a,
      id: `${a.id}:review:v2:${interval}`,
      sourceContentId: a.id,
      requiredSessionId: a.id,
      activity: 'Recall',
      kind: 'review',
      minutes: 20,
      reviewFromDay: from,
      reviewDueDay: from + interval,
    });
    const slots = [
      [execution],
      [recall(execution, 1, 1)],
      [recall(execution, 1, 2), java],
      [recall(java, 3, 1)],
      [],
      [],
      [],
    ];
    const days = slots.map((assignments, i) => ({
      ...saved.snapshot.days[0],
      day: i + 1,
      assignments,
      focusedMinutes: assignments.reduce((sum, a) => sum + a.minutes, 0),
    }));
    const snapshot = {
      ...saved.snapshot,
      config: { ...saved.snapshot.config, days: 7 },
      focusedDailyHours: 1,
      futureReviews: [],
      days,
      weeks: [{ number: 1, label: 'Learn', days }],
    };
    page.saved.set({ ...saved, snapshot, completedIds: ['execution'], studyLog: [] });
    page.selectedDay.set(4);
    window.localStorage.setItem('look-ahead.study-plan.v1', JSON.stringify(page.saved()));
    harness.detectChanges();
    return { page, harness, account: TestBed.inject(StudyPlanAccount) };
  }

  for (const method of ['Close', 'Escape']) {
    it(`${method} closes the review without declining or changing saved work, including after reload`, async () => {
      const { page, harness } = await adjustmentPage();
      const before = JSON.stringify(page.saved());
      page.reviewAdjustment();
      harness.detectChanges();
      const dialog = harness.routeNativeElement!.querySelector('.recovery-dialog')!;
      if (method === 'Escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      else
        [...dialog.querySelectorAll('button')]
          .find((button) => button.textContent?.trim() === 'Close adjustments')!
          .click();
      harness.detectChanges();
      expect(page.recoveryPreview()).toBeNull();
      expect(page.adjustmentNotice()).toBe(true);
      expect(page.visibleStatus()).not.toContain('Plan retained');
      expect(JSON.stringify(page.saved())).toBe(before);
      expect(localStorage.getItem('look-ahead.study-plan.v1')).toBe(before);
      await harness.navigateByUrl('/exit', PlannerExit);
      const restored: any = await harness.navigateByUrl('/study-plan?day=4', StudyPlanPage);
      harness.detectChanges();
      expect(restored.adjustmentNotice()).toBe(true);
    });
  }

  it('does not retain a stale proposal or announce an earlier decision for a changed plan', async () => {
    const { page } = await adjustmentPage();
    page.reviewAdjustment();
    const original = page.saved();
    page.saved.set({ ...original, revision: original.revision + 1 });
    page.keepCurrentPlan();
    expect(page.adjustmentNotice()).toBe(true);
    expect(page.visibleStatus()).not.toContain('Plan retained');
    page.keepCurrentPlan();
    expect(page.visibleStatus()).toContain('Plan retained');
    page.selectedDay.set(5);
    expect(page.visibleStatus()).toBe('');
  });

  it('places one plan-and-day notice below the day selector and keeps retained status there', async () => {
    const { page, harness, account } = await adjustmentPage();
    Object.defineProperty(account, 'enabled', { value: true });
    page.accountMode.set(true);
    account.account.set({
      accountId: 'a',
      username: 'a',
      displayName: 'A',
      topicGrants: ['learn:core-java'],
    });
    account.active.set({ planId: 'plan-a', versionId: 'v1', revision: 1 } as any);
    account.plans.set([{ planId: 'plan-a', goal: 'My plan', revision: 1 }] as any);
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.querySelectorAll('.adjustment-notice')).toHaveLength(1);
    expect(
      root
        .querySelector('.session-heading')!
        .nextElementSibling?.classList.contains('adjustment-notice'),
    ).toBe(true);
    expect(root.querySelector('.adjustment-notice')?.textContent).toContain('Day 4');
    page.keepCurrentPlan();
    harness.detectChanges();
    expect(root.querySelector('.adjustment-notice [role="status"]')?.textContent).toContain(
      'Plan retained',
    );
    account.active.set({ planId: 'plan-b', versionId: 'v1', revision: 1 } as any);
    harness.detectChanges();
    expect(root.querySelector('.adjustment-notice')?.textContent).not.toContain('Plan retained');
  });

  it('gates author tools and opens repeated scenarios without writes', async () => {
    const { page, harness, account } = await adjustmentPage();
    const original = page.saved();
    const open = vi.spyOn(account, 'open');
    await page.openAuthorScenario('saved');
    expect(open).not.toHaveBeenCalled();
    expect(harness.routeNativeElement!.querySelector('.author-preview-tools')).toBeNull();
    page.accountMode.set(true);
    account.account.set({
      accountId: 'author',
      username: 'author',
      displayName: 'Author',
      authorPreview: true,
      topicGrants: ['learn:core-java'],
    });
    const fixture = (id: string, adjusted = false) =>
      ({
        planId: id,
        versionId: 'v1',
        revision: 3,
        goal: id === 'saved' ? 'Author sample · Saved plan' : 'Author sample · Adjusted plan',
        snapshot: original.snapshot,
        provenance: { algorithmVersion: null, catalogVersion: null, rankingVersion: null },
        progress: {
          completedContentIds: [],
          completedSessionIds: [],
          attemptedContentIds: [],
          needsReviewContentIds: [],
          notes: {},
          sessionOutcomes: {},
        },
        recovery: {
          strategy: adjusted ? 'fixed-window' : 'none',
          elapsedDays: adjusted ? 2 : 0,
          deadlineDays: 7,
          deferredContentIds: [],
        },
        createdAt: '',
        updatedAt: '',
      }) as any;
    const samples = [fixture('saved'), fixture('adjusted', true)];
    const snapshots = JSON.stringify(samples);
    account.plans.set(samples);
    open.mockImplementation(async (id) => {
      const plan = samples.find((item) => item.planId === id)!;
      account.active.set(plan);
      return plan;
    });
    const save = vi.spyOn(account, 'save');
    await page.openAuthorScenario('missed');
    expect(page.selectedDay()).toBe(2);
    page.reviewSchedule();
    expect(page.selectedDay()).toBe(2);
    page.closeRecovery();
    await page.openAuthorScenario('adjusted');
    expect(page.selectedDay()).toBe(3);
    expect(page.saved().recovery.strategy).toBe('fixed-window');
    await page.openAuthorScenario('create');
    expect(page.saved()).toBeNull();
    expect(page.days()).toBe(30);
    expect(page.goal()).toBe('Build reliable engineering foundations');
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.account-panel')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.creation-intro')).not.toBeNull();
    page.goal.set('My unfinished draft');
    page.days.set(60);
    await page.openAuthorScenario('saved');
    expect(page.saved().goal).toBe('Author sample · Saved plan');
    expect(page.selectedDay()).toBe(1);
    await page.openAuthorScenario('create');
    expect(page.goal()).toBe('My unfinished draft');
    expect(page.days()).toBe(60);
    await page.openAuthorScenario('saved');
    expect(JSON.stringify(samples)).toBe(snapshots);
    expect(save).not.toHaveBeenCalled();
    harness.detectChanges();
    expect(
      harness.routeNativeElement!.querySelector('.author-preview-tools button[disabled]')
        ?.textContent,
    ).toContain('Delete plan');
    samples[1].recovery.strategy = 'explicit-extension';
    await page.openAuthorScenario('adjusted');
    expect(page.saved().goal).toBe('Author sample · Saved plan');
    expect(page.authorScenarioStatus()).toContain('does not contain');
  });

  it('renders every owned card without selecting a plan or inferring progress from dates', async () => {
    const { page, harness, account } = await adjustmentPage();
    page.accountMode.set(true);
    account.account.set({ accountId: 'a', username: 'a', displayName: 'A', topicGrants: [] });
    const original = account.active();
    const open = vi.spyOn(account, 'open');
    account.plans.set(
      Array.from({ length: 5 }, (_, index) => ({
        planId: 'p' + index,
        goal: 'Plan ' + index,
        revision: 1,
        updatedAt: '2099-01-01',
        card: index
          ? undefined
          : {
              schemaVersion: 'plan-card/v1',
              metadataStatus: 'available',
              selectedTopicIds: ['learn:core-java'],
              durationDays: 30,
              configuredDailyMinutes: 120,
              completedSessionCount: 3,
              totalSessionCount: 20,
              nextScheduledActivity: { title: 'Next saved session' },
              lifecycleState: null,
              reservation: null,
            },
      })) as any,
    );
    await page.showAllPlans();
    harness.detectChanges();
    expect(page.setupVisible()).toBe(false);
    expect(page.progressVisible()).toBe(false);
    expect(harness.routeNativeElement!.querySelectorAll('.plan-card')).toHaveLength(5);
    expect(harness.routeNativeElement!.querySelector('.plan-card')?.textContent).toContain(
      '3 / 20',
    );
    expect(harness.routeNativeElement!.querySelector('.plan-card')?.textContent).toContain(
      '2 hours configured',
    );
    expect(harness.routeNativeElement!.textContent).not.toContain('2099');
    expect(account.active()).toBe(original);
    expect(open).not.toHaveBeenCalled();
  });

  it('always exposes Review schedule and does not offer Apply for a no-op diagnostic', async () => {
    const { page, harness } = await adjustmentPage();
    page.selectedDay.set(1);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.session-heading')?.textContent).toContain(
      'Review schedule',
    );
    const before = JSON.stringify(page.saved());
    page.reviewSchedule();
    harness.detectChanges();
    expect(page.scheduleDiagnostic()?.kind).toBe('no-unfinished-work');
    const dialog = harness.routeNativeElement!.querySelector('.recovery-dialog')!;
    expect(dialog.textContent).toContain('No unfinished work needs rescheduling');
    expect(dialog.textContent).not.toContain('Apply adjustment');
    expect(page.recoveryPreview()).toBeNull();
    expect(JSON.stringify(page.saved())).toBe(before);
    page.closeRecovery();
  });

  it('offers only a temporary adjustment on entry and remembers Keep current plan across reload', async () => {
    const { page, harness } = await adjustmentPage();
    const before = JSON.stringify(page.saved());
    expect(page.adjustmentNotice()).toBe(true);
    expect(harness.routeNativeElement!.querySelector('dialog[open]')).toBeNull();
    page.reviewAdjustment();
    harness.detectChanges();
    expect(page.recoveryPreview().moved).toContainEqual({
      assignmentId: 'java',
      fromDay: 3,
      toDay: 6,
    });
    expect(harness.routeNativeElement!.textContent).toContain('Day 3 to day 6');
    expect(JSON.stringify(page.saved())).toBe(before);
    page.keepCurrentPlan();
    expect(page.adjustmentNotice()).toBe(false);
    expect(page.visibleStatus()).toContain('Plan retained');
    expect(globalThis.document.activeElement?.id).toBe('today-heading');
    expect(localStorage.getItem('look-ahead.study-plan.v1')).toBe(before);
    await harness.navigateByUrl('/exit', PlannerExit);
    const restored: any = await harness.navigateByUrl('/study-plan?day=4', StudyPlanPage);
    harness.detectChanges();
    expect(restored.saved()).not.toBeNull();
    expect(restored.adjustmentNotice()).toBe(false);
    expect(harness.routeNativeElement!.querySelector('.recovery-toggle')).not.toBeNull();
    restored.saved.set({ ...restored.saved(), revision: restored.saved().revision + 1 });
    expect(restored.adjustmentNotice()).toBe(true);
    restored.dismissAdjustment();
    restored.saved.set({ ...restored.saved(), revision: restored.saved().revision - 1 });
    expect(restored.adjustmentNotice()).toBe(false);
  });

  it('isolates dismissal by owner and plan and invalidates a review after progress changes', async () => {
    const { page, account } = await adjustmentPage();
    page.accountMode.set(true);
    account.account.set({
      accountId: 'a',
      username: 'a',
      displayName: 'A',
      topicGrants: ['learn:core-java'],
    });
    account.active.set({ planId: 'plan-a', versionId: 'v1', revision: 1 } as any);
    page.dismissAdjustment();
    expect(page.adjustmentNotice()).toBe(false);
    account.account.set({
      accountId: 'b',
      username: 'b',
      displayName: 'B',
      topicGrants: ['learn:core-java'],
    });
    expect(page.adjustmentNotice()).toBe(true);
    account.active.set({ planId: 'plan-b', versionId: 'v1', revision: 1 } as any);
    page.reviewAdjustment();
    const save = vi.spyOn(account, 'save').mockResolvedValue(null);
    page.saved.set({
      ...page.saved(),
      completedIds: [...page.saved().completedIds, 'execution:review:v2:1'],
    });
    expect(page.adjustmentStale()).toBe(true);
    await page.confirmRecovery();
    expect(save).not.toHaveBeenCalled();
    expect(page.status()).toContain('Review a fresh adjustment');
  });

  it('applies a reviewed local adjustment once and preserves the current plan on storage failure', async () => {
    const { page } = await adjustmentPage();
    page.reviewAdjustment();
    const before = JSON.stringify(page.saved());
    const persist = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await page.confirmRecovery();
    expect(JSON.stringify(page.saved())).toBe(before);
    expect(page.recoveryPreview()).not.toBeNull();
    expect(page.status()).not.toContain('Plan updated');
    persist.mockRestore();
    const revision = page.saved().revision;
    await page.confirmRecovery();
    await page.confirmRecovery();
    expect(page.saved().revision).toBe(revision + 1);
    expect(
      page
        .saved()
        .snapshot.days[5].assignments.some((a: any) => a.id === 'java' && a.minutes === 50),
    ).toBe(true);
    expect(page.saved().completedIds).toEqual(['execution']);
    expect(page.status()).toContain('Plan updated');
    expect(JSON.parse(localStorage.getItem('look-ahead.study-plan.v1')!).revision).toBe(
      revision + 1,
    );
  });

  it('keeps an uncertain account proposal and blocks conflict retry until reload and review', async () => {
    const { page, account } = await adjustmentPage();
    page.accountMode.set(true);
    account.account.set({
      accountId: 'a',
      username: 'a',
      displayName: 'A',
      topicGrants: ['learn:core-java'],
    });
    page.reviewAdjustment();
    const before = JSON.stringify(page.saved());
    const proposal = page.recoveryPreview();
    const save = vi.spyOn(account, 'save').mockImplementation(async () => {
      account.pending.set(true);
      account.errorStatus.set(409);
      account.error.set('Changed elsewhere');
      return null;
    });
    const retry = vi.spyOn(account, 'retry').mockResolvedValue(null);
    await page.confirmRecovery();
    await page.confirmRecovery();
    await page.retryAccountSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(JSON.stringify(page.saved())).toBe(before);
    expect(page.recoveryPreview()).toBe(proposal);
    expect(page.status()).not.toContain('Plan updated');
    account.discardPending();
    page.reviewAdjustment();
    await page.confirmRecovery();
    expect(save).toHaveBeenCalledTimes(1);
    expect(page.adjustmentStale()).toBe(true);
  });

  it('waits for the account acknowledgement before refreshing the plan or reporting success', async () => {
    const { page, account } = await adjustmentPage();
    page.accountMode.set(true);
    account.account.set({
      accountId: 'a',
      username: 'a',
      displayName: 'A',
      topicGrants: ['learn:core-java'],
    });
    page.reviewAdjustment();
    const original = page.saved(),
      proposed = page.recoveryPreview().snapshot;
    let acknowledge!: (value: any) => void;
    const save = vi.spyOn(account, 'save').mockImplementation(() => {
      account.busy.set(true);
      return new Promise((resolve) => {
        acknowledge = resolve;
      });
    });
    const applying = page.confirmRecovery();
    await page.confirmRecovery();
    expect(save).toHaveBeenCalledTimes(1);
    expect(page.saved()).toBe(original);
    expect(page.status()).not.toContain('Plan updated');
    account.busy.set(false);
    acknowledge({
      planId: 'plan-a',
      versionId: 'v2',
      revision: original.revision + 1,
      goal: original.goal,
      snapshot: proposed,
      provenance: {
        algorithmVersion: proposed.schedulingVersion ?? null,
        catalogVersion: null,
        rankingVersion: null,
      },
      progress: {
        completedContentIds: ['execution'],
        completedSessionIds: ['execution'],
        attemptedContentIds: [],
        needsReviewContentIds: [],
        notes: {},
        sessionOutcomes: {},
        studyLog: [],
      },
      recovery: {
        strategy: 'fixed-window',
        elapsedDays: 3,
        deadlineDays: 7,
        deferredContentIds: [],
        deferredSessions: [],
      },
      createdAt: '2026-09-11T12:00:00Z',
      updatedAt: '2026-09-11T13:00:00Z',
    });
    await applying;
    expect(page.saved().revision).toBe(original.revision + 1);
    expect(page.saved().snapshot).toEqual(proposed);
    expect(page.status()).toBe('Plan updated. Your adjustment is saved.');
    expect(page.recoveryPreview()).toBeNull();
  });

  it('does not suggest during loading, access failure or an unavailable account', async () => {
    const { page, account } = await adjustmentPage();
    page.accountReady.set(false);
    expect(page.adjustmentNotice()).toBe(false);
    page.accountReady.set(true);
    page.loadingError.set('Content unavailable');
    expect(page.adjustmentNotice()).toBe(false);
    page.loadingError.set('');
    account.error.set('Account unavailable');
    expect(page.adjustmentNotice()).toBe(false);
  });

  it('starts with a realistic hour and a single published-offering checklist', async () => {
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    const controls = harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>(
      '.setup-panel .field-pair select',
    );
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
    expect((panel as HTMLDetailsElement).open).toBe(true);
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
    const controls = harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>(
      '.setup-panel .field-pair select',
    );
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
    for (const assignment of [overlap, blocked, current]) {
      expect(root.querySelectorAll(`[data-session-id="${assignment.id}"]`)).toHaveLength(1);
    }
    expect(
      [...root.querySelectorAll('.session-card h4, .pending-session h4')].filter(
        (node) => node.textContent === 'Shared visible title',
      ),
    ).toHaveLength(1);
    expect(root.querySelector(`[data-session-id="${independent.id}"]`)).toBeNull();
    expect(page.dailyQueue().deferred).toContainEqual(independent);
    expect(page.dailyQueue().allDue).toContainEqual(independent);
    expect(root.querySelector<HTMLDetailsElement>('.pending-panel')?.open).toBe(true);
    expect(JSON.stringify(page.saved())).toBe(before);
    expect(page.completedIds().has(unfinished.id)).toBe(false);
  });

  it('keeps Day 4 within budget while hiding only redundant recalls for today', async () => {
    const docs = ['execution', 'java', 'different-source'].map((id) =>
      document(id, 'core-java', 'free'),
    );
    TestBed.overrideProvider(ContentService, {
      useValue: { ...service, getSearchIndex: () => of(docs) },
    });
    await TestBed.inject(StudyPlanAccount).initialize();
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan?hours=1', StudyPlanPage);
    await page.generatePlan();
    await page.saveDraft();
    const saved = page.saved();
    const originals = saved.snapshot.days.flatMap((day: any) => day.assignments);
    const execution = { ...originals.find((a: any) => a.id === 'execution'), minutes: 45 };
    const java = { ...originals.find((a: any) => a.id === 'java'), minutes: 50 };
    const recall = (original: any, interval: number, from: number) => ({
      ...original,
      id: `${original.id}:review:v2:${interval}`,
      sourceContentId: original.id,
      requiredSessionId: original.id,
      kind: 'review',
      activity: 'Recall',
      minutes: 20,
      reviewFromDay: from,
      reviewDueDay: from + interval,
    });
    const first = recall(execution, 1, 1);
    const later = recall(execution, 2, 1);
    const blocked = recall(java, 1, 3);
    const day = saved.snapshot.days[0];
    page.saved.set({
      ...saved,
      completedIds: [execution.id],
      studyLog: [],
      snapshot: {
        ...saved.snapshot,
        focusedDailyHours: 1,
        futureReviews: [later],
        days: [[execution], [first], [java, later], [blocked], []].map((assignments, i) => ({
          ...day,
          day: i + 1,
          assignments,
          focusedMinutes: assignments.reduce((sum, a) => sum + a.minutes, 0),
        })),
      },
    });
    page.selectedDay.set(4);
    const before = JSON.stringify(page.saved());
    const storageBefore = window.localStorage.getItem('look-ahead.study-plan.v1');
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(page.dailyQueue()).toMatchObject({ budget: 60, spent: 0, minutes: 20, remaining: 40 });
    expect(page.dailyQueue().selected.map((a: any) => a.id)).toEqual([first.id]);
    expect(page.dailyQueue().deferred.map((a: any) => a.id)).toEqual([
      later.id,
      java.id,
      blocked.id,
    ]);
    expect(
      [...root.querySelectorAll('[data-session-id]')].map((e) => e.getAttribute('data-session-id')),
    ).toEqual([first.id, java.id, blocked.id]);
    const pending = root.querySelector<HTMLDetailsElement>('.pending-panel')!;
    expect(pending.open).toBe(true);
    expect(pending.querySelector('summary')?.textContent).toContain('2 sessions');
    expect(pending.textContent).toContain('daily budget');
    expect(root.querySelector(`[data-session-id="${blocked.id}"] a`)).toBeNull();
    expect(page.canOpen(blocked)).toBe(false);
    expect(JSON.stringify(page.saved())).toBe(before);
    expect(window.localStorage.getItem('look-ahead.study-plan.v1')).toBe(storageBefore);

    // Same title is not identity: a different source must remain visible.
    const other = {
      ...later,
      id: 'different-source:review:v2:1',
      sourceContentId: 'different-source',
      requiredSessionId: 'different-source',
    };
    const originalState = page.saved();
    page.saved.set({
      ...originalState,
      snapshot: { ...originalState.snapshot, futureReviews: [later, other] },
    });
    harness.detectChanges();
    expect(root.querySelector(`[data-session-id="${other.id}"]`)).not.toBeNull();
    page.saved.set(originalState);

    // Completing one occurrence never completes another; it reappears on a later day.
    page.saved.set({
      ...originalState,
      completedIds: [execution.id, first.id],
      studyLog: [
        {
          assignmentId: first.id,
          day: 4,
          minutes: 20,
          recordedAt: '2026-09-11T12:00:00Z',
        },
      ],
    });
    harness.detectChanges();
    expect(page.dailyQueue().spent).toBe(20);
    expect(root.querySelector(`[data-session-id="${later.id}"]`)).toBeNull();
    expect(root.querySelector('[aria-labelledby="day-sessions-recorded"]')?.textContent).toContain(
      execution.title,
    );
    expect(page.completedIds().has(later.id)).toBe(false);
    page.selectedDay.set(5);
    harness.detectChanges();
    expect(page.dailyQueue().selected.map((a: any) => a.id)).toContain(later.id);
    expect(root.querySelector(`[data-session-id="${later.id}"]`)).not.toBeNull();
    expect(JSON.stringify(page.saved().snapshot)).toBe(JSON.stringify(originalState.snapshot));
    expect(window.localStorage.getItem('look-ahead.study-plan.v1')).toBe(storageBefore);
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

  it('does not mistake an unavailable account service for an empty plan', async () => {
    const account = TestBed.inject(StudyPlanAccount);
    vi.spyOn(account, 'initialize').mockImplementation(async () => {
      account.error.set('Account unavailable');
    });
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.setupVisible()).toBe(false);
    expect(harness.routeNativeElement!.querySelector('.empty-plan')).toBeNull();
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
    accounts.plans.set([{ planId: 'owned', goal: saved.goal, revision: 1, updatedAt: '' }]);
    page = await harness.navigateByUrl('/study-plan?day=8', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.progressVisible()).toBe(true);
    expect(page.setupVisible()).toBe(false);
    expect(page.selectedDay()).toBe(8);
    await harness.navigateByUrl('/exit', PlannerExit);
    accounts.plans.update((plans) => [
      ...plans,
      { planId: 'owned-two', goal: 'Second plan', revision: 1, updatedAt: '' },
    ]);
    page = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.dashboardVisible()).toBe(true);
    expect(page.progressVisible()).toBe(false);
    expect(harness.routeNativeElement!.querySelectorAll('.plan-card')).toHaveLength(2);
    await harness.navigateByUrl('/exit', PlannerExit);
    page = await harness.navigateByUrl('/study-plan?plan=owned&day=8', StudyPlanPage);
    await Promise.resolve();
    harness.detectChanges();
    expect(page.progressVisible()).toBe(true);
    expect(page.dashboardVisible()).toBe(false);
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
  it('loads an authored variant through three dependent controls and keeps it temporary until save', async () => {
    const variant = {
      templateId: 'java-d7-h1',
      templateVersion: 'template-v1',
      durationDays: 7,
      dailyHours: 1,
      intensive: false,
      intendedUse: 'Interview revision and targeted gaps',
      href: '/content/study-plans/templates/java-d7-h1.json',
      sha256: 'sha-test',
      scheduledMinutes: 20,
      selectedContentCount: 1,
      availableContentCount: 1,
      topicIds: ['learn:core-java'],
    };
    const catalog = {
      schemaVersion: 'study-plan-picker/v1',
      catalogVersion: 'picker-v1',
      availabilityUnit: 'hours-per-day',
      durationOptions: [7, 21],
      pendingOptions: [],
      paths: [
        {
          id: 'java',
          title: 'Java preparation',
          summary: 'Focused Java revision.',
          roleLevel: 'Engineer',
          startingKnowledge: ['Can read Java.'],
          outcomes: ['Explain one Java contract.'],
          uncoveredScope: ['Does not cover every Java course.'],
          topics: [
            { id: 'learn:core-java', title: 'Core Java' },
            { id: 'learn:modern-java', title: 'Modern Java' },
          ],
          recommendedVariantId: variant.templateId,
          variants: [
            variant,
            { ...variant, templateId: 'java-d7-h6', dailyHours: 6, intensive: true },
            { ...variant, templateId: 'java-d7-h9', dailyHours: 9, intensive: true },
            { ...variant, templateId: 'java-d21-h1', durationDays: 21 },
          ],
        },
      ],
    };
    const days = Array.from({ length: 7 }, (_, index) => ({
      day: index + 1,
      phase: index ? 'open' : 'revision',
      sessions:
        index === 0
          ? [
              {
                id: 'refresh-1',
                kind: 'review',
                activity: 'Refresh',
                contentId: 'available-lesson',
                minutes: 20,
                instructions: 'Recall the lesson.',
                prerequisiteIds: [],
                requiredSessionIds: [],
                review: {
                  basis: 'declared-familiarity',
                  sourceSessionId: null,
                  sourceDay: null,
                  dueDay: 1,
                },
              },
            ]
          : [],
      scheduledMinutes: index ? 0 : 20,
      focusedMinutes: index ? 0 : 20,
      recoveryMinutes: 0,
      unallocatedMinutes: index ? 60 : 40,
    }));
    const template = {
      schemaVersion: 'study-plan-template/v1',
      templateId: variant.templateId,
      templateVersion: variant.templateVersion,
      pathId: 'java',
      durationDays: 7,
      dailyHours: 1,
      availabilityUnit: 'hours-per-day',
      intensive: false,
      intendedUse: variant.intendedUse,
      provenance: {
        algorithmVersion: 'ready-made-schedule/v1',
        catalogVersion: 'content-v1',
        rankingVersion: null,
        blueprintVersion: 'blueprint-v1',
        sourceContentVersion: 'source-v1',
      },
      startingKnowledge: [],
      assumedPrerequisiteIds: [],
      topicIds: ['learn:core-java'],
      references: [
        {
          contentId: 'available-lesson',
          topicId: 'learn:core-java',
          title: 'Available lesson',
          courseTitle: 'Core Java',
          contentType: 'theory',
          route: ['/', 'learn', 'core-java', 'available-lesson'],
          contentVersion: 'v1',
          prerequisiteIds: [],
        },
      ],
      days,
      coverage: {
        selectedContentCount: 1,
        availableContentCount: 1,
        scheduledMinutes: 20,
        unallocatedMinutes: 400,
        uncoveredContentIds: [],
        uncoveredScope: [],
      },
      futureReviews: [
        {
          ...days[0].sessions[0],
          id: 'recall-after-window',
          activity: 'Recall',
          requiredSessionIds: ['refresh-1'],
          review: {
            basis: 'scheduled-session',
            sourceSessionId: 'refresh-1',
            sourceDay: 1,
            dueDay: 10,
          },
        },
      ],
    };
    TestBed.overrideProvider(ContentService, {
      useValue: {
        ...service,
        getReadyMadeStudyPlans: () => of(catalog),
        getReadyMadeStudyPlan: () => of(template),
      },
    });
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    expect(
      harness.routeNativeElement!.querySelectorAll('.ready-made-controls select'),
    ).toHaveLength(3);
    page.chooseReadyMadePath('java');
    page.chooseReadyMadeDays('7');
    expect(page.selectedReadyMadeHours()).toBeNull();
    page.chooseReadyMadeHours('9');
    expect(page.readyMadeMessage()).toContain('intensive daily schedule');
    page.chooseReadyMadeHours('6');
    expect(page.readyMadeMessage()).toContain('intensive daily schedule');
    page.chooseReadyMadeDays('21');
    expect(page.selectedReadyMadeHours()).toBeNull();
    expect(page.readyMadeMessage()).toContain('Choose hours per day again');
    page.chooseReadyMadeDays('7');
    page.chooseReadyMadeHours('1');
    expect(page.readyMadeSelectedCourses()).toEqual([
      { id: 'learn:core-java', title: 'Core Java' },
    ]);
    page.previewReadyMadePlan();
    harness.detectChanges();
    expect(page.draft().goal).toBe('Java preparation');
    expect(page.draft().readyMade).toMatchObject({
      templateId: 'java-d7-h1',
      templateVersion: 'template-v1',
      templateSha256: 'sha-test',
      pickerCatalogVersion: 'picker-v1',
      adapterVersion: 'ready-made-to-study-plan/v1',
    });
    expect(page.saved()).toBeNull();
    expect(localStorage.getItem('look-ahead.study-plan.v1')).toBeNull();
    const preview = harness.routeNativeElement!.querySelector('.plan-review-dialog')!;
    expect(preview.textContent).toContain('1 hour available a day');
    expect(preview.querySelector('.authored-review-summary')!.textContent).toContain(
      'Selected courses: Core Java',
    );
    expect(page.authoredDraftSummary()).toMatchObject({
      focusedMinutes: 20,
      recoveryMinutes: 0,
      unallocatedMinutes: 400,
    });
    expect(preview.querySelector('.authored-future-reviews')!.textContent).toContain('Day 10');
    expect(preview.textContent).toContain('Assumes prior familiarity');
    await page.saveDraft();
    expect(page.saved().completedIds).toEqual([]);
    expect(page.saved().snapshot.schedulingVersion).toBe('ready-made-schedule/v1');
    expect(page.saved().readyMade.templateId).toBe('java-d7-h1');
    expect(page.saved().snapshot.template).toEqual(template);
    harness.detectChanges();
    expect(page.dailyQueue().selected.map((item: any) => item.id)).toEqual(['refresh-1']);
    expect(page.weekAllocation()).toMatchObject({
      total: 20,
      understand: 0,
      recall: 20,
      practice: 0,
    });
    const refresh = page.dailyQueue().selected[0];
    page.toggleCompletion(refresh);
    expect(page.saved().completedIds).toEqual(['refresh-1']);
    expect(page.saved().snapshot.template).toEqual(template);
    expect(page.dailyQueue().selected).toEqual([]);

    const original = page.saved();
    const practice = {
      ...refresh,
      id: 'practice',
      templateKind: 'practice',
      activity: 'Practice',
      reviewBasis: undefined,
      requiredSessionId: 'refresh-1',
      requiredSessionIds: ['refresh-1', 'second'],
    };
    const second = {
      ...refresh,
      id: 'second',
      kind: 'new',
      templateKind: 'new',
      activity: 'Understand',
      reviewBasis: undefined,
    };
    page.saved.set({
      ...original,
      completedIds: ['refresh-1', 'available-lesson'],
      snapshot: {
        ...original.snapshot,
        days: [
          { ...original.snapshot.days[0], assignments: [refresh, second, practice] },
          ...original.snapshot.days.slice(1),
        ],
      },
    });
    expect(page.canOpen(practice)).toBe(false);
    page.saved.set({ ...page.saved(), completedIds: ['refresh-1'] });
    page.toggleCompletion(second);
    expect(page.saved().completedIds).toContain('second');
    expect(page.saved().completedIds).toContain('available-lesson');
    expect(page.canOpen(practice)).toBe(true);
    expect(
      page.currentDaySections().find((section: any) => section.id === 'current').assignments,
    ).toContainEqual(practice);
  });

  it('preserves an authored draft and prevents account save when adoption is unavailable', async () => {
    const accounts = TestBed.inject(StudyPlanAccount);
    await accounts.initialize();
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    await page.generatePlan();
    expect(page.draft()?.snapshot.days.length).toBeGreaterThan(0);
    const draft = { ...page.draft(), readyMade: { templateId: 'sample-d7-h1' } };
    page.draft.set(draft);
    Object.defineProperty(accounts, 'enabled', { value: true });
    page.accountMode.set(true);
    accounts.account.set({
      accountId: 'synthetic',
      username: 'synthetic',
      displayName: 'Synthetic',
      topicGrants: [],
    });
    const save = vi.spyOn(accounts, 'save');

    await page.saveDraft();

    expect(save).not.toHaveBeenCalled();
    expect(page.draft()).toBe(draft);
    expect(page.saved()).toBeNull();
    expect(accounts.error()).toContain('Your draft is preserved');
  });

  it('shows catalog and access failures without replacing or truncating the current draft', async () => {
    TestBed.overrideProvider(ContentService, {
      useValue: {
        ...service,
        getReadyMadeStudyPlans: () => throwError(() => new Error('offline')),
      },
    });
    const harness = await RouterTestingHarness.create();
    const page: any = await harness.navigateByUrl('/study-plan', StudyPlanPage);
    harness.detectChanges();
    expect(page.readyMadeStatus()).toBe('error');
    expect(harness.routeNativeElement!.textContent).toContain('could not be loaded');
    expect(harness.routeNativeElement!.textContent).toContain('Create your study plan');
    expect(page.saved()).toBeNull();
    expect(page.draft()).toBeNull();
  });
});
