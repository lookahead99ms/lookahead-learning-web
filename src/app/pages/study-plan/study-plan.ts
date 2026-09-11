import { variationRank } from '../../content/study-plan-variation';
import { STUDY_PLAN_PRESETS, resolveStudyPlanPreset } from '../../content/study-plan-presets';
import {
  studyDayQueue,
  recordStudyLog,
  validStudyLog,
  isDailyRecall,
  findStudyActivity,
} from '../../content/study-plan-daily';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentPath, SearchDocument } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import {
  STUDY_PLAN_DURATIONS,
  STUDY_PLAN_HOURS,
  STUDY_PLAN_TOPICS,
  StudyPlan,
  StudyPlanAssignment,
  StudyPlanTopic,
  buildStudyPlan,
  studyPlanOfferings,
  studyPlanMatchesTopic,
} from '../../content/study-plan';
import {
  StudyPlanRecoveryPreview,
  previewStudyPlanRecovery,
} from '../../content/study-plan-recovery';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { STUDY_PLAN_ACCESS } from './study-plan-access';

import {
  AccountPlan,
  PlanActivity,
  RecoveryMetadata,
  SavedPlan,
  StudyPlanAccount,
  savedAccountPlan,
} from './study-plan-account';

const STORAGE_KEY = 'look-ahead.study-plan.v1';
const DRAFT_INTENT_KEY = 'look-ahead.study-plan-draft-intent.v1';

