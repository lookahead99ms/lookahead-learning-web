import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
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
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { STUDY_PLAN_ACCESS } from './study-plan-access';

interface SavedPlan {
  schemaVersion: 'study-plan-local/v1';
  revision: number;
  goal: string;
  rankingVersion: string | null;
  snapshot: StudyPlan;
  completedIds: string[];
  shiftedDays: number;
  sessionOutcomes?: Record<string, 'attempted' | 'needs-review' | 'completed'>;
  reviewNotes?: Record<string, string>;
  attemptedContentIds?: string[];
  needsReviewContentIds?: string[];
  history: { revision: number; changedAt: string; reason: string }[];
}
const STORAGE_KEY = 'look-ahead.study-plan.v1';

@Component({
  selector: 'app-study-plan',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './study-plan.html',
  styleUrl: './study-plan.css',
})
export class StudyPlanPage implements OnInit {
  private readonly content = inject(ContentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly access = inject(STUDY_PLAN_ACCESS);
  protected readonly durations = STUDY_PLAN_DURATIONS;
  protected readonly hours = STUDY_PLAN_HOURS;
  protected readonly paths: ContentPath[] = ['learn', 'grow', 'look-ahead'];
  protected readonly days = signal(30);
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
  protected readonly currentDay = computed(
    () => this.plan()?.days.find(({ day }) => day === this.selectedDay()) ?? null,
  );
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
    this.loadContent();
    this.loadRanking();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const days = Number(params.get('days'));
      const hours = Number(params.get('hours'));
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
    if (!this.canOpen(assignment)) return;
    const saved = this.saved();
    if (!saved) return;
    const source = this.sourceId(assignment);
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
    });
    this.persist(
      outcome === 'completed'
        ? 'Content completion recorded explicitly. This does not establish mastery.'
        : 'Timebox recorded. The full content has not been marked complete.',
    );
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
  protected readonly pendingSessions = computed(() => {
    const plan = this.plan();
    if (!plan) return [];
    const sessions = [
      ...plan.days.filter((day) => day.day < this.selectedDay()).flatMap((day) => day.assignments),
      ...(plan.futureReviews ?? []).filter(
        (item) => (item.reviewDueDay ?? Infinity) <= this.selectedDay(),
      ),
    ];
    const seen = new Set<string>();
    return sessions.filter((item) => {
      if (this.completedIds().has(item.id) || this.outcome(item) || !this.canOpen(item))
        return false;
      const source = this.sourceId(item);
      if (seen.has(source)) return false;
      seen.add(source);
      return true;
    });
  });

  protected async generatePlan(): Promise<void> {
    if (!this.canGenerate()) return;
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
        goalType: this.goalType(),
        familiarity: { ...this.familiarity() },
        completedContentIds: [...this.completedIds()],
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
    this.saved.set({
      schemaVersion: 'study-plan-local/v1',
      revision,
      goal: this.goal().trim() || 'My engineering practice',
      rankingVersion: this.rankingVersion,
      snapshot,
      completedIds: previous?.completedIds ?? [],
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
    this.persist('Plan ready. Saved on this browser.');
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
    if (!this.canOpen(assignment)) return;
    const saved = this.saved();
    if (!saved) return;
    const completedIds = new Set(saved.completedIds);
    if (completedIds.has(assignment.id)) completedIds.delete(assignment.id);
    else completedIds.add(assignment.id);
    if (assignment.sourceContentId && assignment.timebox === false) {
      if (completedIds.has(assignment.id)) completedIds.add(assignment.sourceContentId);
      else completedIds.delete(assignment.sourceContentId);
    }
    this.saved.set({ ...saved, completedIds: [...completedIds] });
    this.persist('Progress saved on this browser. Completion records practice, not mastery.');
  }
  protected shiftSchedule(): void {
    const saved = this.saved();
    if (!saved) return;
    const revision = saved.revision + 1;
    this.saved.set({
      ...saved,
      revision,
      shiftedDays: saved.shiftedDays + 1,
      history: [
        ...saved.history,
        {
          revision,
          changedAt: new Date().toISOString(),
          reason: 'Added one recovery day; session order and completed work preserved',
        },
      ],
    });
    this.persist('One recovery day added. Your next session and completed work stay in place.');
  }
  private persist(message: string): void {
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
        !this.durations.some((days) => days === value.snapshot.config.days) ||
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
