import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { CourseContent } from '../../content/content.models';
import {
  HandsOnDifficulty,
  buildHandsOnDsaGroups,
  filterHandsOnDsaGroups,
  limitHandsOnDsaGroups,
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
        grid-template-columns: minmax(220px, 1fr) minmax(180px, auto);
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
        scrollbar-width: thin;
      }
      .pattern-filter a {
        flex: 0 0 auto;
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
      .pattern-group > header {
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
      .pattern-group header p {
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
        display: grid;
        flex: 0 0 auto;
        gap: 8px;
        justify-items: end;
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
        gap: 16px;
      }
      .pattern-group {
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 9px 25px rgba(54, 83, 119, 0.04);
      }
      .problem-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 11px;
        margin-top: 16px;
      }
      .problem-card {
        display: flex;
        min-width: 0;
        min-height: 170px;
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
      .show-more-problems {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: min(420px, 100%);
        min-height: 48px;
        margin: 22px auto 0;
        border: 1px solid #69a7bd;
        border-radius: 10px;
        color: #1f6277;
        background: #fff;
        cursor: pointer;
        font: inherit;
        font-weight: 820;
      }
      .show-more-problems:hover,
      .show-more-problems:focus-visible {
        color: #fff;
        background: var(--practice-accent);
        outline: 3px solid rgba(13, 129, 146, 0.2);
        outline-offset: 3px;
      }
      @media (max-width: 920px) {
        .problem-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
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
        .pattern-group > header,
        .practice-results-header {
          display: grid;
        }
        .lesson-link {
          justify-self: start;
        }
        .group-links {
          justify-items: start;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .problem-card {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .practice-hero,
        .practice-controls,
        .active-practice,
        .pattern-group,
        .problem-card,
        .pattern-filter a {
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
  protected readonly courses = signal<CourseContent[] | null>(null);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly difficulty = signal<HandsOnDifficulty>('All');
  protected readonly patternId = signal('');
  protected readonly problemId = signal('');
  protected readonly visibleLimit = signal(40);
  protected readonly difficulties: HandsOnDifficulty[] = [
    'All',
    'Beginner',
    'Intermediate',
    'Advanced',
  ];
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
    );
  });
  protected readonly visibleProblemCount = computed(() =>
    this.visibleGroups().reduce(
      (count, group) => count + group.essentialProblems.length + group.continuationProblems.length,
      0,
    ),
  );
  protected readonly visibleUniqueProblemCount = computed(() =>
    uniqueHandsOnProblemCount(this.visibleGroups()),
  );
  protected readonly renderedGroups = computed(() =>
    limitHandsOnDsaGroups(this.visibleGroups(), this.visibleLimit()),
  );
  protected readonly renderedProblemCount = computed(() =>
    this.renderedGroups().reduce(
      (count, group) => count + group.essentialProblems.length + group.continuationProblems.length,
      0,
    ),
  );
  protected readonly nextProblemBatchSize = computed(() =>
    Math.min(40, this.visibleProblemCount() - this.renderedProblemCount()),
  );

  ngOnInit(): void {
    forkJoin([
      this.content.getCourse('learn', 'algorithmic-patterns'),
      this.content.getCourse('learn', 'core-data-structures'),
      this.content.getCourse('learn', 'sorting-searching'),
    ]).subscribe({
      next: (courses) => this.courses.set(courses),
      error: () => this.error.set('The practice catalog could not be loaded. Please try again.'),
    });
    this.route.queryParamMap.subscribe((params) => {
      this.patternId.set(params.get('pattern') ?? '');
      this.problemId.set(params.get('problem') ?? '');
      this.visibleLimit.set(40);
    });
  }

  protected updateQuery(value: string): void {
    this.query.set(value);
    this.visibleLimit.set(40);
  }

  protected updateDifficulty(value: string): void {
    this.difficulty.set(value as HandsOnDifficulty);
    this.visibleLimit.set(40);
  }

  protected showMoreProblems(): void {
    this.visibleLimit.update((limit) => limit + 40);
  }
}
