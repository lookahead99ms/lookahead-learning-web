import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentService } from '../../content/content.service';
import {
  HandsOnDifficulty,
  HandsOnDsaIndex,
  HandsOnSort,
  HandsOnTierScope,
  filterHandsOnDsaIndexGroups,
  rankedHandsOnDsaIndexProblems,
  resolveHandsOnDsaIndexGroup,
  uniqueHandsOnIndexProblemCount,
} from '../../content/hands-on-dsa';
import { PlatformHeader } from '../../core/platform-header/platform-header';

@Component({
  selector: 'app-hands-on-dsa',
  imports: [PlatformHeader, RouterLink],
  templateUrl: './hands-on-dsa.html',
  styles: [
    `
      .practice-reader {
        --practice-ink: #192b3d;
        --practice-body: #465c72;
        --practice-accent: #0d8192;
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
        border: 1px solid #b9dce6;
        border-radius: 20px;
        color: var(--practice-body);
        background:
          radial-gradient(circle at 92% 10%, rgba(241, 167, 57, 0.2), transparent 28%),
          linear-gradient(135deg, #edfafa 0%, #fff 64%);
        box-shadow: 0 16px 38px rgba(28, 78, 96, 0.08);
      }
      .practice-hero::after {
        content: '';
        position: absolute;
        right: -28px;
        bottom: -75px;
        width: 220px;
        height: 220px;
        border: 28px solid rgba(13, 129, 146, 0.08);
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
        color: #587188;
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
        background: #c0780a;
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
        border: 1px solid #347f91;
        border-radius: 14px;
        color: #183f4b;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 8px 20px rgba(31, 101, 122, 0.09);
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .surprise-problem:hover,
      .surprise-problem:focus-visible {
        border-color: #c0780a;
        outline: 3px solid rgba(192, 120, 10, 0.16);
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
        color: #fff;
        background: #c0780a;
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
        color: #9ab4c1;
      }
      .practice-controls {
        display: grid;
        grid-template-columns: minmax(260px, 1.4fr) repeat(3, minmax(150px, 0.55fr));
        gap: 14px;
        align-items: end;
        margin: 18px 0;
        padding: 17px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #fff;
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
        border: 1px solid #9db7ca;
        border-radius: 8px;
        color: var(--practice-ink);
        background: #fff;
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
        border: 1px solid #c7d9e8;
        border-radius: 999px;
        color: #416b9e;
        background: #fff;
        font-size: 0.78rem;
        font-weight: 800;
        text-decoration: none;
      }
      .pattern-filter a[aria-current='page'] {
        border-color: var(--practice-accent);
        color: #fff;
        background: var(--practice-accent);
      }
      .pattern-filter-order {
        color: #a86008;
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 0.68rem;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0;
      }
      .pattern-filter a[aria-current='page'] .pattern-filter-order {
        color: #fff;
        opacity: 0.82;
      }
      .active-practice {
        margin: 0 0 26px;
        padding: clamp(18px, 3vw, 28px);
        border: 1px solid #bfd9e5;
        border-radius: 18px;
        background: #fff;
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
        color: #a86008;
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
        color: #315f9d;
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
        border: 1px solid #9dbdcd;
        border-radius: 999px;
        color: #315f9d;
        background: #fff;
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
        outline: 3px solid rgba(13, 129, 146, 0.15);
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
        background: #fff;
        box-shadow: 0 9px 25px rgba(54, 83, 119, 0.04);
      }
      .pattern-group > summary {
        display: grid;
        grid-template-columns: minmax(0, 1fr) max-content 14px;
        align-items: start;
        gap: 18px;
        padding: 16px 18px;
        cursor: pointer;
        list-style: none;
      }
      .pattern-group > summary::-webkit-details-marker {
        display: none;
      }
      .pattern-group[open] {
        border-color: #9bc4d1;
        box-shadow: 0 14px 32px rgba(31, 101, 122, 0.1);
      }
      .pattern-group-count {
        justify-self: end;
        color: #587188;
        font-size: 0.76rem;
        font-weight: 800;
        text-align: right;
        white-space: nowrap;
      }
      .pattern-group-toggle {
        width: 11px;
        height: 11px;
        justify-self: end;
        margin: 8px 3px 0 0;
        border-right: 2px solid var(--practice-accent);
        border-bottom: 2px solid var(--practice-accent);
        transform: rotate(45deg);
        transition: transform 160ms ease;
      }
      .pattern-group[open] .pattern-group-toggle {
        transform: rotate(225deg);
      }
      .problem-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 11px;
        padding: 0 20px 20px;
      }
      .ranked-problem-list {
        display: grid;
        gap: 8px;
      }
      .ranked-problem-row {
        display: grid;
        grid-template-columns: minmax(190px, 0.7fr) minmax(260px, 1.6fr) minmax(240px, 1fr);
        gap: 14px;
        align-items: center;
        min-height: 76px;
        padding: 12px 15px;
        border: 1px solid #d5e3eb;
        border-radius: 12px;
        color: var(--practice-body);
        background: #fff;
        text-decoration: none;
        transition:
          border-color 140ms ease,
          transform 140ms ease,
          box-shadow 140ms ease;
      }
      .ranked-problem-row:hover,
      .ranked-problem-row:focus-visible {
        border-color: #69a7bd;
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(31, 101, 122, 0.08);
      }
      .ranked-problem-row h3 {
        margin: 0;
        color: var(--practice-ink);
        font-size: 0.95rem;
      }
      .ranked-problem-pattern {
        color: #416b9e;
        font-size: 0.76rem;
        font-weight: 800;
      }
      .load-more-problems {
        display: block;
        min-height: 44px;
        margin: 16px auto 0;
        padding: 9px 18px;
        border: 1px solid #347f91;
        border-radius: 999px;
        color: #183f4b;
        background: #fff;
        cursor: pointer;
        font:
          800 0.82rem 'Avenir Next',
          Avenir,
          sans-serif;
      }
      .load-more-problems:hover,
      .load-more-problems:focus-visible {
        outline: 3px solid rgba(13, 129, 146, 0.15);
        outline-offset: 2px;
      }
      .problem-card {
        display: flex;
        min-width: 0;
        min-height: 132px;
        flex-direction: column;
        align-items: flex-start;
        padding: 15px;
        border: 1px solid #d5e3eb;
        border-radius: 12px;
        color: var(--practice-body);
        background: #fbfdfe;
        text-decoration: none;
        transition:
          border-color 140ms ease,
          transform 140ms ease,
          box-shadow 140ms ease;
      }
      .problem-card:hover,
      .problem-card:focus-visible {
        border-color: #69a7bd;
        transform: translateY(-2px);
        box-shadow: 0 9px 20px rgba(31, 101, 122, 0.09);
      }
      .problem-card h3 {
        margin: 9px 0 7px;
        color: var(--practice-ink);
        font-size: 1rem;
      }
      .problem-card p {
        max-width: 82ch;
        margin: 0;
        font-size: 0.82rem;
        line-height: 1.5;
      }
      .problem-card b {
        margin-top: auto;
        padding-top: 13px;
        color: #315f9d;
        font-size: 0.78rem;
      }
      .problem-card-meta {
        display: flex;
        gap: 5px 10px;
        flex-wrap: wrap;
        color: #587188;
        font-size: 0.68rem;
        font-weight: 850;
        letter-spacing: 0.045em;
        line-height: 1.35;
        text-transform: uppercase;
      }
      .problem-card-meta span + span::before {
        content: '·';
        margin-right: 10px;
        color: #9db7ca;
      }
      .empty-state {
        padding: 34px;
        border: 1px dashed #b9ccda;
        border-radius: 14px;
        text-align: center;
        background: #fff;
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
        .practice-controls,
        .problem-grid,
        .ranked-problem-row {
          grid-template-columns: minmax(0, 1fr);
        }
        .active-practice > header,
        .practice-results-header {
          display: grid;
        }
        .pattern-group > summary {
          grid-template-columns: minmax(0, 1fr) max-content 14px;
          gap: 10px;
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
      @media (prefers-reduced-motion: reduce) {
        .problem-card,
        .pattern-group-toggle {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .practice-hero,
        .practice-controls,
        .active-practice,
        .pattern-group,
        .problem-card,
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
  protected readonly catalog = signal<HandsOnDsaIndex | null>(null);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly difficulty = signal<HandsOnDifficulty>('All');
  protected readonly tierScope = signal<HandsOnTierScope>('730');
  protected readonly sort = signal<HandsOnSort>('pattern-order');
  protected readonly patternId = signal('');
  protected readonly openGroupId = signal<string | null>(null);
  protected readonly rankedProblemLimit = signal(50);
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
    { value: 'pattern-order', label: 'Pattern Ranking' },
    { value: 'study-order', label: 'Problem Ranking' },
    { value: 'interview-rank', label: 'Interview Importance' },
    { value: 'difficulty-ascending', label: 'Difficulty · Beginner to Advanced' },
    { value: 'difficulty-descending', label: 'Difficulty · Advanced to Beginner' },
  ];
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
  protected readonly visibleUniqueProblemCount = computed(() =>
    uniqueHandsOnIndexProblemCount(this.visibleGroups()),
  );
  protected readonly visibleRankedProblems = computed(() =>
    this.sort() === 'pattern-order'
      ? []
      : rankedHandsOnDsaIndexProblems(
          this.visibleGroups(),
          this.sort() as Exclude<HandsOnSort, 'pattern-order'>,
        ),
  );
  protected readonly displayedRankedProblems = computed(() =>
    this.visibleRankedProblems().slice(0, this.rankedProblemLimit()),
  );
  protected readonly hasMoreRankedProblems = computed(
    () => this.displayedRankedProblems().length < this.visibleRankedProblems().length,
  );
  protected readonly hasCatalogFilters = computed(
    () =>
      Boolean(this.query()) ||
      this.difficulty() !== 'All' ||
      this.tierScope() !== '730' ||
      this.sort() !== 'pattern-order',
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
        next: (catalog) => this.catalog.set(catalog),
        error: () => this.error.set('The practice catalog could not be loaded. Please try again.'),
      });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
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
        : 'pattern-order';
      this.sort.set(
        this.difficulty() !== 'All' && this.isDifficultySort(selectedSort)
          ? 'pattern-order'
          : selectedSort,
      );
      this.resetView();
    });
  }

  protected updateQuery(value: string): void {
    this.query.set(value);
    this.updateCatalogParams({ q: value || null }, true);
    this.resetView();
  }

  protected updateDifficulty(value: string): void {
    const difficulty = this.difficulties.includes(value as HandsOnDifficulty)
      ? (value as HandsOnDifficulty)
      : 'All';
    this.difficulty.set(difficulty);
    const resetDifficultySort = difficulty !== 'All' && this.isDifficultySort(this.sort());
    if (resetDifficultySort) this.sort.set('pattern-order');
    this.updateCatalogParams({
      difficulty: difficulty === 'All' ? null : difficulty,
      ...(resetDifficultySort ? { sort: null } : {}),
    });
    this.resetView();
  }

  protected updateTierScope(value: string): void {
    const scope = this.tierScopes.some((option) => option.value === value)
      ? (value as HandsOnTierScope)
      : '730';
    this.tierScope.set(scope);
    this.updateCatalogParams({ scope: scope === '730' ? null : scope });
    this.resetView();
  }

  protected updateSort(value: string): void {
    const requestedSort = this.sortOptions.some((option) => option.value === value)
      ? (value as HandsOnSort)
      : 'pattern-order';
    const sort = this.sortOptionDisabled(requestedSort) ? 'pattern-order' : requestedSort;
    this.sort.set(sort);
    this.updateCatalogParams({ sort: sort === 'pattern-order' ? null : sort });
    this.resetView();
  }

  protected sortOptionDisabled(sort: HandsOnSort): boolean {
    return this.difficulty() !== 'All' && this.isDifficultySort(sort);
  }

  protected tierLabel(tier: string | undefined): string {
    return (
      {
        'universal-must-do': 'Universal must-do',
        'interview-core': 'Interview core',
        'pattern-depth': 'Pattern depth',
        'advanced-specialized': 'Advanced / specialized',
      }[tier ?? ''] ?? 'Unranked'
    );
  }

  protected loadMoreRankedProblems(): void {
    this.rankedProblemLimit.update((limit) => limit + 50);
  }

  protected clearCatalogFilters(): void {
    void this.router.navigate(['/learn/hands-on-dsa']);
  }

  protected handlePatternToggle(groupId: string, event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement;
    if (details.open) {
      const summary = details.querySelector('summary');
      const previousTop = summary?.getBoundingClientRect().top;
      this.openGroupId.set(groupId);
      if (summary && previousTop !== undefined) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const offset = summary.getBoundingClientRect().top - previousTop;
            if (Math.abs(offset) > 1) window.scrollBy({ top: offset, behavior: 'auto' });
          });
        });
      }
      return;
    }

    if (this.openGroupId() === groupId) {
      this.openGroupId.set(null);
    }
  }

  protected isPatternOpen(groupId: string): boolean {
    return this.openGroupId() === groupId;
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

  private resetView(): void {
    this.openGroupId.set(null);
    this.rankedProblemLimit.set(50);
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
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}
