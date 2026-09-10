import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HeaderNavigation } from './header-navigation';
import { TopicShortcuts } from '../topic-shortcuts';
import { FormsModule } from '@angular/forms';
import { PlatformThemeService } from '../platform-theme';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ContentService } from '../../content/content.service';
import { SearchDocument } from '../../content/content.models';

type HeaderSuggestion = {
  type: 'Question' | 'Topic' | 'Course' | 'Module' | 'Theory' | 'DSA' | 'Tool' | 'Path' | 'Search';
  label: string;
  query: string;
  route?: string[];
  queryParams?: Record<string, string>;
  detail?: string;
};

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
  imports: [HeaderNavigation, TopicShortcuts, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './platform-header.html',
  styles: [
    `
      .platform-header {
        position: sticky;
        top: 0;
        z-index: 50;
        background: var(--surface-page);
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
        background: var(--surface-subtle);
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
        height: 44px;
        font-size: 1rem;
      }
      .header-search-form.search-palette .header-search-suggestions {
        max-height: calc(100dvh - 180px);
        overflow-y: auto;
        top: calc(100% - 1px);
        padding: 14px;
      }
      .header-search-field {
        position: relative;
      }
      .header-search-icon {
        position: absolute;
        top: 50%;
        inset-inline-start: 14px;
        width: 15px;
        height: 15px;
        color: var(--accent-link);
        pointer-events: none;
        transform: translateY(-50%);
      }
      .header-search-input {
        width: 100%;
        height: 42px;
        padding: 0 6px 0 32px;
        border: 0;
        border-radius: 3px;
        color: var(--text-strong);
        background: transparent;
        font: inherit;
        font-size: 0.86rem;
        transition:
          border-color 160ms ease,
          border-radius 160ms ease;
      }
      .header-search-input:focus {
        outline: none;
      }
      .header-search-suggestions {
        position: absolute;
        top: 42px;
        left: 0;
        z-index: 25;
        width: 100%;
        padding: 12px;
        border: 1px solid var(--line);
        border-top: 0;
        border-radius: 0 0 14px 14px;
        background: var(--surface-page);
        box-shadow: 0 16px 34px var(--shadow);
      }
      .dynamic-suggestions {
        display: block;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--line);
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
        color: var(--text-strong);
        background: transparent;
        cursor: pointer;
        font: inherit;
        text-align: start;
        text-decoration: none;
      }
      .dynamic-suggestions .header-search-suggestion:hover,
      .dynamic-suggestions .header-search-suggestion:focus-visible {
        background: var(--surface-accent);
        color: var(--text-strong);
        outline: none;
      }
      .dynamic-suggestions .suggestion-type {
        padding-top: 2px;
        color: var(--accent-link);
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
        color: var(--muted);
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.72rem;
      }
      .header-search-empty {
        padding: 10px 4px;
        margin: 0;
        color: var(--muted);
        font-size: 0.82rem;
      }
      .search-palette-hint {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin: 10px -14px -14px;
        padding: 12px 14px;
        border-top: 1px solid var(--line);
        color: var(--text-subtle);
        font-size: 0.72rem;
      }
      .search-palette-hint kbd {
        padding: 1px 4px;
        border: 1px solid var(--line);
        border-radius: 4px;
        color: var(--text-body);
        background: var(--surface-subtle);
        font: inherit;
        font-size: 0.68rem;
      }

      .profile-dropdown-container {
        position: relative;
        margin-left: 8px;
      }
      .study-plan-link {
        margin-left: auto;
        padding: 8px 11px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--accent-link);
        background: var(--surface);
        font-size: 0.76rem;
        font-weight: 800;
        text-decoration: none;
        white-space: nowrap;
      }
      .study-plan-link:hover,
      .study-plan-link:focus-visible {
        border-color: var(--accent-strong);
        color: var(--accent-link);
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      @media (max-width: 760px) {
        .study-plan-link {
          padding-inline: 9px;
          font-size: 0.7rem;
        }
      }
      .avatar-trigger-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 10px 5px 5px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--text-subtle);
        background: var(--surface-subtle);
        cursor: pointer;
        font: inherit;
      }
      .avatar-trigger-btn:hover,
      .avatar-trigger-btn:focus-visible {
        border-color: var(--line);
        background: var(--surface-muted);
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .user-avatar-img {
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        border: 1px solid var(--warning);
        border-radius: 50%;
        color: var(--surface-page);
        background: var(--accent-link);
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
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--surface-page);
        box-shadow: 0 16px 36px var(--shadow);
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
        color: var(--text-strong);
        font-size: 0.95rem;
        font-weight: 750;
      }
      .user-display-email {
        margin-top: 2px;
        color: var(--text-subtle);
        font-size: 0.8rem;
      }
      .menu-divider {
        height: 1px;
        margin: 12px 0;
        background: var(--surface-muted);
      }
      .group-label {
        display: block;
        margin-bottom: 6px;
        color: var(--text-subtle);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .active-plan-badge {
        display: inline-block;
        color: var(--text-subtle);
        font-size: 0.75rem;
        font-weight: 750;
      }
      .dropdown-links-list {
        display: flex;
        flex-direction: column;
      }
      .dropdown-item-link {
        padding: 10px 20px;
        color: var(--text-body);
        font-size: 0.88rem;
        font-weight: 650;
        text-decoration: none;
      }
      .dropdown-item-link:hover,
      .dropdown-item-link:focus-visible {
        color: var(--accent-link);
        background: var(--surface-subtle);
        outline: none;
      }
      .dropdown-item-link.logout-trigger {
        color: var(--danger);
      }
      .dropdown-item-link.logout-trigger:hover {
        color: var(--danger);
        background: var(--surface-accent);
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
      .platform-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: 24px;
        padding: 12px 4%;
        min-height: 76px;
      }
      .platform-header .brand {
        justify-self: start;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -1px;
        white-space: nowrap;
      }
      .platform-header .brand span {
        color: var(--accent-strong);
      }
      .platform-navigation {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 26px;
        margin: 0;
        white-space: nowrap;
      }
      .platform-navigation a,
      .header-utilities > a,
      .header-search-trigger {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        color: var(--muted);
        font:
          500 13px/1.2 system-ui,
          sans-serif;
        text-decoration: none;
        white-space: nowrap;
      }
      .platform-navigation a[aria-current='page'],
      .header-utilities > a[aria-current='page'] {
        color: var(--text-strong);
        font-weight: 700;
      }
      .header-utilities {
        justify-self: end;
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .header-search-trigger {
        gap: 7px;
        border: 0;
        padding: 0;
        background: transparent;
        cursor: pointer;
      }
      .header-search-trigger kbd {
        font-family: inherit;
        font-size: 11px;
        line-height: 1.2;
        color: var(--muted);
      }
      .theme-switch {
        display: flex;
        gap: 2px;
        padding: 2px;
        flex-shrink: 0;
        border: 1px solid var(--line);
        border-radius: 5px;
      }
      .theme-switch button {
        border: 0;
        border-radius: 3px;
        padding: 4px 7px;
        min-height: 28px;
        background: transparent;
        color: var(--muted);
        font:
          500 11px/1.2 system-ui,
          sans-serif;
        cursor: pointer;
      }
      .theme-switch button[aria-pressed='true'] {
        color: var(--accent-on-primary);
        background: var(--accent-strong);
      }
      .header-utilities .profile-dropdown-container {
        margin: 0;
      }
      .platform-header.with-search .header-search-form:not(.search-palette) {
        position: relative;
        left: auto;
        top: auto;
        transform: none;
        width: min(340px, 30vw);
      }
      @media (max-width: 1199px) {
        .platform-header {
          grid-template-columns: auto minmax(0, 1fr);
          gap: 4px 20px;
        }
        .platform-navigation {
          grid-row: 2;
          grid-column: 1 / -1;
        }
        .header-utilities {
          grid-column: 2;
          grid-row: 1;
        }
      }
      @media (max-width: 600px) {
        .platform-header {
          padding: 8px 5%;
          gap: 2px 10px;
        }
        .platform-header .brand {
          font-size: 21px;
        }
        .header-utilities {
          display: contents;
        }
        .platform-navigation {
          grid-row: 2;
          gap: 22px;
        }
        .header-search-trigger {
          grid-column: 1;
          grid-row: 3;
          justify-self: start;
        }
        .header-search-trigger kbd {
          display: none;
        }
        .header-utilities > a {
          grid-column: 2;
          grid-row: 3;
          justify-self: end;
        }
        .theme-switch {
          grid-column: 2;
          grid-row: 1;
          justify-self: end;
        }
        .header-utilities .profile-dropdown-container {
          display: none;
        }
      }
      @media (pointer: coarse) {
        .theme-switch button {
          min-height: 40px;
          min-width: 44px;
        }
      }
    `,
    `
      .platform-navigation {
        gap: 12px;
      }
      .header-search-field {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        border: 1px solid var(--line);
        border-radius: 5px;
        background: var(--surface);
      }
      .header-search-field:focus-within {
        border-color: var(--accent-strong);
        outline: 2px solid var(--accent-strong);
        outline-offset: 2px;
      }
      .header-search-field .header-search-input {
        min-width: 0;
        width: 100%;
        padding-inline: 32px 6px;
      }
      .search-submit {
        flex-shrink: 0;
        min-height: 44px;
        padding: 10px 26px;
        border-radius: 3px;
        font-size: 14px;
        background: var(--accent-strong);
        color: var(--accent-on-primary);
        border: 0;
        font-weight: 700;
        cursor: pointer;
      }
      .search-submit:focus-visible {
        outline: 2px solid var(--accent-strong);
        outline-offset: 3px;
      }
      @media (max-width: 600px) {
        .platform-navigation {
          gap: 6px;
        }
        .search-submit {
          padding: 10px 14px;
        }
      }
    `,
  ],
})
export class PlatformHeader implements AfterViewInit, OnDestroy {
  private headerResizeObserver?: ResizeObserver;
  ngAfterViewInit(): void {
    const header = this.elementRef.nativeElement.querySelector<HTMLElement>('.platform-header');
    const page = this.elementRef.nativeElement.parentElement;
    if (!header || !page) return;
    const updateHeight = () => {
      const height = header.getBoundingClientRect().height;
      if (height > 0) page.style.setProperty('--platform-header-height', `${height}px`);
    };
    updateHeight();
    if (typeof ResizeObserver !== 'undefined') {
      this.headerResizeObserver = new ResizeObserver(updateHeight);
      this.headerResizeObserver.observe(header);
    }
  }
  ngOnDestroy(): void {
    this.headerResizeObserver?.disconnect();
  }

