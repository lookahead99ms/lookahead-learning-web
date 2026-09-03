import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { highlightLearn, reviewStatusLabel } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { CatalogItem } from '../../content/content.models';
import { LEARN_COURSE_GROUPS, LearnCourseGroup } from '../../content/learn-course-groups';

@Component({
  selector: 'app-learn',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './learn.html',
  styles: [
    `
      .question-library-callout {
        width: min(1180px, 88vw);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        margin: 12px auto 20px;
        padding: 18px 20px;
        border: 1px solid var(--line);
        border-left: 4px solid var(--search-primary);
        border-radius: 14px;
        color: var(--text-strong);
        background: linear-gradient(110deg, var(--surface-accent), var(--surface));
        text-decoration: none;
      }
      .question-library-callout strong,
      .question-library-callout small {
        display: block;
      }
      .question-library-callout strong {
        font-size: 1.02rem;
      }
      .question-library-callout small {
        margin-top: 4px;
        color: var(--muted);
        line-height: 1.45;
      }
      .question-library-callout > span:last-child {
        flex: 0 0 auto;
        color: var(--search-primary);
        font-size: 0.84rem;
        font-weight: 800;
      }
      .question-library-callout:hover,
      .question-library-callout:focus-visible {
        border-color: var(--search-primary);
        box-shadow: 0 10px 24px rgba(102, 153, 204, 0.13);
        outline: none;
      }
      @media (max-width: 700px) {
        .question-library-callout {
          align-items: flex-start;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
        }
      }
    `,
  ],
})
export class Learn implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  protected readonly courses = signal<CatalogItem[] | null>(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;
  protected readonly highlightLearn = highlightLearn;
  protected readonly expandedGroups = signal<Set<string>>(new Set());
  protected readonly courseGroups = LEARN_COURSE_GROUPS;

  ngOnInit(): void {
    this.content.getCatalog('learn').subscribe({
      next: (courses) => this.courses.set(courses),
      error: () => this.error.set('The Learn catalog could not be loaded. Please try again.'),
    });
    this.route.queryParamMap.subscribe((params) => {
      const groupId = params.get('group');
      const group = this.courseGroups.find((candidate) => candidate.id === groupId);
      if (!group) return;
      this.expandedGroups.update((current) => new Set(current).add(group.title));
      this.scrollToGroup(group.id);
    });
  }

  protected coursesFor(group: LearnCourseGroup, courses: CatalogItem[]): CatalogItem[] {
    const byId = new Map(courses.map((course) => [course.id, course]));
    return group.courseIds.flatMap((id) => byId.get(id) ?? []);
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

  private scrollToGroup(groupId: string, attempts = 8): void {
    requestAnimationFrame(() => {
      const element = document.getElementById(`learn-group-${groupId}`);
      if (!element && attempts > 0) {
        this.scrollToGroup(groupId, attempts - 1);
        return;
      }
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}
