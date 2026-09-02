import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { CourseContent, CourseModule, CourseSection as ContentSection, reviewStatusLabel } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-course-section',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './course-section.html',
  styles: [`
    .section-parent-link { margin: 0 0 3px; }
    .section-title { font-size: clamp(1.35rem, 2.1vw, 2rem); }
    .section-description { margin: 6px 0 0; max-width: 780px; color: var(--muted); font-size: .95rem; line-height: 1.55; }
    .section-item { display: flex; min-height: 190px; flex-direction: column; }
    .section-item h2 { margin: 0 0 12px; color: var(--text-strong); font-size: 1.22rem; }
    .section-item p { margin: 0; color: var(--muted); line-height: 1.55; }
    .section-item-action { margin-top: auto; padding-top: 18px; color: var(--search-primary); font-size: .84rem; font-weight: 800; }
  `],
})
export class CourseSection implements OnInit {
  private readonly contentService = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  protected readonly course = signal<CourseContent | null>(null);
  protected readonly section = signal<ContentSection | null>(null);
  protected readonly modules = signal<CourseModule[]>([]);
  protected readonly courseId = signal('');
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;

  ngOnInit(): void {
    this.route.paramMap.pipe(
      switchMap((params) => {
        this.courseId.set(params.get('courseId') ?? 'big-o-analysis');
        return this.contentService.getCourse('learn', this.courseId());
      }),
    ).subscribe({
      next: (course) => this.display(course),
      error: () => this.error.set('The learning content could not be loaded.'),
    });
  }

  private display(course: CourseContent): void {
    const sectionId = this.route.snapshot.paramMap.get('sectionId');
    const section = course.sections?.find(({ id }) => id === sectionId);
    if (!section) {
      this.error.set('Content section not found.');
      return;
    }
    this.course.set(course);
    this.section.set(section);
    const moduleById = new Map(course.modules.map((module) => [module.id, module]));
    const modulesWithContent = new Set(course.questions.map(({ moduleId }) => moduleId));
    this.modules.set(
      section.moduleIds
        .map((id) => moduleById.get(id))
        .filter((module): module is CourseModule => Boolean(module))
        // Hide unfinished roadmap modules: a module with no published questions
        // (or explicitly marked "planned") is not ready for navigation yet.
        .filter((module) => module.reviewStatus !== 'planned' && modulesWithContent.has(module.id)),
    );
  }
}
