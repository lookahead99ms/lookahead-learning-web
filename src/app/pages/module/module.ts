import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, forkJoin, switchMap } from 'rxjs';
import {
  CatalogItem,
  CourseContent,
  CourseModule,
  CourseSection,
  InterviewQuestion,
  reviewStatusLabel,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { questionsForModule } from '../../content/question-discovery';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-module',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './module.html',
  styles: [
    `
      .module-navigation-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--line);
      }
      .module-previous-link {
        min-width: 0;
        color: var(--muted);
        font-size: 0.75rem;
        line-height: 18px;
        text-decoration: none;
      }
      .module-previous-link strong {
        font-weight: 600;
      }
      .module-previous-link:hover,
      .module-previous-link:focus-visible {
        color: var(--search-hover);
        outline: none;
      }
      .module-action-group {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        min-width: 0;
        margin-left: auto;
      }
      .module-catalog-link,
      .module-next-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        box-sizing: border-box;
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 0.75rem;
        line-height: 18px;
        text-decoration: none;
        white-space: nowrap;
      }
      .module-catalog-link {
        border: 1px solid var(--line);
        color: var(--text-strong);
        background: var(--surface);
        font-weight: 500;
      }
      .module-next-link {
        display: inline;
        height: auto;
        padding: 0;
        border: 0;
        border-radius: 0;
        color: var(--muted);
        background: transparent;
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 18px;
        text-decoration: none;
        white-space: normal;
      }
      .module-catalog-link:hover,
      .module-catalog-link:focus-visible {
        background: var(--surface-subtle);
        outline: none;
      }
      .module-next-link:hover,
      .module-next-link:focus-visible {
        color: var(--search-hover);
        background: transparent;
        outline: none;
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
  private readonly router = inject(Router);
  protected readonly courseId = signal('');
  protected readonly pathId = signal('learn');
  protected readonly course = signal<CourseContent | null>(null);
  protected readonly module = signal<CourseModule | null>(null);
  protected readonly parentSection = signal<CourseSection | null>(null);
  protected readonly questions = signal<InterviewQuestion[]>([]);
  protected readonly previousModule = signal<CourseModule | null>(null);
  protected readonly nextModule = signal<CourseModule | null>(null);
  protected readonly nextCourse = signal<CatalogItem | null>(null);
  protected readonly isFirstModuleInTrack = signal(false);
  protected readonly isLastModuleInTrack = signal(false);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.course.set(null);
          this.module.set(null);
          this.questions.set([]);
          this.error.set('');
          const courseId = params.get('courseId') ?? 'core-java';
          const pathId = this.route.snapshot.data['pathId'] ?? 'learn';
          this.courseId.set(courseId);
          this.pathId.set(pathId);
          return forkJoin({
            catalog: this.contentService.getCatalog(pathId),
            course: this.contentService.getCourse(pathId, courseId),
          }).pipe(
            catchError(() => {
              this.error.set('The learning content could not be loaded.');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ catalog, course }) => this.displayModule(catalog, course),
      });
  }

  private displayModule(catalog: CatalogItem[], course: CourseContent): void {
    const moduleId = this.route.snapshot.paramMap.get('moduleId');
    const selectedModule = course.modules.find(({ id }) => id === moduleId);
    if (!selectedModule) {
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
    this.questions.set(questionsForModule(course, selectedModule.id));

    const currentCatalogIndex = catalog.findIndex(({ id }) => id === course.id);
    this.nextCourse.set(catalog[currentCatalogIndex + 1] ?? null);
  }

  protected openQuestion(question: InterviewQuestion): void {
    this.router.navigate(['/', this.pathId(), this.courseId(), question.id]);
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
      : this.pathId() === 'look-ahead'
        ? 'Look Ahead'
        : 'Learn';
  }

  protected questionFilterTags(question: InterviewQuestion): string[] {
    const contentType =
      question.contentType === 'q-and-a' || !question.contentType
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
      this.pathId() === 'grow' ? 'Grow' : this.pathId() === 'learn' ? 'Learn' : 'Look Ahead';
    const seen = new Set<string>();
    return [path, contentType, question.difficulty, ...question.tags].filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
