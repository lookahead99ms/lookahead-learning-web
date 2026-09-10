import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentService } from '../../content/content.service';
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
import { CodingSolutionTabs } from '../../core/coding-solution-tabs/coding-solution-tabs';
import { PlatformHeader } from '../../core/platform-header/platform-header';

type SearchSort = 'relevance' | 'title' | 'difficulty';
type SearchGroup = 'none' | 'path' | 'course' | 'module' | 'tag' | 'content-type';
type SearchContentType = 'all' | ContentType;
type SearchDiscoveryKind = 'all' | DiscoveryKind;
type SearchPracticeFormat = 'all' | PracticeFormat;
type SearchDifficulty = 'all' | 'Beginner' | 'Intermediate' | 'Advanced';
type SearchLanguage = 'all' | PatternLanguage;
const RESULT_PAGE_SIZE = 40;
const VISIBLE_TAG_LIMIT = 60;

@Component({
  selector: 'app-search',
  imports: [PlatformHeader, FormsModule, RouterLink, CodingSolutionTabs],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class Search implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlSyncInfo = {};
  private readonly router = inject(Router);
  protected readonly questions = signal<SearchDocument[]>([]);
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
  protected readonly loadedQuestions = signal(new Map<string, InterviewQuestion>());
  protected readonly loadingQuestions = signal(new Set<string>());
  protected readonly questionErrors = signal(new Set<string>());
  protected readonly loading = signal(true);
  protected readonly error = signal('');
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

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      // Internal updates already changed the filters; keep any unsubmitted text.
      // Navigation info is transient, unlike history state used by Back/Forward.
      if (this.router.currentNavigation()?.extras.info === this.urlSyncInfo) return;
      const initialQuery = params.get('q')?.trim().toLowerCase() ?? '';
      const initialTags = [...params.getAll('tag'), ...(params.get('tags')?.split(',') ?? [])]
        .map((tag) => tag.trim())
        .filter(Boolean);
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
      this.loadIndex(nextPath);
    });
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
    this.resetVisibleResults();
    if (hadScopedPath) this.loadIndex('all');
    this.syncUrl();
  }

  protected updateTagQuery(value: string): void {
    this.tagQuery.set(value);
  }

  protected updatePath(value: string): void {
    const path = value as 'all' | ContentPath;
    this.setPathFilter(path);
    this.selectedCourseId.set('all');
    this.selectedModuleId.set('all');
    this.resetVisibleResults();
    this.loadIndex(path);
    this.syncUrl();
  }

  protected updateCourse(value: string): void {
    this.selectedCourseId.set(value);
    this.selectedModuleId.set('all');
    this.retainUnavailableTags();
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateModule(value: string): void {
    this.selectedModuleId.set(value);
    this.retainUnavailableTags();
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateDifficulty(value: string): void {
    this.selectedDifficulty.set(this.difficultyFromValue(value));
    this.retainUnavailableTags();
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateLanguage(value: string): void {
    this.selectedLanguage.set(this.languageFromValue(value));
    this.retainUnavailableTags();
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateContentType(value: string): void {
    this.selectedContentType.set(this.contentTypeFromValue(value));
    this.retainUnavailableTags();
    this.resetVisibleResults();
    this.syncUrl();
  }

  protected updateDiscoveryKind(value: string): void {
    this.selectedDiscoveryKind.set(this.discoveryKindFromValue(value));
    this.retainUnavailableTags();
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
    this.retainUnavailableTags();
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
        this.retainUnavailableTags();
        this.loading.set(false);
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

  private retainUnavailableTags(): void {
    const available = new Set(
      this.scopeResults().flatMap((result) =>
        this.subjectLabels(result).map((tag) => this.normalize(tag)),
      ),
    );
    this.selectedTags.update(
      (selectedTags) =>
        new Set(
          [...selectedTags].filter(
            (tag) => this.pathForFilter(tag) !== null || available.has(this.normalize(tag)),
          ),
        ),
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
    requestAnimationFrame(() =>
      document
        .getElementById('search-results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  protected preview(result: SearchDocument): string {
    return result.preview
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

  protected courseLink(result: SearchDocument): string[] {
    return ['/', result.path, result.courseId];
  }

  protected moduleLink(result: SearchDocument): string[] {
    return ['/', result.path, result.courseId, 'module', result.moduleId];
  }

  protected moduleLabel(result: SearchDocument): string {
    return result.moduleTitle;
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
    if (kind === 'practice' && this.practiceFormat(result)) {
      const format = this.practiceFormat(result)!;
      return `${format[0].toUpperCase()}${format.slice(1)} practice`;
    }
    return kind === 'tool' ? 'Learning tool' : `${kind[0].toUpperCase()}${kind.slice(1)}`;
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
      result.access.tier === 'free' &&
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
    return result.question ?? this.loadedQuestions().get(this.resultKey(result));
  }

  protected questionLoading(result: SearchDocument): boolean {
    return this.loadingQuestions().has(this.resultKey(result));
  }

  protected questionError(result: SearchDocument): boolean {
    return this.questionErrors().has(this.resultKey(result));
  }

  protected loadQuestion(result: SearchDocument): void {
    const key = this.resultKey(result);
    if (
      this.resolvedQuestion(result) ||
      this.loadingQuestions().has(key) ||
      result.access.tier === 'premium'
    )
      return;
    this.questionErrors.update((errors) => {
      const next = new Set(errors);
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
        this.questionErrors.update((errors) => new Set(errors).add(key));
      },
      error: () => {
        this.loadingQuestions.update((loading) => {
          const next = new Set(loading);
          next.delete(key);
          return next;
        });
        this.questionErrors.update((errors) => new Set(errors).add(key));
      },
    });
  }

  protected answerId(result: SearchDocument): string {
    return `answer-${this.resultKey(result).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  private resultKey(result: SearchDocument): string {
    return result.id;
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private difficultyFromValue(value: string | null): SearchDifficulty {
    return value === 'Beginner' || value === 'Intermediate' || value === 'Advanced' ? value : 'all';
  }

  private languageFromValue(value: string | null): SearchLanguage {
    return value === 'java' || value === 'python' || value === 'go' ? value : 'all';
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
