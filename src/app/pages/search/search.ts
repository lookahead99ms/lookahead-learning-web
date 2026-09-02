import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContentService } from '../../content/content.service';
import { ContentPath, ContentType, SearchDocument } from '../../content/content.models';
import { PlatformHeader } from '../../core/platform-header/platform-header';

type SearchSort = 'relevance' | 'title' | 'difficulty';
type SearchGroup = 'none' | 'path' | 'course' | 'module' | 'tag' | 'content-type';
type SearchContentType = 'all' | ContentType;

@Component({
  selector: 'app-search',
  imports: [PlatformHeader, FormsModule, RouterLink],
  templateUrl: './search.html',
  styles: [`
    .search-page { min-height: 100vh; padding-bottom: 80px; background: var(--surface-page); color: var(--text-strong); }
    .search-header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 5vw; border-bottom: 1px solid var(--line); background: var(--surface); }
    .search-header .brand { display: flex; align-items: center; gap: 12px; color: var(--text-strong); text-decoration: none; }
    .brand-mark { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 13px; color: white; background: linear-gradient(135deg, #625cff, var(--search-primary)); font-weight: 800; }
    .brand strong, .brand small { display: block; }
    .brand small { margin-top: 2px; color: var(--muted); }
    .home-link { color: var(--search-primary); font-weight: 700; text-decoration: none; }
    .search-hero { max-width: 1120px; margin: 0 auto; padding: 52px 5vw 24px; }
    .eyebrow { margin: 0 0 10px; color: var(--search-primary); font-size: .76rem; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(1.9rem, 3.5vw, 3.2rem); font-weight: 650; line-height: 1.08; letter-spacing: -.035em; }
    .search-intro { max-width: 680px; margin: 18px 0 28px; color: var(--muted); font-size: 1.08rem; line-height: 1.65; }
    .search-form { display: flex; gap: 10px; align-items: stretch; }
    .search-input { width: 100%; padding: 16px 20px; border: 1px solid var(--line); border-radius: 14px; color: var(--text-strong); background: var(--surface); font: inherit; font-size: 1.08rem; box-shadow: 0 10px 30px rgba(102,153,204,.08); transition: border-color 160ms ease; }
    .search-input:focus { border-color: var(--accent-focus); outline: 3px solid rgba(137,207,240,.28); }
    .search-submit { padding: 0 20px; border: 0; border-radius: 12px; color: var(--surface); background: var(--search-primary); cursor: pointer; font: inherit; font-weight: 750; white-space: nowrap; }
    .search-submit:hover, .search-submit:focus-visible { background: var(--search-hover); outline: none; }
    .search-workspace { max-width: 1120px; margin: 0 auto; padding: 0 5vw; }
    .search-toolbar { display: grid; grid-template-columns: 1fr repeat(3, minmax(150px, 190px)); gap: 12px; align-items: end; padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
    .control { display: grid; gap: 6px; color: var(--muted); font-size: .78rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
    select { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; color: var(--text-strong); background: var(--surface); font: inherit; transition: border-color 160ms ease; }
    select:hover, select:focus { border-color: var(--accent-focus); outline: 3px solid rgba(137,207,240,.18); }
    .tag-panel { margin: 18px 0; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
    .tag-panel-title { margin: 0 0 10px; color: var(--muted); font-size: .78rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
    .tag-panel-title span { color: var(--search-primary); letter-spacing: normal; text-transform: none; }
    .tag-strip { display: flex; flex-wrap: wrap; gap: 8px; max-height: 184px; overflow-y: auto; padding: 2px 4px 4px 0; align-content: flex-start; scrollbar-gutter: stable; }
    .tag-pill { padding: 7px 11px; border: 1px solid transparent; border-radius: 999px; color: var(--muted); background: var(--surface-muted); cursor: pointer; font: inherit; font-size: .82rem; font-weight: 700; }
    .tag-pill:hover, .tag-pill:focus-visible { background: var(--surface-accent); color: var(--text-strong); outline: none; }
    .tag-pill.active { border-color: var(--search-primary); color: var(--text-strong); background: var(--surface-accent); cursor: default; }
    .no-tags { padding: 7px 0; color: var(--muted); font-size: .84rem; }
    .results-anchor { scroll-margin-top: 24px; }
    .result-summary { margin: 22px 0 12px; color: var(--muted); }
    .result-group { margin-top: 28px; }
    .group-title { margin: 0 0 10px; color: var(--search-primary); font-size: 1.05rem; }
    .result-card { margin-bottom: 10px; padding: 18px 20px; border: 1px solid var(--line); border-left: 3px solid transparent; border-radius: 14px; color: inherit; background: var(--surface); cursor: pointer; transition: border-color 160ms ease, box-shadow 160ms ease; }
    .result-card.expanded, .result-card:hover, .result-card:focus-within { border-color: var(--line); border-left-color: var(--search-primary); box-shadow: 0 10px 24px rgba(102,153,204,.1); }
    .result-header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; color: var(--muted); font-size: .78rem; font-weight: 700; }
    .result-toggle { width: 100%; padding: 8px 0 0; border: 0; color: inherit; background: transparent; cursor: pointer; font: inherit; text-align: left; }
    .result-toggle:focus-visible { outline: 3px solid rgba(137,207,240,.28); outline-offset: 4px; }
    .result-meta { display: contents; }
    .result-breadcrumbs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; color: var(--muted); }
    .result-breadcrumbs a { color: var(--muted); text-decoration: none; }
    .result-breadcrumbs a:hover, .result-breadcrumbs a:focus-visible { color: var(--search-primary); text-decoration: underline; outline: none; }
    .result-meta-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-left: auto; }
    .result-meta-filter { padding: 4px 8px; border: 0; border-radius: 999px; color: var(--muted); background: var(--surface-muted); cursor: pointer; font: inherit; font-size: .78rem; font-weight: 700; }
    .result-meta-filter:hover, .result-meta-filter:focus-visible, .result-meta-filter.active { color: var(--surface); background: var(--search-primary); outline: none; }
    .result-meta-filter.active { cursor: default; }
    .result-difficulty { padding: 4px 8px; border-radius: 999px; color: var(--muted); background: var(--surface-muted); }
    .result-title { display: inline; margin: 8px 0; color: var(--text-strong); font-size: 1.08rem; font-weight: 750; }
    .expand-indicator { float: right; color: var(--search-primary); font-size: 1.2rem; font-weight: 500; }
    .result-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .result-tag { padding: 4px 8px; border: 1px solid transparent; border-radius: 999px; color: var(--muted); background: var(--surface-muted); cursor: pointer; font: inherit; font-size: .74rem; font-weight: 700; }
    .result-tag:hover, .result-tag:focus-visible, .result-tag.active { border-color: var(--search-primary); color: var(--surface); background: var(--search-primary); outline: none; }
    .result-tag.active { cursor: default; }
    .result-answer { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
    .result-answer-label { margin: 0 0 6px; color: var(--muted); font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .result-preview { margin: 0 0 14px; color: var(--muted); line-height: 1.55; }
    .detail-link { display: inline-block; padding: 9px 13px; border-radius: 9px; color: var(--surface); background: var(--search-primary); font-size: .86rem; font-weight: 750; text-decoration: none; }
    .detail-link:hover, .detail-link:focus-visible { background: var(--search-hover); outline: none; }
    .premium-state { display: grid; gap: 5px; padding: 14px; border-radius: 10px; color: #7a5510; background: #fff8e7; }
    .premium-state strong { color: #6b4907; }
    .premium-state p { margin: 0; color: #8b6a27; font-size: .9rem; }
    .premium-badge { padding: 4px 8px; border-radius: 999px; color: #8b5e00; background: #fff0bd; font-size: .72rem; font-weight: 800; text-transform: uppercase; }
    .empty-state, .loading-state { padding: 38px 20px; border: 1px dashed #D2DAE4; border-radius: 14px; color: var(--muted); text-align: center; background: var(--surface); }
    @media (max-width: 760px) { .search-header { padding: 14px 5vw; } .search-toolbar { grid-template-columns: 1fr; } .search-hero { padding-top: 44px; } .search-form { flex-direction: column; } .search-submit { min-height: 44px; } .result-meta-right { margin-left: 0; } }
  `],
})
export class Search implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  protected readonly questions = signal<SearchDocument[]>([]);
  protected readonly query = signal('');
  protected readonly submittedQuery = signal('');
  protected readonly selectedPath = signal<'all' | ContentPath>('all');
  protected readonly selectedTags = signal(new Set<string>());
  protected readonly selectedFilterCount = computed(() => this.selectedTags().size);
  protected readonly selectedContentType = signal<SearchContentType>('all');
  protected readonly sortBy = signal<SearchSort>('relevance');
  protected readonly groupBy = signal<SearchGroup>('none');
  protected readonly expandedResults = signal(new Set<string>());
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly unqueriedScopeResults = computed(() => {
    const path = this.selectedPath();
    const contentType = this.selectedContentType();
    return this.questions()
      .filter((result) => path === 'all' || result.path === path)
      .filter((result) => contentType === 'all' || result.contentType === contentType);
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
    const candidates = this.scopeResults().filter((result) => [...selectedTags].every((tag) => this.hasFilter(result, tag)));
    const matchingTags = this.uniqueLabels(candidates.flatMap(({ filterTags }) => filterTags)).sort((a, b) => a.localeCompare(b));
    if (matchingTags.length) return matchingTags;
    return this.uniqueLabels(this.unqueriedScopeResults().flatMap(({ filterTags }) => filterTags)).sort((a, b) => a.localeCompare(b));
  });

  protected readonly groups = computed(() => {
    const grouped = new Map<string, SearchDocument[]>();
    for (const result of this.results()) {
      const key = this.groupKey(result);
      grouped.set(key, [...(grouped.get(key) ?? []), result]);
    }
    return [...grouped.entries()].map(([label, results]) => ({ label, results }));
  });

  ngOnInit(): void {
    const initialQuery = this.route.snapshot.queryParamMap.get('q')?.trim().toLowerCase() ?? '';
    const initialTags = [
      ...this.route.snapshot.queryParamMap.getAll('tag'),
      ...(this.route.snapshot.queryParamMap.get('tags')?.split(',') ?? []),
    ].map((tag) => tag.trim()).filter(Boolean);
    this.query.set(initialQuery);
    this.submittedQuery.set(initialQuery);
    const initialPath = initialTags.map((tag) => this.pathForFilter(tag)).find((path): path is ContentPath => path !== null);
    this.selectedPath.set(initialPath ?? 'all');
    const initialFilterTags = initialTags.filter((tag) => this.pathForFilter(tag) === null);
    if (initialPath) initialFilterTags.push(this.pathLabel(initialPath));
    this.selectedTags.set(new Set(initialFilterTags));
    this.content.getSearchIndex().subscribe({
      next: (questions) => { this.questions.set(questions); this.retainUnavailableTags(); this.loading.set(false); },
      error: () => { this.error.set('The question index could not be loaded.'); this.loading.set(false); },
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
        if (this.sortBy() === 'difficulty') return this.difficultyScore(left.result.difficulty) - this.difficultyScore(right.result.difficulty);
        return right.score - left.score || left.result.title.localeCompare(right.result.title);
      })
      .map(({ result }) => result);
  });

  protected updateQuery(value: string): void {
    this.query.set(value);
    if (this.normalize(value) !== this.submittedQuery()) {
      this.submittedQuery.set('');
      this.selectedTags.update((selectedTags) => new Set([...selectedTags].filter((tag) => this.pathForFilter(tag) !== null)));
    }
  }

  protected updatePath(value: string): void {
    this.setPathFilter(value as 'all' | ContentPath);
    this.retainUnavailableTags();
  }

  protected updateContentType(value: string): void {
    this.selectedContentType.set(value as SearchContentType);
    this.retainUnavailableTags();
  }

  protected updateSort(value: string): void { this.sortBy.set(value as SearchSort); }
  protected updateGroup(value: string): void { this.groupBy.set(value as SearchGroup); }
  protected submitSearch(): void {
    const query = this.normalize(this.query());
    this.submittedQuery.set(query);
    const selectedTags = this.selectedTags();
    const matchingTags = new Set(
      this.scopeResults()
        .filter((result) => [...selectedTags].every((tag) => this.hasFilter(result, tag)))
        .flatMap(({ filterTags }) => filterTags)
        .filter((tag) => query.length > 0 && this.normalize(tag) === query),
    );
    if (matchingTags.size) {
      this.selectedTags.update((tags) => new Set([...tags, ...matchingTags]));
    } else {
      this.retainUnavailableTags();
    }
    this.scrollToResults();
  }

  protected isTagSelected(tag: string): boolean {
    const path = this.pathForFilter(tag);
    return path ? this.selectedPath() === path : [...this.selectedTags()].some((selectedTag) => this.normalize(selectedTag) === this.normalize(tag));
  }

  protected selectTag(tag: string): void {
    if (tag !== 'all' && !this.availableTags().some((availableTag) => this.normalize(availableTag) === this.normalize(tag))) return;
    const wasSelected = tag !== 'all' && this.isTagSelected(tag);
    const path = this.pathForFilter(tag);
    if (path) {
      this.setPathFilter(this.selectedPath() === path ? 'all' : path);
      this.retainUnavailableTags();
      if (!wasSelected) this.scrollToResults();
      return;
    }
    const selectedTags = new Set(this.selectedTags());
    const selectedTag = [...selectedTags].find((value) => this.normalize(value) === this.normalize(tag));
    if (tag === 'all') {
      selectedTags.clear();
      this.selectedPath.set('all');
    } else if (selectedTag) selectedTags.delete(selectedTag);
    else selectedTags.add(tag);
    this.selectedTags.set(selectedTags);
    if (tag !== 'all' && !wasSelected) this.scrollToResults();
  }

  private setPathFilter(path: 'all' | ContentPath): void {
    this.selectedPath.set(path);
    this.selectedTags.update((selectedTags) => {
      const next = new Set([...selectedTags].filter((tag) => this.pathForFilter(tag) === null));
      if (path !== 'all') next.add(this.pathLabel(path));
      return next;
    });
  }

  private retainUnavailableTags(): void {
    const available = new Set(this.scopeResults().flatMap(({ filterTags }) => filterTags.map((tag) => this.normalize(tag))));
    this.selectedTags.update((selectedTags) => new Set([...selectedTags].filter((tag) => this.pathForFilter(tag) !== null || available.has(this.normalize(tag)))));
  }

  private hasFilter(result: SearchDocument, tag: string): boolean {
    return result.filterTags.some((value) => this.normalize(value) === this.normalize(tag));
  }

  private pathForFilter(tag: string): ContentPath | null {
    switch (this.normalize(tag)) {
      case 'learn': return 'learn';
      case 'grow': return 'grow';
      case 'look ahead': return 'look-ahead';
      default: return null;
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
    requestAnimationFrame(() => document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected preview(result: SearchDocument): string {
    return result.preview.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  protected questionLink(result: SearchDocument): string[] {
    return result.route ?? [];
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

  protected contentTypeLabel(contentType: ContentType): string {
    return contentType === 'q-and-a' ? 'Q&A' : contentType === 'dsa-pattern' ? 'DSA pattern' : contentType === 'system-design' ? 'System design' : contentType === 'language-comparison' ? 'Language comparison' : contentType[0].toUpperCase() + contentType.slice(1);
  }

  protected pathLabel(path: ContentPath): string {
    return path === 'look-ahead' ? 'Look Ahead' : path[0].toUpperCase() + path.slice(1);
  }

  protected questionTags(result: SearchDocument): string[] {
    const excluded = new Set([this.pathLabel(result.path), this.contentTypeLabel(result.contentType), result.difficulty].filter(Boolean).map((value) => this.normalize(value!)));
    return result.tags.filter((tag) => !excluded.has(this.normalize(tag)));
  }

  protected isExpanded(result: SearchDocument): boolean {
    return this.expandedResults().has(this.resultKey(result));
  }

  protected toggleResult(result: SearchDocument): void {
    const key = this.resultKey(result);
    const expanded = new Set(this.expandedResults());
    expanded.has(key) ? expanded.delete(key) : expanded.add(key);
    this.expandedResults.set(expanded);
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
      case 'path': return this.pathLabel(result.path);
      case 'course': return result.courseTitle;
      case 'module': return `${result.courseTitle} · ${result.moduleTitle}`;
      case 'tag': return result.tags[0] ?? 'Untagged';
      case 'content-type': return this.contentTypeLabel(result.contentType);
      default: return 'All matching content';
    }
  }
}
