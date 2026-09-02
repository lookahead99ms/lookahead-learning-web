import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { highlightLearn, reviewStatusLabel } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { CatalogItem } from '../../content/content.models';
import { LEARN_COURSE_GROUPS, LearnCourseGroup } from '../../content/learn-course-groups';

@Component({ selector: 'app-learn', imports: [PlatformHeader, RouterLink], templateUrl: './learn.html' })
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
  protected isExpanded(group: LearnCourseGroup): boolean { return this.expandedGroups().has(group.title); }
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
