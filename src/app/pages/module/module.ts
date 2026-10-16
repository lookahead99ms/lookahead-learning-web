import { ContentRecovery, RecoveryKind, RecoveryPreview, recoveryKind } from '../../core/content-recovery/content-recovery';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, Subject, merge, map, catchError, forkJoin, of, switchMap } from 'rxjs';
import {
  CatalogItem,
  CourseOutline,
  CourseModule,
  CourseSection,
  ContentItemSummary,
  reviewStatusLabel,
  navTitle,
} from '../../content/content.models';
import { catalogGroupForCourse } from '../../content/catalog-course-groups';
import { ContentService } from '../../content/content.service';
import { isTheoryArticle } from '../../content/question-discovery';
import {
  AccessLevel,
  AccessLevelsService,
  accessLabelFor,
  accessViewerFor,
} from '../../content/access-levels';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { flattenLearningUnits } from '../../content/learning-units';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-module',
  imports: [ContentRecovery, PlatformHeader, RouterLink],
  templateUrl: './module.html',
  styles: [
    `
      .question-card {
        position: relative;
        isolation: isolate;
        cursor: pointer;
      }
      .question-card-link {
        color: inherit;
        text-decoration: none;
      }
      .question-card-link::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        border-radius: 15px;
      }
      .question-card-link:focus-visible {

      }
      .question-card:has(.question-card-link:focus-visible) {
        outline: 3px solid var(--cyan);
        outline-offset: 4px;
      }
      .question-filter-tag {
        /* Keep sibling filters above the primary link's full-card hit area. */
        position: relative;
        z-index: 2;
      }
      .question-filter-tag:focus-visible {
        outline: 3px solid var(--cyan);
        outline-offset: 3px;
      }
      .module-navigation-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--line);
      }
      /* DLV-937: previous, next and "all modules" are pill buttons (.action-link). */
      .module-previous-link,
      .module-catalog-link,
      .module-next-link {
        min-height: 40px;
        padding: 8px 16px;
        font-size: 0.82rem;
        text-align: start;
      }
      .module-previous-link strong {
        font-weight: 750;
      }
      .module-action-group {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        min-width: 0;
        margin-left: auto;
      }
      /* DLV-942: who can open this module's unit, as plain text (never a pill). */
      .module-access {
        margin: 6px 0 0;
        color: var(--text-subtle);
        font-size: 0.86rem;
        font-weight: 650;
      }
      .module-context-title {
        margin: 0 0 6px;
        color: var(--text-strong);
        font-size: clamp(1.35rem, 2.1vw, 2rem);
        line-height: 1.2;
        letter-spacing: -0.025em;
      }
      @media (max-width: 760px) {
        .module-navigation-bar {
          align-items: flex-start;
          flex-direction: column;
        }
        .module-action-group {
          width: 100%;
          justify-content: flex-start;
          flex-wrap: wrap;
          margin-left: 0;
        }
      }
    `,
  ],
})
export class Module implements OnInit {
  private readonly contentService = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly courseId = signal('');
  protected readonly pathId = signal('learn');
  /** The catalog group the course sits in, for the breadcrumb's group level. */
  protected readonly courseGroup = computed(() =>
    catalogGroupForCourse(this.pathId(), this.courseId()),
  );
  protected readonly course = signal<CourseOutline | null>(null);
  protected readonly module = signal<CourseModule | null>(null);
  protected readonly parentSection = signal<CourseSection | null>(null);
  protected readonly questions = signal<ContentItemSummary[]>([]);
  protected readonly previousModule = signal<CourseModule | null>(null);
  protected readonly nextModule = signal<CourseModule | null>(null);
  protected readonly nextCourse = signal<CatalogItem | null>(null);
  protected readonly isFirstModuleInTrack = signal(false);
  protected readonly isLastModuleInTrack = signal(false);
  protected readonly error = signal('');
  protected readonly recovery = signal<RecoveryKind>('temporary');
  protected readonly recoveryPreview = signal<RecoveryPreview>({});
  protected readonly retryLoad = new Subject<void>();
  protected readonly reviewStatusLabel = reviewStatusLabel;
  protected readonly navTitle = navTitle;
  private readonly accessLevels = inject(AccessLevelsService).levels;
  private readonly accounts = inject(StudyPlanAccount);
  /** DLV-942: the access level of the unit that owns this module; null when unknown. */
  protected readonly moduleAccess = computed<AccessLevel | null>(() => {
    const levels = this.accessLevels();
    const course = this.course();
    const moduleId = this.module()?.id;
    if (!levels || !course || !moduleId) return null;
    const unit = flattenLearningUnits(course.learningUnits ?? []).find(
      (candidate) =>
        !candidate.planned &&
        [candidate.theoryModuleId, candidate.questionModuleId, candidate.practiceModuleId].includes(
          moduleId,
        ),
    );
    return unit ? levels.levelFor(this.pathId(), this.courseId(), unit.id) : null;
  });
  /**
   * DLV-209: the access line for whoever is looking; null hides it. Signed-out visitors see every
   * level, signed-in learners only "Paid plan" on a course they cannot open.
   */
  protected readonly moduleAccessText = computed(() => {
    const access = this.moduleAccess();
    if (!access) return null;
    const account = this.accounts.sessionExpired() ? null : this.accounts.account();
    return accessLabelFor(access, accessViewerFor(account, this.pathId(), this.courseId()));
  });

