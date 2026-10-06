import { ContentRecovery, RecoveryKind, recoveryKind } from '../../core/content-recovery/content-recovery';
import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, Scroll } from '@angular/router';
import { catalogGroupForCourse } from '../../content/catalog-course-groups';
import { DsaProblemV2 } from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import {
  HandsOnDifficulty,
  HandsOnDsaIndex,
  HandsOnDsaIndexProblem,
  HandsOnDsaIndexProblemResult,
  HandsOnSort,
  HandsOnTierScope,
  filterHandsOnDsaIndexGroups,
  rankedHandsOnDsaIndexProblems,
  resolveHandsOnDsaIndexGroup,
} from '../../content/hands-on-dsa';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import {
  PageSidebarContextDirective,
  PageSidebarContextValue,
} from '../../core/page-sidebars/page-sidebar-context';
import { PracticeProgressService } from '../../core/practice-progress/practice-progress';
import { PracticeStatusMark } from '../../core/practice-progress/practice-status-mark';
import {
  SORT_COLUMNS,
  SORT_DESCRIPTIONS,
  SortColumn,
  SortColumnId,
  columnSortArrow,
  columnSortDirection,
  columnSortLabel,
  nextColumnSort,
} from './catalog-sort';
import { PatternBrowser, PatternEntry } from './pattern-browser';
import { PracticeProgressStrip } from './practice-progress-strip';

/** Inline row preview, loaded on demand from the problem's canonical detail. */
/** The two catalog views; `view=groups` in the URL is By pattern. */
export type CatalogView = 'all' | 'groups';

type ProblemPreview =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; summary: string; example: { input: string; expected: string } | null };

/** The first sentence or two of a statement: enough to choose a problem without opening it. */
export function previewSummary(text: string): string {
  const sentences = text.trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/);
  const first = sentences[0] ?? '';
  return first.length >= 160 || sentences.length < 2 ? first : `${first} ${sentences[1]}`;
}

