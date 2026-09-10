import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, Scroll } from '@angular/router';
import { ContentService } from '../../content/content.service';
import {
  HandsOnDifficulty,
  HandsOnDsaIndex,
  HandsOnDsaIndexProblemResult,
  HandsOnSort,
  HandsOnTierScope,
  filterHandsOnDsaIndexGroups,
  rankedHandsOnDsaIndexProblems,
  resolveHandsOnDsaIndexGroup,
} from '../../content/hands-on-dsa';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-hands-on-dsa',
  imports: [PlatformHeader, RouterLink, NgTemplateOutlet],
  templateUrl: './hands-on-dsa.html',
  styles: [
    `
      .practice-reader {
        --practice-ink: var(--text-strong);
        --practice-body: var(--text-body);
        --practice-accent: var(--accent-strong);
      }
      .practice-breadcrumb-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      .practice-breadcrumb-bar .breadcrumbs {
        margin: 0;
      }
      .practice-hero {
        position: relative;
        overflow: hidden;
        margin: 22px 0 18px;
        padding: clamp(24px, 4vw, 46px);
        border: 1px solid var(--line);
        border-radius: 20px;
        color: var(--practice-body);
        background:
          radial-gradient(
            circle at 92% 10%,
            color-mix(in srgb, var(--accent-secondary) 20%, transparent),
            transparent 28%
          ),
          linear-gradient(135deg, var(--surface-accent) 0%, var(--surface) 64%);
        box-shadow: 0 16px 38px var(--shadow);
      }
      .practice-hero::after {
        content: '';
        position: absolute;
        right: -28px;
        bottom: -75px;
        width: 220px;
        height: 220px;
        border: 28px solid color-mix(in srgb, var(--accent-strong) 8%, transparent);
        border-radius: 50%;
        pointer-events: none;
      }
      .practice-hero h1 {
        max-width: 830px;
        margin: 9px 0 10px;
        color: var(--practice-ink);
        font-family: 'Avenir Next', Avenir, 'Segoe UI', sans-serif;
        font-size: clamp(2rem, 4vw, 3.8rem);
        line-height: 1.04;
        letter-spacing: -0.055em;
      }
      .practice-hero > p {
        max-width: 740px;
        margin: 0;
        font-size: clamp(1rem, 1vw + 0.72rem, 1.18rem);
        line-height: 1.65;
      }
      .practice-hero .review-status.practice-status {
        position: relative;
        gap: 0;
        padding: 0 0 0 28px;
        border: 0;
        border-radius: 0;
        color: var(--text-subtle);
        background: transparent;
        font-size: 0.66rem;
        letter-spacing: 0.09em;
        line-height: 1.25;
      }
      .practice-status::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        width: 20px;
        height: 2px;
        background: var(--accent-secondary);
        transform: translateY(-50%);
      }
      .practice-proof {
        display: flex;
        gap: 14px 20px;
        flex-wrap: wrap;
        margin-top: 19px;
        padding: 0;
        list-style: none;
      }
      .practice-proof li {
        color: var(--practice-accent);
        font-size: 0.72rem;
        font-weight: 850;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }
      .practice-hero-actions {
        position: relative;
        z-index: 1;
        display: flex;
        margin-top: 22px;
      }
      .surprise-problem {
        display: inline-flex;
        max-width: 470px;
        min-height: 58px;
        align-items: center;
        gap: 12px;
        padding: 10px 16px 10px 10px;
        border: 1px solid var(--accent-strong);
        border-radius: 14px;
        color: var(--text-strong);
        background: var(--surface);
        box-shadow: 0 8px 20px var(--shadow);
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .surprise-problem:hover,
      .surprise-problem:focus-visible {
        border-color: var(--accent-strong);
        outline: 3px solid var(--accent-focus);
        outline-offset: 3px;
      }
      .surprise-problem:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
      .surprise-problem-mark {
        display: grid;
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 10px;
        color: var(--accent-on-primary);
        background: var(--accent-strong);
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 1.2rem;
        font-weight: 900;
      }
      .surprise-problem strong,
      .surprise-problem small {
        display: block;
      }
      .surprise-problem strong {
        color: var(--practice-ink);
        font-size: 0.9rem;
      }
      .surprise-problem small {
        margin-top: 2px;
        color: var(--practice-body);
        font-size: 0.72rem;
        line-height: 1.35;
      }
      .pattern-group-metadata {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        color: var(--practice-accent);
        font-size: 0.66rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .pattern-group-metadata-separator {
        color: var(--text-subtle);
      }
      .practice-controls {
        display: grid;
        grid-template-columns: minmax(260px, 1.4fr) repeat(2, minmax(150px, 0.55fr));
        gap: 14px;
        align-items: end;
        margin: 18px 0;
        padding: 17px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--surface);
      }
      .practice-controls label {
        display: grid;
        gap: 6px;
        color: var(--practice-body);
        font-size: 0.72rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .practice-controls input,
      .practice-controls select {
        width: 100%;
        min-height: 44px;
        padding: 9px 12px;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        color: var(--practice-ink);
        background: var(--surface);
        font:
          700 0.9rem 'Avenir Next',
          Avenir,
          sans-serif;
      }
      .pattern-filter {
        display: flex;
        gap: 8px;
        margin: 0 0 22px;
        padding: 4px 3px 10px;
        overflow-x: auto;
        scroll-padding-inline: 12%;
        scroll-snap-type: x proximity;
        scrollbar-width: thin;
        mask-image: linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent);
      }
      .pattern-filter a {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: baseline;
        gap: 6px;
        scroll-snap-align: center;
        padding: 8px 12px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--accent-link);
        background: var(--surface);
        font-size: 0.78rem;
        font-weight: 800;
        text-decoration: none;
      }
      .pattern-filter a[aria-current='page'] {
        border-color: var(--practice-accent);
        color: var(--accent-on-primary);
        background: var(--practice-accent);
      }
      .pattern-filter-order {
        color: var(--accent-secondary-strong);
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 0.68rem;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0;
      }
      .pattern-filter a[aria-current='page'] .pattern-filter-order {
        color: var(--accent-on-primary);
        opacity: 0.82;
      }
      .active-practice {
        margin: 0 0 26px;
        padding: clamp(18px, 3vw, 28px);
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--surface);
      }
      .active-practice > header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 18px;
      }
      .active-practice h2,
      .pattern-group h2 {
        margin: 5px 0 7px;
        color: var(--practice-ink);
        font-family: 'Avenir Next', Avenir, 'Segoe UI', sans-serif;
        letter-spacing: -0.03em;
      }
      .pattern-group h2 {
        display: flex;
        align-items: baseline;
        gap: 10px;
      }
      .pattern-group-order {
        flex: 0 0 auto;
        color: var(--accent-secondary-strong);
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 0.86rem;
        font-variant-numeric: tabular-nums;
        font-weight: 900;
        letter-spacing: 0;
      }
      .active-practice header p,
      .pattern-group summary p {
        margin: 0;
        color: var(--practice-body);
        line-height: 1.55;
      }
      .lesson-link {
        flex: 0 0 auto;
        color: var(--accent-link);
        font-size: 0.8rem;
        font-weight: 800;
        text-decoration: none;
      }
      .group-links {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding: 0 20px 16px;
      }
      .workbench-wrap {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid var(--line);
        scroll-margin-top: 138px;
      }
      .practice-results-header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 18px;
        margin: 28px 0 12px;
      }
      .practice-results-header h2 {
        margin: 0;
        color: var(--practice-ink);
        font-family: 'Avenir Next', Avenir, sans-serif;
        font-size: 1.45rem;
      }
      .practice-results-header p {
        margin: 0;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 700;
      }
      .practice-results-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }
      .clear-pattern-filter,
      .clear-catalog-filters {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        gap: 7px;
        padding: 7px 12px;
        border: 1px solid var(--border-strong);
        border-radius: 999px;
        color: var(--accent-link);
        background: var(--surface);
        font-size: 0.76rem;
        font-weight: 850;
        text-decoration: none;
      }
      .clear-pattern-filter span,
      .clear-catalog-filters span {
        color: var(--practice-accent);
        font-size: 1.1rem;
        line-height: 1;
      }
      .clear-pattern-filter:hover,
      .clear-pattern-filter:focus-visible,
      .clear-catalog-filters:hover,
      .clear-catalog-filters:focus-visible {
        border-color: var(--practice-accent);
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .pattern-groups {
        display: grid;
        gap: 12px;
        overflow-anchor: none;
      }
      .pattern-group {
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--surface);
        box-shadow: 0 9px 25px var(--shadow);
      }
      .pattern-group-header {
        padding: 18px;
      }
      .pattern-group-header p {
        color: var(--text-subtle);
        margin: 8px 0;
      }
      .problem-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        color: var(--practice-body);
        background: var(--surface);
      }
      .problem-table th,
      .problem-table td {
        padding: 14px 18px;
        border-bottom: 1px solid var(--line);
        text-align: start;
        vertical-align: middle;
        overflow-wrap: anywhere;
      }
      .problem-table th {
        background: var(--surface-muted);
        color: var(--text-strong);
        font-size: 0.8rem;
        font-weight: 800;
      }
      .problem-table th:first-child {
        width: 52%;
      }
      .problem-table th:not(:first-child),
      .problem-table td:not(:first-child) {
        text-align: end;
        font-variant-numeric: tabular-nums;
        font-size: 0.8rem;
      }
      .column-sort,
      .group-patterns {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 4px 0;
        border: 0;
        background: transparent;
        color: var(--accent-strong);
        font: inherit;
        font-weight: 700;
        text-align: inherit;
        cursor: pointer;
      }
      .column-sort span {
        flex-shrink: 0;
      }
      .column-sort:hover {
        text-decoration: underline;
      }
      .column-sort:disabled {
        color: var(--text-subtle);
        cursor: default;
        text-decoration: none;
      }
      .column-sort:focus-visible,
      .group-patterns:focus-visible {
        outline: 2px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .group-patterns {
        padding: 6px 12px;
        border: 1px solid var(--line);
        border-radius: 5px;
        font-size: 0.8rem;
      }
      .group-patterns[aria-pressed='true'] {
        background: var(--surface-muted);
        border-color: var(--accent-strong);
      }
      .problem-link {
        display: flex;
        align-items: center;
        min-height: 44px;
        color: var(--accent-link);
        font-weight: 800;
        text-decoration: none;
      }
      .problem-link:hover {
        text-decoration: underline;
      }
      .problem-link:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .problem-pattern {
        display: block;
        color: var(--text-subtle);
        font-size: 0.76rem;
      }
      @media (max-width: 700px) {
        .problem-table,
        .problem-table tbody {
          display: block;
        }
        .problem-table thead {
          display: block;
        }
        .problem-table thead tr {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .problem-table th,
        .problem-table th:first-child {
          width: auto;
          padding: 4px 8px;
        }
        .problem-table th:not(:first-child) {
          text-align: start;
        }
        .problem-table-row {
          display: block;
          padding: 12px 16px;
          border-bottom: 1px solid var(--line);
        }
        .problem-table td {
          display: block;
          padding: 4px 0;
          border: 0;
        }
        .problem-table td[data-label] {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
        }
        .problem-table td[data-label]::before {
          content: attr(data-label);
          text-align: start;
          color: var(--text-subtle);
        }
        .problem-title-cell {
          padding-bottom: 10px !important;
        }
      }
      .problem-pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 20px;
      }
      .problem-pagination a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        padding: 4px 9px;
        border: 1px solid var(--line);
        border-radius: 5px;
        color: var(--accent-link);
        background: var(--surface);
        text-decoration: none;
        font-weight: 700;
      }
      .problem-pagination a[aria-current='page'] {
        color: var(--accent-on-primary);
        background: var(--accent-strong);
      }
      .problem-pagination a:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .practice-results-header {
        scroll-margin-top: calc(var(--platform-header-height, 76px) + 100px);
      }
      @media (max-width: 440px) {
        .pagination-direction {
          flex-basis: 40%;
        }
        .pagination-previous {
          order: 1;
        }
        .pagination-next {
          order: 2;
        }
      }
      .empty-state {
        padding: 34px;
        border: 1px dashed var(--border-strong);
        border-radius: 14px;
        text-align: center;
        background: var(--surface);
      }
      .empty-state h2 {
        margin-top: 0;
        color: var(--practice-ink);
      }
      @media (max-width: 640px) {
        .practice-breadcrumb-bar {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          align-items: start;
        }
        .practice-breadcrumb-bar .breadcrumbs {
          width: 100%;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: thin;
        }
        .practice-breadcrumb-bar .reader-search-link {
          position: static;
          justify-self: start;
        }
        .practice-controls {
          grid-template-columns: minmax(0, 1fr);
        }
        .active-practice > header,
        .practice-results-header {
          display: grid;
        }
        .practice-results-meta {
          justify-content: start;
        }
        .lesson-link {
          justify-self: start;
        }
        .group-links {
          justify-content: start;
        }
      }
      @media (min-width: 641px) and (max-width: 1050px) {
        .practice-controls {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (forced-colors: active) {
        .practice-hero,
        .practice-controls,
        .active-practice,
        .pattern-group,
        .pattern-filter a,
        .clear-pattern-filter,
        .clear-catalog-filters,
        .surprise-problem {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .pattern-filter a[aria-current='page'] {
          color: HighlightText;
          background: Highlight;
        }
      }
    `,
  ],
})
export class HandsOnDsa implements OnInit {
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private focusResultsAfterPaging = false;
  private focusColumnAfterSorting: string | null = null;
  protected readonly catalog = signal<HandsOnDsaIndex | null>(null);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly difficulty = signal<HandsOnDifficulty>('All');
  protected readonly tierScope = signal<HandsOnTierScope>('730');
  protected readonly sort = signal<HandsOnSort>('study-order');
  protected readonly patternId = signal('');
  protected readonly pageSize = 25;
  private readonly requestedPage = signal(1);
  private readonly lastSurpriseProblemId = signal('');
  protected readonly difficulties: HandsOnDifficulty[] = [
    'All',
    'Beginner',
    'Intermediate',
    'Advanced',
  ];
  protected readonly tierScopes: { value: HandsOnTierScope; label: string }[] = [
    { value: '150', label: 'Universal Must-Do · 150' },
    { value: '365', label: 'Interview Core · 365' },
    { value: '600', label: 'Pattern Depth · 600' },
    { value: '730', label: 'Full Library' },
  ];
  protected readonly sortOptions: { value: HandsOnSort; label: string }[] = [
    { value: 'title-ascending', label: 'Problem: A to Z' },
    { value: 'title-descending', label: 'Problem: Z to A' },
    { value: 'study-order-descending', label: 'Learning order: descending' },
    { value: 'interview-rank-descending', label: 'Interview priority: descending' },
    { value: 'pattern-order', label: 'Pattern' },
    { value: 'study-order', label: 'Learning order' },
    { value: 'interview-rank', label: 'Interview priority' },
    { value: 'difficulty-ascending', label: 'Difficulty: Beginner first' },
    { value: 'difficulty-descending', label: 'Difficulty: Advanced first' },
  ];
  protected readonly sortColumns = [
    { id: 'title', label: 'Problem', ascending: 'title-ascending', descending: 'title-descending' },
    {
      id: 'difficulty',
      label: 'Difficulty',
      ascending: 'difficulty-ascending',
      descending: 'difficulty-descending',
    },
    {
      id: 'interview',
      label: 'Interview priority',
      ascending: 'interview-rank',
      descending: 'interview-rank-descending',
    },
    {
      id: 'learning',
      label: 'Learning order',
      ascending: 'study-order',
      descending: 'study-order-descending',
    },
  ] as const;

