import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, forkJoin, switchMap } from 'rxjs';
import { ContentService } from '../../content/content.service';
import {
  CatalogItem,
  ContentItemSummary,
  CourseLearningDirection,
  CourseOutline,
  highlightGrow,
  highlightLearn,
  reviewStatusLabel,
} from '../../content/content.models';
import { LEARN_COURSE_GROUPS, LearnCourseGroup } from '../../content/learn-course-groups';
import { GROW_COURSE_GROUPS, GrowCourseGroup } from '../../content/grow-course-groups';
import {
  LOOK_AHEAD_COURSE_GROUPS,
  LookAheadCourseGroup,
} from '../../content/look-ahead-course-groups';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { CourseLearningMap } from '../../core/course-learning-map/course-learning-map';

@Component({
  selector: 'app-course',
  imports: [PlatformHeader, RouterLink, CourseLearningMap],
  templateUrl: './course.html',
  styles: [
    `
      .course-section-tile {
        min-height: 220px;
        display: flex;
        flex-direction: column;
      }
      .course-section-tile .eyebrow {
        margin: 0 0 12px;
      }
      .course-section-tile h3 {
        margin-bottom: 12px;
      }
      .course-section-action {
        margin-top: auto;
        padding-top: 20px;
        color: var(--search-primary);
        font-size: 0.84rem;
        font-weight: 800;
      }
      .course-page-intro {
        margin: 26px 0 8px;
        padding: 0 14px 12px;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        gap: 0;
        border-bottom: 1px solid var(--line);
      }
      .course-page-intro .course-intro-summary > .eyebrow {
        margin: 5px 0 0;
        color: var(--muted);
        font-size: 0.9rem;
        font-weight: 600;
        letter-spacing: normal;
        text-transform: none;
      }
      .course-reader[data-path='grow'] .course-page-intro .course-intro-summary > .eyebrow {
        padding-left: 12px;
        border-left: 3px solid var(--grow-accent);
      }
      .course-reader[data-path='grow'] .course-page-intro .grow-highlight {
        display: block;
        margin-bottom: 2px;
        font-size: 0.78rem;
        font-weight: 850;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .course-learning-path {
        max-width: 1120px;
        margin-top: 20px;
        padding: 20px 22px;
        border: 1px solid var(--line);
        border-left: 4px solid var(--search-primary);
        border-radius: 14px;
        background: var(--surface);
      }
      .course-reader[data-path='grow'] .course-learning-path {
        border-left-color: var(--grow-accent);
      }
      .course-learning-path h2 {
        margin: 0 0 6px;
        color: var(--text);
        font-size: 0.88rem;
        font-weight: 850;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .course-learning-path > p {
        max-width: 880px;
        margin: 0 0 16px;
        color: var(--muted);
      }
      .course-relationship-map {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(180px, 0.8fr) auto minmax(0, 1fr);
        align-items: start;
        gap: 10px;
      }
      .course-relationship-map.background-only {
        grid-template-columns: minmax(0, 1fr) auto minmax(180px, 0.8fr);
      }
      .course-relationship-map.next-only {
        grid-template-columns: minmax(180px, 0.8fr) auto minmax(0, 1fr);
      }
      .course-relationship-column {
        min-width: 0;
      }
      .course-relationship-column h3 {
        display: block;
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 0.7rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .course-background-note {
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 0.78rem;
        line-height: 1.4;
      }
      .course-relationship-list {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .course-relationship-list a,
      .course-relationship-list .unavailable {
        display: block;
        padding: 10px 12px;
        border-left: 3px solid var(--line);
        background: var(--surface-muted);
        color: var(--text);
        font-weight: 750;
        text-decoration: none;
      }
      .course-relationship-list a {
        color: var(--search-primary);
      }
      .course-relationship-list a:hover,
      .course-relationship-list a:focus-visible {
        border-left-color: var(--search-primary);
        color: var(--search-hover);
      }
      .course-relationship-list .unavailable {
        color: var(--text-subtle);
      }
      .course-direction-reason {
        margin: 6px 12px 0;
        color: var(--muted);
        font-size: 0.78rem;
        line-height: 1.4;
      }
      .course-other-directions {
        margin-top: 12px;
      }
      .course-other-directions summary {
        width: fit-content;
        color: var(--search-primary);
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 750;
      }
      .course-other-directions .course-relationship-list {
        margin-top: 10px;
      }
      .course-relationship-more:not([open]) > .course-relationship-list,
      .course-other-directions:not([open]) > .course-relationship-list {
        display: none;
      }
      .course-current-node {
        min-width: 180px;
        display: flex;
        flex-direction: column;
        border-left: 4px solid var(--search-primary);
        background: var(--surface-accent);
      }
      .course-reader[data-path='grow'] .course-current-node {
        border-left-color: var(--grow-accent);
      }
      .course-current-node strong {
        display: block;
        padding: 10px 12px;
        color: var(--text);
      }
      .course-relationship-arrow {
        align-self: start;
        margin-top: 28px;
        color: var(--search-primary);
        font-size: 1.35rem;
        font-weight: 800;
      }
      .course-relationship-more {
        margin-top: 8px;
        color: var(--muted);
      }
      .course-relationship-more summary {
        width: fit-content;
        color: var(--search-primary);
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 750;
      }
      .course-relationship-more .course-relationship-list {
        margin-top: 8px;
      }
      .course-group-return {
        display: inline-flex;
        align-self: flex-end;
        margin: 0 12px 10px;
        padding-top: 8px;
        border-top: 1px solid var(--line);
        color: var(--search-primary);
        font-size: 0.76rem;
        font-weight: 750;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .course-breadcrumb-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px 24px;
        flex-wrap: wrap;
      }
      .course-breadcrumb-bar .breadcrumbs {
        margin: 0;
      }
      .course-breadcrumb-bar .reader-search-link {
        position: static;
        flex: 0 0 auto;
      }
      @media (max-width: 980px) {
        .course-relationship-map,
        .course-relationship-map.background-only,
        .course-relationship-map.next-only {
          grid-template-columns: 1fr;
          align-items: start;
        }
        .course-relationship-arrow {
          margin-top: 0;
          transform: rotate(90deg);
          text-align: center;
        }
      }
    `,
  ],
})
export class Course implements OnInit {
  private readonly contentService = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly course = signal<CourseOutline | null>(null);
  protected readonly courseId = signal('');
  protected readonly pathId = signal('learn');
  protected readonly backgroundCourses = signal<CourseNavigationItem[]>([]);
  protected readonly recommendedNextCourse = signal<CourseNavigationItem | null>(null);
  protected readonly otherDirectionCourses = signal<CourseNavigationItem[]>([]);
  protected readonly learningGroup = signal<
    LearnCourseGroup | GrowCourseGroup | LookAheadCourseGroup | null
  >(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;
  protected readonly highlightGrow = highlightGrow;
  protected readonly highlightLearn = highlightLearn;

  protected pathLabel(): string {
    return this.pathId() === 'grow'
      ? 'Grow'
      : this.pathId() === 'look-ahead'
        ? 'Look Ahead'
        : 'Learn';
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.course.set(null);
          this.learningGroup.set(null);
          this.backgroundCourses.set([]);
          this.recommendedNextCourse.set(null);
          this.otherDirectionCourses.set([]);
          this.error.set('');
          const courseId = params.get('courseId') ?? 'core-java';
          const pathId = this.route.snapshot.data['pathId'] ?? 'learn';
          this.courseId.set(courseId);
          this.pathId.set(pathId);
          return forkJoin({
            course: this.contentService.getCourseOutline(pathId, courseId),
            catalog: this.contentService.getCatalog(pathId),
          }).pipe(
            // Handle each request independently so later route changes can recover.
            catchError(() => {
              this.error.set('The learning content could not be loaded.');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ course, catalog }) => {
          this.course.set(course);
          const group = this.groupFor(this.pathId(), course.id);
          this.learningGroup.set(group);
          const catalogById = new Map(
            catalog.flatMap((item) => (item.id ? ([[item.id, item]] as const) : [])),
          );
          this.backgroundCourses.set(
            (course.learningPath?.backgroundCourseIds ?? []).map((id) =>
              this.navigationItem(id, catalogById),
            ),
          );
          this.recommendedNextCourse.set(
            course.learningPath?.recommendedNext
              ? this.directionItem(course.learningPath.recommendedNext, catalogById)
              : null,
          );
          this.otherDirectionCourses.set(
            (course.learningPath?.otherDirections ?? []).map((direction) =>
              this.directionItem(direction, catalogById),
            ),
          );
        },
      });
  }