@Component({
  selector: 'app-hands-on-dsa',
  imports: [
    ContentRecovery,
    PlatformHeader,
    RouterLink,
    NgTemplateOutlet,
    PracticeStatusMark,
    PracticeProgressStrip,
    PatternBrowser,
    PageSidebarContextDirective,
  ],
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
        margin: 0 0 10px;
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
        display: grid;
        justify-items: start;
        gap: 10px;
        margin-top: 22px;
      }
      .surprise-problem {
        display: inline-flex;
        min-height: 48px;
        align-items: center;
        gap: 10px;
        padding: 12px 18px;
        border: 1px solid var(--accent-strong);
        border-radius: 10px;
        color: var(--text-strong);
        background: var(--surface);
        cursor: pointer;
        font: inherit;
        text-align: start;
      }
      .surprise-problem:hover:not(:disabled) {
        background: var(--surface-accent);
      }
      .surprise-problem:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 3px;
      }
      .surprise-problem:disabled {
        color: var(--text-subtle);
        cursor: not-allowed;
        opacity: 0.5;
      }
      .surprise-problem-mark {
        display: grid;
        width: 20px;
        flex: 0 0 auto;
        place-items: center;
        color: inherit;
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 1.2rem;
        font-weight: 700;
      }
      .surprise-problem strong {
        color: inherit;
        font-size: 1rem;
        font-weight: 700;
      }
      .practice-hero-actions > p {
        max-width: 52ch;
        margin: 0;
        color: var(--text-subtle);
        font-size: 0.875rem;
        font-weight: 400;
        line-height: 1.5;
      }
      .practice-hero-actions > .surprise-problem-unavailable {
        color: var(--text-body);
        font-weight: 700;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .practice-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 14px;
        align-items: end;
        margin: 18px 0;
        padding: 17px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--surface);
      }
      /* One row on a wide screen: the search grows, the selects keep a readable width, and the
         two switches travel together. */
      .practice-controls > label {
        display: grid;
        flex: 1 1 168px;
        min-width: min(100%, 150px);
        max-width: 260px;
        gap: 6px;
        color: var(--practice-body);
        font-size: 0.72rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .practice-controls input[type='search'],
      .practice-controls select {
        width: 100%;
        min-width: 0;
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
      .practice-controls > .practice-search {
        flex: 3 1 240px;
        max-width: none;
      }
      .practice-switches {
        display: flex;
        flex: 0 1 auto;
        flex-wrap: wrap;
        gap: 0 18px;
        align-items: center;
        min-width: 0;
      }
      .practice-controls .hide-pattern-names,
      .practice-controls .hide-solved {
        display: flex;
        flex: 0 0 auto;
        min-height: 44px;
        align-items: center;
        gap: 8px;
        color: var(--practice-body);
        letter-spacing: 0.02em;
        text-transform: none;
        font-size: 0.875rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .hide-pattern-names input,
      .hide-solved input {
        width: 18px;
        height: 18px;
        margin: 0;
        accent-color: var(--accent-strong);
      }
      .practice-results-header {
        display: grid;
        gap: 10px;
        margin: 28px 0 12px;
      }
      .practice-results-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px 18px;
        flex-wrap: wrap;
      }
      /* The view switch: one segmented control, styled like the Focus Studio mode switch. */
      .view-switch {
        display: inline-flex;
        flex: none;
        gap: 2px;
        padding: 4px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
      }
      .view-switch button {
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        padding: 6px 14px;
        border: 0;
        border-radius: 8px;
        color: var(--text-subtle);
        background: transparent;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
      }
      .view-switch button:hover {
        color: var(--text-strong);
      }
      .view-switch button[aria-checked='true'] {
        color: var(--text-strong);
        background: var(--surface-muted);
        box-shadow: inset 0 -2px 0 var(--accent-strong);
        font-weight: 700;
      }
      .view-switch button:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
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
        justify-content: flex-start;
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
      .problem-table-wrap {
        max-width: 100%;
        overflow-x: auto;
        container-type: inline-size;
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
        padding: 12px 18px;
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
        /* Headers wrap between words ("Interview / priority"), never inside one ("Difficult/y"). */
        overflow-wrap: normal;
        hyphens: manual;
        /* The sort buttons already give each header a 44px target. */
        padding-block: 2px;
      }
      .problem-table th:not(.problem-title-column) {
        padding-inline: 10px;
      }
      /* The problem column takes whatever the narrow columns leave. Each narrow column is
         sized to its header. Below 1100px of table the two-word headers wrap between words, so
         problem titles keep their one line. */
      /* Status is the last column: narrow, and its mark centred under the header. */
      .problem-table .problem-status-column {
        width: 4.75rem;
        padding-inline: 8px 14px;
        text-align: center;
      }
      @media (min-width: 701px) {
        .problem-table .problem-table-row > td.problem-status {
          padding-inline: 8px 14px;
          text-align: center;
        }
      }
      /* Learning order is the first column: start-aligned, with the table's outer padding. */
      .problem-table thead th[data-column='learning'],
      .problem-table .problem-table-row > td.problem-learning-order {
        padding-inline-start: 18px;
      }
      @media (min-width: 701px) {
        .problem-table thead th[data-column='learning'],
        .problem-table .problem-table-row > td.problem-learning-order {
          text-align: start;
        }
      }
      .problem-table th[data-column='difficulty'] {
        width: 7rem;
      }
      @media (min-width: 701px) {
        /* Short values: the same 10px gutter as their headers, and never broken mid-word. */
        .problem-table-row > td:not(.problem-title-cell, .problem-status) {
          padding-inline: 10px;
          white-space: nowrap;
        }
      }
      .problem-table th[data-column='interview'] {
        width: 6.5rem;
      }
      .problem-table th[data-column='learning'] {
        width: 6.25rem;
      }
      @container (min-width: 1100px) {
        .problem-table th[data-column='difficulty'] {
          width: 7.75rem;
        }
        .problem-table th[data-column='interview'] {
          width: 10.75rem;
        }
        .problem-table th[data-column='learning'] {
          width: 9.75rem;
        }
        .problem-table th:not(.problem-title-column, .problem-status-column) .column-sort {
          white-space: nowrap;
        }
      }
      .problem-table th:not(.problem-title-column, .problem-status-column),
      .problem-table-row > td:not(.problem-title-cell, .problem-status) {
        text-align: end;
        font-variant-numeric: tabular-nums;
        font-size: 0.8rem;
      }
      .column-sort {
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
      .column-sort:focus-visible {
        outline: 2px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .problem-title-layout {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px 16px;
      }
      .problem-title-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
        min-width: 0;
      }
      .problem-link {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        color: var(--accent-link);
        font-weight: 800;
        line-height: 1.35;
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
        line-height: 1.3;
      }
      .problem-pattern.pattern-hidden {
        font-style: italic;
      }
      .problem-preview-toggle,
      .problem-preview-retry {
        min-height: 44px;
        padding: 4px 0;
        border: 0;
        color: var(--accent-link);
        background: transparent;
        font: inherit;
        font-size: 0.8rem;
        font-weight: 800;
        cursor: pointer;
      }
      .problem-preview-toggle {
        flex: 0 0 auto;
        /* A 44px target that overlaps the cell padding instead of making the row taller. */
        margin-block: -4px;
        margin-inline-end: -8px;
        padding-inline: 8px;
        font-size: 0.78rem;
        font-weight: 700;
        white-space: nowrap;
      }
      .problem-preview-toggle:hover,
      .problem-preview-retry:hover {
        text-decoration: underline;
      }
      .problem-preview-toggle:focus-visible,
      .problem-preview-retry:focus-visible,
      .problem-preview-open:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .problem-table-row.is-previewing td {
        border-bottom-color: transparent;
      }
      .problem-preview-row td {
        background: var(--surface-muted);
        font-size: 0.875rem;
        line-height: 1.55;
      }
      .problem-preview-row p,
      .problem-preview-summary,
      .problem-preview-example,
      .problem-preview-status {
        max-width: 78ch;
        margin: 0 0 8px;
      }
      .problem-preview-example {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 8px;
      }
      .problem-preview-label {
        color: var(--text-subtle);
        font-weight: 800;
      }
      .problem-preview-example code {
        overflow-wrap: anywhere;
      }
      .problem-preview-status {
        color: var(--text-subtle);
      }
      .problem-preview-open {
        color: var(--accent-link);
        font-weight: 800;
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
        .problem-table th.problem-title-column,
        .problem-table th[data-column],
        .problem-table .problem-status-column {
          width: auto;
          padding: 4px 8px;
        }
        .problem-table th:not(.problem-title-column) {
          text-align: start;
        }
        .problem-table th.problem-status-column {
          display: none;
        }
        .problem-table-row {
          display: grid;
          grid-template-columns: 2rem minmax(0, 1fr);
          column-gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--line);
        }
        .problem-table-row > td {
          grid-column: 2;
        }
        .problem-table-row > td.problem-status {
          grid-column: 1;
          grid-row: 1 / span 4;
          padding-top: 10px;
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
        .problem-preview-row {
          display: block;
        }
        .problem-preview-row td {
          display: block;
          padding: 12px 16px;
        }
        .problem-table-row.is-previewing {
          border-bottom: 0;
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
        .practice-controls > label,
        .practice-controls > .practice-search {
          flex-basis: 100%;
          max-width: none;
        }
      }
      @media (forced-colors: active) {
        .practice-hero,
        .practice-controls,
        .practice-controls select,
        .view-switch,
        .clear-pattern-filter,
        .clear-catalog-filters,
        .surprise-problem {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .view-switch button[aria-checked='true'] {
          outline: 2px solid Highlight;
          outline-offset: -2px;
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
  /** Practice progress saved in this browser only (no account or cross-device sync yet). */
  protected readonly progress = inject(PracticeProgressService);
  private focusResultsAfterPaging = false;
  /** Selector of the sort control that keeps focus once the re-sorted results render. */
  private focusAfterSorting: string | null = null;
  /** The Learn catalog group Hands-On DSA sits in, for the breadcrumb's group level. */
  protected readonly courseGroup = catalogGroupForCourse('learn', 'hands-on-dsa');
  /** Below 1700px the left page navigation starts collapsed, so the catalog gets its column. */
  protected readonly sidebarContext: PageSidebarContextValue = {
    excluded: false,
    collapseLeftBelow: 1700,
  };
  protected readonly catalog = signal<HandsOnDsaIndex | null>(null);
  protected readonly error = signal('');
  protected readonly recovery = signal<RecoveryKind>('temporary');
  protected readonly query = signal('');
  protected readonly difficulty = signal<HandsOnDifficulty>('All');
  protected readonly tierScope = signal<HandsOnTierScope>('782');
  protected readonly sort = signal<HandsOnSort>('study-order');
  protected readonly patternId = signal('');
  /**
   * `view=groups` in the URL: "By pattern", a pattern list beside one pattern's problems.
   * It is a view, not a filter, it works with pattern names hidden, and it keeps the table's sort.
   */
  protected readonly grouped = signal(false);
  /** `patterns=show` in the URL; names are hidden by default so the list does not give them away. */
  protected readonly patternNamesShown = signal(false);
  protected readonly patternNamesHidden = computed(() => !this.patternNamesShown());
  /** Patterns whose name the learner revealed one at a time with "Show name" while names are hidden. */
  protected readonly revealedPatterns = signal<ReadonlySet<string>>(new Set());
  /** `solved=hide` in the URL: leave out problems marked solved on this device. */
  protected readonly solvedHidden = signal(false);
  protected readonly openPreviewId = signal<string | null>(null);
  protected readonly previews = signal<Record<string, ProblemPreview>>({});
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
    { value: '782', label: 'Full Library' },
  ];
  protected readonly sortOptions: { value: HandsOnSort; label: string }[] = [
    { value: 'title-ascending', label: 'Problem: A to Z' },
    { value: 'title-descending', label: 'Problem: Z to A' },
    { value: 'study-order-descending', label: 'Learning order: descending' },
    { value: 'interview-rank-descending', label: 'Interview priority: descending' },
    { value: 'study-order', label: 'Learning order' },
    { value: 'interview-rank', label: 'Interview priority' },
    { value: 'difficulty-ascending', label: 'Difficulty: Beginner first' },
    { value: 'difficulty-descending', label: 'Difficulty: Advanced first' },
  ];
  /** The sortable headers of both tables; Status is not sortable. */
  protected readonly sortColumns = SORT_COLUMNS;
  /** The view switch: one problem library, or one pattern at a time. */
  protected readonly views: { value: CatalogView; label: string }[] = [
    { value: 'all', label: 'All problems' },
    { value: 'groups', label: 'By pattern' },
  ];

  protected columnSortDirection(id: SortColumnId): 'ascending' | 'descending' | 'none' {
    return columnSortDirection(this.sort(), id);
  }

  protected columnSortArrow(id: SortColumnId): string {
    return columnSortArrow(this.sort(), id);
  }

  protected columnSortLabel(column: SortColumn): string {
    return columnSortLabel(this.sort(), column, this.difficulty() !== 'All');
  }

  /** A column header in either view: the same sort, kept in the URL, carries to the other view. */
  protected sortColumn(id: SortColumnId): void {
    this.focusAfterSorting = `[data-sort-column="${id}"]`;
    this.updateSort(nextColumnSort(this.sort(), id));
  }

  protected preparationOrderLabel(order: number): string {
    return order.toString().padStart(2, '0');
  }
  protected readonly groups = computed(() => this.catalog()?.groups ?? []);
  /** Hero line counts from the published catalog: distinct problems, and only patterns that have problems. */
  protected readonly heroCounts = computed(() => {
    const catalog = this.catalog();
    if (!catalog) return null;
    const patterns = catalog.groups.filter((group) => group.problems.length).length;
    return { problems: catalog.totals.distinctProblems, patterns };
  });
  /** Every published problem id, so device progress for retired problems is not counted. */
  protected readonly catalogProblemIds = computed(
    () => new Set(this.groups().flatMap((group) => group.problems.map((problem) => problem.id))),
  );
  protected readonly selectedGroup = computed(() =>
    resolveHandsOnDsaIndexGroup(this.groups(), this.patternId()),
  );
  /** In the flat table `pattern` filters to one pattern; in the grouped view it only selects one. */
  protected readonly filterGroup = computed(() => (this.grouped() ? null : this.selectedGroup()));
  /**
   * Every pattern with problems, in preparation order, with its problems after the filters. A
   * problem placed in two patterns appears in both; a pattern with no matches stays listed.
   */
  protected readonly patternEntries = computed<PatternEntry[]>(() => {
    if (!this.grouped()) return [];
    const groups = this.groups()
      .filter((group) => group.problems.length)
      .sort((a, b) => a.preparationOrder - b.preparationOrder);
    const matches = new Map(
      filterHandsOnDsaIndexGroups(
        groups,
        this.query(),
        this.difficulty(),
        this.tierScope(),
        // The same column sort as the flat table orders the problems inside each pattern.
        this.sort(),
        !this.patternNamesHidden(),
      ).map((group) => [group.id, group.problems]),
    );
    const solved = this.progress.solvedIds();
    const hideSolved = this.solvedHidden();
    return groups.map((group) => {
      const problems = (matches.get(group.id) ?? []).filter(
        ({ id }) => !hideSolved || !solved.has(id),
      );
      const level = (difficulty: string) =>
        problems.filter((problem) => problem.difficulty === difficulty).length;
      return {
        group,
        problems,
        total: group.problems.length,
        solved: group.problems.filter(({ id }) => solved.has(id)).length,
        mix: {
          beginner: level('Beginner'),
          intermediate: level('Intermediate'),
          advanced: level('Advanced'),
        },
      };
    });
  });
  /** The pattern in the URL, or else the first one with an unsolved match, so the pane is never empty. */
  protected readonly selectedPattern = computed<PatternEntry | null>(() => {
    const entries = this.patternEntries();
    const chosen = this.selectedGroup();
    if (chosen) return entries.find(({ group }) => group.id === chosen.id) ?? entries[0] ?? null;
    const solved = this.progress.solvedIds();
    return (
      entries.find(({ problems }) => problems.some(({ id }) => !solved.has(id))) ??
      entries.find(({ problems }) => problems.length) ??
      entries[0] ??
      null
    );
  });
  /** On a phone the URL picks the screen: the pattern list, or the pattern it names. */
  protected readonly patternScreen = computed(() => (this.selectedGroup() ? 'detail' : 'list'));
  protected readonly visibleGroups = computed(() => {
    const selected = this.filterGroup();
    return filterHandsOnDsaIndexGroups(
      selected ? [selected] : this.groups(),
      this.query(),
      this.difficulty(),
      this.tierScope(),
      this.sort(),
      !this.patternNamesHidden(),
    );
  });
  protected readonly visibleRankedProblems = computed(() =>
    this.grouped() || this.sort() === 'pattern-order'
      ? []
      : rankedHandsOnDsaIndexProblems(
          this.visibleGroups(),
          this.sort() as Exclude<HandsOnSort, 'pattern-order'>,
        ),
  );
  // Group order remains authored; deduplicate before slicing so each page owns 25 problems.
  protected readonly orderedProblems = computed(() => {
    const problems = this.sortedProblems();
    if (!this.solvedHidden()) return problems;
    const solved = this.progress.solvedIds();
    return problems.filter(({ id }) => !solved.has(id));
  });
  private readonly sortedProblems = computed(() => {
    if (!this.grouped()) return this.visibleRankedProblems();
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
  /** The grouped view has no pages: each pattern lists all its problems. */
  protected readonly pageCount = computed(() =>
    this.grouped() ? 1 : Math.ceil(this.orderedProblems().length / this.pageSize),
  );
  protected readonly currentPage = computed(() =>
    Math.min(this.requestedPage(), Math.max(1, this.pageCount())),
  );
  protected readonly pageOffset = computed(() => (this.currentPage() - 1) * this.pageSize);
  protected readonly displayedRankedProblems = computed(() =>
    this.orderedProblems().slice(this.pageOffset(), this.pageOffset() + this.pageSize),
  );
  protected readonly resultRange = computed(() => {
    const count = this.orderedProblems().length;
    if (this.grouped()) {
      // A chosen pattern (in the URL) is named; otherwise the line counts every pattern, which
      // also suits the phone's pattern-list screen.
      const chosen = this.selectedGroup() ? this.selectedPattern() : null;
      if (chosen) {
        const shown = chosen.problems.length;
        const name =
          this.patternNamesHidden() && !this.revealedPatterns().has(chosen.group.id)
            ? `Pattern ${chosen.group.preparationOrder}`
            : chosen.group.title;
        return `${shown} ${shown === 1 ? 'problem' : 'problems'} in ${name} · ${this.sortDescription()}`;
      }
      const patterns = this.patternEntries().filter(({ problems }) => problems.length).length;
      return `${count} ${count === 1 ? 'problem' : 'problems'} in ${patterns} ${patterns === 1 ? 'pattern' : 'patterns'} · ${this.sortDescription()}`;
    }
    if (!count) return '0 problems';
    return `${this.pageOffset() + 1}–${Math.min(this.pageOffset() + this.pageSize, count)} of ${count} ${count === 1 ? 'problem' : 'problems'} · ${this.sortDescription()}`;
  });
  protected readonly sortDescription = computed(() => SORT_DESCRIPTIONS[this.sort()]);
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
      this.tierScope() !== '782' ||
      // The view (All problems / By pattern) and the sort are how the list is shown, not filters (user, 2026-10-06).
      this.solvedHidden(),
  );
  /**
   * Surprise me draws from every page of the current filtered list (already one entry per problem),
   * preferring problems not yet solved on this device and falling back to all of them.
   */
  private readonly randomPracticePool = computed(() => {
    const problems = this.orderedProblems();
    const solved = this.progress.solvedIds();
    const unsolved = problems.filter(({ id }) => !solved.has(id));
    return unsolved.length ? unsolved : problems;
  });
  protected readonly randomPracticeCount = computed(() => this.randomPracticePool().length);
  /** Visible reason beside a disabled Surprise me once the catalog has loaded. */
  protected readonly surpriseUnavailableReason = computed(() => {
    if (!this.catalog() || this.randomPracticeCount()) return '';
    return this.heroCounts()?.problems
      ? 'No problem matches your current filters. Change or clear a filter to draw one.'
      : 'No problems are published yet.';
  });

  protected retryCatalog(): void {
    this.error.set('');
    this.content
      .getHandsOnDsaIndex()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) => {
          this.catalog.set(catalog);
          queueMicrotask(() => this.canonicalizePage());
        },
        error: (error) => { this.recovery.set(recoveryKind(error)); this.error.set('The practice catalog could not be loaded.'); },
      });
  }

  ngOnInit(): void {
    this.retryCatalog();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const page = params.get('page') ?? '';
      const parsedPage = /^[1-9]\d*$/.test(page) ? Number(page) : 1;
      this.requestedPage.set(Number.isSafeInteger(parsedPage) ? parsedPage : 1);
      this.patternId.set(params.get('pattern') ?? '');
      const namesShown = params.get('patterns') === 'show';
      if (namesShown !== this.patternNamesShown()) this.revealedPatterns.set(new Set());
      this.patternNamesShown.set(namesShown);
      this.solvedHidden.set(params.get('solved') === 'hide');
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
          : '782',
      );
      const requestedSort = params.get('sort');
      // `sort=pattern-order` is the old grouping URL; it now opens the grouped view.
      const legacyGrouping = requestedSort === 'pattern-order';
      this.grouped.set(params.get('view') === 'groups' || legacyGrouping);
      if (legacyGrouping) queueMicrotask(() => this.canonicalizeGrouping());
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
      const sortControl = this.focusAfterSorting;
      this.focusAfterSorting = null;
      window.requestAnimationFrame(() => {
        if (this.destroyRef.destroyed) return;
        const results = this.element.nativeElement.querySelector<HTMLElement>('#practice-results');
        const focusTarget = sortControl
          ? this.element.nativeElement.querySelector<HTMLElement>(sortControl)
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

  protected updatePattern(value: string): void {
    const pattern = this.groups().find((group) => group.id === value)?.id ?? '';
    this.patternId.set(pattern);
    this.updateCatalogParams({ pattern: pattern || null });
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
      : '782';
    this.tierScope.set(scope);
    this.updateCatalogParams({ scope: scope === '782' ? null : scope });
  }

  protected updateSort(value: string): void {
    const requestedSort = this.sortOptions.some((option) => option.value === value)
      ? (value as HandsOnSort)
      : 'study-order';
    const sort = this.sortOptionDisabled(requestedSort) ? 'study-order' : requestedSort;
    // Sorting never changes the view or, in By pattern, the chosen pattern.
    this.focusResultsAfterPaging = true;
    this.sort.set(sort);
    this.updateCatalogParams({ sort: sort === 'study-order' ? null : sort });
  }

  /** The view switch. Pattern names, every filter and the sort stay as they are. */
  protected setView(view: CatalogView): void {
    const grouped = view === 'groups';
    if (grouped === this.grouped()) return;
    this.focusAfterSorting = `[data-view="${view}"]`;
    this.focusResultsAfterPaging = true;
    this.grouped.set(grouped);
    this.updateCatalogParams({
      view: grouped ? 'groups' : null,
      // The chosen pattern belongs to By pattern; All problems shows every pattern.
      ...(grouped ? {} : { pattern: null }),
    });
  }

  /** Radio-group keys: the arrows move to the other view and choose it; Home and End too. */
  protected viewKeys(event: KeyboardEvent): void {
    const index = this.views.findIndex(({ value }) => value === (this.grouped() ? 'groups' : 'all'));
    const last = this.views.length - 1;
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? (index + 1) % this.views.length
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? (index + last) % this.views.length
              : -1;
    if (target < 0) return;
    event.preventDefault();
    const view = this.views[target].value;
    this.setView(view);
    this.element.nativeElement
      .querySelector<HTMLButtonElement>(`[data-view="${view}"]`)
      ?.focus({ preventScroll: true });
  }

  protected choosePattern(id: string): void {
    this.updateCatalogParams({ pattern: id });
  }

  /** Phone: back from one pattern to the pattern list. */
  protected backToPatterns(): void {
    this.updateCatalogParams({ pattern: null });
  }

  protected revealPattern(id: string): void {
    this.revealedPatterns.update((ids) => new Set([...ids, id]));
  }

  /** Hiding names keeps the grouped view: patterns read "Pattern N" until one is revealed. */
  protected updatePatternNames(hide: boolean): void {
    this.patternNamesShown.set(!hide);
    this.revealedPatterns.set(new Set());
    this.updateCatalogParams({ patterns: hide ? null : 'show' });
  }

  protected updateSolvedHidden(hide: boolean): void {
    this.solvedHidden.set(hide);
    this.updateCatalogParams({ solved: hide ? 'hide' : null });
  }

  protected togglePreview(problem: HandsOnDsaIndexProblem): void {
    if (this.openPreviewId() === problem.id) {
      this.openPreviewId.set(null);
      return;
    }
    this.openPreviewId.set(problem.id);
    const cached = this.previews()[problem.id];
    if (!cached || cached.status === 'error') this.loadPreview(problem);
  }

  protected loadPreview(problem: HandsOnDsaIndexProblem): void {
    const setPreview = (preview: ProblemPreview) =>
      this.previews.update((previews) => ({ ...previews, [problem.id]: preview }));
    setPreview({ status: 'loading' });
    try {
      this.content
        .getDsaProblem(problem.id, problem.version || undefined)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (detail) => setPreview(this.previewFrom(detail, problem.description)),
          error: () => setPreview({ status: 'error' }),
        });
    } catch {
      setPreview({ status: 'error' });
    }
  }

  protected readyPreview(problemId: string): Extract<ProblemPreview, { status: 'ready' }> | null {
    const preview = this.previews()[problemId];
    return preview?.status === 'ready' ? preview : null;
  }

  protected previewDomId(problemId: string): string {
    return `problem-preview-${problemId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  private previewFrom(detail: DsaProblemV2, fallback: string): ProblemPreview {
    const fixture = detail.fixtures?.[0];
    return {
      status: 'ready',
      summary: previewSummary(detail.practice?.statement?.prompt || detail.description || fallback),
      example: fixture ? { input: fixture.input, expected: fixture.expectedOutput } : null,
    };
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
    // The old grouping URL is rewritten as a whole (page included) by canonicalizeGrouping.
    if (params.get('sort') === 'pattern-order') return;
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
    // Showing pattern names, the view, the chosen pattern and the sort are how the list is shown, not filters.
    const params = this.route.snapshot.queryParamMap;
    const kept: Record<string, string> = this.patternNamesShown() ? { patterns: 'show' } : {};
    if (this.grouped()) {
      kept['view'] = 'groups';
      if (params.get('pattern')) kept['pattern'] = params.get('pattern')!;
    }
    if (this.sort() !== 'study-order') kept['sort'] = this.sort();
    void this.router.navigate(['/learn/hands-on-dsa'], { queryParams: kept });
  }

  /** Rewrites the old `sort=pattern-order` grouping URL to `view=groups`, in place. */
  private canonicalizeGrouping(): void {
    if (this.destroyRef.destroyed) return;
    if (this.route.snapshot.queryParamMap.get('sort') !== 'pattern-order') return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: null, view: 'groups', page: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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
      // Filters, sorts and pattern choices keep the reader where it is; focus handling scrolls.
      scroll: 'manual',
    });
  }
}