  protected readonly theme = inject(PlatformThemeService);
  @Input() showSearch = false;
  private readonly router = inject(Router);
  private readonly content = inject(ContentService);
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
  private searchIndexLoaded = false;
  private searchReturnFocus: HTMLElement | null = null;
  protected readonly searchShortcut = /Mac|iPhone|iPad/.test(
    this.elementRef.nativeElement.ownerDocument.defaultView?.navigator.platform ?? '',
  )
    ? '⌘K'
    : 'Ctrl K';
  @ViewChild(HeaderNavigation) private navigation?: HeaderNavigation;
  protected closeForNavigation(): void {
    this.closeSearchPalette(false);
    this.profileMenuOpen.set(false);
  }
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

  protected toggleSearch(event: MouseEvent): void {
    event.stopPropagation();
    if (this.paletteOpen()) this.closeSearchPalette();
    else this.openSearchPalette();
  }

  @HostListener('document:keydown', ['$event'])
  protected toggleSearchPalette(event: KeyboardEvent): void {
    if (this.paletteOpen() && event.key === 'Tab') {
      const controls = [
        ...this.elementRef.nativeElement.querySelectorAll<HTMLElement>(
          '.search-palette input, .search-palette button:not([disabled]), .search-palette a[href]',
        ),
      ];
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = this.elementRef.nativeElement.ownerDocument.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.altKey ||
      event.key.toLowerCase() !== 'k' ||
      (!event.metaKey && !event.ctrlKey)
    )
      return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      !this.paletteOpen() &&
      target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
      )
    )
      return;
    event.preventDefault();
    if (this.paletteOpen()) this.closeSearchPalette();
    else this.openSearchPalette();
  }

  private openSearchPalette(): void {
    this.navigation?.close();
    this.searchReturnFocus = this.elementRef.nativeElement.ownerDocument
      .activeElement as HTMLElement | null;
    this.profileMenuOpen.set(false);
    this.loadSearchIndex();
    this.paletteOpen.set(true);
    this.suggestionsOpen.set(true);
    requestAnimationFrame(() =>
      this.elementRef.nativeElement
        .querySelector<HTMLInputElement>('.header-search-input')
        ?.focus(),
    );
  }

  protected closeSearchPalette(restoreFocus = true): void {
    const wasOpen = this.paletteOpen();
    this.suggestionsOpen.set(false);
    this.paletteOpen.set(false);
    if (wasOpen && restoreFocus) {
      const target = this.searchReturnFocus;
      requestAnimationFrame(() => {
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    }
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
        type: this.documentType(document),
        label: document.title,
        detail:
          document.discoveryKind === 'course' || document.discoveryKind === 'tool'
            ? this.pathLabel(document.path)
            : `${document.courseTitle} · ${document.moduleTitle}`,
        query: document.title,
        route: document.route,
      })),
      ...documents
        .filter((document) => !document.discoveryKind)
        .map((document) => ({
          type: 'Module' as const,
          label: document.moduleTitle,
          detail: document.courseTitle,
          query: document.moduleTitle,
          route: ['/', document.path, document.courseId, 'module', document.moduleId],
        })),
      ...documents
        .filter((document) => !document.discoveryKind)
        .map((document) => ({
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
    for (const type of [
      'Course',
      'Topic',
      'Theory',
      'Question',
      'DSA',
      'Tool',
      'Module',
    ] as const) {
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

  private documentType(document: SearchDocument): HeaderSuggestion['type'] {
    if (document.discoveryKind === 'course') return 'Course';
    if (document.discoveryKind === 'topic') return 'Topic';
    if (document.discoveryKind === 'tool') return 'Tool';
    if (document.contentType === 'theory') return 'Theory';
    if (document.contentType === 'dsa-pattern' || document.contentType === 'dsa-problem')
      return 'DSA';
    return 'Question';
  }

  private pathLabel(path: SearchDocument['path']): string {
    return path === 'look-ahead' ? 'Look Ahead' : `${path[0].toUpperCase()}${path.slice(1)}`;
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
    this.navigation?.close();
    this.closeSearchPalette(false);
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
