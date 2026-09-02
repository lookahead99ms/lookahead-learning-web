import {
  Component,
  ElementRef,
  HostListener,
  Input,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';

type HeaderSuggestion = {
  type: 'Question' | 'Topic' | 'Course' | 'Module' | 'Theory' | 'DSA' | 'Path' | 'Search';
  label: string;
  query: string;
  route?: string[];
  queryParams?: Record<string, string>;
  style?: 'learn' | 'grow' | 'look-ahead' | 'search';
  detail?: string;
};

const PERSISTENT_SUGGESTIONS: HeaderSuggestion[] = [
  { type: 'Path', label: 'Learn', query: 'Learn', route: ['/learn'], style: 'learn' },
  { type: 'Path', label: 'Grow', query: 'Grow', route: ['/grow'], style: 'grow' },
  {
    type: 'Path',
    label: 'Look Ahead',
    query: 'Look Ahead',
    route: ['/look-ahead'],
    style: 'look-ahead',
  },
  { type: 'Search', label: 'Search all content', query: '', route: ['/search'], style: 'search' },
];

const HEADER_SUGGESTIONS: HeaderSuggestion[] = [
  {
    type: 'Topic',
    label: 'DFS',
    query: 'DFS',
    route: ['/learn', 'sorting-searching', 'module', 'sorting-searching-fundamentals'],
  },
  {
    type: 'Topic',
    label: 'load shedding',
    query: 'load shedding',
    route: ['/grow', 'distributed-systems', 'module', 'resilience'],
  },
  {
    type: 'Question',
    label: 'How does Spring Boot manage context?',
    query: 'How does Spring Boot manage context?',
    route: ['/grow', 'spring-boot', 'spring-boot-production-engineering-13'],
  },
  {
    type: 'Topic',
    label: 'coding patterns',
    query: 'coding patterns',
    route: ['/learn', 'solid-design-patterns', 'module', 'creational-behavioral-patterns'],
  },
  {
    type: 'Question',
    label: 'When should Redis NOT be a system of record?',
    query: 'When should Redis NOT be a system of record?',
    route: ['/grow', 'distributed-systems', 'distributed-systems-redis-7'],
  },
  {
    type: 'Topic',
    label: 'Goroutines and Channels',
    query: 'Goroutines and Channels',
    route: ['/learn', 'go-fundamentals', 'module', 'go-concurrency-model'],
  },
];

@Component({
  selector: 'app-platform-header',
  imports: [FormsModule, RouterLink],
  templateUrl: './platform-header.html',
  styles: [
    `
      .platform-header {
        position: sticky;
        top: 0;
        z-index: 50;
        background: #ffffff;
        transform: translate3d(0, 0, 0);
        will-change: transform;
        backface-visibility: hidden;
      }
      .platform-header.with-search {
        min-height: 76px;
      }
      .platform-header .brand > span:last-child {
        width: max-content;
      }
      .platform-header .brand small {
        font-size: 11px !important;
        letter-spacing: -0.01em !important;
        line-height: 1.2 !important;
        white-space: nowrap;
      }
      .header-search-form {
        position: absolute;
        top: 50%;
        left: 50%;
        width: min(440px, 42vw);
        transform: translate(-50%, -50%);
      }
      .search-palette-backdrop {
        position: fixed;
        z-index: 80;
        inset: 0;
        width: 100vw;
        height: 100vh;
        border: 0;
        background: rgba(226, 232, 240, 0.46);
        backdrop-filter: blur(8px);
        cursor: default;
      }
      .header-search-form.search-palette {
        position: fixed;
        z-index: 81;
        top: 88px;
        left: 50%;
        width: min(760px, calc(100vw - 32px));
        transform: translateX(-50%);
      }
      .header-search-form.search-palette .header-search-input {
        height: 52px;
        font-size: 1rem;
      }
      .header-search-form.search-palette .header-search-suggestions {
        top: 52px;
        padding: 14px;
      }
      .header-search-field {
        position: relative;
      }
      .header-search-form.suggestions-open .header-search-input {
        border-radius: 999px 999px 0 0;
        border-bottom-color: transparent;
      }
      .header-search-icon {
        position: absolute;
        top: 50%;
        left: 14px;
        width: 15px;
        height: 15px;
        color: #6699cc;
        pointer-events: none;
        transform: translateY(-50%);
      }
      .header-search-input {
        width: 100%;
        height: 42px;
        padding: 0 14px 0 38px;
        border: 1px solid #dbe3ee;
        border-radius: 999px;
        color: #172033;
        background: #ffffff;
        font: inherit;
        font-size: 0.86rem;
        transition:
          border-color 160ms ease,
          border-radius 160ms ease;
      }
      .header-search-input:focus {
        border-color: #89cff0;
        outline: 3px solid rgba(137, 207, 240, 0.3);
      }
      .header-search-suggestions {
        position: absolute;
        top: 42px;
        left: 0;
        z-index: 25;
        width: 100%;
        padding: 12px;
        border: 1px solid #d2dae4;
        border-top: 0;
        border-radius: 0 0 14px 14px;
        background: #ffffff;
        box-shadow: 0 16px 34px rgba(15, 23, 42, 0.14);
      }
      .persistent-suggestions {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }
      .persistent-suggestions .header-search-suggestion {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        max-width: none;
        min-height: 34px;
        padding: 9px 12px;
        border: 1px solid transparent;
        border-radius: 8px;
        color: #172033;
        background: #f7f9fc;
        cursor: pointer;
        font: inherit;
        text-align: center;
        white-space: nowrap;
      }
      .persistent-suggestions .header-search-suggestion:hover,
      .persistent-suggestions .header-search-suggestion:focus-visible {
        background: #eaf5fa;
        outline: none;
      }
      .persistent-suggestions .header-search-suggestion.learn {
        color: #168ca5;
      }
      .persistent-suggestions .header-search-suggestion.grow {
        color: #b45309;
      }
      .persistent-suggestions .header-search-suggestion.look-ahead {
        color: #334155;
      }
      .persistent-suggestions .header-search-suggestion.search {
        color: #6699cc;
      }
      .dynamic-suggestions {
        display: block;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #dbe3ee;
      }
      .dynamic-suggestions .header-search-suggestion {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        column-gap: 10px;
        width: 100%;
        max-width: none;
        min-height: auto;
        padding: 10px 4px;
        border: 0;
        border-radius: 0;
        color: #172033;
        background: transparent;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .dynamic-suggestions .header-search-suggestion:hover,
      .dynamic-suggestions .header-search-suggestion:focus-visible {
        background: #eaf5fa;
        color: #172033;
        outline: none;
      }
      .header-search-suggestion .suggestion-icon {
        display: inline-grid;
        place-items: center;
        width: 18px;
        height: 18px;
      }
      .header-search-suggestion .suggestion-icon svg {
        width: 14px;
        height: 14px;
      }
      .persistent-suggestions .suggestion-label {
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 0.82rem;
        font-weight: 700;
      }
      .dynamic-suggestions .suggestion-type {
        padding-top: 2px;
        color: #6699cc;
        font-size: 0.64rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .dynamic-suggestions .suggestion-label {
        display: block;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.86rem;
        font-weight: 650;
      }
      .dynamic-suggestions small {
        grid-column: 2;
        overflow: hidden;
        margin-top: 2px;
        color: #65758b;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.72rem;
      }
      .header-search-empty {
        padding: 10px 4px;
        margin: 0;
        color: #65758b;
        font-size: 0.82rem;
      }
      .search-palette-hint {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin: 10px -14px -14px;
        padding: 12px 14px;
        border-top: 1px solid #dbe3ee;
        color: #64748b;
        font-size: 0.72rem;
      }
      .search-palette-hint kbd {
        padding: 1px 4px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        color: #475569;
        background: #f8fafc;
        font: inherit;
        font-size: 0.68rem;
      }

      .profile-dropdown-container {
        position: relative;
        margin-left: auto;
      }
      .avatar-trigger-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 10px 5px 5px;
        border: 1px solid #e2e8f0;
        border-radius: 999px;
        color: #64748b;
        background: #f8fafc;
        cursor: pointer;
        font: inherit;
      }
      .avatar-trigger-btn:hover,
      .avatar-trigger-btn:focus-visible {
        border-color: #cbd5e1;
        background: #f1f5f9;
        outline: none;
      }
      .user-avatar-img {
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        border: 1px solid #f97316;
        border-radius: 50%;
        color: #ffffff;
        background: #315f9d;
        font-size: 0.72rem;
        font-weight: 850;
      }
      .avatar-chevron {
        font-size: 0.62rem;
      }
      .profile-dropdown-menu {
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        z-index: 20;
        width: 260px;
        padding: 16px 0;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #ffffff;
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14);
      }
      .menu-user-header,
      .menu-section-group {
        padding: 0 20px;
      }
      .user-display-name,
      .user-display-email {
        margin: 0;
      }
      .user-display-name {
        color: #172033;
        font-size: 0.95rem;
        font-weight: 750;
      }
      .user-display-email {
        margin-top: 2px;
        color: #64748b;
        font-size: 0.8rem;
      }
      .menu-divider {
        height: 1px;
        margin: 12px 0;
        background: #f1f5f9;
      }
      .group-label {
        display: block;
        margin-bottom: 6px;
        color: #94a3b8;
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .active-plan-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 6px;
        color: #f97316;
        background: rgba(249, 115, 22, 0.08);
        font-size: 0.75rem;
        font-weight: 750;
      }
      .dropdown-links-list {
        display: flex;
        flex-direction: column;
      }
      .dropdown-item-link {
        padding: 10px 20px;
        color: #334155;
        font-size: 0.88rem;
        font-weight: 650;
        text-decoration: none;
      }
      .dropdown-item-link:hover,
      .dropdown-item-link:focus-visible {
        color: #0066cc;
        background: #f8fafc;
        outline: none;
      }
      .dropdown-item-link.logout-trigger {
        color: #ef4444;
      }
      .dropdown-item-link.logout-trigger:hover {
        color: #b91c1c;
        background: #fef2f2;
        outline: none;
      }
      @media (max-width: 760px) {
        .header-search-form {
          width: min(72vw, 340px);
        }
      }
      @media (max-width: 520px) {
        .header-search-form {
          width: 56vw;
        }
        .header-search-input {
          padding-left: 34px;
          font-size: 0.76rem;
        }
        .header-search-icon {
          left: 10px;
        }
      }
    `,
  ],
})
export class PlatformHeader {
  @Input() showSearch = false;
  private readonly router = inject(Router);
  private readonly content = inject(ContentService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private searchIndexLoaded = false;
  protected readonly persistentSuggestions = PERSISTENT_SUGGESTIONS;
  protected readonly profileMenuOpen = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly suggestionsOpen = signal(false);
  protected readonly paletteOpen = signal(false);
  protected readonly searchDocuments = signal<SearchDocument[]>([]);
  protected readonly visibleSuggestions = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const matchingDocuments = this.searchDocuments()
      .filter((document) => !query || document.searchableText.includes(query))
      .sort(
        (left, right) =>
          this.documentScore(right, query) - this.documentScore(left, query) ||
          left.title.localeCompare(right.title),
      );
    const documents = this.spreadAcrossCourses(matchingDocuments).slice(0, 20);
    if (!documents.length) return query ? [] : HEADER_SUGGESTIONS.slice(0, 6);
    return this.diverseSuggestions(documents);
  });

  protected openSuggestions(): void {
    if (this.showSearch || this.paletteOpen()) this.suggestionsOpen.set(true);
  }

  protected updateSearchQuery(value: string): void {
    this.searchQuery.set(value);
    this.suggestionsOpen.set(true);
    if (value.trim()) this.loadSearchIndex();
  }

  protected selectSuggestion(suggestion: HeaderSuggestion): void {
    this.suggestionsOpen.set(false);
    this.paletteOpen.set(false);
    if (suggestion.route) {
      this.router.navigate(suggestion.route, { queryParams: suggestion.queryParams });
      return;
    }
    this.searchQuery.set(suggestion.query);
    this.submitSearch();
  }

  protected submitSearch(): void {
    const query = this.searchQuery().trim();
    this.suggestionsOpen.set(false);
    this.paletteOpen.set(false);
    this.router.navigate(['/search'], { queryParams: query ? { q: query } : {} });
  }

  protected resetHomeScroll(): void {
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  @HostListener('document:keydown', ['$event'])
  protected toggleSearchPalette(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    if (this.paletteOpen()) {
      this.closeSearchPalette();
      return;
    }
    this.openSearchPalette();
  }

  private openSearchPalette(): void {
    this.loadSearchIndex();
    this.paletteOpen.set(true);
    this.suggestionsOpen.set(true);
    requestAnimationFrame(() =>
      (
        this.elementRef.nativeElement.querySelector(
          '.header-search-input',
        ) as HTMLInputElement | null
      )?.focus(),
    );
  }

  protected closeSearchPalette(): void {
    this.suggestionsOpen.set(false);
    this.paletteOpen.set(false);
    this.blurSearchInput();
  }

  private closeInlineSearch(): void {
    this.suggestionsOpen.set(false);
    this.blurSearchInput();
  }

  private blurSearchInput(): void {
    (
      this.elementRef.nativeElement.querySelector('.header-search-input') as HTMLInputElement | null
    )?.blur();
  }

  private loadSearchIndex(): void {
    if (this.searchIndexLoaded) return;
    this.searchIndexLoaded = true;
    this.content
      .getSearchIndex()
      .subscribe({ next: (documents) => this.searchDocuments.set(documents) });
  }

  private suggestionScore(suggestion: HeaderSuggestion, query: string): number {
    const label = suggestion.label.toLowerCase();
    if (label === query) return 100;
    if (label.startsWith(query)) return 80;
    if (label.split(/\s+/).some((word) => word.startsWith(query))) return 70;
    if (label.includes(query)) return 40;
    return 0;
  }

  private diverseSuggestions(documents: SearchDocument[]): HeaderSuggestion[] {
    const candidates: HeaderSuggestion[] = [
      ...documents.map((document) => ({
        type:
          document.contentType === 'theory'
            ? ('Theory' as const)
            : document.contentType === 'dsa-pattern'
              ? ('DSA' as const)
              : ('Question' as const),
        label: document.title,
        detail: `${document.courseTitle} · ${document.moduleTitle}`,
        query: document.title,
        route: document.route,
      })),
      ...documents.map((document) => ({
        type: 'Module' as const,
        label: document.moduleTitle,
        detail: document.courseTitle,
        query: document.moduleTitle,
        route: ['/', document.path, document.courseId, 'module', document.moduleId],
      })),
      ...documents.map((document) => ({
        type: 'Course' as const,
        label: document.courseTitle,
        detail: document.path === 'grow' ? 'Grow capability' : 'Learn competency',
        query: document.courseTitle,
        route: ['/', document.path, document.courseId],
      })),
      ...documents.flatMap((document) =>
        document.tags.map((tag) => ({
          type: 'Topic' as const,
          label: tag,
          query: tag,
          route: ['/search'],
          queryParams: { tags: tag },
        })),
      ),
    ];
    const unique = new Map<string, HeaderSuggestion>();
    for (const candidate of candidates)
      unique.set(`${candidate.type}:${candidate.label.toLowerCase()}`, candidate);
    const available = [...unique.values()];
    const result: HeaderSuggestion[] = [];
    const usedCourses = new Set<string>();
    for (const type of ['Theory', 'Question', 'DSA', 'Module', 'Course', 'Topic'] as const) {
      const matching = available.filter((item) => item.type === type);
      const candidate =
        matching.find((item) => {
          const course = this.suggestionCourse(item);
          return !course || !usedCourses.has(course);
        }) ?? matching[0];
      if (candidate) {
        result.push(candidate);
        const course = this.suggestionCourse(candidate);
        if (course) usedCourses.add(course);
      }
    }
    for (const candidate of available) {
      if (result.length === 8) break;
      if (!result.includes(candidate)) result.push(candidate);
    }
    return result;
  }

  private suggestionCourse(suggestion: HeaderSuggestion): string | null {
    const route = suggestion.route;
    return route?.[0] === '/' && route.length >= 3 ? `${route[1]}:${route[2]}` : null;
  }

  private documentScore(document: SearchDocument, query: string): number {
    if (!query) return document.contentType === 'theory' ? 3 : 1;
    const title = document.title.toLowerCase();
    if (title === query) return 100;
    if (title.includes(query)) return 80;
    if (
      document.moduleTitle.toLowerCase().includes(query) ||
      document.courseTitle.toLowerCase().includes(query)
    )
      return 60;
    return 20;
  }

  private spreadAcrossCourses(documents: SearchDocument[]): SearchDocument[] {
    const byCourse = new Map<string, SearchDocument[]>();
    for (const document of documents) {
      const key = `${document.path}:${document.courseId}`;
      byCourse.set(key, [...(byCourse.get(key) ?? []), document]);
    }
    const queues = [...byCourse.values()];
    const result: SearchDocument[] = [];
    while (queues.some((queue) => queue.length)) {
      for (const queue of queues) {
        const document = queue.shift();
        if (document) result.push(document);
      }
    }
    return result;
  }

  protected toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
  }

  @HostListener('document:keydown.escape')
  protected closeOverlays(): void {
    const restoreAccountFocus = this.profileMenuOpen();
    this.profileMenuOpen.set(false);
    this.closeSearchPalette();
    if (restoreAccountFocus) {
      requestAnimationFrame(() => {
        (
          this.elementRef.nativeElement.querySelector(
            '.avatar-trigger-btn',
          ) as HTMLButtonElement | null
        )?.focus();
      });
    }
  }

  @HostListener('window:scroll')
  protected closeInlineSearchOnScroll(): void {
    if (this.showSearch && this.suggestionsOpen()) this.closeInlineSearch();
  }

  @HostListener('document:click', ['$event'])
  protected closeOverlaysOnOutsideClick(event: MouseEvent): void {
    const path = event.composedPath();
    if ((event.target as HTMLElement | null)?.closest('.search-trigger')) {
      this.openSearchPalette();
      return;
    }
    const profileContainer = this.elementRef.nativeElement.querySelector(
      '.profile-dropdown-container',
    );
    const searchForm = this.elementRef.nativeElement.querySelector('.header-search-form');
    if (this.profileMenuOpen() && profileContainer && !path.includes(profileContainer))
      this.profileMenuOpen.set(false);
    if (this.suggestionsOpen() && searchForm && !path.includes(searchForm)) {
      if (!this.showSearch) this.closeSearchPalette();
      else this.closeInlineSearch();
    }
  }
}