  ngOnInit(): void {
    merge(this.route.paramMap, this.retryLoad.pipe(map(() => this.route.snapshot.paramMap)))
      .pipe(
        switchMap((params) => {
          this.course.set(null);
          this.module.set(null);
          this.questions.set([]);
          this.error.set('');
          this.recovery.set('temporary');
          const courseId = params.get('courseId') ?? 'core-java';
          const pathId = this.route.snapshot.data['pathId'] ?? 'learn';
          this.courseId.set(courseId);
          this.pathId.set(pathId);
          return forkJoin({
            catalog: this.contentService.getCatalog(pathId),
            course: this.contentService.getCourseOutline(pathId, courseId),
          }).pipe(
            switchMap((result) => {
              const moduleId = params.get('moduleId');
              if (!moduleId) throw new Error('Module not found');
              return of({
                ...result,
                questions: result.course.questions.filter((item) => item.moduleId === moduleId),
              });
            }),
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
        next: ({ catalog, course, questions }) => this.displayModule(catalog, course, questions),
      });
  }

  private displayModule(
    catalog: CatalogItem[],
    course: CourseOutline,
    questions: ContentItemSummary[],
  ): void {
    const moduleId = this.route.snapshot.paramMap.get('moduleId');
    const selectedModule = course.modules.find(({ id }) => id === moduleId);
    if (!selectedModule) {
      this.recovery.set('missing');
      this.error.set('Module not found.');
      return;
    }
    this.course.set(course);
    this.module.set(selectedModule);
    this.parentSection.set(
      course.sections?.find((section) => section.moduleIds.includes(selectedModule.id)) ?? null,
    );
    const trackModules = this.parentSection()
      ? course.modules.filter((module) => this.parentSection()!.moduleIds.includes(module.id))
      : course.modules;
    const selectedIndex = trackModules.findIndex(({ id }) => id === selectedModule.id);
    this.previousModule.set(trackModules[selectedIndex - 1] ?? null);
    this.nextModule.set(trackModules[selectedIndex + 1] ?? null);
    this.isFirstModuleInTrack.set(selectedIndex === 0);
    this.isLastModuleInTrack.set(selectedIndex === trackModules.length - 1);
    this.questions.set(
      questions
        .filter((question) => !isTheoryArticle(question))
        .sort((left, right) => left.order - right.order),
    );

    const currentCatalogIndex = catalog.findIndex(({ id }) => id === course.id);
    this.nextCourse.set(catalog[currentCatalogIndex + 1] ?? null);
  }

  protected catalogRoute(): string[] {
    const section = this.parentSection();
    return section
      ? ['/', this.pathId(), this.courseId(), 'section', section.id]
      : ['/', this.pathId(), this.courseId()];
  }

  protected pathLabel(): string {
    return this.pathId() === 'grow'
      ? 'Grow'
      : this.pathId() === 'blaze'
        ? 'Blaze'
        : 'Learn';
  }

  protected questionFilterTags(question: ContentItemSummary): string[] {
    const isPracticeModule =
      this.course()?.learningUnits?.some(
        ({ practiceModuleId }) => practiceModuleId === this.module()?.id,
      ) ?? false;
    const contentType = isPracticeModule
      ? 'Practice'
      : question.contentType === 'q-and-a' || !question.contentType
        ? 'Q&A'
        : question.contentType === 'dsa-pattern'
          ? 'DSA pattern'
          : question.contentType === 'system-design'
            ? 'System design'
            : question.contentType === 'language-comparison'
              ? 'Language comparison'
              : question.contentType === 'guide'
                ? 'Guide'
                : 'Theory';
    const path =
      this.pathId() === 'grow' ? 'Grow' : this.pathId() === 'learn' ? 'Learn' : 'Blaze';
    const seen = new Set<string>();
    return [path, contentType, question.difficulty, ...question.tags].filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
