import {
  AfterRenderRef,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, Scroll } from '@angular/router';
import {
  CatalogOverviewItem,
  highlightLearn,
  reviewStatusLabel,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { LEARN_COURSE_GROUPS, LearnCourseGroup } from '../../content/learn-course-groups';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-learn',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './learn.html',
  styleUrl: '../catalog-experience.css',
})
export class Learn implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pendingGroupId: string | null = null;
  private navigationScrollPending = true;
  private scrollRequest?: AfterRenderRef;
  protected readonly courses = signal<CatalogOverviewItem[] | null>(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;
  protected readonly highlightLearn = highlightLearn;
  protected readonly expandedGroups = signal<Set<string>>(
    new Set(['Programming Language Foundations']),
  );
  protected readonly courseGroups = LEARN_COURSE_GROUPS;
  protected readonly startingGroup = LEARN_COURSE_GROUPS[0]!;

  ngOnInit(): void {
    this.content
      .getCatalogOverview('learn')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (courses) => {
          this.courses.set(courses);
          if (this.pendingGroupId) this.scrollToGroup(this.pendingGroupId);
        },
        error: () => this.error.set('The Learn catalog could not be loaded. Please try again.'),
      });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const groupId = params.get('group');
      const group = this.courseGroups.find((candidate) => candidate.id === groupId);
      this.pendingGroupId = group?.id ?? null;
      this.navigationScrollPending = true;
      this.scrollRequest?.destroy();
      if (!group) return;
      this.expandedGroups.update((current) => new Set(current).add(group.title));
    });
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof Scroll)) return;
      // Reveal the group after the router has restored the page's scroll position.
      this.navigationScrollPending = false;
      if (this.pendingGroupId) this.scrollToGroup(this.pendingGroupId);
    });
  }

  protected coursesFor(
    group: LearnCourseGroup,
    courses: CatalogOverviewItem[],
  ): CatalogOverviewItem[] {
    const byId = new Map(courses.map((course) => [course.id, course]));
    return group.courseIds.flatMap((id) => byId.get(id) ?? []);
  }

  protected totalLessons(courses: CatalogOverviewItem[]): number {
    return courses.reduce((total, course) => total + course.lessonCount, 0);
  }

  protected totalQuestions(courses: CatalogOverviewItem[]): number {
    return courses.reduce((total, course) => total + course.questionCount, 0);
  }

  protected lessonsFor(group: LearnCourseGroup, courses: CatalogOverviewItem[]): number {
    return this.coursesFor(group, courses).reduce((total, course) => total + course.lessonCount, 0);
  }

  protected questionsFor(group: LearnCourseGroup, courses: CatalogOverviewItem[]): number {
    return this.coursesFor(group, courses).reduce(
      (total, course) => total + course.questionCount,
      0,
    );
  }

  protected isExpanded(group: LearnCourseGroup): boolean {
    return this.expandedGroups().has(group.title);
  }

  protected toggleGroup(group: LearnCourseGroup): void {
    this.expandedGroups.update((current) => {
      const next = new Set(current);
      next.has(group.title) ? next.delete(group.title) : next.add(group.title);
      return next;
    });
  }

  protected repeatJump(event: MouseEvent, group: LearnCourseGroup): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    // Angular ignores an unchanged URL, so repeated jumps must reveal the group explicitly.
    if (this.route.snapshot.queryParamMap.get('group') !== group.id) return;
    this.expandedGroups.update((current) => new Set(current).add(group.title));
    this.scrollToGroup(group.id);
  }

  private scrollToGroup(groupId: string): void {
    this.scrollRequest?.destroy();
    if (this.navigationScrollPending || !this.courses()?.length) return;
    this.scrollRequest = afterNextRender(
      () => {
        const host = this.host.nativeElement;
        const element = host.querySelector<HTMLElement>(`#learn-group-${groupId}`);
        if (!element) return;
        const sticky = host.querySelector<HTMLElement>('.catalog-sticky-utility');
        const view = host.ownerDocument.defaultView;
        const stickyTop = sticky && view ? parseFloat(view.getComputedStyle(sticky).top) || 0 : 0;
        element.style.scrollMarginTop = `${stickyTop + (sticky?.getBoundingClientRect().height ?? 0) + 12}px`;
        element
          .querySelector<HTMLButtonElement>('.catalog-group-heading')
          ?.focus({ preventScroll: true });
        element.scrollIntoView({
          behavior: view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
          block: 'start',
        });
      },
      { injector: this.injector },
    );
  }
}