  protected columnSortDirection(id: string): 'ascending' | 'descending' | 'none' {
    const column = this.sortColumns.find((item) => item.id === id)!;
    return this.sort() === column.ascending
      ? 'ascending'
      : this.sort() === column.descending
        ? 'descending'
        : 'none';
  }

  protected columnSortLabel(id: string, label: string): string {
    if (id === 'difficulty' && this.difficulty() !== 'All')
      return 'Difficulty: sorting unavailable while filtered to one difficulty';
    const direction = this.columnSortDirection(id) === 'ascending' ? 'descending' : 'ascending';
    return `Sort by ${label.toLowerCase()}, ${direction}`;
  }

  protected sortColumn(id: string): void {
    const column = this.sortColumns.find((item) => item.id === id)!;
    this.focusColumnAfterSorting = column.id;
    this.updateSort(
      this.columnSortDirection(id) === 'ascending' ? column.descending : column.ascending,
    );
  }

  protected preparationOrderLabel(order: number): string {
    return order.toString().padStart(2, '0');
  }
  protected readonly groups = computed(() => this.catalog()?.groups ?? []);
  protected readonly selectedGroup = computed(() =>
    resolveHandsOnDsaIndexGroup(this.groups(), this.patternId()),
  );
  protected readonly visibleGroups = computed(() => {
    const selected = this.selectedGroup();
    return filterHandsOnDsaIndexGroups(
      selected ? [selected] : this.groups(),
      this.query(),
      this.difficulty(),
      this.tierScope(),
      this.sort(),
    );
  });
  protected readonly visibleRankedProblems = computed(() =>
    this.sort() === 'pattern-order'
      ? []
      : rankedHandsOnDsaIndexProblems(
          this.visibleGroups(),
          this.sort() as Exclude<HandsOnSort, 'pattern-order'>,
        ),
  );
  // Group order remains authored; deduplicate before slicing so each page owns 25 problems.
  protected readonly orderedProblems = computed(() => {
    if (this.sort() !== 'pattern-order') return this.visibleRankedProblems();
    const problems = new Map<string, HandsOnDsaIndexProblemResult>();
    for (const group of this.visibleGroups()) {
      for (const problem of group.problems) {
        if (!problems.has(problem.id))
          problems.set(problem.id, {
            ...problem,
            patternId: group.id,
            patternTitle: group.title,
            patternPreparationOrder: group.preparationOrder,
          });
      }
    }
    return [...problems.values()];
  });
  protected readonly pageCount = computed(() =>
    Math.ceil(this.orderedProblems().length / this.pageSize),
  );
  protected readonly currentPage = computed(() =>
    Math.min(this.requestedPage(), Math.max(1, this.pageCount())),
  );
  protected readonly pageOffset = computed(() => (this.currentPage() - 1) * this.pageSize);
  protected readonly displayedRankedProblems = computed(() =>
    this.orderedProblems().slice(this.pageOffset(), this.pageOffset() + this.pageSize),
  );
  protected readonly displayedGroups = computed(() => {
    const pageProblems = this.displayedRankedProblems();
    return this.visibleGroups()
      .map((group) => ({
        ...group,
        problems: pageProblems.filter((problem) => problem.patternId === group.id),
      }))
      .filter((group) => group.problems.length > 0);
  });
  protected readonly resultRange = computed(() => {
    const count = this.orderedProblems().length;
    if (!count) return '0 problems';
    return `${this.pageOffset() + 1}–${Math.min(this.pageOffset() + this.pageSize, count)} of ${count} ${count === 1 ? 'problem' : 'problems'}`;
  });
  protected readonly pageLinks = computed(() => {
    const current = this.currentPage();
    const last = this.pageCount();
    const pages = [...new Set([1, current - 1, current, current + 1, last])]
      .filter((page) => page >= 1 && page <= last)
      .sort((a, b) => a - b);
    const links: (number | 'gap-before' | 'gap-after')[] = [];
    for (const page of pages) {
      const previous = links.at(-1);
      if (typeof previous === 'number' && page - previous > 1) {
        links.push(page <= current ? 'gap-before' : 'gap-after');
      }
      links.push(page);
    }
    return links;
  });
  protected readonly hasCatalogFilters = computed(
    () =>
      Boolean(this.query()) ||
      this.difficulty() !== 'All' ||
      this.tierScope() !== '730' ||
      this.sort() !== 'study-order',
  );
  private readonly randomPracticePool = computed(() => {
    const candidates = new Map<string, { id: string; route: string[]; version: string }>();

    for (const group of this.groups()) {
      for (const problem of group.problems) {
        candidates.set(problem.id, {
          id: problem.id,
          route: problem.route,
          version: problem.version,
        });
      }
    }

    return [...candidates.values()];
  });
  protected readonly randomPracticeCount = computed(() => this.randomPracticePool().length);

