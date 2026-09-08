import {
  AfterRenderRef,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, Scroll } from '@angular/router';
import { CatalogCourseGroup } from '../../content/catalog-course-groups';
import {
  CatalogOverviewItem,
  ContentPath,
  highlightLearn,
  reviewStatusLabel,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';

export interface CatalogAction {
  label: string;
  routerLink: string;
  queryParams?: Record<string, string>;
  groupId?: string;
}

export interface AdaptiveCatalogConfig {
  path: ContentPath;
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  actionsLabel: string;
  primaryAction: CatalogAction;
  secondaryActions: CatalogAction[];
  metricsLabel: string;
  courseMetricLabel: string;
  lessonMetricLabel: string;
  questionMetricLabel: string;
  jumpLabel: string;
  sectionEyebrow: string;
  previewLabel: string;
  previewAriaLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  errorDescription: string;
  loadingDescription: string;
}

@Component({
  selector: 'app-adaptive-catalog',
  imports: [RouterLink],
  templateUrl: './adaptive-catalog.html',
  styleUrl: '../../pages/catalog-experience.css',
})
export class AdaptiveCatalog implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pendingGroupId: string | null = null;
  private navigationScrollPending = true;
  private scrollRequest?: AfterRenderRef;

  readonly config = input.required<AdaptiveCatalogConfig>();
  readonly groups = input.required<readonly CatalogCourseGroup[]>();

  protected readonly catalog = signal<CatalogOverviewItem[] | null>(null);
  protected readonly error = signal('');
  protected readonly reviewStatusLabel = reviewStatusLabel;

  ngOnInit(): void {
    this.content
      .getCatalogOverview(this.config().path)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) => {
          this.catalog.set(catalog);
          if (this.pendingGroupId) this.scrollToGroup(this.pendingGroupId);
        },
        error: () => this.error.set(this.config().errorDescription),
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const groupId = params.get('group');
      const group = this.groups().find((candidate) => candidate.id === groupId);
      this.pendingGroupId = group?.id ?? null;
      this.navigationScrollPending = true;
      this.scrollRequest?.destroy();
    });

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof Scroll)) return;
      this.navigationScrollPending = false;
      if (this.pendingGroupId) this.scrollToGroup(this.pendingGroupId);
    });
  }

  protected itemsFor(
    group: CatalogCourseGroup,
    catalog: CatalogOverviewItem[],
  ): CatalogOverviewItem[] {
    const byId = new Map(catalog.map((item) => [item.id, item]));
    return group.courseIds.flatMap((id) => byId.get(id) ?? []);
  }

  protected totalLessons(catalog: CatalogOverviewItem[]): number {
    return catalog.reduce((total, item) => total + item.lessonCount, 0);
  }

  protected totalQuestions(catalog: CatalogOverviewItem[]): number {
    return catalog.reduce((total, item) => total + item.questionCount, 0);
  }

  protected lessonsFor(group: CatalogCourseGroup, catalog: CatalogOverviewItem[]): number {
    return this.itemsFor(group, catalog).reduce((total, item) => total + item.lessonCount, 0);
  }

  protected questionsFor(group: CatalogCourseGroup, catalog: CatalogOverviewItem[]): number {
    return this.itemsFor(group, catalog).reduce((total, item) => total + item.questionCount, 0);
  }

  protected descriptionFor(item: CatalogOverviewItem): string {
    return this.config().path === 'learn'
      ? highlightLearn(item.description)
      : (item.description ?? '');
  }

  protected cardClass(): string {
    return `${this.config().path}-course-card`;
  }

  protected repeatJump(event: MouseEvent, groupId: string | undefined): void {
    if (
      !groupId ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (this.route.snapshot.queryParamMap.get('group') !== groupId) return;
    this.scrollToGroup(groupId);
  }

  private scrollToGroup(groupId: string): void {
    this.scrollRequest?.destroy();
    if (this.navigationScrollPending || !this.catalog()?.length) return;
    this.scrollRequest = afterNextRender(
      () => {
        const host = this.host.nativeElement;
        const element = host.querySelector<HTMLElement>(`#${this.config().path}-group-${groupId}`);
        if (!element) return;
        const sticky = host.querySelector<HTMLElement>('.catalog-sticky-utility');
        const view = host.ownerDocument.defaultView;
        const stickyTop = sticky && view ? parseFloat(view.getComputedStyle(sticky).top) || 0 : 0;
        element.style.scrollMarginTop = `${stickyTop + (sticky?.getBoundingClientRect().height ?? 0) + 12}px`;
        element.querySelector<HTMLElement>('.catalog-path-title')?.focus({ preventScroll: true });
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
