import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  StudyPlanAccount,
  SavedPlan,
  savedAccountPlan,
} from '../pages/study-plan/study-plan-account';
import { studyDayQueue, findStudyActivity, validStudyLog } from '../content/study-plan-daily';
@Component({
  selector: 'app-study-plan-reader-navigation',
  imports: [RouterLink],
  template: `@if (valid()) {
    <nav class="plan-reader-navigation" aria-label="Study Plan navigation">
      <a routerLink="/study-plan" [queryParams]="{ day: day(), plan: planId }"
        >Back to Study Plan · Day {{ day() }}</a
      >
      @if (next(); as item) {
        <a [routerLink]="item.route" [queryParams]="{ day: day(), plan: planId, activity: item.id }"
          >Next in plan: {{ item.title }} →</a
        >
      } @else {
        <span>Return to your plan to record progress and choose the next session.</span>
      }
    </nav>
  }`,
  styles: [
    `
      .plan-reader-navigation {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 16px;
        padding: 18px;
        margin-bottom: 24px;
        border: 1px solid var(--line);
        background: var(--surface);
      }
      a {
        color: var(--accent-link);
        min-height: 44px;
        align-content: center;
      }
    `,
  ],
})
export class StudyPlanReaderNavigation implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly account = inject(StudyPlanAccount);
  readonly planId = this.route.snapshot.queryParamMap.get('plan') ?? '';
  readonly day = signal(Number(this.route.snapshot.queryParamMap.get('day')));
  private readonly saved = signal<SavedPlan | null>(null);
  private owner: string | null = null;
  readonly valid = computed(() => !!this.current());
  private readonly activity = signal(this.route.snapshot.queryParamMap.get('activity') ?? '');
  private readonly contextPlan = signal(this.planId);
  private readonly current = computed(() => {
    const saved = this.saved();
    if (this.account.sessionExpired() || this.owner !== (this.account.account()?.accountId ?? null))
      return null;
    if (
      !saved ||
      this.contextPlan() !== this.planId ||
      !Number.isInteger(this.day()) ||
      this.day() < 1 ||
      this.day() > saved.snapshot.config.days
    )
      return null;
    const item = findStudyActivity(saved.snapshot, this.activity(), this.day());
    return item &&
      this.router.serializeUrl(this.router.createUrlTree(item.route)) ===
        this.router.url.split('?')[0]
      ? item
      : null;
  });
  readonly next = computed(() => {
    const current = this.current(),
      saved = this.saved();
    if (!current || !saved) return null;
    const queue = studyDayQueue(
      saved.snapshot,
      this.day(),
      new Set(saved.completedIds),
      saved.sessionOutcomes,
      saved.studyLog,
      !this.account.account() ||
        !!this.account.catalog()?.studyActivityPolicies?.includes('completion-day-v1'),
      (item) => {
        const account = this.account.account();
        return (
          !account ||
          !!account.contentGrants?.includes(item.sourceContentId ?? item.id) ||
          account.topicGrants.includes(item.topicId)
        );
      },
    ).selected;
    const index = queue.findIndex((a) => a.id === current.id);
    return index >= 0
      ? (queue[index + 1] ?? null)
      : saved.completedIds.includes(current.id) || saved.sessionOutcomes?.[current.id]
        ? (queue[0] ?? null)
        : null;
  });
  async ngOnInit(): Promise<void> {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.activity.set(params.get('activity') ?? '');
      this.day.set(Number(params.get('day')));
      this.contextPlan.set(params.get('plan') ?? '');
      if (params.get('plan') !== this.planId) this.saved.set(null);
    });
    await this.account.initialize();
    this.owner = this.account.account()?.accountId ?? null;
    if (this.planId && this.planId !== 'browser' && this.account.account()) {
      const plan =
        this.account.active()?.planId === this.planId
          ? this.account.active()
          : await this.account.open(this.planId);
      if (plan) this.saved.set(savedAccountPlan(plan));
    } else if (this.planId === 'browser' && !this.account.account()) {
      try {
        const saved = JSON.parse(localStorage.getItem('look-ahead.study-plan.v1') ?? 'null');
        if (
          saved?.schemaVersion === 'study-plan-local/v1' &&
          (saved.studyLog === undefined || validStudyLog(saved.studyLog)) &&
          Number.isInteger(saved.snapshot?.config?.days) &&
          saved.snapshot.config.days > 0 &&
          saved.snapshot.config.days <= 180 &&
          Number.isFinite(saved.snapshot.focusedDailyHours) &&
          saved.snapshot.focusedDailyHours > 0 &&
          Array.isArray(saved.snapshot.days) &&
          Array.isArray(saved.completedIds) &&
          saved.completedIds.every((id: unknown) => typeof id === 'string') &&
          saved.snapshot.days.every(
            (day: any) => Number.isInteger(day.day) && Array.isArray(day.assignments),
          ) &&
          (saved.snapshot.futureReviews === undefined ||
            Array.isArray(saved.snapshot.futureReviews)) &&
          [
            ...saved.snapshot.days.flatMap((day: any) => day.assignments),
            ...(saved.snapshot.futureReviews ?? []),
          ].every(
            (item: any) =>
              item &&
              typeof item.id === 'string' &&
              Number.isFinite(item.minutes) &&
              item.minutes >= 0 &&
              (item.kind === 'new' || item.kind === 'review') &&
              (item.prerequisiteIds === undefined || Array.isArray(item.prerequisiteIds)) &&
              Array.isArray(item.route) &&
              item.route.length > 0 &&
              item.route.every((part: unknown) => typeof part === 'string'),
          )
        )
          this.saved.set(saved);
      } catch {
        /* Invalid local context falls back to ordinary course navigation. */
      }
    }
  }
}
