import {
  ContentRecovery,
  RecoveryKind,
  RecoveryPreview,
  recoveryKind,
} from '../../core/content-recovery/content-recovery';
import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, Subject, merge, map, catchError, forkJoin, switchMap } from 'rxjs';
import { ContentService } from '../../content/content.service';
import {
  CatalogItem,
  ContentItemSummary,
  CourseLearningBackgroundLink,
  CourseLearningDirection,
  CourseOutline,
  highlightGrow,
  highlightLearn,
  reviewStatusLabel,
} from '../../content/content.models';
import { CatalogCourseGroup, catalogGroupForCourse } from '../../content/catalog-course-groups';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { CourseLearningMap } from '../../core/course-learning-map/course-learning-map';
import { courseHasUnitCards } from '../../content/learning-units';

@Component({
  selector: 'app-course',
  imports: [ContentRecovery, PlatformHeader, RouterLink, CourseLearningMap, NgTemplateOutlet],
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
        color: var(--accent-link);
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
      /* Card courses place the learning path between the course banner and the card grid. */
      .course-page-intro-cards {
        margin: 0;
        padding: 0;
        border-bottom: 0;
      }
      .course-page-intro-cards .course-learning-path {
        max-width: none;
        margin-top: 0;
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
        border-left: 2px solid var(--path-grow);
      }
      .course-reader[data-path='grow'] .course-page-intro .grow-highlight {
        display: block;
        margin-bottom: 2px;
        font-size: 0.78rem;
        font-weight: 850;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      /* Learning path (user review #7, 2026-10-03): a stepper, not three boxes. Each column is a
         step on one line (background → you are here → next); the current course is the filled
         dot in the path colour, the recommended next course is the one big link, and other
         directions fold under it. Phones stack the steps on a vertical line. */
      .course-learning-path {
        --path-step-accent: var(--card-top-accent, var(--accent-strong));
        max-width: 1120px;
        margin-top: 20px;
        padding: 22px 26px 24px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--surface);
      }
      .course-learning-path h2 {
        margin: 0 0 4px;
        color: var(--text-strong);
        font-size: 1.05rem;
        font-weight: 800;
        letter-spacing: -0.005em;
      }
      .course-learning-path > p {
        max-width: 880px;
        margin: 0 0 22px;
        color: var(--text-body);
        font-size: 0.95rem;
        line-height: 1.5;
      }
      .course-relationship-map {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        gap: 0 32px;
        align-items: start;
      }
      .course-relationship-arrow {
        display: none;
      }
      .course-relationship-column {
        position: relative;
        min-width: 0;
        padding-top: 30px;
      }
      /* The step dot, and the line from it to the next step. */
      .course-relationship-column::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        box-sizing: border-box;
        width: 16px;
        height: 16px;
        border: 2px solid var(--border-strong);
        border-radius: 50%;
        background: var(--surface);
      }
      .course-relationship-column:not(:last-child)::after {
        content: '';
        position: absolute;
        top: 7px;
        left: 24px;
        right: -24px;
        height: 2px;
        border-radius: 2px;
        background: var(--line);
      }
      .course-current-column::before {
        border-color: var(--path-step-accent);
        background: var(--path-step-accent);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--path-step-accent) 22%, transparent);
      }
      .course-next-column::before {
        border-color: var(--accent-link);
      }
      .course-relationship-column h3 {
        display: block;
        margin: 0 0 6px;
        color: var(--text-subtle);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .course-current-column h3 {
        color: var(--path-step-accent);
      }
      .course-background-note {
        margin: 10px 0 0;
        color: var(--text-subtle);
        font-size: 0.8rem;
        line-height: 1.45;
      }
      .course-relationship-list {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .course-relationship-list a,
      .course-relationship-list .unavailable {
        color: var(--text-strong);
        font-weight: 700;
        text-decoration: none;
      }
      .course-relationship-list a {
        color: var(--accent-link);
      }
      .course-relationship-list a:hover,
      .course-relationship-list a:focus-visible {
        color: var(--search-hover);
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .course-relationship-list .unavailable {
        color: var(--text-subtle);
      }
      /* The recommended next course is the step's one clear action. */
      .course-next-column > .course-relationship-list a {
        font-size: 1.12rem;
        font-weight: 800;
      }
      .course-next-column > .course-relationship-list a::after {
        content: ' →';
      }
      .course-direction-reason {
        margin: 4px 0 0;
        color: var(--text-body);
        font-size: 0.86rem;
        line-height: 1.45;
      }
      .course-other-directions,
      .course-relationship-more {
        margin-top: 14px;
      }
      .course-other-directions summary,
      .course-relationship-more summary {
        width: fit-content;
        color: var(--accent-link);
        cursor: pointer;
        font-size: 0.84rem;
        font-weight: 700;
      }
      .course-other-directions .course-relationship-list,
      .course-relationship-more .course-relationship-list {
        margin-top: 10px;
        padding-left: 12px;
        border-left: 2px solid var(--line);
      }
      .course-relationship-more:not([open]) > .course-relationship-list,
      .course-other-directions:not([open]) > .course-relationship-list {
        display: none;
      }
      .course-current-node {
        display: grid;
        gap: 6px;
        justify-items: start;
      }
      .course-current-node strong {
        color: var(--text-strong);
        font-size: 1.12rem;
        font-weight: 800;
        line-height: 1.3;
      }
      .course-group-return {
        color: var(--accent-link);
        font-size: 0.84rem;
        font-weight: 650;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      /* The side nav takes a column, so the map keeps room for its card grid. */
      .course-reader.course-reader-with-nav {
        width: min(1400px, 94vw);
      }
      .course-reader-with-nav .module-question-list {
        width: 100%;
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
      @media (max-width: 760px) {
        .course-learning-path {
          padding: 18px 18px 20px;
        }
        .course-relationship-map {
          grid-auto-flow: row;
          grid-auto-columns: auto;
          gap: 22px;
        }
        .course-relationship-column {
          padding: 0 0 0 30px;
        }
        .course-relationship-column::before {
          top: 1px;
        }
        .course-relationship-column:not(:last-child)::after {
          top: 24px;
          bottom: -16px;
          left: 7px;
          right: auto;
          width: 2px;
          height: auto;
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
  protected readonly learningGroup = signal<CatalogCourseGroup | null>(null);
  protected readonly error = signal('');
  protected readonly recovery = signal<RecoveryKind>('temporary');
  protected readonly recoveryPreview = signal<RecoveryPreview>({});
  protected readonly retryLoad = new Subject<void>();
  protected readonly reviewStatusLabel = reviewStatusLabel;
  protected readonly highlightGrow = highlightGrow;
  protected readonly highlightLearn = highlightLearn;
  /** Card courses show their title in the banner at the top of the learning map. */
  protected readonly hasUnitCards = courseHasUnitCards;

  /**
   * DLV-408: Look Ahead learning-map courses show the sticky side nav of every lesson.
   * Learn and Grow use the same map and can opt in here once reviewed.
   */
  protected lessonNav(course: CourseOutline): boolean {
    return (
      this.pathId() === 'look-ahead' &&
      course.layout === 'learning-map' &&
      Boolean(course.learningUnits?.length)
    );
  }

  protected pathLabel(): string {
    return this.pathId() === 'grow'
      ? 'Grow'
      : this.pathId() === 'look-ahead'
        ? 'Look Ahead'
        : 'Learn';
  }

  ngOnInit(): void {
    merge(this.route.paramMap, this.retryLoad.pipe(map(() => this.route.snapshot.paramMap)))
      .pipe(
        switchMap((params) => {
          this.course.set(null);
          this.learningGroup.set(null);
          this.backgroundCourses.set([]);
          this.recommendedNextCourse.set(null);
          this.otherDirectionCourses.set([]);
          this.error.set('');
          this.recovery.set('temporary');
          const courseId = params.get('courseId') ?? 'core-java';
          const pathId = this.route.snapshot.data['pathId'] ?? 'learn';
          this.courseId.set(courseId);
          this.pathId.set(pathId);
          return forkJoin({
            course: this.contentService.getCourseOutline(pathId, courseId),
            catalog: this.contentService.getCatalog(pathId),
          }).pipe(
            // Handle each request independently so later route changes can recover.
            catchError((error) => {
              this.recovery.set(recoveryKind(error));
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
          const group = catalogGroupForCourse(this.pathId(), course.id);
          this.learningGroup.set(group);
          const catalogById = new Map(
            catalog.flatMap((item) => (item.id ? ([[item.id, item]] as const) : [])),
          );
          this.backgroundCourses.set([
            ...(course.learningPath?.backgroundCourseIds ?? []).map((id) =>
              this.navigationItem(id, catalogById),
            ),
            ...(course.learningPath?.backgroundCourseLinks ?? []).map((link) =>
              this.backgroundLinkItem(link),
            ),
          ]);
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
      path: this.pathId(),
    };
  }

  private backgroundLinkItem(link: CourseLearningBackgroundLink): CourseNavigationItem {
    return {
      id: link.courseId,
      title: link.title,
      available: true,
      path: link.path,
    };
  }

  protected questionsFor(moduleId: string): ContentItemSummary[] {
    return (this.course()?.questions ?? [])
      .filter((question) => question.moduleId === moduleId)
      .sort((left, right) => left.order - right.order);
  }
}

type CourseNavigationItem = Pick<CatalogItem, 'id' | 'title'> & {
  available: boolean;
  path: string;
  reason?: string;
};