  ngOnInit(): void {
    this.content
      .getHandsOnDsaIndex()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) => {
          this.catalog.set(catalog);
          queueMicrotask(() => this.canonicalizePage());
        },
        error: () => this.error.set('The practice catalog could not be loaded. Please try again.'),
      });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const page = params.get('page') ?? '';
      const parsedPage = /^[1-9]\d*$/.test(page) ? Number(page) : 1;
      this.requestedPage.set(Number.isSafeInteger(parsedPage) ? parsedPage : 1);
      this.patternId.set(params.get('pattern') ?? '');
      this.query.set(params.get('q') ?? '');
      const difficulty = params.get('difficulty');
      this.difficulty.set(
        this.difficulties.includes(difficulty as HandsOnDifficulty)
          ? (difficulty as HandsOnDifficulty)
          : 'All',
      );
      const scope = params.get('scope');
      this.tierScope.set(
        this.tierScopes.some((option) => option.value === scope)
          ? (scope as HandsOnTierScope)
          : '730',
      );
      const requestedSort = params.get('sort');
      const sort = requestedSort === 'difficulty' ? 'difficulty-ascending' : requestedSort;
      const selectedSort: HandsOnSort = this.sortOptions.some((option) => option.value === sort)
        ? (sort as HandsOnSort)
        : 'study-order';
      this.sort.set(
        this.difficulty() !== 'All' && this.isDifficultySort(selectedSort)
          ? 'study-order'
          : selectedSort,
      );
      queueMicrotask(() => this.canonicalizePage());
    });
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof Scroll) || !this.focusResultsAfterPaging) return;
      this.focusResultsAfterPaging = false;
      const sortedColumn = this.focusColumnAfterSorting;
      this.focusColumnAfterSorting = null;
      window.requestAnimationFrame(() => {
        if (this.destroyRef.destroyed) return;
        const results = this.element.nativeElement.querySelector<HTMLElement>('#practice-results');
        const focusTarget = sortedColumn
          ? this.element.nativeElement.querySelector<HTMLElement>(
              `[data-sort-column="${sortedColumn}"]`,
            )
          : results;
        focusTarget?.focus({ preventScroll: true });
        results?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    });
  }

  protected updateQuery(value: string): void {
    this.query.set(value);
    this.updateCatalogParams({ q: value || null }, true);
  }

  protected updateDifficulty(value: string): void {
    const difficulty = this.difficulties.includes(value as HandsOnDifficulty)
      ? (value as HandsOnDifficulty)
      : 'All';
    this.difficulty.set(difficulty);
    const resetDifficultySort = difficulty !== 'All' && this.isDifficultySort(this.sort());
    if (resetDifficultySort) this.sort.set('study-order');
    this.updateCatalogParams({
      difficulty: difficulty === 'All' ? null : difficulty,
      ...(resetDifficultySort ? { sort: null } : {}),
    });
  }

  protected updateTierScope(value: string): void {
    const scope = this.tierScopes.some((option) => option.value === value)
      ? (value as HandsOnTierScope)
      : '730';
    this.tierScope.set(scope);
    this.updateCatalogParams({ scope: scope === '730' ? null : scope });
  }

  protected updateSort(value: string): void {
    const requestedSort = this.sortOptions.some((option) => option.value === value)
      ? (value as HandsOnSort)
      : 'study-order';
    const sort = this.sortOptionDisabled(requestedSort) ? 'study-order' : requestedSort;
    this.focusResultsAfterPaging = true;
    this.sort.set(sort);
    this.updateCatalogParams({ sort: sort === 'study-order' ? null : sort });
  }

  protected sortOptionDisabled(sort: HandsOnSort): boolean {
    return this.difficulty() !== 'All' && this.isDifficultySort(sort);
  }

  protected pageQueryParams(page: number | string): Record<string, string | number | null> {
    return { page: page === 1 ? null : page };
  }

  protected preparePageNavigation(event: MouseEvent): void {
    if ((event.currentTarget as HTMLAnchorElement).getAttribute('aria-current') === 'page') return;
    if (
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      this.focusResultsAfterPaging = true;
    }
  }

  protected problemQueryParams(pattern: string): Record<string, string> {
    return { pattern, returnTo: this.router.url };
  }

  private canonicalizePage(): void {
    if (!this.catalog() || this.destroyRef.destroyed) return;
    const params = this.route.snapshot.queryParamMap;
    const canonical = this.currentPage() === 1 ? null : String(this.currentPage());
    if (params.get('page') === canonical && params.getAll('page').length <= 1) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: canonical },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearCatalogFilters(): void {
    void this.router.navigate(['/learn/hands-on-dsa']);
  }

  protected surpriseMe(): void {
    const pool = this.randomPracticePool();
    if (!pool.length) return;

    const alternatives =
      pool.length > 1 ? pool.filter(({ id }) => id !== this.lastSurpriseProblemId()) : pool;
    const randomValue = new Uint32Array(1);
    window.crypto.getRandomValues(randomValue);
    const candidate = alternatives[randomValue[0] % alternatives.length];

    this.lastSurpriseProblemId.set(candidate.id);
    void this.router.navigate(candidate.route, {
      queryParams: { mode: 'surprise' },
    });
  }

  private isDifficultySort(sort: HandsOnSort): boolean {
    return sort === 'difficulty-ascending' || sort === 'difficulty-descending';
  }

  private updateCatalogParams(
    queryParams: Record<string, string | null>,
    replaceUrl = false,
  ): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...queryParams, page: null },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}
