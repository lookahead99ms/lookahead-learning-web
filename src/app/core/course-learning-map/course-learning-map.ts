import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  input,
  inject,
  signal,
  DestroyRef,
  ElementRef,
  HostListener,
  afterRenderEffect,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  ContentItemSummary,
  CourseLearningUnit,
  CourseLearningUnitCard,
  CourseOutline,
  reviewStatusLabel,
} from '../../content/content.models';
import { questionsForModule } from '../../content/question-discovery';
import { CardScene } from '../card-scene/card-scene';
import { CourseLessonNav, CourseLessonNavItem } from '../course-lesson-nav/course-lesson-nav';
import { evenGridColumns } from '../even-grid';

const LADDER_INTROS: Record<string, string> = {
  'design-fundamentals':
    'Each lesson explains one building block or one technology: what it is, how it works, where it breaks, and what to say about it in an interview.',
  'design-patterns':
    'Each lesson starts from a problem that shows up in many systems, then walks through the ways to solve it and when to pick each one.',
  'design-systems':
    'Each lesson designs one system end to end. When you finish one, practice it as a timed interview in Design Rounds.',
  'design-rounds':
    'Each round is a 45-minute interview question. Try it on your own first, then open the reference answer and follow the links down to the lessons behind each step.',
};

/**
 * Singular and plural nouns for the side nav count and the filter summary; lessons unless a
 * course says otherwise.
 */
const LADDER_COUNT_NOUNS: Record<string, readonly [string, string]> = {
  'design-rounds': ['round', 'rounds'],
};

/** One card in the course grid: an authored card, a conventional unit card, or a planned unit. */
interface UnitCardEntry {
  /** Unique within the page; sub-unit keys include their parent id. */
  key: string;
  unit: CourseLearningUnit;
  card?: CourseLearningUnitCard;
  planned: boolean;
  subUnit: boolean;
  scene: string;
  sceneAlt: string;
  initials: string;
  meta: string[];
  /** The meta line shows only when it has something to say (a sub-unit label or planned). */
  hasMeta: boolean;
  /** Level, meta and summary ids, in reading order, for the card's accessible description. */
  describedBy: string;
  route: string[];
  queryParams: Record<string, string> | null;
}

