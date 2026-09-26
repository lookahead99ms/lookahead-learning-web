import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  AfterViewInit,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentService } from '../../content/content.service';
import { PROTECTED_CONTENT } from '../../content/content-delivery';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  CodeSolution,
  ContentPath,
  ContentType,
  DiscoveryKind,
  InterviewQuestion,
  PatternLanguage,
  PracticeFormat,
  SearchDocument,
} from '../../content/content.models';
import { PlatformHeader } from '../../core/platform-header/platform-header';

type SearchSort = 'relevance' | 'title' | 'difficulty';
type SearchGroup = 'none' | 'path' | 'course' | 'module' | 'tag' | 'content-type';
type SearchContentType = 'all' | ContentType;
type SearchDiscoveryKind = 'all' | DiscoveryKind;
type SearchPracticeFormat = 'all' | PracticeFormat;
type SearchDifficulty = 'all' | 'Beginner' | 'Intermediate' | 'Advanced';
type SearchLanguage = 'all' | PatternLanguage | 'unspecified';
const RESULT_PAGE_SIZE = 40;
const VISIBLE_TAG_LIMIT = 60;

@Component({
  selector: 'app-search',
  imports: [PlatformHeader, FormsModule, RouterLink, NgTemplateOutlet],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class Search implements OnInit, AfterViewInit {
  @ViewChild('searchPage') private searchPage?: ElementRef<HTMLElement>;
  @ViewChild('searchHeading') private searchHeading?: ElementRef<HTMLElement>;
  @ViewChild('modeFilterRow') private modeFilterRow?: ElementRef<HTMLElement>;
  @ViewChild('filterDetails') private filterDetails?: ElementRef<HTMLDetailsElement>;
  private readonly content = inject(ContentService);
  private readonly protectedContent = inject(PROTECTED_CONTENT);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlSyncInfo = {};
  private readonly router = inject(Router);
  protected readonly questions = signal<SearchDocument[]>([]);
  protected readonly reviewUnit = signal('');
  protected readonly reviewContext = computed(() => {
    if (this.selectedDiscoveryKind() !== 'practice') return null;
    const item = this.questions().find((item) => item.path === this.selectedPath()
      && item.courseId === this.selectedCourseId() && item.moduleId === this.selectedModuleId());
    if (!item) return null;
    const unit = this.reviewUnit() || item.moduleId;
    if (!/^[a-zA-Z0-9_-]+$/.test(unit)) return null;
    return { title: item.moduleTitle, route: ['/', item.path, item.courseId], fragment: 'unit-' + unit };
  });
  protected readonly query = signal('');
  protected readonly submittedQuery = signal('');
  protected readonly selectedPath = signal<'all' | ContentPath>('all');
  private indexRequestVersion = 0;
  private indexPath: 'uninitialized' | 'all' | ContentPath = 'uninitialized';
  protected readonly selectedTags = signal(new Set<string>());
  protected readonly tagQuery = signal('');
  protected readonly selectedContentType = signal<SearchContentType>('all');
  protected readonly selectedDiscoveryKind = signal<SearchDiscoveryKind>('all');
  protected readonly selectedPracticeFormat = signal<SearchPracticeFormat>('all');
  protected readonly selectedCourseId = signal('all');
  protected readonly selectedModuleId = signal('all');
  protected readonly selectedDifficulty = signal<SearchDifficulty>('all');
  protected readonly selectedLanguage = signal<SearchLanguage>('all');
  protected readonly sortBy = signal<SearchSort>('relevance');
  protected readonly groupBy = signal<SearchGroup>('none');
  protected readonly expandedResults = signal(new Set<string>());
  protected readonly visibleResultLimit = signal(RESULT_PAGE_SIZE);
  protected readonly selectedPreviewId = signal<string | null>(null);
  protected readonly detailsOpen = signal(false);
  protected readonly compactPreview = signal(this.isCompactViewport());
  protected readonly loadedQuestions = signal(new Map<string, InterviewQuestion>());
  protected readonly loadingQuestions = signal(new Set<string>());
  protected readonly questionErrors = signal(new Map<string, 'sign-in' | 'unavailable'>());
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private readonly selectedAnswerRequest = effect(() => {
    const selected = this.selectedPreview();
    if (
      !selected ||
      this.loading() ||
      !this.canPreviewAnswer(selected)
    )
      return;
    untracked(() => this.loadQuestion(selected));
  });
  protected readonly selectedFilterCount = computed(
    () =>
      this.selectedTags().size +
      [
        this.selectedPath(),
        this.selectedContentType(),
        this.selectedDiscoveryKind(),
        this.selectedPracticeFormat(),
        this.selectedCourseId(),
        this.selectedModuleId(),
        this.selectedDifficulty(),
        this.selectedLanguage(),
      ].filter((value) => value !== 'all').length,
  );

  protected readonly availableCourses = computed(() => {
    const path = this.selectedPath();
    const courses = new Map<string, string>();
    for (const result of this.questions().flatMap((item) => item.practicePlacements ?? [item])) {
      if (path === 'all' || result.path === path) courses.set(result.courseId, result.courseTitle);
    }
    return [...courses.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((left, right) => left.title.localeCompare(right.title));
  });

  protected readonly availableModules = computed(() => {
    const path = this.selectedPath();
    const courseId = this.selectedCourseId();
    const modules = new Map<string, string>();
    for (const result of this.questions().flatMap((item) => item.practicePlacements ?? [item])) {
      if (path !== 'all' && result.path !== path) continue;
      if (courseId !== 'all' && result.courseId !== courseId) continue;
      modules.set(result.moduleId, result.moduleTitle);
    }
    return [...modules.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((left, right) => left.title.localeCompare(right.title));
  });

  protected readonly unqueriedScopeResults = computed(() => {
    const path = this.selectedPath();
    const contentType = this.selectedContentType();
    return this.questions()
      .map((result) => {
        const placement = result.practicePlacements?.find(
          (item) =>
            (path === 'all' || item.path === path) &&
            (this.selectedCourseId() === 'all' || item.courseId === this.selectedCourseId()) &&
            (this.selectedModuleId() === 'all' || item.moduleId === this.selectedModuleId()),
        );
        return placement ? { ...result, ...placement } : result;
      })
      .filter((result) => path === 'all' || result.path === path)
      .filter(
        (result) =>
          this.selectedCourseId() === 'all' || result.courseId === this.selectedCourseId(),
      )
      .filter(
        (result) =>
          this.selectedModuleId() === 'all' || result.moduleId === this.selectedModuleId(),
      )
      .filter(
        (result) =>
          this.selectedDifficulty() === 'all' || result.difficulty === this.selectedDifficulty(),
      )
      .filter(
        (result) =>
          this.selectedLanguage() === 'all' ||
          (this.selectedLanguage() === 'unspecified' && result.languages.length === 0) ||
          result.languages.includes(this.selectedLanguage() as PatternLanguage),
      )
      .filter((result) => contentType === 'all' || result.contentType === contentType)
      .filter(
        (result) =>
          this.selectedDiscoveryKind() === 'all' ||
          this.discoveryKind(result) === this.selectedDiscoveryKind(),
      )
      .filter(
        (result) =>
          this.selectedPracticeFormat() === 'all' ||
          this.practiceFormat(result) === this.selectedPracticeFormat(),
      );
  });

  protected readonly scopeResults = computed(() => {
    const query = this.submittedQuery();
    return this.unqueriedScopeResults()
      .map((result) => ({ result, score: this.score(result, query) }))
      .filter(({ score }) => !query || score > 0)
      .map(({ result }) => result);
  });

  protected readonly availableTags = computed(() => {
    const selectedTags = this.selectedTags();
    let candidates = this.scopeResults().filter((result) =>
      [...selectedTags].every((tag) => this.hasFilter(result, tag)),
    );
    if (!candidates.length) candidates = this.unqueriedScopeResults();
    const labels = new Map<string, { label: string; count: number }>();
    for (const result of candidates) {
      for (const label of this.subjectLabels(result)) {
        const key = this.normalize(label);
        const current = labels.get(key);
        labels.set(key, {
          label: current?.label ?? label,
          count: (current?.count ?? 0) + 1,
        });
      }
    }
    // Keep active subjects visible even when another filter has no matches.
    for (const label of selectedTags) {
      const key = this.normalize(label);
      if (!labels.has(key)) labels.set(key, { label, count: 0 });
    }
    return [...labels.values()]
      .sort((left, right) => {
        const leftSelected = this.isTagSelected(left.label) ? 1 : 0;
        const rightSelected = this.isTagSelected(right.label) ? 1 : 0;
        return (
          rightSelected - leftSelected ||
          right.count - left.count ||
          left.label.localeCompare(right.label)
        );
      })
      .map(({ label }) => label);
  });

  protected readonly visibleTags = computed(() => {
    const query = this.normalize(this.tagQuery());
    return this.availableTags()
      .filter((tag) => !query || this.normalize(tag).includes(query))
      .slice(0, VISIBLE_TAG_LIMIT);
  });

  protected readonly groups = computed(() => {
    const grouped = new Map<string, SearchDocument[]>();
    for (const result of this.visibleResults()) {
      const key = this.groupKey(result);
      grouped.set(key, [...(grouped.get(key) ?? []), result]);
    }
    return [...grouped.entries()].map(([label, results]) => ({ label, results }));
  });

  // Pinning changes only the presentation. The ranked results and their count stay intact.
  protected readonly remainingGroups = computed(() => {
    const selected = this.compactPreview() ? null : this.selectedPreview();
    if (!selected) return this.groups();
    return this.groups()
      .map((group) => ({
        ...group,
        results: group.results.filter((result) => this.resultKey(result) !== this.resultKey(selected)),
      }))
      .filter((group) => group.results.length > 0);
  });

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      // Internal updates already changed the filters; keep any unsubmitted text.
      // Navigation info is transient, unlike history state used by Back/Forward.
      if (this.router.currentNavigation()?.extras.info === this.urlSyncInfo) return;
      const initialQuery = params.get('q')?.trim().toLowerCase() ?? '';
      const initialTags = [...params.getAll('tag'), ...(params.get('tags')?.split(',') ?? [])]
        .map((tag) => tag.trim())
        .filter(Boolean);
      this.reviewUnit.set(params.get('unit') ?? '');
      this.query.set(initialQuery);
      this.submittedQuery.set(initialQuery);
      const initialPath =
        this.pathForFilter(params.get('path') ?? '') ??
        initialTags
          .map((tag) => this.pathForFilter(tag))
          .find((path): path is ContentPath => path !== null);
      const nextPath = initialPath ?? 'all';
      this.selectedPath.set(nextPath);
      this.selectedTags.set(new Set(initialTags.filter((tag) => this.pathForFilter(tag) === null)));
      this.selectedCourseId.set(params.get('course') ?? 'all');
      this.selectedModuleId.set(params.get('module') ?? 'all');
      this.selectedDifficulty.set(this.difficultyFromValue(params.get('difficulty')));
      this.selectedLanguage.set(this.languageFromValue(params.get('language')));
      this.selectedContentType.set(this.contentTypeFromValue(params.get('type')));
      this.selectedDiscoveryKind.set(this.discoveryKindFromValue(params.get('kind')));
      this.selectedPracticeFormat.set(this.practiceFormatFromValue(params.get('format')));
      this.sortBy.set(this.sortFromValue(params.get('sort')));
      this.groupBy.set(this.groupFromValue(params.get('group')));
      this.resetVisibleResults();
      this.selectedPreviewId.set(params.get('previewItem'));
      this.loadIndex(nextPath);
      this.validatePreviewSelection();
    });
  }

  ngAfterViewInit(): void {
    this.updateStickyOffsets();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.updateStickyOffsets());
    if (this.searchHeading) observer.observe(this.searchHeading.nativeElement);
    if (this.modeFilterRow) observer.observe(this.modeFilterRow.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private updateStickyOffsets(): void {
    const page = this.searchPage?.nativeElement;
    const heading = this.searchHeading?.nativeElement;
    const filters = this.modeFilterRow?.nativeElement;
    if (!page || !heading) return;
    const headingMargin = Number.parseFloat(getComputedStyle(heading).marginBottom) || 0;
    page.style.setProperty('--search-heading-stack', `${Math.ceil(heading.getBoundingClientRect().height + headingMargin)}px`);
    page.style.setProperty('--search-filter-height', `${Math.ceil(filters?.getBoundingClientRect().height ?? 0)}px`);
  }

  protected readonly results = computed(() => {
    const selectedTags = this.selectedTags();
    const matches = this.scopeResults()
      .filter((result) => [...selectedTags].every((tag) => this.hasFilter(result, tag)))
      .map((result) => ({ result, score: this.score(result, this.submittedQuery()) }));

    return matches
      .sort((left, right) => {
        if (this.sortBy() === 'title') return left.result.title.localeCompare(right.result.title);
        if (this.sortBy() === 'difficulty')
          return (
            this.difficultyScore(left.result.difficulty) -
            this.difficultyScore(right.result.difficulty)
          );
        return right.score - left.score || left.result.title.localeCompare(right.result.title);
      })
      .map(({ result }) => result);
  });

  protected readonly visibleResults = computed(() =>
    this.results().slice(0, this.visibleResultLimit()),
  );

  protected readonly selectedPreview = computed(() => {
    const id = this.selectedPreviewId();
    return id ? (this.visibleResults().find((result) => this.resultKey(result) === id) ?? null) : null;
  });

  protected readonly hasMoreResults = computed(
    () => this.visibleResults().length < this.results().length,
  );

  protected readonly nextResultCount = computed(() =>
    Math.min(RESULT_PAGE_SIZE, this.results().length - this.visibleResults().length),
  );

  protected updateQuery(value: string): void {
    this.query.set(value);
    const normalizedQuery = this.normalize(value);
    if (normalizedQuery === this.submittedQuery()) return;

    const hadScopedPath = this.selectedPath() !== 'all';
    this.submittedQuery.set(normalizedQuery);
    this.selectedPath.set('all');
    this.selectedCourseId.set('all');
    this.selectedModuleId.set('all');
    this.selectedDifficulty.set('all');
    this.selectedLanguage.set('all');
    this.selectedContentType.set('all');
    this.selectedDiscoveryKind.set('all');
    this.selectedPracticeFormat.set('all');
    this.selectedTags.set(new Set());
    this.tagQuery.set('');
    this.sortBy.set('relevance');
    this.groupBy.set('none');
    this.expandedResults.set(new Set());
    this.selectedPreviewId.set(null);
    this.resetVisibleResults();
    if (hadScopedPath) this.loadIndex('all');
    this.syncUrl();
  }

  protected updateTagQuery(value: string): void {
    this.tagQuery.set(value);
  }

  protected updatePath(value: string): void {
    this.reviewUnit.set('');
    const path = value as 'all' | ContentPath;
    this.setPathFilter(path);
    this.selectedCourseId.set('all');
    this.selectedModuleId.set('all');
    this.resetVisibleResults();
    this.loadIndex(path);
    this.syncUrl();
  }

  protected updateCourse(value: string): void {
    this.reviewUnit.set('');
    this.selectedCourseId.set(value);
    this.selectedModuleId.set('all');
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateModule(value: string): void {
    this.reviewUnit.set('');
    this.selectedModuleId.set(value);
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateDifficulty(value: string): void {
    this.selectedDifficulty.set(this.difficultyFromValue(value));
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateLanguage(value: string): void {
    this.selectedLanguage.set(this.languageFromValue(value));
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateContentType(value: string): void {
    this.selectedContentType.set(this.contentTypeFromValue(value));
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateDiscoveryKind(value: string): void {
    this.selectedDiscoveryKind.set(this.discoveryKindFromValue(value));
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected readonly activityOptions = [
    { id: 'all', label: 'Everything' },
    { id: 'theory', label: 'Theory & lessons' },
    { id: 'interview', label: 'Interview questions' },
    { id: 'practice', label: 'Practice' },
  ] as const;

  protected activitySelected(activity: string): boolean {
    const kind = this.selectedDiscoveryKind();
    const format = this.selectedPracticeFormat();
    return activity === 'all'
      ? kind === 'all' && format === 'all'
      : activity === 'theory'
        ? kind === 'lesson' && format === 'all'
        : activity === 'interview'
          ? kind === 'practice' && format === 'explain'
          : kind === 'practice' && format === 'all';
  }

  protected selectActivity(activity: string): void {
    this.selectedDiscoveryKind.set(
      activity === 'all' ? 'all' : activity === 'theory' ? 'lesson' : 'practice',
    );
    this.selectedPracticeFormat.set(activity === 'interview' ? 'explain' : 'all');
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected clearSubjects(): void {
    this.selectedTags.set(new Set());
    this.tagQuery.set('');
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected retrySearch(): void {
    this.loadIndex(this.selectedPath());
  }

  protected updatePracticeFormat(value: string): void {
    this.selectedPracticeFormat.set(this.practiceFormatFromValue(value));
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateSort(value: string): void {
    this.sortBy.set(this.sortFromValue(value));
    this.syncUrl();
  }

  protected updateGroup(value: string): void {
    this.groupBy.set(this.groupFromValue(value));
    this.syncUrl();
  }

  protected clearFilters(): void {
    const hadScopedPath = this.selectedPath() !== 'all';
    this.query.set('');
    this.submittedQuery.set('');
    this.selectedPath.set('all');
    this.selectedCourseId.set('all');
    this.selectedModuleId.set('all');
    this.selectedDifficulty.set('all');
    this.selectedLanguage.set('all');
    this.selectedContentType.set('all');
    this.selectedDiscoveryKind.set('all');
    this.selectedPracticeFormat.set('all');
    this.selectedTags.set(new Set());
    this.sortBy.set('relevance');
    this.groupBy.set('none');
    this.resetVisibleResults();
    if (hadScopedPath) this.loadIndex('all');
    this.syncUrl();
  }

  protected submitSearch(): void {
    const query = this.normalize(this.query());
    if (query !== this.submittedQuery()) {
      this.updateQuery(this.query());
    }
    this.scrollToResults();
  }

  protected isTagSelected(tag: string): boolean {
    const path = this.pathForFilter(tag);
    return path
      ? this.selectedPath() === path
      : [...this.selectedTags()].some(
          (selectedTag) => this.normalize(selectedTag) === this.normalize(tag),
        );
  }

  protected selectTag(tag: string): void {
    if (
      tag !== 'all' &&
      !this.availableTags().some(
        (availableTag) => this.normalize(availableTag) === this.normalize(tag),
      )
    )
      return;
    const wasSelected = tag !== 'all' && this.isTagSelected(tag);
    const path = this.pathForFilter(tag);
    if (path) {
      const nextPath = this.selectedPath() === path ? 'all' : path;
      this.setPathFilter(nextPath);
      this.resetVisibleResults();
      this.loadIndex(nextPath);
      this.syncUrl();
      if (!wasSelected) this.scrollToResults();
      return;
    }
    const selectedTags = new Set(this.selectedTags());
    const selectedTag = [...selectedTags].find(
      (value) => this.normalize(value) === this.normalize(tag),
    );
    if (tag === 'all') {
      const hadPathFilter = this.selectedPath() !== 'all';
      selectedTags.clear();
      this.selectedPath.set('all');
      if (hadPathFilter) this.loadIndex('all');
    } else if (selectedTag) selectedTags.delete(selectedTag);
    else selectedTags.add(tag);
    this.selectedTags.set(selectedTags);
    this.resetVisibleResults();
    this.syncUrl();
    if (tag !== 'all' && !wasSelected) this.scrollToResults();
  }

  protected showMoreResults(): void {
    this.visibleResultLimit.update((limit) => limit + RESULT_PAGE_SIZE);
  }

  private resetVisibleResults(): void {
    this.visibleResultLimit.set(RESULT_PAGE_SIZE);
    if (this.selectedPreviewId() && !this.selectedPreview()) this.selectedPreviewId.set(null);
  }

  protected previewSelected(result: SearchDocument): boolean {
    return this.selectedPreview()
      ? this.resultKey(this.selectedPreview()!) === this.resultKey(result)
      : false;
  }

  protected previewExpanded(result: SearchDocument): boolean {
    return this.previewSelected(result);
  }

  protected previewControlsId(): string {
    return 'search-preview-pane';
  }

  @HostListener('window:resize')
  protected onViewportResize(): void {
    this.compactPreview.set(this.isCompactViewport());
    this.updateStickyOffsets();
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentPointerDown(event: PointerEvent): void {
    const details = this.filterDetails?.nativeElement;
    if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
      details.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  protected onFilterEscape(): void {
    const details = this.filterDetails?.nativeElement;
    if (!details?.open) return;
    details.open = false;
    details.querySelector<HTMLElement>('summary')?.focus();
  }

  protected openPreview(result: SearchDocument, event: Event): void {
    if (this.previewSelected(result)) {
      this.closePreview();
      return;
    }
    this.previewTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.previewScrollY = window.scrollY;
    this.detailsOpen.set(false);
    const id = this.resultKey(result);
    this.selectedPreviewId.set(id);
    this.writeSelectionUrl(id);
    if (!this.compactPreview()) {
      requestAnimationFrame(() => {
        const pinned = document.querySelector<HTMLElement>('.pinned-selection');
        pinned?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
        pinned?.querySelector<HTMLElement>('.summary-toggle')?.focus({ preventScroll: true });
      });
    }
  }

  protected closePreview(restoreFocus = true): void {
    const selectedId = this.selectedPreviewId();
    if (!selectedId) return;
    this.selectedPreviewId.set(null);
    this.detailsOpen.set(false);
    this.writeSelectionUrl(null);
    if (!restoreFocus) return;
    const scrollY = this.previewScrollY;
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: 'auto' });
      const trigger = [...document.querySelectorAll<HTMLElement>('.result-group .summary-toggle')]
        .find((button) => button.dataset['resultId'] === selectedId) ?? this.previewTrigger;
      trigger?.focus({ preventScroll: true });
    });
  }

  private previewTrigger: HTMLElement | null = null;
  private previewScrollY = 0;

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 800px)').matches;
  }

  private writeSelectionUrl(id: string | null, replaceUrl = true): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'merge',
      queryParams: { previewItem: id },
      replaceUrl,
      info: this.urlSyncInfo,
    });
  }

  private validatePreviewSelection(): void {
    const selectedId = this.selectedPreviewId();
    if (this.loading() || !selectedId) return;
    if (this.visibleResults().some((result) => this.resultKey(result) === selectedId)) return;
    this.selectedPreviewId.set(null);
    this.writeSelectionUrl(null, true);
  }

  private loadIndex(path: 'all' | ContentPath): void {
    if (this.indexPath === path) return;
    this.indexPath = path;
    const requestVersion = ++this.indexRequestVersion;
    const scopedPath = path === 'all' ? undefined : path;
    this.loading.set(true);
    this.error.set('');
    const index = this.content.getSearchIndex(scopedPath);
    index.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (questions) => {
        if (requestVersion !== this.indexRequestVersion) return;
        this.questions.set(questions);
        this.loading.set(false);
        this.validatePreviewSelection();
      },
      error: () => {
        if (requestVersion !== this.indexRequestVersion) return;
        this.indexPath = 'uninitialized';
        this.error.set('The search index could not be loaded.');
        this.loading.set(false);
      },
    });
  }

  private setPathFilter(path: 'all' | ContentPath): void {
    this.selectedPath.set(path);
    this.selectedTags.update(
      (selectedTags) =>
        new Set([...selectedTags].filter((tag) => this.pathForFilter(tag) === null)),
    );
  }

  private hasFilter(result: SearchDocument, tag: string): boolean {
    return this.subjectLabels(result).some(
      (value) => this.normalize(value) === this.normalize(tag),
    );
  }

  private subjectLabels(result: SearchDocument): string[] {
    return this.uniqueLabels([
      ...(result.subjects ?? result.tags),
      ...result.languages.map((language) =>
        language === 'go' ? 'Go' : `${language[0].toUpperCase()}${language.slice(1)}`,
      ),
    ]);
  }

  private pathForFilter(tag: string): ContentPath | null {
    switch (this.normalize(tag)) {
      case 'learn':
        return 'learn';
      case 'grow':
        return 'grow';
      case 'look ahead':
        return 'look-ahead';
      default:
        return null;
    }
  }

  private uniqueLabels(labels: string[]): string[] {
    const seen = new Set<string>();
    return labels.filter((label) => {
      const key = this.normalize(label);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private scrollToResults(): void {
    requestAnimationFrame(() => {
      const resultList = document.querySelector<HTMLElement>('.result-list-area');
      if (resultList) resultList.scrollTop = 0;
    });
  }

  protected preview(result: SearchDocument): string {
    const parsed = new DOMParser().parseFromString(result.preview, 'text/html');
    return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  protected resultRowSummary(result: SearchDocument): string {
    if (result.contentType === 'q-and-a') return '';
    const description = this.preview(result);
    return description.localeCompare(this.resultCardTitle(result).replace(/\s+/g, ' ').trim(), undefined, {
      sensitivity: 'base',
    }) === 0 ? '' : description;
  }

  protected summaryText(result: SearchDocument): string {
    if (result.contentType !== 'q-and-a' || this.practiceFormat(result) !== 'explain') {
      return this.preview(result) || 'Open this item to see its full content.';
    }
    if (!result.detailRef || result.detailRef.kind !== 'content-item')
      return 'Open the full question to read the interview answer.';
    if (!this.canPreviewAnswer(result)) return 'Sign in to view the interview answer.';
    const question = this.resolvedQuestion(result);
    if (question)
      return question.interviewAnswer?.trim() || 'Interview answer unavailable for this question.';
    if (this.questionError(result) === 'sign-in') return 'Sign in to view the interview answer.';
    if (this.questionError(result))
      return 'Interview answer unavailable here. Open the full question to check access.';
    return 'Loading interview answer…';
  }

  protected questionLink(result: SearchDocument): string[] {
    return result.route ?? [];
  }

  protected questionQueryParams(result: SearchDocument): Record<string, string> | null {
    if (!['practice', 'lesson'].includes(this.discoveryKind(result))) return null;
    return { returnTo: this.router.url };
  }

  protected pathLink(result: SearchDocument): string[] {
    return ['/', result.path];
  }

  protected courseLink(result: SearchDocument): string[] | null {
    return result.path && result.courseId ? ['/', result.path, result.courseId] : null;
  }

  protected moduleLink(result: SearchDocument): string[] | null {
    return result.path && result.courseId && result.moduleId
      ? ['/', result.path, result.courseId, 'module', result.moduleId]
      : null;
  }

  protected moduleLabel(result: SearchDocument): string {
    return result.moduleTitle;
  }

  protected difficultyFilter(result: SearchDocument): Record<string, string> | null {
    return result.difficulty ? this.metadataFilter({ difficulty: result.difficulty }) : null;
  }

  protected languageFilter(language: PatternLanguage): Record<string, string> {
    return this.metadataFilter({ language });
  }

  protected subjectFilter(subject: string): Record<string, string> {
    const {
      tag: _tag,
      tags: _tags,
      ...current
    } = this.router.parseUrl(this.router.url).queryParams;
    return { ...current, tags: subject };
  }

  protected activityFilter(result: SearchDocument): Record<string, string> {
    const {
      kind: _kind,
      format: _format,
      ...current
    } = this.router.parseUrl(this.router.url).queryParams;
    const kind = this.discoveryKind(result);
    const format = kind === 'practice' ? this.practiceFormat(result) : undefined;
    return { ...current, kind, ...(format ? { format } : {}) };
  }

  protected languageLabel(language: PatternLanguage): string {
    return language === 'go' ? 'Go' : `${language[0].toUpperCase()}${language.slice(1)}`;
  }

  private metadataFilter(patch: Record<string, string>): Record<string, string> {
    return { ...this.router.parseUrl(this.router.url).queryParams, ...patch };
  }

  protected discoveryKind(result: SearchDocument): DiscoveryKind {
    return (
      result.discoveryKind ??
      (result.contentType === 'theory' || result.contentType === 'dsa-pattern'
        ? 'lesson'
        : 'practice')
    );
  }

  protected practiceFormat(result: SearchDocument): PracticeFormat | undefined {
    if (this.discoveryKind(result) !== 'practice') return undefined;
    return (
      result.practiceFormat ??
      (result.contentType === 'dsa-problem'
        ? 'solve'
        : result.contentType === 'system-design'
          ? 'design'
          : 'explain')
    );
  }

  protected resultTypeLabel(result: SearchDocument): string {
    const kind = this.discoveryKind(result);
    if (kind === 'practice') {
      switch (this.practiceFormat(result)) {
        case 'explain': return result.contentType === 'q-and-a' ? 'Interview question' : 'Practice question';
        case 'solve': return 'Coding practice';
        case 'design': return 'Design practice';
        case 'debug': return 'Debug scenario';
        case 'rehearse': return 'Rehearsal';
        default: return 'Practice';
      }
    }
    return kind === 'tool' ? 'Learning tool' : `${kind[0].toUpperCase()}${kind.slice(1)}`;
  }

  protected resultCardTitle(result: SearchDocument): string {
    return result.contentType === 'dsa-problem' && result.preview.trim()
      ? result.preview.trim()
      : result.title;
  }

  protected resultHeadingLines(result: SearchDocument): string[] {
    const title = this.resultCardTitle(result);
    if (result.contentType !== 'dsa-problem') return [title];
    const sentenceBreak = /[.!?]\s+(?=[A-Z])/.exec(title);
    if (!sentenceBreak) return [title];
    const splitAt = sentenceBreak.index + 1;
    return [title.slice(0, splitAt), title.slice(splitAt).trimStart()];
  }

  protected resultActionLabel(result: SearchDocument): string {
    const kind = this.discoveryKind(result);
    if (kind === 'course') return 'Explore course';
    if (kind === 'topic') return 'Explore topic';
    if (kind === 'lesson') return 'Read lesson';
    if (kind === 'tool') return 'Open tool';
    switch (this.practiceFormat(result)) {
      case 'solve':
        return 'Practise problem';
      case 'design':
        return 'Practise design';
      case 'debug':
        return 'Debug scenario';
      case 'rehearse':
        return 'Rehearse response';
      default:
        return 'Read full answer';
    }
  }

  protected canPreviewAnswer(result: SearchDocument): boolean {
    return (
      result.contentType === 'q-and-a' &&
      this.practiceFormat(result) === 'explain' &&
      (result.access.tier === 'free' ||
        (this.protectedContent && !!this.accounts.account() && !this.accounts.sessionExpired())) &&
      result.detailRef?.kind === 'content-item'
    );
  }

  protected questionSolutions(question: InterviewQuestion): CodeSolution[] {
    if (question.solutions?.length) return question.solutions;
    return question.code
      ? [
          {
            language: question.code.language,
            title: question.code.title,
            source: question.code.source,
          },
        ]
      : [];
  }

  protected relatedLessonLink(
    result: SearchDocument,
    question: InterviewQuestion,
  ): string[] | null {
    const articleId = question.relatedArticleId;
    return articleId ? ['/', result.path, result.courseId, articleId] : null;
  }

  protected contentTypeLabel(contentType: ContentType): string {
    return contentType === 'q-and-a'
      ? 'Q&A'
      : contentType === 'dsa-problem'
        ? 'DSA problem'
        : contentType === 'dsa-pattern'
          ? 'DSA pattern'
          : contentType === 'system-design'
            ? 'System design'
            : contentType === 'language-comparison'
              ? 'Language comparison'
              : contentType[0].toUpperCase() + contentType.slice(1);
  }

  protected pathLabel(path: ContentPath): string {
    return path === 'look-ahead' ? 'Look Ahead' : path[0].toUpperCase() + path.slice(1);
  }

  protected questionTags(result: SearchDocument): string[] {
    const excluded = new Set(
      [this.pathLabel(result.path), this.contentTypeLabel(result.contentType), result.difficulty]
        .filter(Boolean)
        .map((value) => this.normalize(value!)),
    );
    return (result.subjects ?? result.tags)
      .filter((tag) => !excluded.has(this.normalize(tag)))
      .slice(0, 8);
  }

  protected isExpanded(result: SearchDocument): boolean {
    return this.expandedResults().has(this.resultKey(result));
  }

  protected toggleResult(result: SearchDocument): void {
    const key = this.resultKey(result);
    const expanded = new Set(this.expandedResults());
    expanded.has(key) ? expanded.delete(key) : expanded.add(key);
    this.expandedResults.set(expanded);
    if (
      !expanded.has(key) ||
      result.access.tier === 'premium' ||
      result.detailRef?.kind !== 'content-item'
    )
      return;
    this.loadQuestion(result);
  }

  protected resolvedQuestion(result: SearchDocument): InterviewQuestion | undefined {
    return (
      this.loadedQuestions().get(this.answerCacheKey(result)) ??
      (!this.protectedContent && result.access.tier === 'free' ? result.question : undefined)
    );
  }

  protected questionLoading(result: SearchDocument): boolean {
    return this.loadingQuestions().has(this.answerCacheKey(result));
  }

  protected questionError(result: SearchDocument): 'sign-in' | 'unavailable' | undefined {
    return this.questionErrors().get(this.answerCacheKey(result));
  }

  protected loadQuestion(result: SearchDocument): void {
    const key = this.answerCacheKey(result);
    if (
      this.resolvedQuestion(result) ||
      this.loadingQuestions().has(key) ||
      this.questionErrors().has(key) ||
      !this.canPreviewAnswer(result)
    )
      return;
    this.questionErrors.update((errors) => {
      const next = new Map(errors);
      next.delete(key);
      return next;
    });
    this.loadingQuestions.update((loading) => new Set(loading).add(key));
    this.content.getInterviewQuestion(result).subscribe({
      next: (question) => {
        this.loadingQuestions.update((loading) => {
          const next = new Set(loading);
          next.delete(key);
          return next;
        });
        if (question) {
          this.loadedQuestions.update((questions) => new Map(questions).set(key, question));
          return;
        }
        this.questionErrors.update((errors) => new Map(errors).set(key, 'unavailable'));
      },
      error: (error: unknown) => {
        this.loadingQuestions.update((loading) => {
          const next = new Set(loading);
          next.delete(key);
          return next;
        });
        const status =
          error && typeof error === 'object' && 'status' in error ? error.status : null;
        this.questionErrors.update((errors) =>
          new Map(errors).set(key, status === 401 ? 'sign-in' : 'unavailable'),
        );
      },
    });
  }

  protected answerId(result: SearchDocument): string {
    return `answer-${this.resultKey(result).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  private resultKey(result: SearchDocument): string {
    return result.id;
  }

  private answerCacheKey(result: SearchDocument): string {
    return `${this.accounts.account()?.accountId ?? 'anonymous'}:${this.resultKey(result)}`;
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private difficultyFromValue(value: string | null): SearchDifficulty {
    return value === 'Beginner' || value === 'Intermediate' || value === 'Advanced' ? value : 'all';
  }

  private languageFromValue(value: string | null): SearchLanguage {
    return value === 'java' || value === 'python' || value === 'go' || value === 'unspecified'
      ? value
      : 'all';
  }

  private contentTypeFromValue(value: string | null): SearchContentType {
    return value === 'q-and-a' ||
      value === 'theory' ||
      value === 'dsa-pattern' ||
      value === 'dsa-problem' ||
      value === 'system-design' ||
      value === 'language-comparison' ||
      value === 'guide'
      ? value
      : 'all';
  }

  private practiceFormatFromValue(value: string | null): SearchPracticeFormat {
    return value === 'explain' ||
      value === 'solve' ||
      value === 'design' ||
      value === 'debug' ||
      value === 'rehearse'
      ? value
      : 'all';
  }

  private discoveryKindFromValue(value: string | null): SearchDiscoveryKind {
    return value === 'course' ||
      value === 'topic' ||
      value === 'lesson' ||
      value === 'practice' ||
      value === 'tool'
      ? value
      : 'all';
  }

  private sortFromValue(value: string | null): SearchSort {
    return value === 'title' || value === 'difficulty' ? value : 'relevance';
  }

  private groupFromValue(value: string | null): SearchGroup {
    return value === 'path' ||
      value === 'course' ||
      value === 'module' ||
      value === 'tag' ||
      value === 'content-type'
      ? value
      : 'none';
  }

  private syncUrl(afterNavigation?: () => void): void {
    const tags = [...this.selectedTags()];
    void this.router
      .navigate([], {
        relativeTo: this.route,
        replaceUrl: true,
        info: this.urlSyncInfo,
        queryParams: {
          unit: this.reviewUnit() || null,
          q: this.submittedQuery() || null,
          path: this.selectedPath() === 'all' ? null : this.selectedPath(),
          course: this.selectedCourseId() === 'all' ? null : this.selectedCourseId(),
          module: this.selectedModuleId() === 'all' ? null : this.selectedModuleId(),
          difficulty: this.selectedDifficulty() === 'all' ? null : this.selectedDifficulty(),
          language: this.selectedLanguage() === 'all' ? null : this.selectedLanguage(),
          type: this.selectedContentType() === 'all' ? null : this.selectedContentType(),
          kind: this.selectedDiscoveryKind() === 'all' ? null : this.selectedDiscoveryKind(),
          format: this.selectedPracticeFormat() === 'all' ? null : this.selectedPracticeFormat(),
          tags: tags.length ? tags.join(',') : null,
          sort: this.sortBy() === 'relevance' ? null : this.sortBy(),
          group: this.groupBy() === 'none' ? null : this.groupBy(),
          previewItem: this.selectedPreview()?.id ?? null,
        },
      })
      .then(() => afterNavigation?.());
  }

  private score(result: SearchDocument, query: string): number {
    if (!query) return 1;
    const title = result.title.toLowerCase();
    const tags = result.tags.join(' ').toLowerCase();
    let score = 0;
    if (title === query) score += 100;
    if (title.includes(query)) score += 60;
    if (tags.includes(query)) score += 40;
    if (result.searchableText.includes(query)) score += 10;
    return score;
  }

  private difficultyScore(difficulty: SearchDocument['difficulty']): number {
    return difficulty === 'Beginner' ? 1 : difficulty === 'Intermediate' ? 2 : 3;
  }

  private groupKey(result: SearchDocument): string {
    switch (this.groupBy()) {
      case 'path':
        return this.pathLabel(result.path);
      case 'course':
        return result.courseTitle;
      case 'module':
        return `${result.courseTitle} · ${result.moduleTitle}`;
      case 'tag':
        return result.tags[0] ?? 'Untagged';
      case 'content-type':
        return this.contentTypeLabel(result.contentType);
      default:
        return 'All matching content';
    }
  }
}