  protected relationshipCountLabel(count: number): string {
    return `View ${count} more ${count === 1 ? 'relationship' : 'relationships'}`;
  }

  protected browseQueryParams(): { group: string } | null {
    const group = this.learningGroup();
    return group ? { group: group.id } : null;
  }

  private directionItem(
    direction: CourseLearningDirection,
    catalogById: Map<string, CatalogItem>,
  ): CourseNavigationItem {
    return { ...this.navigationItem(direction.courseId, catalogById), reason: direction.reason };
  }

  private navigationItem(id: string, catalogById: Map<string, CatalogItem>): CourseNavigationItem {
    const item = catalogById.get(id);
    return {
      id,
      title: item?.title ?? id,
      available: Boolean(item) && item?.available !== false,
    };
  }

  protected questionsFor(moduleId: string): ContentItemSummary[] {
    return (this.course()?.questions ?? [])
      .filter((question) => question.moduleId === moduleId)
      .sort((left, right) => left.order - right.order);
  }

  private groupFor(
    pathId: string,
    courseId: string,
  ): LearnCourseGroup | GrowCourseGroup | LookAheadCourseGroup | null {
    const groups =
      pathId === 'learn'
        ? LEARN_COURSE_GROUPS
        : pathId === 'grow'
          ? GROW_COURSE_GROUPS
          : LOOK_AHEAD_COURSE_GROUPS;
    return groups.find((candidate) => candidate.courseIds.includes(courseId)) ?? null;
  }
}

type CourseNavigationItem = Pick<CatalogItem, 'id' | 'title'> & {
  available: boolean;
  reason?: string;
};
