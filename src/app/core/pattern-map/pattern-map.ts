import { htmlText } from '../html-text';
import { AfterViewInit, Component, DestroyRef, ElementRef, InjectionToken, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TheoryPatternMap, TheoryPatternSignal, TheoryTable } from '../../content/content.models';
import { Observable } from 'rxjs';
import { ContentService } from '../../content/content.service';
import {
  FINDER_SHAPES,
  FINDER_SIZES,
  FINDER_WANTS,
  FinderAnswers,
  FinderReason,
  FinderShape,
  FinderSize,
  FinderWant,
  RecognitionIndex,
  UnitMatch,
  leaders,
  matchingUnits,
  score,
} from '../pattern-finder/pattern-finder';
import { closestSpelling, hasWords } from '../pattern-finder/words';

/**
 * Where the map gets the pattern finder's problem cards. The default reads the published index
 * through ContentService; when it fails, the map hides the finder rows and works as before.
 */
export const PATTERN_RECOGNITION_INDEX = new InjectionToken<() => Observable<RecognitionIndex>>('PATTERN_RECOGNITION_INDEX', {
  providedIn: 'root',
  factory: () => {
    const content = inject(ContentService);
    return () => content.getPatternRecognitionIndex();
  },
});


/** Labels for the reasons under a result, matching the chips the learner tapped. */
function reasonLabel(reason: FinderReason): string {
  if (reason.check === 'input') return FINDER_SHAPES.find((item) => item.value === reason.value)?.label ?? reason.value;
  if (reason.check === 'wants') return FINDER_WANTS.find((item) => item.value === reason.value)?.label ?? reason.value;
  if (reason.check === 'size') return FINDER_SIZES.find((item) => item.value === reason.value)?.label ?? reason.value;
  return `‘${reason.value}’`;
}

interface FinderLeader {
  unit: number;
  name: string;
  /** With two leaders: when this one fits, so the learner can tell them apart. */
  when: string;
  reasons: { label: string; matched: boolean }[];
  examples: { id: string; title: string; href: string }[];
}

interface FinderView {
  /** Two leaders say when each fits, from a map signal both share, else each unit's own signal. */
  leaders: FinderLeader[];
  check: string;
  /** Further units that fit every tapped check, after the leaders. */
  more: number;
}

interface MapUnit {
  n: number;
  name: string;
  signal: string;
  memory: string;
  href: string;
}

/**
 * Stations per row of the drawn route. DLV-803: inside the centred lesson frame the route beside
 * the guide panel is 470-640px wide on laptops and large monitors, so it keeps a 4-station route
 * there instead of falling back to the plain list; only a really narrow column gets the list.
 */
export function routeColumns(width: number): number {
  if (!width || width >= 640) return 5;
  return width >= 460 ? 4 : 1;
}

/**
 * Input types: every pattern reads them, so they cannot point to one (user, 2026-10-16). Typing one
 * explains that and asks what the problem wants instead of listing several units.
 */
export const DATA_TYPE_WORDS = [
  'string', 'strings', 'array', 'arrays', 'list', 'lists', 'integer', 'integers', 'int', 'ints',
  'number', 'numbers', 'char', 'chars', 'character', 'characters', 'matrix', 'input',
];

/**
 * What the problem asks for, as short phrases, each opening one of the map's own signals. Only the
 * signals the section publishes are offered, in this order.
 */
export const ASK_HINTS: { key: string; phrase: string }[] = [
  { key: 'how many ways', phrase: 'Count how many ways' },
  { key: 'in a row', phrase: 'The longest or shortest run in a row' },
  { key: 'min or max', phrase: 'The smallest or largest value, such as the best day to buy and sell' },
  { key: 'seen before', phrase: 'Whether a value was seen before' },
  { key: 'top k', phrase: 'The k largest, smallest or most frequent' },
  { key: 'all combinations', phrase: 'Every combination or arrangement' },
  { key: 'sorted', phrase: 'Input that is already sorted' },
  { key: 'next greater', phrase: 'The next greater or smaller value' },
  { key: 'prefix', phrase: 'Words that share a prefix' },
];

