import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, forkJoin, switchMap } from 'rxjs';
import { ContentService } from '../../content/content.service';
import {
  CatalogItem,
  CourseContent,
  InterviewQuestion,
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
      .course-navigation-bar {
        width: 100%;
        margin: 24px 0 0;
        padding: 16px 0 0;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 24px;
        border-top: 1px solid var(--line);
      }
      .course-navigation-bar .reader-footer-link {
        flex: 0 1 44%;
        width: auto;
      }
      .course-navigation-bar .reader-footer-link.next {
        margin-left: auto;
      }
      .course-navigation-bar .reader-footer-link > span {
        color: var(--search-primary);
        font-size: 0.7rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .course-navigation-bar .reader-footer-link:hover > strong,
      .course-navigation-bar .reader-footer-link:focus-visible > strong {
        color: var(--search-hover);
      }
      .course-navigation-bar .reader-footer-link.unavailable {
        color: var(--text-subtle);
        cursor: default;
      }
      .course-navigation-bar .reader-footer-link.unavailable > span {
        color: var(--text-subtle);
      }
      .course-navigation-bar .reader-footer-link.unavailable small {
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.72rem;
      }
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
        max-width: 880px;
        margin-top: 20px;
        padding: 16px 0 2px 18px;
        border-left: 3px solid var(--search-primary);
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
        margin: 0 0 12px;
        color: var(--muted);
      }
      .course-learning-path-row {
        display: grid;
        grid-template-columns: minmax(150px, 190px) minmax(0, 1fr);
        gap: 6px 16px;
        margin-top: 8px;
        color: var(--muted);
      }
      .course-learning-path-row strong {
        color: var(--text);
      }
      .course-learning-path-row a {
        color: var(--search-primary);
        font-weight: 750;
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
      }
      .course-learning-path-row a:hover,
      .course-learning-path-row a:focus-visible {
        color: var(--search-hover);
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
        .course-navigation-bar {
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
        }
        .course-navigation-bar .reader-footer-link {
          flex-basis: auto;
          width: 100%;
        }
        .course-navigation-bar .reader-footer-link.next {
          margin-left: 0;
          align-items: flex-start;
          text-align: left;
        }
        .course-learning-path-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class Course implements OnInit {
  private readonly contentService = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly course = signal<CourseContent | null>(null);
  protected readonly courseId = signal('');
  protected readonly pathId = signal('learn');
  protected readonly previousCompetency = signal<CourseNavigationItem | null>(null);
  protected readonly nextCompetency = signal<CourseNavigationItem | null>(null);
  protected readonly preparationCourses = signal<CourseNavigationItem[]>([]);
  protected readonly continuationCourses = signal<CourseNavigationItem[]>([]);
  protected readonly learningGroup = signal<
    LearnCourseGroup | GrowCourseGroup | LookAheadCourseGroup | null
  >(null);
  protected readonly isFirstCompetency = signal(false);
  protected readonly isLastCompetency = signal(false);
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
          this.previousCompetency.set(null);
          this.nextCompetency.set(null);
          this.preparationCourses.set([]);
          this.continuationCourses.set([]);
          this.error.set('');
          const courseId = params.get('courseId') ?? 'core-java';
          const pathId = this.route.snapshot.data['pathId'] ?? 'learn';
          this.courseId.set(courseId);
          this.pathId.set(pathId);
          return forkJoin({
            course: this.contentService.getCourse(pathId, courseId),
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
          this.preparationCourses.set(
            this.learningPathItems(course.learningPath?.preparation.courseIds ?? [], catalogById),
          );
          this.continuationCourses.set(
            this.learningPathItems(course.learningPath?.nextCourseIds ?? [], catalogById),
          );
          const availableCompetencies: CourseNavigationItem[] = group
            ? group.courseIds.map((id) => {
                const item = catalogById.get(id);
                return {
                  id,
                  title: item?.title ?? id,
                  available: Boolean(item) && item?.available !== false,
                };
              })
            : catalog.map(({ id, title, available }) => ({
                id,
                title,
                available: available !== false,
              }));
          const currentIndex = availableCompetencies.findIndex(({ id }) => id === course.id);
          this.previousCompetency.set(availableCompetencies[currentIndex - 1] ?? null);
          this.nextCompetency.set(availableCompetencies[currentIndex + 1] ?? null);
          this.isFirstCompetency.set(currentIndex === 0);
          this.isLastCompetency.set(currentIndex === availableCompetencies.length - 1);
        },
      });
  }

  private learningPathItems(
    courseIds: string[],
    catalogById: Map<string, CatalogItem>,
  ): CourseNavigationItem[] {
    return courseIds.map((id) => {
      const item = catalogById.get(id);
      return {
        id,
        title: item?.title ?? id,
        available: Boolean(item) && item?.available !== false,
      };
    });
  }

  protected questionsFor(moduleId: string): InterviewQuestion[] {
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

type CourseNavigationItem = Pick<CatalogItem, 'id' | 'title'> & { available: boolean };
