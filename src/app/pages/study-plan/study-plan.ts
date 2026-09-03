import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentPath, SearchDocument } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import {
  STUDY_PLAN_DURATIONS,
  STUDY_PLAN_HOURS,
  STUDY_PLAN_TOPICS,
  StudyPlanTopic,
  buildStudyPlan,
} from '../../content/study-plan';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-study-plan',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './study-plan.html',
  styleUrl: './study-plan.css',
})
export class StudyPlanPage implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly durations = STUDY_PLAN_DURATIONS;
  protected readonly hours = STUDY_PLAN_HOURS;
  protected readonly topics = STUDY_PLAN_TOPICS;
  protected readonly days = signal<number>(30);
  protected readonly dailyHours = signal<number>(5);
  protected readonly selectedTopicIds = signal<Set<string>>(
    new Set(['dsa', 'backend-production', 'architecture']),
  );
  protected readonly accessTopicIds = signal<Set<string>>(
    new Set(STUDY_PLAN_TOPICS.map(({ id }) => id)),
  );
  protected readonly documents = signal<SearchDocument[] | null>(null);
  protected readonly loadingError = signal('');
  protected readonly planRequested = signal(false);
  protected readonly hasAccessibleSelection = computed(() =>
    this.topics.some(
      (topic) => this.selectedTopicIds().has(topic.id) && this.accessTopicIds().has(topic.id),
    ),
  );
  protected readonly plan = computed(() => {
    const documents = this.documents();
    if (!documents || !this.planRequested()) return null;
    return buildStudyPlan(documents, {
      days: this.days(),
      dailyHours: this.dailyHours(),
      topicIds: [...this.selectedTopicIds()],
      accessTopicIds: [...this.accessTopicIds()],
    });
  });

  ngOnInit(): void {
    this.content.getSearchIndex().subscribe({
      next: (documents) => this.documents.set(documents),
      error: () =>
        this.loadingError.set('The curriculum index could not be loaded. Please try again.'),
    });
    this.route.queryParamMap.subscribe((params) => {
      if (!params.has('days')) return;
      const days = Number(params.get('days'));
      const hours = Number(params.get('hours'));
      const topics = this.validTopicIds(params.get('topics'));
      const access = this.validTopicIds(params.get('access'));
      if (STUDY_PLAN_DURATIONS.includes(days as (typeof STUDY_PLAN_DURATIONS)[number])) {
        this.days.set(days);
      }
      if (STUDY_PLAN_HOURS.includes(hours as (typeof STUDY_PLAN_HOURS)[number])) {
        this.dailyHours.set(hours);
      }
      if (topics.size) this.selectedTopicIds.set(topics);
      if (access.size) this.accessTopicIds.set(access);
      this.planRequested.set(true);
    });
  }

  protected setDays(value: string): void {
    this.days.set(Number(value));
  }

  protected setHours(value: string): void {
    this.dailyHours.set(Number(value));
  }

  protected toggleTopic(topic: StudyPlanTopic, checked: boolean): void {
    const next = new Set(this.selectedTopicIds());
    if (checked) next.add(topic.id);
    else next.delete(topic.id);
    this.selectedTopicIds.set(next);
  }

  protected toggleTopicAccess(topicId: string, checked: boolean): void {
    const next = new Set(this.accessTopicIds());
    if (checked) next.add(topicId);
    else next.delete(topicId);
    this.accessTopicIds.set(next);
  }

  protected setPathAccess(path: ContentPath, checked: boolean): void {
    const next = new Set(this.accessTopicIds());
    for (const topic of this.topics.filter((candidate) => candidate.path === path)) {
      if (checked) next.add(topic.id);
      else next.delete(topic.id);
    }
    this.accessTopicIds.set(next);
  }

  protected clearAccess(): void {
    this.accessTopicIds.set(new Set());
  }

  protected selectAllTopics(): void {
    this.selectedTopicIds.set(new Set(this.topics.map(({ id }) => id)));
  }

  protected clearTopics(): void {
    this.selectedTopicIds.set(new Set());
  }

  protected pathLabel(path: ContentPath): string {
    return path === 'look-ahead' ? 'Look Ahead' : path === 'grow' ? 'Grow' : 'Learn';
  }

  protected async generatePlan(): Promise<void> {
    if (!this.hasAccessibleSelection()) return;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        days: this.days(),
        hours: this.dailyHours(),
        topics: [...this.selectedTopicIds()].join(','),
        access: [...this.accessTopicIds()].join(','),
      },
    });
    this.planRequested.set(true);
    requestAnimationFrame(() =>
      document.getElementById('generated-plan')?.scrollIntoView({ behavior: 'smooth' }),
    );
  }

  private validTopicIds(value: string | null): Set<string> {
    const valid = new Set(this.topics.map(({ id }) => id));
    return new Set((value ?? '').split(',').filter((id) => valid.has(id)));
  }
}