@Component({
  selector: 'app-course-learning-map',
  imports: [RouterLink, CardScene, NgTemplateOutlet, CourseLessonNav],
  template: `
    <div class="learning-map-layout" [class.with-lesson-nav]="lessonNav()">
      @if (lessonNav()) {
        <app-course-lesson-nav
          [courseTitle]="course().title"
          [items]="navItems()"
          [activeKey]="activeKey()"
          [nouns]="cardNouns()"
        />
      }
      <!-- data-signature-column: the platform statements after the page line up with this column. -->
      <section
        class="learning-map learning-map-cards"
        [attr.data-path]="pathId()"
        [attr.data-signature-column]="lessonNav() ? '' : null"
        aria-label="Learning map"
      >
        <header class="unit-card-banner">
          @if (course().reviewStatus; as status) {
            @if (status !== 'reviewed') {
              <span
                class="review-status unit-card-banner-status"
                [attr.data-review-status]="status"
                >{{ reviewStatusText(status) }}</span
              >
            }
          }
          <h1 class="unit-card-banner-title">{{ course().title }}</h1>
          <p class="unit-card-banner-intro">{{ ladderIntro() ?? course().description }}</p>
        </header>
        <ng-content />
        @if (family(); as active) {
          <div class="unit-card-filter">
            <p class="unit-card-filter-status" role="status">
              {{ filterSummary() }} <strong>{{ active }}</strong>
            </p>
            <button type="button" class="unit-card-filter-clear" (click)="clearFamily()">
              Show all {{ cardNouns()[1] }}
            </button>
          </div>
        }
        @if (shownCards().length) {
          <ul
            class="unit-card-grid"
            [attr.data-columns]="lessonNav() ? null : gridColumns(shownCards().length)"
          >
            @for (entry of shownCards(); track entry.key) {
              <li
                class="unit-card-item"
                [attr.data-lesson-key]="entry.key"
                (mouseenter)="hoveredKey.set(entry.key)"
                (mouseleave)="hoveredKey.set(null)"
                (focusin)="hoveredKey.set(entry.key)"
                (focusout)="hoveredKey.set(null)"
              >
                <ng-template #cardContent>
                  <app-card-scene
                    card
                    class="unit-card-scene"
                    [src]="entry.scene"
                    [alt]="entry.sceneAlt"
                    [fallback]="entry.initials"
                  />
                  <div class="unit-card-body">
                    <!-- The level is plain text on the title row, not a pill; it wraps under a long title. -->
                    <div class="unit-card-title-row">
                      <h2 class="unit-card-title" [id]="'unit-card-title-' + entry.key">
                        {{ entry.unit.title }}
                      </h2>
                      @if (entry.card?.level; as level) {
                        <span
                          class="unit-card-level"
                          [id]="'unit-card-level-' + entry.key"
                          [attr.data-level]="level"
                          >{{ level }}</span
                        >
                      }
                    </div>
                    <p
                      class="unit-card-summary"
                      [class.unit-card-summary-clamped]="!entry.card"
                      [id]="'unit-card-summary-' + entry.key"
                    >
                      {{ entry.card?.summary ?? entry.unit.description }}
                    </p>
                    <!-- Drawing, title and description lead; the unit facts follow as plain meta. -->
                    @if (entry.hasMeta) {
                      <span class="unit-card-meta" [id]="'unit-card-meta-' + entry.key">
                        @for (item of entry.meta; track $index) {
                          <span class="unit-card-meta-item">{{ item }}</span>
                        }
                        @if (entry.planned) {
                          <span
                            class="review-status unit-card-planned-status"
                            data-review-status="planned"
                            >Planned</span
                          >
                        }
                      </span>
                    }
                  </div>
                </ng-template>
                <ng-template #cardFamilies>
                  <!-- Each family pill filters the map to the lessons that share it. The group label
                       (Patterns, Fundamentals, Systems) is the group's accessible name, not visible text. -->
                  @if (entry.card?.pillGroups?.length) {
                    <div class="unit-card-pills">
                      @for (
                        group of entry.card!.pillGroups;
                        track $index;
                        let groupIndex = $index
                      ) {
                        <div
                          class="unit-card-pill-row"
                          [class.primary]="groupIndex === 0"
                          role="group"
                          [attr.aria-label]="'Filter lessons by ' + group.label"
                        >
                          <span class="unit-card-pill-items">
                            @for (item of group.items; track $index) {
                              <button
                                type="button"
                                class="unit-card-pill"
                                [attr.aria-pressed]="family() === item"
                                (click)="toggleFamily(item)"
                              >
                                {{ item }}
                              </button>
                            }
                          </span>
                        </div>
                      }
                    </div>
                  }
                </ng-template>
                @if (entry.planned) {
                  <article
                    class="unit-card unit-card-planned"
                    [id]="'unit-' + entry.unit.id"
                    [attr.aria-labelledby]="'unit-card-title-' + entry.key"
                    [attr.aria-describedby]="entry.describedBy"
                  >
                    <ng-container *ngTemplateOutlet="cardContent" />
                    <ng-container *ngTemplateOutlet="cardFamilies" />
                  </article>
                } @else {
                  <div class="unit-card-frame">
                    <a
                      class="unit-card"
                      [class.unit-card-subunit]="entry.subUnit"
                      [id]="'unit-' + entry.unit.id"
                      [routerLink]="entry.route"
                      [queryParams]="entry.queryParams"
                      [attr.aria-labelledby]="'unit-card-title-' + entry.key"
                      [attr.aria-describedby]="entry.describedBy"
                    >
                      <ng-container *ngTemplateOutlet="cardContent" />
                    </a>
                    <ng-container *ngTemplateOutlet="cardFamilies" />
                  </div>
                }
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: [
    `
      /* DLV-408: the course side nav sits in its own sticky column beside the map. */
      .learning-map-layout.with-lesson-nav {
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        align-items: start;
        gap: 24px;
      }
      /* A grid item with auto margins would shrink to its (contained, zero) inline size. */
      .learning-map-layout.with-lesson-nav > .learning-map {
        width: 100%;
        min-width: 0;
        margin: 0;
      }
      @media (max-width: 899px) {
        .learning-map-layout.with-lesson-nav {
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
        }
      }
      .learning-map {
        --learning-accent: var(--accent-strong);
        display: grid;
        gap: 22px;
        margin: 0 auto;
        container-type: inline-size;
      }
      .unit-card-banner {
        display: grid;
        gap: 10px;
        padding: 34px 38px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--surface);
      }
      .unit-card-banner-status {
        justify-self: start;
      }
      .unit-card-banner-title {
        margin: 0;
        color: var(--text-strong);
        font-size: clamp(1.9rem, 3.4vw, 2.6rem);
        letter-spacing: -0.01em;
        line-height: 1.12;
        text-wrap: balance;
      }
      .unit-card-banner-intro {
        max-width: 72ch;
        margin: 0;
        color: var(--text-body);
        font-size: 1.04rem;
        line-height: 1.55;
      }
      .unit-card-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 20px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      /* DLV-408 (user, 2026-10-02, about 21:00): course pages with the side nav show one card per
         row, each clearly a card (border, resting shadow, lift on hover, focus ring), with the
         title row, description and pills on the left and the drawing on the right. The DOM keeps
         the card order (drawing, title, description), so narrow containers stack the drawing
         above the text again. */
      .learning-map-layout.with-lesson-nav .unit-card-grid {
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
      }
      .with-lesson-nav .unit-card-frame,
      .with-lesson-nav article.unit-card {
        border-color: color-mix(in srgb, var(--border-strong) 45%, var(--line));
        box-shadow:
          0 1px 2px var(--shadow),
          0 6px 18px var(--shadow);
      }
      .with-lesson-nav .unit-card-frame:hover,
      .with-lesson-nav .unit-card-frame:has(> a.unit-card:hover) {
        transform: translateY(-2px);
        border-color: var(--learning-accent);
        box-shadow:
          0 2px 4px var(--shadow),
          0 14px 30px var(--shadow);
      }
      .with-lesson-nav a.unit-card {
        cursor: pointer;
      }
      /* The focus ring goes round the whole card, pills included. */
      .with-lesson-nav a.unit-card:focus-visible {
        outline: none;
      }
      .with-lesson-nav .unit-card-frame:has(> a.unit-card:focus-visible) {
        border-color: var(--learning-accent);
        outline: 3px solid var(--accent-focus);
        outline-offset: 3px;
      }
      @container (min-width: 620px) {
        /* One grid for the card: the link's body and the pill row (filter buttons, so outside the
           link) share the left column, centred between two spacer rows; the drawing spans the
           right column (about 42% of the card) at full width, so it sets the card height. The link
           spans the whole card through a subgrid, so the drawing, the text and the space around
           the pills all open the lesson. */
        .with-lesson-nav .unit-card-frame,
        .with-lesson-nav article.unit-card {
          grid-template-columns: minmax(0, 58fr) minmax(0, 42fr);
          grid-template-rows: 1fr auto auto 1fr;
          min-height: 232px;
        }
        .with-lesson-nav .unit-card-frame > a.unit-card {
          grid-column: 1 / -1;
          grid-row: 1 / -1;
          grid-template-columns: subgrid;
          grid-template-rows: subgrid;
        }
        .with-lesson-nav .unit-card > .unit-card-scene {
          grid-column: 2;
          grid-row: 1 / -1;
          display: grid;
          align-content: center;
          border-bottom: 0;
          border-left: 1px solid var(--line);
          background: var(--surface-muted);
        }
        .with-lesson-nav .unit-card > .unit-card-body {
          grid-column: 1;
          grid-row: 2;
          gap: 12px;
          padding: 28px 32px 18px;
        }
        .with-lesson-nav .unit-card-frame > .unit-card-pills,
        .with-lesson-nav article.unit-card > .unit-card-pills {
          grid-column: 1;
          grid-row: 3;
          position: relative;
          z-index: 1;
          padding: 0 32px 28px;
          pointer-events: none;
        }
        .with-lesson-nav .unit-card-pills .unit-card-pill {
          pointer-events: auto;
        }
      }
      /* --card-title-size: the title's size, also read by the card drawing (card-scene.ts) to
         keep its words smaller than the title. */
      .unit-card-item {
        --card-title-size: 1.3rem;
        display: grid;
        min-width: 0;
      }
      /* The frame is the visible card: the link (drawing, title, description, meta) and,
         below it, the family pills, which are filter buttons and so sit outside the link. */
      .unit-card-frame,
      article.unit-card {
        display: grid;
        grid-template-rows: 1fr auto;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--surface);
        transition:
          transform 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease;
      }
      article.unit-card {
        scroll-margin-top: 140px;
        grid-template-rows: auto 1fr auto;
      }
      a.unit-card {
        scroll-margin-top: 140px;
        display: grid;
        grid-template-rows: auto 1fr;
        min-width: 0;
        color: inherit;
        text-decoration: none;
      }
      .unit-card-frame:has(> a.unit-card:hover) {
        transform: translateY(-3px);
        border-color: var(--learning-accent);
        box-shadow: 0 10px 28px rgb(0 0 0 / 0.12);
      }
      .unit-card-frame:has(> a.unit-card:focus-visible) {
        border-color: var(--learning-accent);
      }
      a.unit-card:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: -3px;
        border-radius: 18px 18px 0 0;
      }
      .unit-card-filter {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 14px;
      }
      .unit-card-filter-status {
        margin: 0;
        color: var(--text-body);
        font-size: 0.95rem;
      }
      .unit-card-filter-status strong {
        color: var(--text-strong);
      }
      .unit-card-filter-clear {
        padding: 6px 14px;
        border: 1px solid var(--accent-strong);
        border-radius: 999px;
        color: var(--accent-strong);
        background: var(--surface);
        font: inherit;
        font-size: 0.85rem;
        font-weight: 650;
        cursor: pointer;
      }
      .unit-card-filter-clear:hover {
        color: var(--accent-on-primary);
        background: var(--accent-strong);
      }
      .unit-card-filter-clear:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      /* Planned: a quieter card that is clearly not a link, matching the catalog. */
      .unit-card-planned {
        border-style: dashed;
        border-color: var(--border-strong);
        background: var(--surface-muted);
      }
      .unit-card-planned .unit-card-scene {
        opacity: 0.6;
        filter: grayscale(0.6);
      }
      .unit-card-planned .unit-card-title,
      .unit-card-planned .unit-card-summary {
        color: var(--text-subtle);
      }
      .unit-card-planned-status {
        padding: 2px 9px;
        border: 1px solid var(--border-strong);
        border-radius: 999px;
        color: var(--text-strong);
        background: var(--surface);
        font-size: 0.68rem;
        letter-spacing: 0.06em;
      }
      .unit-card-scene {
        border-bottom: 1px solid var(--line);
      }
      .unit-card-body {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        padding: 18px 20px 20px;
      }
      .unit-card-meta {
        margin-top: auto;
        padding-top: 2px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        min-height: 22px;
        color: var(--learning-accent);
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-variant-numeric: tabular-nums;
      }
      .unit-card-meta-item + .unit-card-meta-item::before {
        content: '·';
        margin-right: 8px;
      }
      /* Title row: the name, and the level right-aligned beside it. A title too long for one line
         pushes the level under it. */
      .unit-card-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 2px 16px;
      }
      .unit-card-title-row .unit-card-title {
        flex: 1 1 auto;
        min-width: 0;
      }
      /* Passive metadata: small muted plain text, not a pill. */
      .unit-card-level {
        flex: none;
        color: var(--text-subtle);
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }
      /* The strongest text on the card: path colour (--card-title-color, styles.css). */
      .unit-card-title {
        margin: 0;
        color: var(--card-title-color, var(--text-strong));
        font-weight: var(--card-title-weight, 800);
        font-size: var(--card-title-size, 1.3rem);
        line-height: 1.25;
        text-wrap: balance;
      }
      .unit-card-summary {
        margin: 0;
        color: var(--text-body);
        font-size: 0.95rem;
        line-height: 1.5;
      }
      .unit-card-summary-clamped {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
      }
      /* Pills only, one row per group: the first group filled, the second outlined. The group's
         name is its accessible label, not visible text. */
      .unit-card-pills {
        display: grid;
        gap: 8px;
        padding: 0 20px 20px;
      }
      .unit-card-pill-items {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        min-width: 0;
      }
      .unit-card-pill {
        max-width: 100%;
        padding: 3px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--text-body);
        background: transparent;
        font: inherit;
        font-size: 0.78rem;
        line-height: 1.35;
        text-align: left;
        cursor: pointer;
      }
      .unit-card-pill-row.primary .unit-card-pill {
        border-color: transparent;
        color: var(--text-strong);
        background: var(--surface-accent);
        font-weight: 600;
      }
      .unit-card-pill:hover {
        border-color: var(--learning-accent);
      }
      .unit-card-pill:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      .unit-card-pill-row .unit-card-pill[aria-pressed='true'] {
        border-color: var(--accent-strong);
        color: var(--accent-on-primary);
        background: var(--accent-strong);
      }
      /* Without the side nav, the column count follows the card count (data-columns,
         even-grid.ts; user review #1, #2): 2 cards share the full width, 4 are 2×2, one card
         gets the whole row with its drawing beside the text. */
      .unit-card-grid[data-columns='2'] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .unit-card-grid[data-columns='1'] {
        grid-template-columns: minmax(0, 1fr);
      }
      @container (min-width: 620px) {
        .unit-card-grid[data-columns='1'] a.unit-card {
          grid-template-columns: minmax(0, 58fr) minmax(0, 42fr);
          grid-template-rows: none;
        }
        .unit-card-grid[data-columns='1'] a.unit-card > .unit-card-scene {
          grid-column: 2;
          grid-row: 1;
          display: grid;
          align-content: center;
          border-bottom: 0;
          border-left: 1px solid var(--line);
        }
        .unit-card-grid[data-columns='1'] a.unit-card > .unit-card-body {
          grid-column: 1;
          grid-row: 1;
          justify-content: center;
          padding: 28px 32px;
        }
      }
      @container (max-width: 940px) {
        .unit-card-grid:not([data-columns='1']) {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @container (max-width: 580px) {
        .unit-card-grid,
        .unit-card-grid[data-columns] {
          grid-template-columns: minmax(0, 1fr);
        }
        .unit-card-banner {
          padding: 24px 22px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .unit-card-frame,
        article.unit-card {
          transition: none;
        }
        .unit-card-frame:has(> a.unit-card:hover),
        .with-lesson-nav .unit-card-frame:hover {
          transform: none;
        }
      }
      @media (forced-colors: active) {
        .unit-card-frame,
        .unit-card,
        .unit-card-banner,
        .unit-card-pill,
        .unit-card-level {
          border-color: CanvasText;
          color: CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .unit-card-pill-row .unit-card-pill[aria-pressed='true'] {
          color: HighlightText;
          background: Highlight;
        }
      }
    `,
  ],
})
export class CourseLearningMap {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fragment = toSignal(this.route.fragment);
  /** Raw `?family=` value; reload and back/forward restore the filter from the URL. */
  private readonly familyParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('family'))),
    { initialValue: this.route.snapshot?.queryParamMap.get('family') ?? null },
  );
  private restoredFragment: string | null = null;

  constructor() {
    afterRenderEffect(() => {
      const fragment = this.fragment();
      this.cards();
      if (!fragment || !fragment.startsWith('unit-') || fragment === this.restoredFragment) return;
      const target = Array.from(
        this.element.nativeElement.querySelectorAll<HTMLElement>('[id]'),
      ).find((element) => element.id === fragment);
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
      this.restoredFragment = fragment;
    });
    // The side nav marks the card in view as soon as the cards render or the filter changes.
    afterRenderEffect(() => {
      this.shownCards();
      if (this.lessonNav()) this.updateInView();
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.viewFrame !== null)
        this.element.nativeElement.ownerDocument.defaultView?.cancelAnimationFrame(this.viewFrame);
    });
  }

  readonly course = input.required<CourseOutline>();
  readonly pathId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly units = input.required<CourseLearningUnit[]>();
  /** Shows the sticky side nav listing every lesson of the course. */
  readonly lessonNav = input(false);
  /** Plain one-line guide for the System Design Ladder courses. */
  protected readonly ladderIntro = computed(() =>
    this.pathId() === 'look-ahead' ? (LADDER_INTROS[this.courseId()] ?? null) : null,
  );
  protected readonly visibleUnits = computed(() => {
    const publishedModuleIds = new Set(this.course().modules.map((module) => module.id));
    return this.units().filter(
      (unit) => unit.planned || publishedModuleIds.has(unit.theoryModuleId),
    );
  });

  /**
   * Every visible unit becomes one card. Units with authored card data keep it; the rest
   * use the conventional scene file for the unit. A family's sub-units follow their parent.
   */
  protected readonly cards = computed<UnitCardEntry[]>(() =>
    this.visibleUnits().flatMap((unit) => [
      // Cards carry no lesson number (user review, 2026-10-03); the side nav keeps the order.
      this.cardEntry(unit, unit.id, null),
      ...(unit.planned ? [] : (unit.subUnits ?? [])).map((subUnit, index) =>
        this.cardEntry(
          subUnit,
          `${unit.id}-${subUnit.id}`,
          `${unit.subUnitLabel ?? 'Subpattern'} ${index + 1}`,
          true,
        ),
      ),
    ]),
  );

  protected readonly gridColumns = evenGridColumns;

  /** Every lesson in course order for the side nav; a family's sub-units nest under it. */
  protected readonly navItems = computed<CourseLessonNavItem[]>(() => {
    const items: CourseLessonNavItem[] = [];
    for (const entry of this.cards()) {
      const item: CourseLessonNavItem = {
        key: entry.key,
        title: entry.unit.title,
        order: entry.subUnit ? null : this.unitOrder(entry.unit),
        route: entry.route,
        queryParams: entry.queryParams,
        planned: entry.planned,
        children: [],
      };
      const parent = items.at(-1);
      if (entry.subUnit && parent) parent.children.push(item);
      else items.push(item);
    }
    return items;
  });

  /** The card under the pointer or holding focus wins over the card in view. */
  protected readonly hoveredKey = signal<string | null>(null);
  protected readonly inViewKey = signal<string | null>(null);
  protected readonly activeKey = computed(() => this.hoveredKey() ?? this.inViewKey());
  private viewFrame: number | null = null;

  @HostListener('window:scroll')
  @HostListener('window:resize')
  protected scheduleInView(): void {
    if (!this.lessonNav() || this.viewFrame !== null) return;
    const view = this.element.nativeElement.ownerDocument.defaultView;
    if (!view) return;
    this.viewFrame = view.requestAnimationFrame(() => {
      this.viewFrame = null;
      this.updateInView();
    });
  }

  /**
   * The card in view is the first one (in reading order) still showing below the platform
   * header and the sticky breadcrumb bar. At the very end of the page it is the last card.
   */
  protected updateInView(): void {
    const host = this.element.nativeElement;
    const view = host.ownerDocument.defaultView;
    if (!view) return;
    const items = Array.from(
      host.querySelectorAll<HTMLElement>('.unit-card-item[data-lesson-key]'),
    );
    if (!items.length) {
      this.inViewKey.set(null);
      return;
    }
    const sticky = host.ownerDocument.querySelector<HTMLElement>('.reader-sticky-stack');
    const header = host.ownerDocument.querySelector<HTMLElement>('app-platform-header');
    const line =
      Math.max(
        sticky?.getBoundingClientRect().bottom ?? 0,
        header?.getBoundingClientRect().bottom ?? 0,
      ) + 24;
    const atBottom =
      view.scrollY > 0 &&
      view.scrollY + view.innerHeight >= host.ownerDocument.documentElement.scrollHeight - 2;
    const current = atBottom
      ? items.at(-1)
      : (items.find((item) => item.getBoundingClientRect().bottom > line) ?? items.at(-1));
    this.inViewKey.set(current?.dataset['lessonKey'] ?? null);
  }

  protected readonly cardNouns = computed(
    () => LADDER_COUNT_NOUNS[this.courseId()] ?? (['lesson', 'lessons'] as const),
  );

  /**
   * The family pill (a pattern or fundamental) the map is filtered to, if any. It comes from
   * `?family=`; a value no card carries falls back to showing every card.
   */
  protected readonly family = computed(() => {
    const family = this.familyParam();
    if (!family) return null;
    const known = this.cards().some((entry) =>
      entry.card?.pillGroups?.some((group) => group.items.includes(family)),
    );
    return known ? family : null;
  });

  /** Cards on screen: all of them, or only those that carry the selected family pill. */
  protected readonly shownCards = computed(() => {
    const family = this.family();
    if (!family) return this.cards();
    return this.cards().filter((entry) =>
      entry.card?.pillGroups?.some((group) => group.items.includes(family)),
    );
  });

  protected readonly filterSummary = computed(() => {
    const count = this.shownCards().length;
    const [singular, plural] = this.cardNouns();
    return `Showing ${count} ${count === 1 ? singular : plural} with`;
  });

  protected toggleFamily(family: string): void {
    this.setFamily(this.family() === family ? null : family);
  }

  protected clearFamily(): void {
    this.setFamily(null);
  }

  /** Each filter change is its own history entry, and the page keeps its scroll position. */
  private setFamily(family: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { family },
      queryParamsHandling: 'merge',
      scroll: 'manual',
    });
  }

  protected reviewStatusText(status: Parameters<typeof reviewStatusLabel>[0]): string {
    return reviewStatusLabel(status);
  }

  private cardEntry(
    unit: CourseLearningUnit,
    key: string,
    label: string | null,
    subUnit = false,
  ): UnitCardEntry {
    const card = unit.card;
    const planned = Boolean(unit.planned);
    const target = card
      ? { route: this.cardRoute(unit), queryParams: null }
      : this.unitTarget(unit);
    // Cards carry no counts or minutes (user review, 2026-10-03): only a sub-unit label.
    const meta = label ? [label] : [];
    const hasMeta = meta.length > 0 || planned;
    const describedBy = [
      ...(card?.level ? [`unit-card-level-${key}`] : []),
      ...(hasMeta ? [`unit-card-meta-${key}`] : []),
      `unit-card-summary-${key}`,
    ].join(' ');
    return {
      key,
      unit,
      card,
      planned,
      subUnit,
      scene:
        card?.scene ?? `/assets/scenes/units/${this.pathId()}/${this.courseId()}/${unit.id}.svg`,
      sceneAlt: card?.sceneAlt ?? '',
      initials: initials(unit.title),
      meta,
      hasMeta,
      describedBy,
      ...target,
    };
  }

  /** An authored card opens its lesson, or the unit's first question when there is no lesson. */
  private cardRoute(unit: CourseLearningUnit): string[] {
    const item =
      this.lesson(unit) ??
      questionsForModule(this.course(), unit.theoryModuleId)[0] ??
      this.practiceItems(unit)[0] ??
      this.questionItems(unit)[0];
    return item
      ? ['/', this.pathId(), this.courseId(), item.id]
      : ['/', this.pathId(), this.courseId()];
  }

  /** A conventional card opens the unit's lesson; without a lesson it opens the unit's practice. */
  private unitTarget(unit: CourseLearningUnit): Pick<UnitCardEntry, 'route' | 'queryParams'> {
    const lesson = this.lesson(unit);
    if (lesson)
      return { route: ['/', this.pathId(), this.courseId(), lesson.id], queryParams: null };
    if (unit.practiceModuleId && this.hasPractice(unit)) {
      return { route: this.practiceRoute(unit), queryParams: this.practiceQueryParams(unit) };
    }
    return { route: this.cardRoute(unit), queryParams: null };
  }

  private lesson(unit: CourseLearningUnit): ContentItemSummary | undefined {
    return this.course().questions.find(
      (question) => question.moduleId === unit.theoryModuleId && question.contentType === 'theory',
    );
  }

  private questionItems(unit: CourseLearningUnit): ContentItemSummary[] {
    return questionsForModule(this.course(), unit.questionModuleId);
  }

  private practiceItems(unit: CourseLearningUnit): ContentItemSummary[] {
    return questionsForModule(this.course(), unit.practiceModuleId);
  }

  private unitOrder(unit: CourseLearningUnit): string | null {
    if (unit.hideOrder) return null;
    const order =
      this.visibleUnits()
        .filter((candidate) => !candidate.hideOrder)
        .indexOf(unit) + 1;
    return order.toString().padStart(2, '0');
  }

  private practiceRoute(unit: CourseLearningUnit): string[] {
    return this.pathId() === 'learn' && !this.usesQuestionBankPractice(unit)
      ? ['/', 'learn', 'hands-on-dsa']
      : [
          '/',
          this.pathId(),
          this.courseId(),
          'module',
          unit.practiceModuleId ?? unit.theoryModuleId,
        ];
  }

  private practiceQueryParams(unit: CourseLearningUnit): Record<string, string> | null {
    return this.pathId() === 'learn' && !this.usesQuestionBankPractice(unit)
      ? { pattern: `${this.courseId()}:${unit.id}` }
      : null;
  }

  private usesQuestionBankPractice(unit: CourseLearningUnit): boolean {
    return unit.practiceExperience === 'questionBank';
  }

  private hasPractice(unit: CourseLearningUnit): boolean {
    return !this.usesQuestionBankPractice(unit) || this.practiceItems(unit).length > 0;
  }
}

/** Up to two initials from the unit title, shown when its scene is missing. */
function initials(title: string): string {
  return title
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
