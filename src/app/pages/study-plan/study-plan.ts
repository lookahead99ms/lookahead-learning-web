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
  protected readonly goal = signal('Build reliable engineering foundations');
  protected readonly selectedTopicIds = signal(new Set<string>());
  protected readonly documents = signal<SearchDocument[] | null>(null);
  protected readonly loadingError = signal('');
  protected readonly status = signal('');
  protected readonly saved = signal<SavedPlan | null>(null);
  protected readonly selectedDay = signal(1);
  private rankingVersion: string | null = null;
  private studyOrder = new Map<string, number>();
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
  protected readonly plan = computed(() => this.saved()?.snapshot ?? null);
  protected readonly currentDay = computed(
    () => this.plan()?.days.find(({ day }) => day === this.selectedDay()) ?? null,
  );
  protected readonly completedIds = computed(() => new Set(this.saved()?.completedIds ?? []));
  protected readonly completion = computed(() => {
    const assignments = this.plan()?.days.flatMap(({ assignments }) => assignments) ?? [];
    const done = assignments.filter(({ id }) => this.completedIds().has(id)).length;
    return {
      done,
      total: assignments.length,
      percent: assignments.length ? Math.round((done / assignments.length) * 100) : 0,
    };
  });
  protected readonly weekAllocation = computed(() => {
    const assignments = this.plan()?.weeks[0]?.days.flatMap(({ assignments }) => assignments) ?? [];
    const understand = assignments
      .filter(({ activity }) => activity === 'Understand')
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
    this.content
      .getHandsOnDsaIndex()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (index) => {
          if (index.ranking?.status !== 'released') return;
          this.rankingVersion = index.ranking.rankingVersion;
          this.studyOrder = new Map(
            index.groups.flatMap((group) =>
              group.problems.map(
                (item) =>
                  [item.id, item.studyOrder ?? item.interviewRank ?? Infinity] as [string, number],
              ),
            ),
          );
        },
        error: () => {
          /* Existing plans remain pinned; new plans use stable curriculum order. */
        },
      });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const days = Number(params.get('days'));
      const hours = Number(params.get('hours'));
      if (this.durations.some((value) => value === days)) this.days.set(days);
      if (this.hours.some((value) => value === hours)) this.dailyHours.set(hours);
      if (params.has('topics'))
        this.selectedTopicIds.set(new Set((params.get('topics') ?? '').split(',')));
      // Legacy access URL values never grant access or authorize a plan.
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
  protected canOpen(assignment: StudyPlanAssignment): boolean {
    return this.availableDocuments().some(
      (item) => (item.canonicalContentId ?? item.id) === assignment.id.replace(/:review:\d+$/, ''),
    );
  }
  protected currentRoute(assignment: StudyPlanAssignment): string[] {
    const item = this.availableDocuments().find(
      (document) =>
        (document.canonicalContentId ?? document.id) === assignment.id.replace(/:review:\d+$/, ''),
    );
    return item?.route ?? (item ? ['/', item.path, item.courseId, item.contentId] : []);
  }
  protected async generatePlan(): Promise<void> {
    if (!this.hasAccessibleSelection()) return;
    const topicIds = [...this.selectedTopicIds()].filter((id) => this.availableTopicIds().has(id));
    const snapshot = buildStudyPlan(
      this.availableDocuments(),
      {
        days: this.days(),
        dailyHours: this.dailyHours(),
        topicIds,
        accessTopicIds: [...this.availableTopicIds()],
      },
      this.topics(),
      this.studyOrder,
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
      queryParams: { days: this.days(), hours: this.dailyHours(), topics: topicIds.join(',') },
    });
  }
  protected toggleCompletion(assignment: StudyPlanAssignment): void {
    if (!this.canOpen(assignment)) return;
    const saved = this.saved();
    if (!saved) return;
    const completedIds = new Set(saved.completedIds);
    if (completedIds.has(assignment.id)) completedIds.delete(assignment.id);
    else completedIds.add(assignment.id);
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
          label: days[0]?.phase ?? '',
          days,
        });
      }
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
