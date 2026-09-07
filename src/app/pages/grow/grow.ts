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
import { reviewStatusLabel } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { CatalogOverviewItem } from '../../content/content.models';
import { GROW_COURSE_GROUPS, GrowCourseGroup } from '../../content/grow-course-groups';

@Component({
  selector: 'app-grow',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './grow.html',
  styleUrl: '../catalog-experience.css',
})
export class Grow implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pendingGroupId: string | null = null;
  private navigationScrollPending = true;
  private scrollRequest?: AfterRenderRef;
  protected readonly capabilities = signal<CatalogOverviewItem[] | null>(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;
  protected readonly expandedGroups = signal<Set<string>>(new Set(['Backend Engineering']));
  protected readonly capabilityGroups = GROW_COURSE_GROUPS;

  ngOnInit(): void {
    this.content
      .getCatalogOverview('grow')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (capabilities) => {
          this.capabilities.set(capabilities);
          if (this.pendingGroupId) this.scrollToGroup(this.pendingGroupId);
        },
        error: () => this.error.set('The Grow catalog could not be loaded. Please try again.'),
      });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const groupId = params.get('group');
      const group = this.capabilityGroups.find((candidate) => candidate.id === groupId);
      this.pendingGroupId = group?.id ?? null;
      this.navigationScrollPending = true;
      this.scrollRequest?.destroy();
      if (!group) return;
      this.expandedGroups.update((current) => new Set(current).add(group.title));
    });
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof Scroll)) return;
      // Reveal the group after the app's router has performed its default scroll-to-top.
      this.navigationScrollPending = false;
      if (this.pendingGroupId) this.scrollToGroup(this.pendingGroupId);
    });
  }

  protected capabilitiesFor(
    group: GrowCourseGroup,
    capabilities: CatalogOverviewItem[],
  ): CatalogOverviewItem[] {
    const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
    return group.courseIds.flatMap((id) => byId.get(id) ?? []);
  }
  protected totalLessons(capabilities: CatalogOverviewItem[]): number {
    return capabilities.reduce((total, capability) => total + capability.lessonCount, 0);
  }
  protected totalQuestions(capabilities: CatalogOverviewItem[]): number {
    return capabilities.reduce((total, capability) => total + capability.questionCount, 0);
  }
  protected lessonsFor(group: GrowCourseGroup, capabilities: CatalogOverviewItem[]): number {
    return this.capabilitiesFor(group, capabilities).reduce(
      (total, capability) => total + capability.lessonCount,
      0,
    );
  }
  protected questionsFor(group: GrowCourseGroup, capabilities: CatalogOverviewItem[]): number {
    return this.capabilitiesFor(group, capabilities).reduce(
      (total, capability) => total + capability.questionCount,
      0,
    );
  }
  protected isExpanded(group: GrowCourseGroup): boolean {
    return this.expandedGroups().has(group.title);
  }
  protected toggleGroup(group: GrowCourseGroup): void {
    this.expandedGroups.update((current) => {
      const next = new Set(current);
      next.has(group.title) ? next.delete(group.title) : next.add(group.title);
      return next;
    });
  }

  protected repeatJump(event: MouseEvent, group: GrowCourseGroup): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    // The router ignores an unchanged URL; a repeated jump must still open and reveal its group.
    if (this.route.snapshot.queryParamMap.get('group') !== group.id) return;
    this.expandedGroups.update((current) => new Set(current).add(group.title));
    this.scrollToGroup(group.id);
  }

  private scrollToGroup(groupId: string): void {
    this.scrollRequest?.destroy();
    if (this.navigationScrollPending || !this.capabilities()?.length) return;
    this.scrollRequest = afterNextRender(
      () => {
        const host = this.host.nativeElement;
        const element = host.querySelector<HTMLElement>(`#grow-group-${groupId}`);
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
