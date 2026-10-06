import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TheoryPatternMap, TheoryPatternSignal, TheoryTable } from '../../content/content.models';

interface MapUnit {
  n: number;
  name: string;
  signal: string;
  memory: string;
  href: string;
}

/** Whole-word match, so "sorted" never matches "unsorted". */
export function hasWords(text: string, phrase: string): boolean {
  const words = phrase.trim().toLowerCase();
  if (!words) return false;
  const pattern = words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z])${pattern}([^a-z]|$)`, 'i').test(text);
}

function plain(html: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  return html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => entities[name]);
}

/**
 * Recognize the Pattern: the 20 units as a route in suggested study order, with a signal finder (user review,
 * 2026-10-05). A signal lists the units that fit, when each fits and what to check; nothing is chosen for the
 * learner. Matching units get a ring, the opened unit a fill; the rest dim but stay readable. On narrow
 * screens the route becomes a numbered list. Rows come from the section table, so the table stays the source.
 */
@Component({
  selector: 'app-pattern-map',
  imports: [RouterLink],
  template: `
    <div class="map" [class.filtering]="hits() !== null">
      <div class="finder">
        <div class="finder-row">
          <label [for]="inputId">What does the problem say?</label>
          <input
            [id]="inputId"
            type="search"
            autocomplete="off"
            placeholder="A word from the problem, e.g. sorted, top k, how many ways"
            [value]="query()"
            (input)="setQuery($any($event.target).value)"
          />
          <button type="button" class="clear" [disabled]="!query() && selected() === null" (click)="clear()">Clear filter</button>
        </div>
        <div class="chips" role="group" aria-label="Common signals">
          @for (item of map().signals; track item.key) {
            <button type="button" class="chip" [attr.aria-pressed]="activeSignal()?.key === item.key" (click)="toggleSignal(item)">{{ item.key }}</button>
          }
        </div>
      </div>
      <div class="map-body">
        <div class="route-column">
          <p class="order-label">{{ map().orderLabel }}@if (map().orderNote) {<small> · {{ map().orderNote }}</small>}</p>
          <div class="route-wrap">
          <svg class="track" aria-hidden="true"><path [attr.d]="trackPath()" /></svg>
          <ol #route class="route" [class.list]="columns() === 1" [style.--cols]="columns()">
            @for (unit of units(); track unit.n; let index = $index) {
              <li [style.grid-row]="cell(index).row" [style.grid-column]="cell(index).column">
                <button
                  type="button"
                  class="station"
                  [class.hit]="hits()?.includes(unit.n)"
                  [attr.aria-current]="selected() === unit.n ? 'true' : null"
                  [attr.aria-label]="unit.n + '. ' + unit.name + ': ' + unit.signal"
                  (click)="open(unit.n)"
                >
                  <span class="dot">{{ unit.n }}</span>
                  <span class="name">{{ unit.name }}</span>
                  <span class="sig">{{ unit.signal }}</span>
                </button>
              </li>
            }
          </ol>
          </div>
        </div>
        <aside class="detail" aria-live="polite">
          @if (selectedUnit(); as unit) {
            @if (query()) {
              <button type="button" class="back" (click)="selected.set(null)"><span aria-hidden="true">‹ </span>Back to matches for “{{ query() }}”</button>
            }
            <p class="eyebrow">Unit {{ unit.n }} of {{ units().length }}</p>
            <h3>{{ unit.name }}</h3>
            <dl>
              <dt>Signal in the problem</dt>
              <dd>{{ unit.signal }}</dd>
              <dt>What you remember while you scan</dt>
              <dd>{{ unit.memory }}</dd>
            </dl>
            <a class="open" [routerLink]="unit.href">{{ unit.name }} lesson</a>
          } @else if (activeSignal(); as item) {
            <p class="eyebrow">Signal: {{ item.key }}</p>
            <h3>{{ item.intro }}</h3>
            <ul class="cands">
              @for (candidate of item.candidates; track candidate.unit) {
                <li>
                  <button type="button" class="cand" (click)="open(candidate.unit)">
                    <span class="cand-unit">{{ candidate.unit }}. {{ units()[candidate.unit - 1]?.name }}</span>
                    <span class="cand-when">{{ candidate.when }}</span>
                  </button>
                </li>
              }
            </ul>
            <p class="check"><strong>Check first.</strong> {{ item.check }}</p>
          } @else if (query()) {
            <p class="eyebrow">Words: {{ query() }}</p>
            @if (wordHits().length) {
              <h3>{{ wordHits().length === 1 ? 'One unit mentions this' : wordHits().length + ' units mention this' }}</h3>
              <ul class="cands">
                @for (unit of wordHits(); track unit.n) {
                  <li>
                    <button type="button" class="cand" (click)="open(unit.n)">
                      <span class="cand-unit">{{ unit.n }}. {{ unit.name }}</span>
                      <span class="cand-when">{{ unit.signal }}</span>
                    </button>
                  </li>
                }
              </ul>
              <p class="check">A shared word is a hint, not a rule. Check each unit's conditions against your input.</p>
            } @else {
              <h3>No unit mentions “{{ query() }}”</h3>
              <p>Try a word that describes the input or the answer, such as sorted, in a row or top k.</p>
            }
          } @else {
            <p class="eyebrow">How to use the map</p>
            <h3>Start from the words in the problem</h3>
            <p>Pick a signal or type a word. You get every unit that fits, when each one fits, and what to check before you choose.</p>
            <p class="check">Or open any unit to see its signal and what you remember while you scan.</p>
          }
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-top: 1rem;
        --map-match: #83d8b9;
        --map-select: #ffba87;
        --map-on-hi: #0b1526;
      }
      .map {
        position: relative;
        overflow: hidden;
        padding: 22px 22px 20px;
        border-radius: 16px;
        background:
          radial-gradient(1100px 380px at 8% -12%, color-mix(in srgb, var(--map-match) 16%, transparent), transparent 60%),
          radial-gradient(900px 360px at 110% 112%, color-mix(in srgb, var(--map-select) 14%, transparent), transparent 60%),
          var(--panel-background);
        color: var(--panel-ink);
      }
      .finder {
        display: grid;
        gap: 10px;
      }
      .finder-row,
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      label {
        font-weight: 700;
      }
      input {
        flex: 1 1 240px;
        min-width: 0;
        padding: 9px 12px;
        border: 1px solid var(--panel-line);
        border-radius: 10px;
        background: color-mix(in srgb, var(--panel-background) 70%, black);
        color: var(--panel-ink);
        font: inherit;
      }
      input::placeholder {
        color: var(--panel-muted);
      }
      .clear,
      .chip,
      .back,
      .cand,
      .station {
        font: inherit;
        cursor: pointer;
      }
      .clear {
        padding: 8px 14px;
        border: 1px solid var(--panel-line);
        border-radius: 10px;
        background: transparent;
        color: var(--panel-ink);
        font-weight: 600;
      }
      .clear:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .chip {
        padding: 4px 12px;
        border: 1px solid var(--panel-line);
        border-radius: 999px;
        background: transparent;
        color: var(--panel-ink);
        font-size: 0.85rem;
      }
      .chip:hover {
        border-color: var(--map-match);
      }
      .chip[aria-pressed='true'] {
        border-color: var(--map-match);
        background: var(--map-match);
        color: var(--map-on-hi);
        font-weight: 700;
      }
      .map-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: 20px;
        margin-top: 18px;
      }
      .order-label {
        margin: 0 0 8px;
        color: var(--panel-muted);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .order-label small {
        font-size: 0.8rem;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
      }
      .route-wrap {
        position: relative;
      }
      .route {
        position: relative;
        display: grid;
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
        row-gap: 24px;
        margin: 0;
        padding: 6px 0;
        list-style: none;
      }
      .track {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
        pointer-events: none;
      }
      .track path {
        fill: none;
        stroke: var(--panel-line);
        stroke-width: 3;
        stroke-dasharray: 2 7;
        stroke-linecap: round;
      }
      .route li {
        position: relative;
        z-index: 1;
        display: flex;
        justify-content: center;
      }
      .station {
        display: grid;
        justify-items: center;
        gap: 6px;
        padding: 4px 6px;
        border: 0;
        border-radius: 12px;
        background: none;
        color: inherit;
        text-align: center;
        transition: opacity 0.2s;
      }
      .dot {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border: 2px solid var(--panel-line);
        border-radius: 50%;
        background: var(--panel-background);
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        transition: transform 0.2s, background 0.2s, border-color 0.2s, box-shadow 0.2s;
      }
      .name {
        max-width: 14ch;
        font-size: 0.875rem;
        font-weight: 700;
        line-height: 1.25;
      }
      .sig {
        max-width: 18ch;
        color: var(--panel-muted);
        font-size: 0.75rem;
        line-height: 1.3;
      }
      .station:hover .dot {
        border-color: var(--map-select);
      }
      .filtering .station:not(.hit):not([aria-current]) {
        opacity: 0.55;
      }
      .station.hit .dot {
        border-color: var(--map-match);
        box-shadow: 0 0 0 5px color-mix(in srgb, var(--map-match) 28%, transparent);
      }
      .station[aria-current] .dot {
        transform: scale(1.1);
        border-color: var(--map-select);
        background: var(--map-select);
        color: var(--map-on-hi);
      }
      .station:focus-visible,
      .chip:focus-visible,
      .cand:focus-visible,
      .clear:focus-visible,
      .open:focus-visible,
      .back:focus-visible,
      input:focus-visible {
        outline: 3px solid var(--map-select);
        outline-offset: 2px;
      }
      .detail {
        align-self: start;
        padding: 16px;
        border: 1px solid var(--panel-line);
        border-radius: 14px;
        background: color-mix(in srgb, var(--panel-background) 75%, black);
      }
      .eyebrow {
        margin: 0;
        color: var(--panel-muted);
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h3 {
        margin: 4px 0 10px;
        color: var(--panel-ink);
        font-size: 1.15rem;
      }
      .detail p {
        margin: 0 0 10px;
      }
      dt {
        color: var(--panel-muted);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      dd {
        margin: 2px 0 12px;
      }
      .cands {
        display: grid;
        gap: 8px;
        margin: 0 0 10px;
        padding: 0;
        list-style: none;
      }
      .cand {
        display: grid;
        gap: 2px;
        width: 100%;
        padding: 9px 11px;
        border: 1px solid var(--panel-line);
        border-left: 3px solid var(--map-match);
        border-radius: 10px;
        background: var(--panel-background);
        color: var(--panel-ink);
        text-align: left;
      }
      .cand:hover {
        border-color: var(--map-match);
      }
      .cand-unit {
        font-weight: 800;
      }
      .cand-when {
        color: var(--panel-muted);
        font-size: 0.85rem;
      }
      .check {
        padding-top: 10px;
        border-top: 1px solid var(--panel-line);
        color: var(--panel-muted);
        font-size: 0.875rem;
      }
      .back {
        margin-bottom: 8px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--map-match);
        font-weight: 700;
      }
      .open {
        display: inline-block;
        padding: 7px 14px;
        border-radius: 9px;
        background: var(--map-select);
        color: var(--map-on-hi);
        font-weight: 700;
        text-decoration: none;
      }
      @media (max-width: 900px) {
        .map-body {
          grid-template-columns: minmax(0, 1fr);
        }
        .detail {
          order: -1;
        }
      }
      @media (max-width: 700px) {
        .map {
          padding: 18px 14px;
        }
      }
      /* Narrow column: a numbered list instead of the drawn route. */
      .route.list {
        row-gap: 6px;
      }
      .route.list li {
        justify-content: stretch;
      }
      .route.list .station {
        grid-template-columns: 34px minmax(0, 1fr);
        justify-items: start;
        column-gap: 12px;
        width: 100%;
        text-align: left;
      }
      .route.list .station .dot {
        grid-row: span 2;
        width: 32px;
        height: 32px;
        font-size: 0.85rem;
      }
      .route.list .name,
      .route.list .sig {
        max-width: none;
      }
      @media (prefers-reduced-motion: reduce) {
        .station,
        .dot {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .station[aria-current] .dot,
        .station.hit .dot {
          border-color: Highlight;
        }
      }
    `,
  ],
})
export class PatternMap implements AfterViewInit {
  readonly table = input.required<TheoryTable>();
  readonly map = input.required<TheoryPatternMap>();

  private static nextId = 0;
  protected readonly inputId = `pattern-map-find-${PatternMap.nextId++}`;
  protected readonly query = signal('');
  protected readonly selected = signal<number | null>(null);
  protected readonly columns = signal(5);
  protected readonly trackPath = signal('');
  private readonly route = viewChild.required<ElementRef<HTMLElement>>('route');
  private readonly host = inject(ElementRef<HTMLElement>);
  private resize?: ResizeObserver;

  protected readonly units = computed<MapUnit[]>(() =>
    this.table().rows.map((row, index) => ({
      n: index + 1,
      name: plain(row[1] ?? ''),
      signal: plain(row[2] ?? ''),
      memory: plain(row[3] ?? ''),
      href: this.map().lessonHrefs[index] ?? '',
    })),
  );

  protected readonly activeSignal = computed<TheoryPatternSignal | null>(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) return null;
    return this.map().signals.find((item) => item.aliases.some((alias) => hasWords(query, alias) || hasWords(alias, query))) ?? null;
  });

  protected readonly wordHits = computed(() => {
    const query = this.query().trim();
    if (!query || this.activeSignal()) return [];
    return this.units().filter((unit) => hasWords(unit.signal, query) || hasWords(unit.name, query));
  });

  /** Unit numbers that match the current signal or words; null when nothing is filtered. */
  protected readonly hits = computed<number[] | null>(() => {
    if (!this.query().trim()) return null;
    const item = this.activeSignal();
    return item ? item.candidates.map((candidate) => candidate.unit) : this.wordHits().map((unit) => unit.n);
  });

  protected readonly selectedUnit = computed(() => {
    const n = this.selected();
    return n === null ? null : (this.units()[n - 1] ?? null);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.resize?.disconnect());
  }

  ngAfterViewInit(): void {
    const Observer = this.host.nativeElement.ownerDocument.defaultView?.ResizeObserver;
    if (Observer) {
      const resize = new Observer(() => this.layout());
      resize.observe(this.route().nativeElement);
      this.resize = resize;
    }
    this.layout();
  }

  /** Snake order on the grid, so the route reads as one line: left to right, then right to left. */
  protected cell(index: number): { row: number; column: number } {
    const columns = this.columns();
    const row = Math.floor(index / columns);
    const column = row % 2 === 0 ? index % columns : columns - 1 - (index % columns);
    return { row: row + 1, column: column + 1 };
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.selected.set(null);
  }

  protected toggleSignal(item: TheoryPatternSignal): void {
    this.setQuery(this.activeSignal()?.key === item.key ? '' : item.key);
  }

  protected open(n: number): void {
    this.selected.set(n);
  }

  protected clear(): void {
    this.query.set('');
    this.selected.set(null);
  }

  private layout(): void {
    const route = this.route().nativeElement;
    const width = route.clientWidth;
    const columns = width && width < 640 ? 1 : 5;
    if (columns !== this.columns()) this.columns.set(columns);
    const view = route.ownerDocument.defaultView;
    // Draw the dotted guide after the grid has placed the stations.
    view?.requestAnimationFrame?.(() => this.trackPath.set(columns > 1 ? this.path(route) : ''));
  }

  private path(route: HTMLElement): string {
    const box = route.getBoundingClientRect();
    const points = Array.from(route.querySelectorAll<HTMLElement>('.dot')).map((dot) => {
      const rect = dot.getBoundingClientRect();
      return [rect.left - box.left + rect.width / 2, rect.top - box.top + rect.height / 2] as const;
    });
    if (points.length < 2) return '';
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      if (Math.abs(y1 - y0) < 2) {
        d += ` L${x1},${y1}`;
      } else {
        const bend = x0 > box.width / 2 ? 44 : -44;
        d += ` C${x0 + bend},${y0} ${x1 + bend},${y1} ${x1},${y1}`;
      }
    }
    return d;
  }
}
