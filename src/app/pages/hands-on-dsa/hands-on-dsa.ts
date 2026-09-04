import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { CourseContent } from '../../content/content.models';
import {
  HandsOnDifficulty,
  HandsOnReadiness,
  buildHandsOnDsaGroups,
  continuationReadiness,
  filterHandsOnDsaGroups,
  resolveHandsOnDsaGroup,
  uniqueHandsOnProblemCount,
} from '../../content/hands-on-dsa';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PatternProblemWorkbench } from '../../core/pattern-problem-workbench/pattern-problem-workbench';

@Component({
  selector: 'app-hands-on-dsa',
  imports: [PlatformHeader, PatternProblemWorkbench, RouterLink],
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
      .practice-proof {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 19px;
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
      .practice-proof span,
      .experience-pill,
      .problem-card > span {
        width: fit-content;
        padding: 6px 10px;
        border: 1px solid #b9dce6;
        border-radius: 999px;
        color: var(--practice-accent);
        background: rgba(255, 255, 255, 0.82);
        font-size: 0.7rem;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .practice-controls {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) repeat(2, minmax(180px, auto));
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
        flex: 0 0 auto;
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
      .active-practice {
        margin: 0 0 26px;
        padding: clamp(18px, 3vw, 28px);
        border: 1px solid #bfd9e5;
        border-radius: 18px;
        background: #fff;
      }
      .active-practice > header,
      .pattern-group > summary {
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
        flex: 0 0 auto;
        color: #587188;
        font-size: 0.76rem;
        font-weight: 800;
        white-space: nowrap;
      }
      .pattern-group-toggle {
        width: 11px;
        height: 11px;
        flex: 0 0 auto;
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
        margin: 11px 0 7px;
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
        .problem-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .active-practice > header,
        .pattern-group > summary,
        .practice-results-header {
          display: grid;
        }
        .lesson-link {
          justify-self: start;
        }
        .group-links {
          justify-content: start;
        }
        .pattern-group-count {
          white-space: normal;
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
  protected readonly courses = signal<CourseContent[] | null>(null);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly difficulty = signal<HandsOnDifficulty>('All');
  protected readonly readiness = signal<HandsOnReadiness>('All');
  protected readonly patternId = signal('');
  protected readonly problemId = signal('');
  protected readonly openGroupId = signal<string | null>(null);
  private readonly lastSurpriseProblemId = signal('');
  protected readonly difficulties: HandsOnDifficulty[] = [
    'All',
    'Beginner',
    'Intermediate',
    'Advanced',
  ];
  protected readonly readinessOptions: HandsOnReadiness[] = [
    'All',
    'Guided',
    'Practice-ready',
    'Catalogued',
  ];
  protected readonly continuationReadiness = continuationReadiness;
  protected readonly groups = computed(() => {
    const courses = this.courses();
    return courses ? courses.flatMap((course) => buildHandsOnDsaGroups(course)) : [];
  });
  protected readonly selectedGroup = computed(() =>
    resolveHandsOnDsaGroup(this.groups(), this.patternId()),
  );
  protected readonly visibleGroups = computed(() => {
    const selected = this.selectedGroup();
    return filterHandsOnDsaGroups(
      selected ? [selected] : this.groups(),
      this.query(),
      this.difficulty(),
      this.readiness(),
    );
  });
  protected readonly visibleUniqueProblemCount = computed(() =>
    uniqueHandsOnProblemCount(this.visibleGroups()),
  );
  private readonly randomPracticePool = computed(() => {
    const candidates = new Map<
      string,
      { courseId: string; problem: CourseContent['questions'][number] }
    >();

    for (const group of this.groups()) {
      for (const problem of group.continuationProblems) {
        if (continuationReadiness(problem) === 'Practice-ready') {
          candidates.set(problem.id, { courseId: group.courseId, problem });
        }
      }
    }

    return [...candidates.values()];
  });
  protected readonly randomPracticeCount = computed(() => this.randomPracticePool().length);

  ngOnInit(): void {
    forkJoin([
      this.content.getCourse('learn', 'algorithmic-patterns'),
      this.content.getCourse('learn', 'core-data-structures'),
      this.content.getCourse('learn', 'sorting-searching'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (courses) => this.courses.set(courses),
        error: () => this.error.set('The practice catalog could not be loaded. Please try again.'),
      });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.patternId.set(params.get('pattern') ?? '');
      this.problemId.set(params.get('problem') ?? '');
      this.resetView();
    });
  }

  protected updateQuery(value: string): void {
    this.query.set(value);
    this.resetView();
  }

  protected updateDifficulty(value: string): void {
    this.difficulty.set(value as HandsOnDifficulty);
    this.resetView();
  }

  protected updateReadiness(value: string): void {
    this.readiness.set(value as HandsOnReadiness);
    this.resetView();
  }

  protected readinessLabel(readiness: HandsOnReadiness): string {
    if (readiness === 'Guided') return 'Guided walkthroughs';
    if (readiness === 'Practice-ready') return 'Ready to solve';
    if (readiness === 'Catalogued') return 'Source required';
    return 'All experiences';
  }

  protected problemReadinessLabel(problem: CourseContent['questions'][number]): string {
    return continuationReadiness(problem) === 'Practice-ready'
      ? 'Ready to solve'
      : 'Source required';
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
      pool.length > 1
        ? pool.filter(({ problem }) => problem.id !== this.lastSurpriseProblemId())
        : pool;
    const randomValue = new Uint32Array(1);
    window.crypto.getRandomValues(randomValue);
    const candidate = alternatives[randomValue[0] % alternatives.length];

    this.lastSurpriseProblemId.set(candidate.problem.id);
    void this.router.navigate(['/learn', candidate.courseId, candidate.problem.id], {
      queryParams: { mode: 'surprise' },
    });
  }

  private resetView(): void {
    this.openGroupId.set(null);
  }
}