@Component({
  selector: 'app-study-plan',
  imports: [PlatformHeader, RouterLink, NgTemplateOutlet],
  templateUrl: './study-plan.html',
  styleUrl: './study-plan.css',
})
export class StudyPlanPage implements OnInit {
  private readonly content = inject(ContentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly access = inject(STUDY_PLAN_ACCESS);
  protected readonly accountStore = inject(StudyPlanAccount);
  protected readonly loginName = signal('');
  protected readonly loginPassword = signal('');
  protected readonly importAvailable = signal(false);
  protected readonly accountMode = signal(false);
  private browserPlan: SavedPlan | null = null;
  private authorViewOpened = false;
  private queueAuthorView(): void {
    if (
      this.authorViewOpened ||
      !this.accountReady() ||
      !this.accountStore.account()?.authorPreview
    )
      return;
    const view = this.route.snapshot.queryParamMap.get('authorView');
    if (
      view === 'draft'
        ? !this.canGenerate() || !!this.saved()
        : !['schedule', 'recovery'].includes(view ?? '') || !this.plan()
    )
      return;
    this.authorViewOpened = true;
    setTimeout(() => {
      if (this.destroyRef.destroyed) return;
      if (view === 'draft') this.generatePlan();
      else if (view === 'schedule') this.openSchedule();
      else this.openRecovery();
    }, 0);
  }
  @ViewChild('draftDialog') private draftDialog?: ElementRef<HTMLDialogElement>;
  protected readonly draft = signal<SavedPlan | null>(null);
  protected readonly accountReady = signal(false);
  protected readonly progressVisible = computed(
    () =>
      this.accountReady() &&
      !!this.saved() &&
      (!this.accountStore.enabled ||
        (this.accountMode() &&
          !!this.accountStore.account() &&
          !this.accountStore.sessionExpired())),
  );
  @ViewChild('scheduleDialog') private scheduleDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('sessionHeading') private sessionHeading?: ElementRef<HTMLElement>;
  protected readonly schedulePage = signal(0);
  protected readonly schedulePageCount = computed(() =>
    Math.ceil((this.plan()?.days.length ?? 0) / 7),
  );
  protected readonly scheduleDays = computed(() =>
    (this.plan()?.days ?? []).slice(this.schedulePage() * 7, this.schedulePage() * 7 + 7),
  );
  protected openSchedule(): void {
    const index = this.plan()?.days.findIndex((day) => day.day === this.selectedDay()) ?? 0;
    this.schedulePage.set(Math.max(0, Math.floor(index / 7)));
    this.scheduleDialog?.nativeElement.showModal?.();
  }
  protected changeSchedulePage(delta: number): void {
    this.schedulePage.update((page) =>
      Math.max(0, Math.min(this.schedulePageCount() - 1, page + delta)),
    );
    this.scheduleDialog?.nativeElement.scrollTo?.({ top: 0 });
  }
  protected closeSchedule(): void {
    this.scheduleDialog?.nativeElement.close?.();
  }
  protected openScheduleDay(day: number): void {
    this.selectedDay.set(day);
    this.closeSchedule();
    this.sessionHeading?.nativeElement.focus();
    this.sessionHeading?.nativeElement.scrollIntoView?.({ block: 'start' });
  }
  @ViewChild('recoveryDialog') private recoveryDialog?: ElementRef<HTMLDialogElement>;
  protected openRecovery(): void {
    this.recoveryDialog?.nativeElement.showModal?.();
  }
  protected closeRecovery(): void {
    if (this.editsLocked()) return;
    this.recoveryDialog?.nativeElement.close?.();
    this.recoveryPreview.set(null);
    this.extensionRequested.set(false);
  }
  protected readonly setupVisible = computed(() => !this.progressVisible() && this.accountReady());
  protected dayStatus(day: { assignments: StudyPlanAssignment[] }): string {
    const done = day.assignments.filter(
      (item) => this.completedIds().has(item.id) || !!this.saved()?.sessionOutcomes?.[item.id],
    ).length;
    return !day.assignments.length || !done
      ? 'Not started'
      : done === day.assignments.length
        ? 'Completed'
        : 'In progress';
  }
  protected closeDraft(): void {
    if (this.accountStore.busy() || this.accountStore.pending()) return;
    this.draftDialog?.nativeElement.close?.();
    this.draft.set(null);
  }
  protected async saveDraft(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.editsLocked()) return;
    if (this.accountStore.enabled && !this.accountMode()) {
      this.continueToSignIn();
      return;
    }
    if (this.accountMode()) {
      const result = await this.accountStore.save(draft);
      if (!result) return;
      this.acceptAccountPlan(result);
    } else {
      this.saved.set(draft);
      this.persist('Plan saved on this browser.');
    }
    this.closeDraft();
  }
  protected continueToSignIn(): void {
    try {
      window.sessionStorage.setItem(
        DRAFT_INTENT_KEY,
        JSON.stringify({
          goal: this.goal(),
          days: this.days(),
          dailyHours: this.dailyHours(),
          goalType: this.goalType(),
          topicIds: [...this.selectedTopicIds()],
          familiarity: this.familiarity(),
        }),
      );
    } catch {
      this.status.set('Browser storage is unavailable. Your selections remain in this tab.');
      return;
    }
    void this.router.navigate(['/sign-in'], { queryParams: { returnTo: '/study-plan?create=1' } });
  }
  private restoreDraftIntent(): void {
    if (this.route.snapshot.queryParamMap.get('create') !== '1') return;
    try {
      const value = JSON.parse(window.sessionStorage.getItem(DRAFT_INTENT_KEY) ?? 'null');
      if (
        !value ||
        typeof value.goal !== 'string' ||
        value.goal.length > 160 ||
        !this.durations.includes(value.days) ||
        !this.hours.includes(value.dailyHours) ||
        !['learning', 'interview'].includes(value.goalType) ||
        !Array.isArray(value.topicIds) ||
        value.topicIds.length > 100 ||
        value.topicIds.some((id: unknown) => typeof id !== 'string') ||
        !value.familiarity ||
        typeof value.familiarity !== 'object' ||
        Object.values(value.familiarity).some(
          (item) => !['familiar', 'refresh', 'new'].includes(item as string),
        )
      )
        return;
      this.goal.set(value.goal);
      this.days.set(value.days);
      this.dailyHours.set(value.dailyHours);
      this.goalType.set(value.goalType);
      this.selectedTopicIds.set(new Set(value.topicIds));
      this.familiarity.set(value.familiarity);
      this.status.set('Your selections are ready. Review your plan before saving it.');
    } catch {
      /* An unavailable or invalid draft never replaces an account plan. */
    }
  }
  protected readonly recoveryPreview = signal<StudyPlanRecoveryPreview | null>(null);
  protected readonly recoveryDay = signal(2);
  protected readonly minimumRecoveryDay = computed(
    () => (this.saved()?.recovery?.elapsedDays ?? 0) + 1,
  );
  protected readonly extensionRequested = signal(false);
  protected readonly editsLocked = computed(
    () =>
      this.accountStore.busy() || this.accountStore.pending() || this.accountStore.sessionExpired(),
  );
  protected readonly durations = STUDY_PLAN_DURATIONS;
  protected readonly hours = STUDY_PLAN_HOURS;
  protected readonly presets = STUDY_PLAN_PRESETS;
  protected readonly selectedPresetId = signal('');
  protected readonly selectedPreset = computed(() =>
    this.presets.find((preset) => preset.id === this.selectedPresetId()),
  );
  protected readonly presetAvailability = computed(() => {
    const preset = this.selectedPreset();
    return preset ? resolveStudyPlanPreset(preset, this.topics(), this.availableTopicIds()) : null;
  });
  protected applyPreset(): void {
    const preset = this.selectedPreset(),
      availability = this.presetAvailability();
    if (!preset || !availability?.selectedIds.length || this.editsLocked()) return;
    this.goal.set(preset.title + ' preparation');
    this.days.set(preset.days);
    this.dailyHours.set(preset.dailyHours);
    this.goalType.set('learning');
    this.familiarity.set({});
    this.selectedTopicIds.set(new Set(availability.selectedIds));
    this.status.set('Starting point applied. Edit your focus and time, then review your plan.');
  }
  protected readonly paths: ContentPath[] = ['learn', 'grow', 'look-ahead'];
  protected readonly days = signal(30);
  protected readonly isPresetDuration = computed(() =>
    this.durations.some((day) => day === this.days()),
  );
  protected readonly dailyHours = signal(1);
  protected readonly goalType = signal<'learning' | 'interview'>('interview');
  protected readonly familiarity = signal<Record<string, 'familiar' | 'refresh' | 'new'>>({});
  protected readonly goal = signal('Build reliable engineering foundations');
  protected readonly selectedTopicIds = signal(new Set<string>());
  protected readonly documents = signal<SearchDocument[] | null>(null);
  protected readonly loadingError = signal('');
  protected readonly status = signal('');
  protected readonly saved = signal<SavedPlan | null>(null);
  protected readonly selectedDay = signal(1);
  protected readonly showAllPendingSessions = signal(false);
  private rankingVersion: string | null = null;
  protected readonly rankingStatus = signal<'loading' | 'ready' | 'error'>('loading');
  private studyOrder = new Map<string, number>();
  private interviewOrder = new Map<string, number>();
  protected readonly topics = computed(() => studyPlanOfferings(this.documents() ?? []));
  protected readonly availableDocuments = computed(() =>
    this.access.status() === 'ready'
      ? (this.documents() ?? []).filter(
          (item) =>
            this.access.canSchedule(item) &&
            (item.discoveryKind === undefined ||
              item.discoveryKind === 'lesson' ||
              item.discoveryKind === 'practice'),
        )
      : [],
  );
  protected readonly availableTopicIds = computed(
    () =>
      new Set(
        this.topics()
          .filter((topic) =>
            this.availableDocuments().some((item) => studyPlanMatchesTopic(item, topic)),
          )
          .map(({ id }) => id),
      ),
  );
  protected readonly hasAccessibleSelection = computed(() =>
    [...this.selectedTopicIds()].some((id) => this.availableTopicIds().has(id)),
  );
  protected readonly needsDsaRanking = computed(() =>
    this.topics().some(
      (topic) =>
        this.selectedTopicIds().has(topic.id) &&
        this.availableDocuments().some(
          (item) => item.contentType === 'dsa-problem' && studyPlanMatchesTopic(item, topic),
        ),
    ),
  );
  protected readonly canGenerate = computed(
    () =>
      !this.editsLocked() &&
      this.accountReady() &&
      !this.accountStore.error() &&
      (!this.accountMode() || !!this.accountStore.catalog()) &&
      this.hasAccessibleSelection() &&
      !this.loadingError() &&
      (!this.needsDsaRanking() || this.rankingStatus() === 'ready'),
  );
  protected readonly plan = computed(() => this.saved()?.snapshot ?? null);
  protected readonly requiredFoundations = computed(() => {
    const ids = new Set((this.plan()?.blockedItems ?? []).flatMap((item) => item.prerequisiteIds));
    return [...ids].map((id) => {
      const document = this.availableDocuments().find(
        (item) => (item.canonicalContentId ?? item.id) === id,
      );
      const topic = document
        ? this.topics().find(
            (item) =>
              item.path === document.path &&
              item.courseIds.length === 1 &&
              item.courseIds[0] === document.courseId,
          )
        : undefined;
      return {
        id,
        title: document?.title ?? 'An unavailable or unresolved foundation lesson',
        topic,
        selectable:
          !!topic &&
          !this.selectedTopicIds().has(topic.id) &&
          this.availableTopicIds().has(topic.id),
      };
    });
  });
  protected readonly isDailyRecall = isDailyRecall;
  protected readonly studyActivitySupported = computed(
    () =>
      !this.accountMode() ||
      !!this.accountStore.catalog()?.studyActivityPolicies?.includes('completion-day-v1'),
  );
  protected readonly dailyQueue = computed(() =>
    this.plan()
      ? studyDayQueue(
          this.plan()!,
          this.selectedDay(),
          this.completedIds(),
          this.saved()?.sessionOutcomes,
          this.saved()?.studyLog,
          this.studyActivitySupported(),
          (assignment) =>
            this.availableDocuments().some(
              (document) =>
                (document.canonicalContentId ?? document.id) === this.sourceId(assignment),
            ),
        )
      : null,
  );
  protected planLink(item: StudyPlanAssignment): Record<string, string | number> {
    return {
      plan: this.accountStore.active()?.planId ?? 'browser',
      day: this.selectedDay(),
      activity: item.id,
    };
  }
  protected readonly currentDay = computed(
    () => this.plan()?.days.find(({ day }) => day === this.selectedDay()) ?? null,
  );
  protected readonly currentDaySections = computed(() => {
    const plan = this.plan(),
      queue = this.dailyQueue();
    if (!plan || !queue) return [];
    const logged = (this.saved()?.studyLog ?? [])
      .filter((entry) => entry.day === this.selectedDay())
      .map((entry) => findStudyActivity(plan, entry.assignmentId, entry.day))
      .filter((item): item is StudyPlanAssignment => !!item);
    const recorded = [
      ...new Map(
        [
          ...logged,
          ...(this.currentDay()?.assignments ?? []).filter(
            (item) => this.completedIds().has(item.id) || !!this.outcome(item),
          ),
        ].map((item) => [item.id, item]),
      ).values(),
    ];
    return [
      {
        id: 'recall',
        title: 'Recall first',
        assignments: queue.selected.filter((item) => item.kind === 'review'),
      },
      {
        id: 'current',
        title: 'Continue learning',
        assignments: queue.selected.filter((item) => item.kind !== 'review'),
      },
      { id: 'recorded', title: 'Recorded today', assignments: recorded },
      {
        id: 'unfinished',
        title: 'Work beyond today’s recommendation',
        assignments: queue.deferred,
      },
    ].filter((section) => section.assignments.length > 0);
  });
  protected readonly completedIds = computed(() => new Set(this.saved()?.completedIds ?? []));
  protected readonly completion = computed(() => {
    const assignments = this.plan()?.days.flatMap(({ assignments }) => assignments) ?? [];
    const done = assignments.filter(
      ({ id }) => this.completedIds().has(id) || this.saved()?.sessionOutcomes?.[id],
    ).length;
    return {
      done,
      total: assignments.length,
      percent: assignments.length ? Math.round((done / assignments.length) * 100) : 0,
    };
  });
  protected readonly weekAllocation = computed(() => {
    const assignments = this.plan()?.weeks[0]?.days.flatMap(({ assignments }) => assignments) ?? [];
    const understand = assignments
      .filter(({ activity }) => activity === 'Understand' || activity === 'Refresh')
      .reduce((total, item) => total + item.minutes, 0);
    const recall = assignments
      .filter(({ kind }) => kind === 'review')
      .reduce((total, item) => total + item.minutes, 0);
    const total = assignments.reduce((sum, item) => sum + item.minutes, 0);
    return {
      total,
      understand,
      recall,
      practice: total - understand - recall,
      learningEnd: total ? (understand / total) * 100 : 0,
      practiceEnd: total ? ((total - recall) / total) * 100 : 0,
    };
  });

