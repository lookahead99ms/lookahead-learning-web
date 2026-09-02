import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { growTagline, highlightGrow, reviewStatusLabel } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { CatalogItem } from '../../content/content.models';
import { GROW_COURSE_GROUPS, GrowCourseGroup } from '../../content/grow-course-groups';

@Component({ selector: 'app-grow', imports: [PlatformHeader, RouterLink], templateUrl: './grow.html' })
export class Grow implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  protected readonly capabilities = signal<CatalogItem[] | null>(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;
  protected readonly highlightGrow = highlightGrow;
  protected readonly growTagline = growTagline;
  protected readonly expandedGroups = signal<Set<string>>(new Set());
  protected readonly capabilityGroups = GROW_COURSE_GROUPS;

  ngOnInit(): void {
    this.content.getCatalog('grow').subscribe({
      next: (capabilities) => this.capabilities.set(capabilities),
      error: () => this.error.set('The Grow catalog could not be loaded. Please try again.'),
    });
    this.route.queryParamMap.subscribe((params) => {
      const groupId = params.get('group');
      const group = this.capabilityGroups.find((candidate) => candidate.id === groupId);
      if (!group) return;
      this.expandedGroups.update((current) => new Set(current).add(group.title));
      this.scrollToGroup(group.id);
    });
  }

  protected capabilitiesFor(group: GrowCourseGroup, capabilities: CatalogItem[]): CatalogItem[] {
    const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
    return group.courseIds.flatMap((id) => byId.get(id) ?? []);
  }
  protected isExpanded(group: GrowCourseGroup): boolean { return this.expandedGroups().has(group.title); }
  protected toggleGroup(group: GrowCourseGroup): void {
    this.expandedGroups.update((current) => {
      const next = new Set(current);
      next.has(group.title) ? next.delete(group.title) : next.add(group.title);
      return next;
    });
  }

  private scrollToGroup(groupId: string, attempts = 8): void {
    requestAnimationFrame(() => {
      const element = document.getElementById(`grow-group-${groupId}`);
      if (!element && attempts > 0) {
        this.scrollToGroup(groupId, attempts - 1);
        return;
      }
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}