// The word helpers live with the pattern finder so its coverage report runs the same code.
export { closestSpelling, editDistance, hasWords } from '../pattern-finder/words';

/**
 * Recognize the Pattern: the 20 units as a route in suggested study order, with a signal finder (user review,
 * 2026-10-05). A signal lists the units that fit, when each fits and what to check; nothing is chosen for the
 * learner. Matching units get a ring, the opened unit a fill; the rest dim but stay readable. On narrow
 * screens the route becomes a numbered list. Rows come from the section table, so the table stays the source.
 */
@Component({
  selector: 'app-pattern-map',
  imports: [RouterLink, NgTemplateOutlet],
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
          <button type="button" class="clear" [disabled]="!query() && selected() === null && !finderActive()" (click)="clear()">Clear filter</button>
        </div>
        <div class="chips" role="group" aria-label="Common signals">
          @for (item of map().signals; track item.key) {
            <button type="button" class="chip" [attr.aria-pressed]="activeSignal()?.key === item.key" (click)="toggleSignal(item)">{{ item.key }}</button>
          }
        </div>
        @if (index()) {
          <div class="checks">
            <div class="check-row" role="group" [attr.aria-labelledby]="inputId + '-shape'">
              <span class="check-label" [id]="inputId + '-shape'">Input</span>
              <div class="chips">
                @for (item of shapes; track item.value) {
                  <button type="button" class="chip" [attr.aria-pressed]="answers().input.includes(item.value)" (click)="toggleShape(item.value)">{{ item.label }}</button>
                }
              </div>
            </div>
            <div class="check-row" role="group" [attr.aria-labelledby]="inputId + '-wants'">
              <span class="check-label" [id]="inputId + '-wants'">Wants back</span>
              <div class="chips">
                @for (item of wants; track item.value) {
                  <button type="button" class="chip" [attr.aria-pressed]="answers().wants.includes(item.value)" (click)="toggleWant(item.value)">{{ item.label }}</button>
                }
              </div>
            </div>
            <div class="check-row" role="group" [attr.aria-labelledby]="inputId + '-size'">
              <span class="check-label" [id]="inputId + '-size'">Size</span>
              <div class="chips">
                @for (item of sizes; track item.value) {
                  <button type="button" class="chip" [attr.aria-pressed]="answers().size === item.value" (click)="toggleSize(item.value)">{{ item.label }}</button>
                }
              </div>
            </div>
          </div>
        }
      </div>
      <div class="map-body">
        <div class="route-column">
          <p class="order-label">{{ map().orderLabel }}@if (map().orderNote) {<small> · {{ map().orderNote }}</small>}</p>
          <div class="route-wrap">
          <svg class="track" aria-hidden="true"><path [attr.d]="hits()?.length ? '' : trackPath()" /></svg>
          <ol #route class="route" [class.list]="columns() === 1" [style.--cols]="columns()">
            @for (unit of routeUnits(); track unit.n; let index = $index) {
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
          @if (corrected(); as fix) {
            <p class="corrected">Showing matches for “{{ fix }}”, the closest to “{{ query() }}”.</p>
          }
          @if (selectedUnit(); as unit) {
            @if (finderActive()) {
              <button type="button" class="back" (click)="selected.set(null)"><span aria-hidden="true">‹ </span>Back to your matches</button>
            } @else if (query()) {
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
          } @else if (finderView(); as view) {
            @if (view.leaders.length) {
              <p class="eyebrow">{{ view.leaders.length === 1 ? 'Fits your answers' : 'Two close fits' }}</p>
              <ul class="results">
                @for (leader of view.leaders; track leader.unit) {
                  <li class="result">
                    <h3 class="result-title">
                      <button type="button" class="result-unit" (click)="open(leader.unit)">
                        <span class="result-n">{{ leader.unit }}</span>
                        <span class="result-name">{{ leader.name }}</span>
                      </button>
                    </h3>
                    @if (leader.when) {
                      <p class="result-when">{{ leader.when }}</p>
                    }
                    <ul class="reasons" aria-label="Your answers against this unit's closest problem">
                      @for (reason of leader.reasons; track $index) {
                        <li [class.miss]="!reason.matched">
                          {{ reason.label }}<span class="mark" aria-hidden="true">{{ reason.matched ? '✓' : '✗' }}</span><span class="sr-only">{{ reason.matched ? 'matches' : 'does not match' }}</span>
                        </li>
                      }
                    </ul>
                    @if (leader.examples.length) {
                      <p class="like">
                        <span class="like-label">Like</span>
                        @for (example of leader.examples; track example.id; let last = $last) {
                          <a [routerLink]="example.href">{{ example.title }}</a>@if (!last) {<span class="sep" aria-hidden="true"> · </span>}
                        }
                      </p>
                    }
                  </li>
                }
              </ul>
              @if (view.more) {
                <p class="more">{{ view.more === 1 ? 'One more unit also fits; it comes next on the map.' : view.more + ' more units also fit; they come next on the map.' }}</p>
              }
              <p class="check"><strong>Check first.</strong> {{ view.check }}</p>
            } @else {
              <p class="eyebrow">Your answers</p>
              <h3>No problem in our catalogue fits all of these</h3>
              <p>Clear one of the checks to widen the search, or open the closest units on the map.</p>
            }
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
          } @else if (dataType(); as type) {
            <p class="eyebrow">Words: {{ query() }}</p>
            <h3>“{{ query() }}” is the input type, not the pattern</h3>
            <p>Many patterns read {{ type.endsWith('s') ? type : 'a ' + type }}, so it cannot point to one. What decides is what the problem asks for. Look for one of these:</p>
            <ng-container *ngTemplateOutlet="askList" />
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
              <p>Search for what the problem asks for instead. Look for one of these:</p>
              <ng-container *ngTemplateOutlet="askList" />
            }
          } @else {
            <p class="eyebrow">How to use the map</p>
            <h3>Start from the words in the problem</h3>
            <p>Pick a signal or type a word. You get every unit that fits, when each one fits, and what to check before you choose.</p>
            @if (index()) {
              <p>Then tap what the input is, what it wants back and how big it can be. The units that fit come first, with problems like yours.</p>
            }
            <p class="check">Or open any unit to see its signal and what you remember while you scan.</p>
          }
        </aside>
      </div>
    </div>
    <ng-template #askList>
      <ul class="cands ask-hints">
        @for (hint of askHints(); track hint.key) {
          <li>
            <button type="button" class="cand" (click)="toggleSignal(hint.signal)">
              <span class="cand-unit">{{ hint.phrase }}</span>
              <span class="cand-when">Search “{{ hint.key }}”</span>
            </button>
          </li>
        }
      </ul>
    </ng-template>
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
      .result-unit:focus-visible,
      .like a:focus-visible,
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
        font-weight: 650;
      }
      .cand-when {
        color: var(--panel-muted);
        font-size: 0.85rem;
      }
      /* What the problem may ask for (user, 2026-10-16): lighter rows than unit results. */
      .ask-hints {
        gap: 6px;
      }
      .ask-hints .cand {
        gap: 1px;
        padding: 8px 12px;
        border: 1px solid color-mix(in srgb, var(--map-match) 22%, transparent);
        border-radius: 12px;
        background: color-mix(in srgb, var(--map-match) 7%, transparent);
        text-align: start;
      }
      .ask-hints .cand:hover {
        border-color: var(--map-match);
        background: color-mix(in srgb, var(--map-match) 13%, transparent);
      }
      .ask-hints .cand-unit {
        color: var(--panel-ink);
        font-size: 0.9rem;
        font-weight: 500;
        line-height: 1.35;
      }
      .ask-hints .cand-when {
        color: var(--map-match);
        font-size: 0.75rem;
        font-weight: 600;
      }
      /* The four checks (user, 2026-10-16): three quiet tap rows under the typing box. */
      .checks {
        display: grid;
        gap: 6px;
        padding-top: 10px;
        border-top: 1px solid color-mix(in srgb, var(--panel-line) 55%, transparent);
      }
      .check-row {
        display: grid;
        grid-template-columns: 6.5rem minmax(0, 1fr);
        gap: 8px;
        align-items: baseline;
      }
      .check-label {
        color: var(--panel-muted);
        font-size: 0.8rem;
        font-weight: 600;
      }
      .check-row .chips {
        gap: 6px;
      }
      .results {
        display: grid;
        gap: 8px;
        margin: 0 0 10px;
        padding: 0;
        list-style: none;
      }
      .result {
        padding: 9px 12px 10px;
        border: 1px solid color-mix(in srgb, var(--map-match) 22%, transparent);
        border-radius: 12px;
        background: color-mix(in srgb, var(--map-match) 7%, transparent);
      }
      .result-unit {
        display: inline-flex;
        gap: 8px;
        align-items: baseline;
        padding: 0;
        border: 0;
        background: none;
        color: var(--panel-ink);
        font: inherit;
        font-weight: 600;
        text-align: start;
        cursor: pointer;
      }
      .result-unit:hover .result-name {
        text-decoration: underline;
        text-decoration-color: var(--map-match);
        text-underline-offset: 3px;
      }
      .result-n {
        color: var(--panel-muted);
        font-size: 0.8rem;
        font-variant-numeric: tabular-nums;
      }
      .reasons {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 10px;
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
        color: var(--panel-ink);
        font-size: 0.8rem;
      }
      .reasons .mark {
        margin-inline-start: 3px;
        color: var(--map-match);
      }
      .reasons .miss {
        color: var(--panel-muted);
      }
      .reasons .miss .mark {
        color: var(--panel-muted);
      }
      .detail .like {
        margin: 6px 0 0;
        color: var(--panel-muted);
        font-size: 0.85rem;
        line-height: 1.45;
      }
      .like-label {
        margin-inline-end: 6px;
      }
      .like a {
        color: var(--panel-ink);
        text-decoration: underline;
        text-decoration-color: color-mix(in srgb, var(--map-match) 55%, transparent);
        text-underline-offset: 3px;
      }
      .like a:hover {
        text-decoration-color: var(--map-match);
      }
      .detail .result-title {
        margin: 0;
        font-size: 1rem;
      }
      .detail .result-when {
        margin: 3px 0 0;
        color: var(--panel-muted);
        font-size: 0.85rem;
        line-height: 1.4;
      }
      .detail .more {
        color: var(--panel-muted);
        font-size: 0.85rem;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .corrected {
        margin: 0 0 8px;
        color: var(--panel-muted);
        font-size: 0.8rem;
        font-style: italic;
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
        .check-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 4px;
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
      name: htmlText(row[1] ?? ''),
      signal: htmlText(row[2] ?? ''),
      memory: htmlText(row[3] ?? ''),
      href: this.map().lessonHrefs[index] ?? '',
    })),
  );

  /** Every word the map knows: signal names and aliases, unit names and signal lines. */
  private readonly vocabulary = computed(() => {
    const words = new Set<string>();
    const add = (text: string) => text.toLowerCase().split(/[^a-z]+/).forEach((word) => word.length >= 3 && words.add(word));
    this.map().signals.forEach((item) => [item.key, ...item.aliases].forEach(add));
    this.units().forEach((unit) => [unit.name, unit.signal].forEach(add));
    return words;
  });

  /** What the map searches for: the typed words, or their closest spelling when they find nothing. */
  protected readonly searchTerm = computed(() => {
    const query = this.query().trim();
    if (!query || this.finds(query) || DATA_TYPE_WORDS.includes(query.toLowerCase())) return query;
    const fixed = closestSpelling(query, this.vocabulary());
    return fixed && this.finds(fixed) ? fixed : query;
  });

  /** The closest spelling in use, when it differs from what was typed. */
  protected readonly corrected = computed(() => {
    const term = this.searchTerm();
    return term && term.toLowerCase() !== this.query().trim().toLowerCase() ? term : null;
  });

  protected readonly activeSignal = computed<TheoryPatternSignal | null>(() => this.signalFor(this.searchTerm()));

  /** The typed word when it is only an input type (string, array…), else null. */
  protected readonly dataType = computed(() => {
    const query = this.query().trim().toLowerCase();
    return query && !this.activeSignal() && DATA_TYPE_WORDS.includes(query) ? query : null;
  });

  protected readonly askHints = computed(() =>
    ASK_HINTS.map((hint) => ({ ...hint, signal: this.map().signals.find((item) => item.key === hint.key) }))
      .filter((hint): hint is { key: string; phrase: string; signal: TheoryPatternSignal } => !!hint.signal)
      .slice(0, 6),
  );

  protected readonly wordHits = computed(() => (this.activeSignal() ? [] : this.unitsFor(this.searchTerm())));

  /**
   * The route in display order: while a signal or words filter it, the matching units come first
   * (in the signal's order) and the rest follow, dimmed, in study order (user, 2026-10-16), so the
   * matches are in view without scrolling.
   */
  protected readonly routeUnits = computed(() => {
    const hits = this.hits();
    const units = this.units();
    if (!hits?.length) return units;
    const first = hits.map((n) => units[n - 1]).filter((unit): unit is MapUnit => !!unit);
    return [...first, ...units.filter((unit) => !hits.includes(unit.n))];
  });

  private signalFor(term: string): TheoryPatternSignal | null {
    const query = term.trim().toLowerCase();
    if (!query) return null;
    return this.map().signals.find((item) => item.aliases.some((alias) => hasWords(query, alias) || hasWords(alias, query))) ?? null;
  }

  private unitsFor(term: string): MapUnit[] {
    const query = term.trim();
    if (!query) return [];
    return this.units().filter((unit) => hasWords(unit.signal, query) || hasWords(unit.name, query));
  }

  private finds(term: string): boolean {
    return !!this.signalFor(term) || this.unitsFor(term).length > 0;
  }

  /** Unit numbers that match the current signal or words; null when nothing is filtered. */
  protected readonly hits = computed<number[] | null>(() => {
    if (this.finderActive()) return this.finderHits();
    if (!this.query().trim() || this.dataType()) return null;
    const item = this.activeSignal();
    return item ? item.candidates.map((candidate) => candidate.unit) : this.wordHits().map((unit) => unit.n);
  });

  protected readonly selectedUnit = computed(() => {
    const n = this.selected();
    return n === null ? null : (this.units()[n - 1] ?? null);
  });

  private viewReady = false;

  /** The pattern finder (user, 2026-10-16): problem cards, the tapped checks and the result. */
  protected readonly shapes = FINDER_SHAPES;
  protected readonly wants = FINDER_WANTS;
  protected readonly sizes = FINDER_SIZES;
  protected readonly index = signal<RecognitionIndex | null>(null);
  private readonly picks = signal<Omit<FinderAnswers, 'words'>>({ input: [], wants: [], size: null });

  /** The tapped checks plus the typed words (after the same spelling fix the map uses). */
  protected readonly answers = computed<FinderAnswers>(() => ({ ...this.picks(), words: this.searchTerm() }));

  /** The finder leads once a check is tapped; until then the typing box and chips work as before. */
  protected readonly finderActive = computed(() => {
    const picks = this.picks();
    return !!this.index() && (picks.input.length > 0 || picks.wants.length > 0 || picks.size !== null);
  });

  private readonly finderResult = computed(() => {
    const index = this.index();
    return index && this.finderActive() ? score(index, this.answers()) : null;
  });

  protected readonly finderView = computed<FinderView | null>(() => {
    const result = this.finderResult();
    if (!result) return null;
    const top = leaders(result);
    const units = this.units();
    const name = (n: number) => units[n - 1]?.name ?? result.ranked.find((match) => match.unit === n)?.name ?? String(n);
    const signals = [this.activeSignal(), ...this.map().signals].filter((item): item is TheoryPatternSignal => !!item);
    const lists = (item: TheoryPatternSignal, n: number) => item.candidates.some((candidate) => candidate.unit === n);
    const shared = top.length === 2 ? signals.find((item) => top.every((match) => lists(item, match.unit))) : undefined;
    const toLeader = (match: UnitMatch): FinderLeader => ({
      unit: match.unit,
      name: name(match.unit),
      when:
        top.length === 2
          ? (shared?.candidates.find((candidate) => candidate.unit === match.unit)?.when ?? units[match.unit - 1]?.signal ?? '')
          : '',
      reasons: match.reasons.map((reason) => ({ label: reasonLabel(reason), matched: reason.matched })),
      examples: match.examples.slice(0, top.length === 1 ? 3 : 2),
    });
    const check = top.length
      ? (shared?.check ??
        signals.find((item) => lists(item, top[0].unit))?.check ??
        `Open two of the examples and compare them with your problem before you choose ${name(top[0].unit)}.`)
      : '';
    const shown = new Set(top.map((match) => match.unit));
    return { leaders: top.map(toLeader), check, more: (this.finderHits() ?? []).filter((n) => !shown.has(n)).length };
  });

  private readonly finderHits = computed(() => {
    const result = this.finderResult();
    return result ? matchingUnits(result) : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.resize?.disconnect());
    // Load the finder's cards once; without them the map keeps today's typing box and chips.
    try {
      inject(PATTERN_RECOGNITION_INDEX)()
        .pipe(takeUntilDestroyed())
        .subscribe({ next: (index) => this.index.set(index), error: () => this.index.set(null) });
    } catch {
      this.index.set(null);
    }
    // The dotted route follows study order, so it is hidden while matches come first and redrawn
    // once the filter clears.
    effect(() => {
      const filtered = !!this.hits()?.length;
      if (!filtered && this.viewReady) untracked(() => this.layout());
    });
  }

  ngAfterViewInit(): void {
    const Observer = this.host.nativeElement.ownerDocument.defaultView?.ResizeObserver;
    if (Observer) {
      const resize = new Observer(() => this.layout());
      resize.observe(this.route().nativeElement);
      this.resize = resize;
    }
    this.viewReady = true;
    this.layout();
  }

  /**
   * Snake order on the grid, so the route reads as one line: left to right, then right to left.
   * While matches come first the route line is hidden, so every row reads left to right.
   */
  protected cell(index: number): { row: number; column: number } {
    const columns = this.columns();
    const row = Math.floor(index / columns);
    const snake = row % 2 === 1 && !this.hits()?.length;
    const column = snake ? columns - 1 - (index % columns) : index % columns;
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
    this.picks.set({ input: [], wants: [], size: null });
  }

  /**
   * Each row is one question with one answer (user, 2026-10-16): a problem has one main input,
   * asks for one thing back and has one size. Tapping another chip switches the answer; tapping
   * the chosen chip again clears it. A card with two inputs still matches either one.
   */
  protected toggleShape(shape: FinderShape): void {
    this.picks.update((picks) => ({ ...picks, input: picks.input[0] === shape ? [] : [shape] }));
    this.selected.set(null);
  }

  protected toggleWant(want: FinderWant): void {
    this.picks.update((picks) => ({ ...picks, wants: picks.wants[0] === want ? [] : [want] }));
    this.selected.set(null);
  }

  protected toggleSize(size: FinderSize): void {
    this.picks.update((picks) => ({ ...picks, size: picks.size === size ? null : size }));
    this.selected.set(null);
  }

  private layout(): void {
    const route = this.route().nativeElement;
    const width = route.clientWidth;
    const columns = routeColumns(width);
    if (columns !== this.columns()) this.columns.set(columns);
    const view = route.ownerDocument.defaultView;
    // Draw the dotted guide after the grid has placed the stations.
    view?.requestAnimationFrame?.(() => {
      if (!this.hits()?.length) this.trackPath.set(columns > 1 ? this.path(route) : '');
    });
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