  ngOnInit(): void {
    this.restore();
    this.browserPlan = this.saved();
    this.importAvailable.set(!!this.browserPlan);
    if (this.accountStore.enabled) this.saved.set(null);
    this.restoreDraftIntent();
    void this.initializeAccount();
    this.loadContent();
    this.loadRanking();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const days = Number(params.get('days'));
      const hours = Number(params.get('hours'));
      const day = Number(params.get('day'));
      if (Number.isInteger(day) && day >= 1 && day <= 180) this.selectedDay.set(day);
      if (this.durations.some((value) => value === days)) this.days.set(days);
      if (this.hours.some((value) => value === hours)) this.dailyHours.set(hours);
      if (params.get('approach') === 'learning' || params.get('approach') === 'interview')
        this.goalType.set(params.get('approach') as 'learning' | 'interview');
      if (params.has('topics'))
        this.selectedTopicIds.set(new Set((params.get('topics') ?? '').split(',')));
      // Legacy access URL values never grant access or authorize a plan.
    });
  }

  protected loadRanking(): void {
    this.rankingStatus.set('loading');
    this.content
      .getHandsOnDsaIndex()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (index) => {
          if (index.ranking?.status !== 'released') {
            this.rankingStatus.set('error');
            return;
          }
          this.rankingVersion = index.ranking.rankingVersion;
          this.studyOrder = new Map(
            index.groups.flatMap((group) =>
              group.problems.map(
                (item) =>
                  [item.id, item.studyOrder ?? item.interviewRank ?? Infinity] as [string, number],
              ),
            ),
          );
          this.interviewOrder = new Map(
            index.groups.flatMap((group) =>
              group.problems.map(
                (item) =>
                  [item.id, item.interviewRank ?? item.studyOrder ?? Infinity] as [string, number],
              ),
            ),
          );
          this.rankingStatus.set('ready');
          this.queueAuthorView();
        },
        error: () => {
          this.rankingStatus.set('error');
        },
      });
  }

  protected loadContent(): void {
    this.loadingError.set('');
    this.content
      .getSearchIndex()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (documents) => {
          this.documents.set(documents);
          // Defer until the same callback has normalized the selected offerings.
          queueMicrotask(() => {
            if (!this.destroyRef.destroyed) this.queueAuthorView();
          });
          const selection = this.selectedTopicIds();
          const legacyCourses = STUDY_PLAN_TOPICS.filter(({ id }) => selection.has(id));
          if (legacyCourses.length)
            this.selectedTopicIds.set(
              new Set(
                this.topics()
                  .filter((topic) =>
                    legacyCourses.some(
                      (legacy) =>
                        legacy.path === topic.path && legacy.courseIds.includes(topic.courseIds[0]),
                    ),
                  )
                  .map(({ id }) => id),
              ),
            );
          if (!this.selectedTopicIds().size && !this.route.snapshot.queryParamMap.has('topics')) {
            this.selectedTopicIds.set(new Set([...this.availableTopicIds()].slice(0, 3)));
          }
        },
        error: () =>
          this.loadingError.set(
            'The curriculum could not be loaded. Your saved work has not been changed.',
          ),
      });
  }

  protected setFamiliarity(id: string, value: string): void {
    if (value === 'familiar' || value === 'refresh' || value === 'new')
      this.familiarity.update((current) => ({ ...current, [id]: value }));
  }
  protected readonly selectedTopics = computed(() =>
    this.topics().filter((t) => this.selectedTopicIds().has(t.id)),
  );
  protected readonly revisionProgress = computed(() => ({
    attempted: new Set(this.saved()?.attemptedContentIds ?? []).size,
    needsReview: new Set(this.saved()?.needsReviewContentIds ?? []).size,
    completed: new Set(
      (this.plan()?.days.flatMap((d) => d.assignments) ?? [])
        .filter((a) => this.completedIds().has(this.sourceId(a)))
        .map((a) => this.sourceId(a)),
    ).size,
  }));
  protected reviewNote(assignment: StudyPlanAssignment): string {
    return this.saved()?.reviewNotes?.[this.sourceId(assignment)] ?? '';
  }
  protected saveReviewNote(assignment: StudyPlanAssignment, note: string): void {
    if (this.editsLocked()) return;
    if (this.reviewNote(assignment) === note.slice(0, 1000)) return;
    if (this.accountMode()) {
      void this.saveAccountActivity([
        {
          type: 'setNote',
          canonicalContentId: this.sourceId(assignment),
          text: note.slice(0, 1000),
        },
      ]);
      return;
    }
    const saved = this.saved();
    if (!saved) return;
    this.saved.set({
      ...saved,
      reviewNotes: { ...saved.reviewNotes, [this.sourceId(assignment)]: note.slice(0, 1000) },
    });
    this.persist('Review note saved on this browser.');
  }
  protected outcome(assignment: StudyPlanAssignment): string {
    const value = this.saved()?.sessionOutcomes?.[assignment.id];
    return value === 'needs-review'
      ? 'Needs review'
      : value === 'attempted'
        ? 'Attempt / refresh recorded'
        : value === 'completed'
          ? 'Full content completion recorded'
          : '';
  }
  protected refreshLinks(assignment: StudyPlanAssignment): { title: string; route: string[] }[] {
    return (assignment.relatedLessonIds ?? []).flatMap((id) => {
      const doc = this.availableDocuments().find((d) => (d.canonicalContentId ?? d.id) === id);
      return doc
        ? [{ title: doc.title, route: doc.route ?? ['/', doc.path, doc.courseId, doc.contentId] }]
        : [];
    });
  }
  protected recordOutcome(
    assignment: StudyPlanAssignment,
    outcome: 'attempted' | 'needs-review' | 'completed',
  ): void {
    if (this.editsLocked() || !this.canOpen(assignment)) return;
    const saved = this.saved();
    if (!saved) return;
    const source = this.sourceId(assignment);
    if (this.accountMode()) {
      const operations: PlanActivity[] =
        outcome === 'completed'
          ? [
              { type: 'setContentCompletion', canonicalContentId: source, completed: true },
              { type: 'setSessionCompletion', assignmentId: assignment.id, completed: true },
            ]
          : [
              {
                type: 'recordAttempt',
                assignmentId: assignment.id,
                canonicalContentId: source,
                outcome,
              },
            ];
      void this.saveAccountActivity(operations);
      return;
    }
    const attempted = new Set(saved.attemptedContentIds ?? []);
    attempted.add(source);
    const needsReview = new Set(saved.needsReviewContentIds ?? []);
    const completed = new Set(saved.completedIds);
    if (outcome === 'needs-review') needsReview.add(source);
    if (outcome === 'completed') {
      completed.add(source);
      needsReview.delete(source);
    }
    this.saved.set({
      ...saved,
      completedIds: [...completed],
      attemptedContentIds: [...attempted],
      needsReviewContentIds: [...needsReview],
      sessionOutcomes: { ...saved.sessionOutcomes, [assignment.id]: outcome },
      studyLog: recordStudyLog(saved.studyLog, assignment, this.selectedDay()),
    });
    this.persist(
      outcome === 'completed'
        ? 'Content completion recorded explicitly. This does not establish mastery.'
        : 'Timebox recorded. The full content has not been marked complete.',
    );
  }
  private browserVariationKey(): string {
    try {
      const key = 'look-ahead.plan-variation.v1';
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const value = crypto.randomUUID();
      localStorage.setItem(key, value);
      return value;
    } catch {
      return 'browser';
    }
  }
  protected setDays(value: string): void {
    this.days.set(Number(value));
  }
  protected setHours(value: string): void {
    this.dailyHours.set(Number(value));
  }
  protected toggleTopic(topic: StudyPlanTopic, checked: boolean): void {
    if (!this.availableTopicIds().has(topic.id)) return;
    const next = new Set(this.selectedTopicIds());
    if (checked) next.add(topic.id);
    else next.delete(topic.id);
    this.selectedTopicIds.set(next);
  }
  protected selectAllTopics(): void {
    this.selectedTopicIds.set(new Set(this.availableTopicIds()));
  }
  protected clearTopics(): void {
    this.selectedTopicIds.set(new Set());
  }
  protected pathLabel(path: ContentPath): string {
    return path === 'look-ahead' ? 'Look Ahead' : path === 'grow' ? 'Grow' : 'Learn';
  }
  protected topicsFor(path: ContentPath): StudyPlanTopic[] {
    return this.topics().filter((topic) => topic.path === path);
  }
  protected unavailableReason(topic: StudyPlanTopic): string {
    if (this.access.status() === 'loading') return 'Checking available access';
    if (this.access.status() === 'error') return 'Access could not be checked';
    return (this.documents() ?? []).some((item) => studyPlanMatchesTopic(item, topic))
      ? 'Not available with current access'
      : 'No published study sessions yet';
  }
  private sourceId(assignment: StudyPlanAssignment): string {
    return assignment.sourceContentId ?? assignment.id.replace(/:review:(?:v2:)?\d+$/, '');
  }
  protected canOpen(assignment: StudyPlanAssignment): boolean {
    return !this.assignmentUnavailableReason(assignment);
  }
  protected assignmentUnavailableReason(assignment: StudyPlanAssignment): string {
    if (
      !this.availableDocuments().some(
        (item) => (item.canonicalContentId ?? item.id) === this.sourceId(assignment),
      )
    )
      return 'Currently unavailable with your access. Your history is preserved.';
    if (assignment.requiredSessionId) {
      const original = this.plan()
        ?.days.flatMap((d) => d.assignments)
        .find((a) => a.id === assignment.requiredSessionId);
      const attempted =
        original?.timebox && !!this.saved()?.sessionOutcomes?.[assignment.requiredSessionId];
      if (!attempted && !this.completedIds().has(this.sourceId(assignment)))
        return 'Record the earlier attempt or complete the original learning session before this revisit.';
    }
    if (
      assignment.kind === 'review' &&
      !assignment.requiredSessionId &&
      !this.completedIds().has(this.sourceId(assignment))
    )
      return 'Complete the original session before starting this recall.';
    if ((assignment.prerequisiteIds ?? []).some((id) => !this.completedIds().has(id)))
      return 'Complete the linked foundation lessons before starting this session.';
    return '';
  }
  protected currentRoute(assignment: StudyPlanAssignment): string[] {
    const item = this.availableDocuments().find(
      (document) => (document.canonicalContentId ?? document.id) === this.sourceId(assignment),
    );
    return item?.route ?? (item ? ['/', item.path, item.courseId, item.contentId] : []);
  }
  protected readonly pendingSessions = computed(() => this.dailyQueue()?.deferred ?? []);

  protected async generatePlan(): Promise<void> {
    if (!this.canGenerate()) return;
    const active = this.accountStore.active();
    if (
      this.accountMode() &&
      active?.snapshot.config.goalType === 'interview' &&
      this.days() !== active.snapshot.config.days
    ) {
      this.status.set(
        'Use the explicit deadline extension to move this interview window, or start a new plan for a different window.',
      );
      return;
    }
    const selectedDsa = this.availableDocuments().filter(
      (item) =>
        item.contentType === 'dsa-problem' &&
        this.topics().some(
          (topic) => this.selectedTopicIds().has(topic.id) && studyPlanMatchesTopic(item, topic),
        ),
    );
    if (
      selectedDsa.some(
        (item) => !Number.isFinite(this.studyOrder.get(item.canonicalContentId ?? item.contentId)),
      )
    ) {
      this.rankingStatus.set('error');
      return;
    }
    const topicIds = [...this.selectedTopicIds()].filter((id) => this.availableTopicIds().has(id));
    const snapshot = buildStudyPlan(
      this.availableDocuments(),
      {
        days: this.days(),
        variationKey:
          !this.accountMode() ||
          this.accountStore.catalog()?.variationPolicies?.includes('topic-tie-v1')
            ? (this.saved()?.snapshot.config.variationKey ??
              'topic-tie-v1-' +
                variationRank(
                  'planner',
                  this.accountStore.account()?.accountId ?? this.browserVariationKey(),
                ))
            : undefined,
        goalType: this.goalType(),
        familiarity: { ...this.familiarity() },
        completedContentIds: this.canonicalCompletedIds(),
        needsReviewContentIds: this.saved()?.needsReviewContentIds ?? [],
        dailyHours: this.dailyHours(),
        topicIds,
        accessTopicIds: [...this.availableTopicIds()],
      },
      this.topics(),
      this.studyOrder,
      this.interviewOrder,
    );
    const previous = this.saved();
    const revision = (previous?.revision ?? 0) + 1;
    this.draft.set({
      schemaVersion: 'study-plan-local/v1',
      revision,
      goal: this.goal().trim() || 'My engineering practice',
      rankingVersion: this.rankingVersion,
      catalogVersion: this.accountMode()
        ? (this.accountStore.catalog()?.catalogVersion ?? null)
        : null,
      snapshot,
      completedIds: previous?.completedIds ?? [],
      studyLog: previous?.studyLog,
      sessionOutcomes: previous?.sessionOutcomes ?? {},
      attemptedContentIds: previous?.attemptedContentIds ?? [],
      reviewNotes: previous?.reviewNotes ?? {},
      needsReviewContentIds: previous?.needsReviewContentIds ?? [],
      shiftedDays: 0,
      history: [
        ...(previous?.history ?? []),
        {
          revision,
          changedAt: new Date().toISOString(),
          reason: previous ? 'Updated time or focus' : 'Created plan',
        },
      ],
    });
    this.selectedDay.set(1);
    this.draftDialog?.nativeElement.showModal?.();
    this.status.set('Review your temporary draft. Save when you are ready.');
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        days: this.days(),
        hours: this.dailyHours(),
        topics: topicIds.join(','),
        approach: this.goalType(),
      },
    });
  }
  protected toggleCompletion(assignment: StudyPlanAssignment): void {
    if (this.editsLocked() || !this.canOpen(assignment)) return;
    const saved = this.saved();
    if (!saved) return;
    if (this.accountMode()) {
      const completed = !this.completedIds().has(assignment.id);
      const operations: PlanActivity[] = [
        { type: 'setSessionCompletion', assignmentId: assignment.id, completed },
      ];
      if (assignment.kind === 'new' && !assignment.timebox)
        operations.push({
          type: 'setContentCompletion',
          canonicalContentId: this.sourceId(assignment),
          completed,
        });
      void this.saveAccountActivity(operations);
      return;
    }
    const completedIds = new Set(saved.completedIds);
    if (completedIds.has(assignment.id)) completedIds.delete(assignment.id);
    else completedIds.add(assignment.id);
    if (assignment.kind === 'new' && assignment.sourceContentId && assignment.timebox === false) {
      if (completedIds.has(assignment.id)) completedIds.add(assignment.sourceContentId);
      else completedIds.delete(assignment.sourceContentId);
    }
    this.saved.set({
      ...saved,
      completedIds: [...completedIds],
      studyLog: completedIds.has(assignment.id)
        ? recordStudyLog(saved.studyLog, assignment, this.selectedDay())
        : saved.studyLog,
    });
    this.persist('Progress saved on this browser. Completion records practice, not mastery.');
  }
  private canonicalCompletedIds(): string[] {
    const known = new Set(
      (this.documents() ?? []).map((item) => item.canonicalContentId ?? item.id),
    );
    return [...this.completedIds()].filter((id) => known.has(id));
  }
  protected previewRecovery(): void {
    const saved = this.saved();
    if (!saved || this.editsLocked()) return;
    if (this.recoveryDay() < this.minimumRecoveryDay()) {
      this.status.set('Recovery cannot move elapsed days backwards. Choose a later recovery day.');
      return;
    }
    try {
      this.recoveryPreview.set(
        previewStudyPlanRecovery(saved.snapshot, {
          currentDay: this.recoveryDay(),
          completedAssignmentIds: saved.completedIds,
          completedContentIds: this.canonicalCompletedIds(),
          sessionOutcomes: saved.sessionOutcomes,
          deferredSessions: saved.deferredSessions,
        }),
      );
      this.extensionRequested.set(false);
    } catch {
      this.status.set(
        'Choose a recovery day within your plan or the day immediately after it ends.',
      );
    }
  }
  protected async confirmRecovery(): Promise<void> {
    const preview = this.recoveryPreview();
    const saved = this.saved();
    if (!preview || !saved || this.editsLocked()) return;
    const metadata: RecoveryMetadata = {
      strategy: 'fixed-window',
      elapsedDays: preview.currentDay - 1,
      deadlineDays: saved.snapshot.config.days,
      deferredContentIds: [
        ...new Set(preview.deferred.map((item) => this.sourceId(item.assignment))),
      ],
      deferredSessions: preview.deferred.map((item) => ({
        ...item,
        assignment:
          saved.snapshot.days
            .flatMap((day) => day.assignments)
            .find((original) => original.id === item.assignment.id) ??
          saved.snapshot.futureReviews?.find((original) => original.id === item.assignment.id) ??
          item.assignment,
      })),
    };
    const draft: SavedPlan = {
      ...saved,
      snapshot: preview.snapshot,
      revision: saved.revision + 1,
      recovery: metadata,
      deferredSessions: metadata.deferredSessions,
      history: [
        ...saved.history,
        {
          revision: saved.revision + 1,
          changedAt: new Date().toISOString(),
          reason: `Recovered within the existing window; ${preview.deferred.length} sessions deferred`,
        },
      ],
    };
    if (this.accountMode()) {
      const result = await this.accountStore.save(draft, 'recovery', metadata);
      if (!result) return;
      this.acceptAccountPlan(result);
    } else {
      this.saved.set(draft);
      this.persist(
        'Recovery applied. Your deadline and daily budget are unchanged; deferred sessions are listed below.',
      );
    }
    this.closeRecovery();
  }
  protected shiftSchedule(): void {
    if (this.editsLocked()) return;
    this.extensionRequested.set(false);
    this.recoveryPreview.set(null);
    const saved = this.saved();
    if (!saved) return;
    const revision = saved.revision + 1;
    const dayCount = saved.snapshot.config.days + 1;
    if (dayCount > 180) {
      this.status.set('This plan is at the 180-day limit. Create a new plan for a later window.');
      return;
    }
    const days = [
      ...saved.snapshot.days,
      {
        day: dayCount,
        phase: 'Recovery',
        focus: 'Additional day; preview recovery to use this time',
        assignments: [],
        newCount: 0,
        reviewCount: 0,
        focusedMinutes: 0,
        bufferMinutes: saved.snapshot.focusedDailyHours * 60,
      },
    ];
    const weeks = [];
    for (let index = 0; index < days.length; index += 7)
      weeks.push({
        number: weeks.length + 1,
        label: days[index].phase,
        days: days.slice(index, index + 7),
      });
    const recovery: RecoveryMetadata = {
      strategy: 'explicit-extension',
      elapsedDays: Math.max(saved.recovery?.elapsedDays ?? 0, this.selectedDay() - 1),
      deadlineDays: dayCount,
      deferredContentIds: saved.recovery?.deferredContentIds ?? [],
      deferredSessions: saved.deferredSessions,
    };
    const draft: SavedPlan = {
      ...saved,
      revision,
      shiftedDays: 0,
      recovery,
      snapshot: {
        ...saved.snapshot,
        config: { ...saved.snapshot.config, days: dayCount },
        days,
        weeks,
      },
      history: [
        ...saved.history,
        {
          revision,
          changedAt: new Date().toISOString(),
          reason:
            'Explicitly extended deadline by one day; session order and completed work preserved',
        },
      ],
    };
    if (this.accountMode()) {
      void this.accountStore.save(draft, 'extend-deadline', recovery).then((result) => {
        if (result) this.acceptAccountPlan(result);
      });
    } else {
      this.saved.set(draft);
      this.days.set(dayCount);
      this.persist(
        'Deadline extended by one day. Your session order and completed work stay in place.',
      );
      this.closeRecovery();
    }
  }
  private async initializeAccount(): Promise<void> {
    await this.accountStore.initialize();
    if (this.accountStore.account()) await this.enterAccount();
    this.accountReady.set(true);
    this.queueAuthorView();
  }
  protected async login(): Promise<void> {
    const password = this.loginPassword();
    this.loginPassword.set('');
    if (await this.accountStore.login(this.loginName().trim(), password)) this.enterAccount();
  }
  private async enterAccount(): Promise<void> {
    this.closeDraft();
    if (!this.accountMode() && this.saved()) this.browserPlan = this.saved();
    this.importAvailable.set(!!this.browserPlan);
    this.accountMode.set(true);
    this.recoveryPreview.set(null);
    this.saved.set(null);
    const requestedDay = Number(this.route.snapshot.queryParamMap.get('day'));
    this.selectedDay.set(
      Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= 180 ? requestedDay : 1,
    );
    if (this.route.snapshot.queryParamMap.get('create') === '1') {
      this.accountStore.newPlan();
      this.restoreDraftIntent();
      return;
    }
    const active = this.accountStore.active();
    const requested = this.route.snapshot.queryParamMap.get('plan');
    const match = this.accountStore.plans().find((plan) => plan.planId === requested);
    if (match && match.planId !== active?.planId) await this.openAccountPlan(match.planId);
    else if (active) this.acceptAccountPlan(active);
    else if (this.accountStore.plans()[0]) {
      await this.openAccountPlan((match ?? this.accountStore.plans()[0]).planId);
    }
  }
  protected async logout(): Promise<void> {
    if (await this.accountStore.logout()) {
      this.accountMode.set(false);
      this.saved.set(null);
      this.closeSchedule();
      this.recoveryDialog?.nativeElement.close?.();
      if (!this.accountStore.enabled && this.browserPlan) {
        const local = this.browserPlan;
        this.saved.set(local);
        this.days.set(local.snapshot.config.days);
        this.dailyHours.set(local.snapshot.config.dailyHours);
        this.goal.set(local.goal);
        this.goalType.set(local.snapshot.config.goalType ?? 'learning');
        this.familiarity.set(local.snapshot.config.familiarity ?? {});
        this.selectedTopicIds.set(new Set(local.snapshot.config.topicIds));
      }
      this.status.set('Signed out. Your original browser plan is preserved.');
    }
  }
  protected newAccountPlan(): void {
    if (this.editsLocked()) return;
    this.accountStore.newPlan();
    this.saved.set(null);
    this.selectedDay.set(1);
    this.status.set('Choose the focus for a new plan. Progress in your other plans is unchanged.');
  }
  protected async openAccountPlan(planId: string): Promise<void> {
    const result = await this.accountStore.open(planId);
    if (result) this.acceptAccountPlan(result);
  }
  protected async importBrowserPlan(): Promise<void> {
    if (!this.browserPlan) return;
    const result = await this.accountStore.importLocal(this.browserPlan);
    if (result) {
      this.acceptAccountPlan(result);
      this.importAvailable.set(false);
    }
  }
  private acceptAccountPlan(plan: AccountPlan): void {
    const saved = savedAccountPlan(plan);
    this.saved.set(saved);
    if (this.route.snapshot.queryParamMap.has('create')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { create: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    try {
      window.sessionStorage.removeItem(DRAFT_INTENT_KEY);
    } catch {
      /* Storage is optional. */
    }
    this.recoveryDay.set(Math.max(2, (saved.recovery?.elapsedDays ?? 0) + 1));
    this.recoveryPreview.set(null);
    this.extensionRequested.set(false);
    this.days.set(saved.snapshot.config.days);
    this.dailyHours.set(saved.snapshot.config.dailyHours);
    this.goal.set(saved.goal);
    this.goalType.set(saved.snapshot.config.goalType ?? 'learning');
    this.familiarity.set(saved.snapshot.config.familiarity ?? {});
    this.selectedTopicIds.set(new Set(saved.snapshot.config.topicIds));
    this.closeRecovery();
    this.status.set('Saved to your account. Progress belongs to this plan.');
  }
  private async saveAccountActivity(operations: PlanActivity[]): Promise<void> {
    const result = await this.accountStore.activity(operations, this.selectedDay());
    if (result) this.acceptAccountPlan(result);
  }
  protected async retryAccountSave(): Promise<void> {
    const result = await this.accountStore.retry();
    if (result) {
      this.acceptAccountPlan(result);
      this.closeDraft();
    }
  }
  protected async reloadAccountPlan(): Promise<void> {
    this.accountStore.discardPending();
    const active = this.accountStore.active();
    if (active) await this.openAccountPlan(active.planId);
  }
  private persist(message: string): void {
    if (this.accountMode()) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.saved()));
      this.status.set(message);
    } catch {
      this.status.set(
        'Your plan works in this tab, but browser storage is unavailable. Keep this tab open to retain progress.',
      );
    }
  }
  private restore(): void {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const value: SavedPlan = JSON.parse(raw);
      if (
        value.schemaVersion !== 'study-plan-local/v1' ||
        !Array.isArray(value.snapshot?.days) ||
        !Array.isArray(value.completedIds) ||
        !Array.isArray(value.history) ||
        !value.snapshot?.config ||
        !Number.isInteger(value.revision) ||
        value.revision < 1 ||
        typeof value.goal !== 'string' ||
        value.goal.length > 160 ||
        !Number.isInteger(value.shiftedDays) ||
        value.shiftedDays < 0 ||
        !Number.isInteger(value.snapshot.config.days) ||
        value.snapshot.config.days < 1 ||
        value.snapshot.config.days > 180 ||
        !this.hours.some((hours) => hours === value.snapshot.config.dailyHours) ||
        !Array.isArray(value.snapshot.config.topicIds) ||
        value.snapshot.config.topicIds.some((id) => typeof id !== 'string') ||
        value.completedIds.some((id) => typeof id !== 'string') ||
        value.history.some(
          (entry) =>
            !entry || !Number.isInteger(entry.revision) || typeof entry.reason !== 'string',
        )
      )
        throw new Error('Invalid saved plan');
      for (const day of value.snapshot.days) {
        if (!Array.isArray(day.assignments) || !Number.isInteger(day.day))
          throw new Error('Invalid saved day');
        for (const item of day.assignments)
          if (
            typeof item.id !== 'string' ||
            typeof item.title !== 'string' ||
            typeof item.courseTitle !== 'string' ||
            !Number.isFinite(item.minutes) ||
            item.minutes < 0 ||
            !Array.isArray(item.route) ||
            item.route.some((part) => typeof part !== 'string')
          )
            throw new Error('Invalid saved assignment');
      }
      if (value.studyLog !== undefined && !validStudyLog(value.studyLog))
        throw new Error('Invalid study activity log');
      value.snapshot.weeks = [];
      for (let index = 0; index < value.snapshot.days.length; index += 7) {
        const days = value.snapshot.days.slice(index, index + 7);
        value.snapshot.weeks.push({
          number: value.snapshot.weeks.length + 1,
          label:
            value.snapshot.mode === 'interview-revision'
              ? 'Interview revision sprint'
              : (days[0]?.phase ?? ''),
          days,
        });
      }
      if (
        value.sessionOutcomes &&
        (typeof value.sessionOutcomes !== 'object' ||
          Array.isArray(value.sessionOutcomes) ||
          Object.values(value.sessionOutcomes).some(
            (outcome) => !['attempted', 'needs-review', 'completed'].includes(outcome),
          ))
      )
        throw new Error('Invalid session outcome');
      for (const ids of [value.attemptedContentIds, value.needsReviewContentIds])
        if (ids && (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')))
          throw new Error('Invalid progress');
      if (
        value.reviewNotes &&
        (typeof value.reviewNotes !== 'object' ||
          Array.isArray(value.reviewNotes) ||
          Object.values(value.reviewNotes).some(
            (note) => typeof note !== 'string' || note.length > 1000,
          ))
      )
        throw new Error('Invalid review notes');
      const familiarity = value.snapshot.config.familiarity;
      if (
        familiarity &&
        (typeof familiarity !== 'object' ||
          Array.isArray(familiarity) ||
          Object.values(familiarity).some((v) => !['familiar', 'refresh', 'new'].includes(v)))
      )
        throw new Error('Invalid familiarity');
      this.familiarity.set(familiarity ?? {});
      this.goalType.set(value.snapshot.config.goalType ?? 'learning');
      this.saved.set(value);
      this.days.set(value.snapshot.config.days);
      this.dailyHours.set(value.snapshot.config.dailyHours);
      this.goal.set(value.goal);
      this.selectedTopicIds.set(new Set(value.snapshot.config.topicIds));
      this.status.set('Resumed your saved plan from this browser.');
    } catch {
      this.status.set('The saved plan could not be read. Build a new plan to continue.');
    }
  }
}
