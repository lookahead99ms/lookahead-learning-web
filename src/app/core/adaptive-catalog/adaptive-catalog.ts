import { ContentRecovery, RecoveryKind, recoveryKind } from '../content-recovery/content-recovery';
import {
  AfterRenderRef,
  Component,
  computed,
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
import { CardScene } from '../card-scene/card-scene';
import { PageSidebarContextDirective } from '../page-sidebars/page-sidebar-context';
import { withoutHiddenCourses } from '../../content/hidden-courses';
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

export interface CatalogQuestionCountDisplay {
  value: number;
  minimum: boolean;
}

/**
 * Keep catalog promises conservative without changing the published inventory.
 * Clean totals stay exact; irregular totals use a lower milestone so the learner
 * always receives more questions than the catalog promises.
 */
export function catalogQuestionCountDisplay(questionCount: number): CatalogQuestionCountDisplay {
  const exactCount = Math.max(0, Math.round(questionCount));
  if (exactCount <= 10 || exactCount % 5 === 0 || exactCount === 36) {
    return { value: exactCount, minimum: false };
  }

  if (exactCount === 37) {
    return { value: 36, minimum: true };
  }

  const milestoneSize = exactCount < 100 ? 5 : exactCount < 250 ? 25 : 50;
  return {
    value: Math.floor(exactCount / milestoneSize) * milestoneSize,
    minimum: true,
  };
}

/** Section id for catalog courses that no authored group lists. */
export const UNGROUPED_SECTION_ID = 'more';

const MONOGRAM_SKIP = new Set(['a', 'an', 'and', 'the', 'of', 'for', 'to', 'with', 'in', 'on']);

/**
 * Short initials shown when a catalog scene is missing: "Core Java" -> "CJ",
 * "SQL" -> "SQL", "Linux" -> "L". Never more than three characters.
 */
export function catalogMonogram(title: string): string {
  const words = title
    .split(/[\s/_-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const significant = words.filter((word) => !MONOGRAM_SKIP.has(word.toLowerCase()));
  const picked = significant.length ? significant : words;
  if (!picked.length) return '';
  if (picked.length === 1) {
    const [word] = picked;
    return /^[\p{Lu}\p{N}]{2,3}$/u.test(word) ? word : word[0].toUpperCase();
  }
  return picked
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

@Component({
  selector: 'app-adaptive-catalog',
  imports: [CardScene, ContentRecovery, RouterLink, PageSidebarContextDirective],
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
  protected readonly recovery = signal<RecoveryKind>('temporary');
  /** Authored groups, plus a "More to explore" section for catalog courses no group lists. */
  protected readonly sections = computed<readonly CatalogCourseGroup[]>(() => {
    const groups = this.groups();
    const assigned = new Set(groups.flatMap((group) => group.courseIds));
    const rest = (this.catalog() ?? []).filter((item) => item.id && !assigned.has(item.id));
    if (!rest.length) return groups;
    return [
      ...groups,
      {
        id: UNGROUPED_SECTION_ID,
        title: 'More to explore',
        description: 'More courses on this path that sit outside the groups above.',
        courseIds: rest.flatMap((item) => (item.id ? [item.id] : [])),
      },
    ];
  });
  protected readonly monogram = catalogMonogram;
  protected readonly sidebarContext = computed(() => ({
    excluded: false,
    groupLabel: this.config().path === 'learn' ? 'Foundation Tracks'
      : this.config().path === 'grow' ? 'Production Capabilities' : 'Senior-readiness Tracks',
    groups: this.sections().map((group) => ({
      id: group.id,
      sectionId: `${this.config().path}-group-${group.id}-heading`,
      title: group.title,
      courses: this.itemsFor(group, this.catalog() ?? [])
        .filter((item) => item.available !== false)
        .flatMap((item) => item.id ? [{ id: item.id, title: item.title, url: `/${this.config().path}/${item.id}` }] : []),
    })).filter((group) => group.courses.length > 0),
  }));
  protected readonly reviewStatusLabel = reviewStatusLabel;

  ngOnInit(): void {
    this.loadCatalog();

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const groupId = params.get('group');
      const known =
        groupId === UNGROUPED_SECTION_ID ||
        this.groups().some((candidate) => candidate.id === groupId);
      this.pendingGroupId = known ? groupId : null;
      this.navigationScrollPending = true;
      this.scrollRequest?.destroy();
    });

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof Scroll)) return;
      this.navigationScrollPending = false;
      if (this.pendingGroupId) this.scrollToGroup(this.pendingGroupId);
    });
  }

  protected retryCatalog(): void {
    this.loadCatalog();
  }

  private loadCatalog(): void {
    this.catalog.set(null);
    this.error.set('');
    this.content
      .getCatalogOverview(this.config().path)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) => {
          this.catalog.set(withoutHiddenCourses(this.config().path, catalog));
          if (this.pendingGroupId) this.scrollToGroup(this.pendingGroupId);
        },
        error: (error) => { this.recovery.set(recoveryKind(error)); this.error.set(this.config().errorDescription); },
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

  protected questionCountText(questionCount: number, showMinimumMarker = true): string {
    const display = catalogQuestionCountDisplay(questionCount);
    return `${display.value}${display.minimum && showMinimumMarker ? '+' : ''}`;
  }

  protected questionCountLabel(questionCount: number): string {
    const display = catalogQuestionCountDisplay(questionCount);
    return `${display.value === 1 ? 'question' : 'questions'}`;
  }

  protected questionCountTitle(questionCount: number): string | null {
    return catalogQuestionCountDisplay(questionCount).minimum
      ? `Exact published total: ${questionCount} questions`
      : null;
  }

  protected questionCountAriaLabel(questionCount: number): string | null {
    const display = catalogQuestionCountDisplay(questionCount);
    return display.minimum
      ? `More than ${display.value} questions; exact published total ${questionCount} questions`
      : null;
  }

  protected descriptionFor(item: CatalogOverviewItem): string {
    return this.config().path === 'learn'
      ? highlightLearn(item.description)
      : (item.description ?? '');
  }

  protected groupScene(group: CatalogCourseGroup): string {
    return `/assets/scenes/groups/${this.config().path}-${group.id}.svg`;
  }

  protected courseScene(item: CatalogOverviewItem): string {
    return `/assets/scenes/courses/${this.config().path}-${item.id}.svg`;
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
