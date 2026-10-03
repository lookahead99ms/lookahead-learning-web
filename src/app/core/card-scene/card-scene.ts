import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { SceneAssets, isSceneAssetPath } from './scene-assets';
import { sanitizeSceneSvg } from './scene-svg';

type SceneState = 'empty' | 'loading' | 'ready' | 'failed';

/**
 * Card mode: each text (and each tspan with its own size) keeps its authored size, in the
 * drawing's units, in --scene-size, so the card CSS can cap it without losing it.
 */
export function recordSceneTextSizes(svg: SVGSVGElement, view: Window): void {
  for (const text of Array.from(svg.querySelectorAll<SVGElement>('text, tspan'))) {
    const size = parseFloat(view.getComputedStyle(text).fontSize);
    if (!(size > 0)) continue;
    if (text.localName === 'tspan' && text.parentElement) {
      const inherited = parseFloat(view.getComputedStyle(text.parentElement).fontSize);
      if (Math.abs(inherited - size) < 0.01) continue;
    }
    text.style.setProperty('--scene-size', `${+size.toFixed(3)}px`);
    text.setAttribute('data-scene-size', '');
  }
}

/** Rendered px per drawing unit (preserveAspectRatio meet: the smaller of the two axes). */
export function sceneScale(svg: SVGSVGElement, width: number, height: number): number {
  const box = svg.viewBox?.baseVal;
  if (!box || !(box.width > 0) || !(box.height > 0) || !(width > 0) || !(height > 0)) return 0;
  return Math.min(width / box.width, height / box.height);
}

/** A rendered size cap (px) in the drawing's own units, or null when it cannot apply. */
export function sceneTextLimit(maxPx: number, scale: number): string | null {
  return maxPx > 0 && scale > 0 ? `${+(maxPx / scale).toFixed(3)}px` : null;
}

/**
 * Shows an animated card scene inline so the scene's CSS follows the theme.
 * The scene SVG reads only the --scene-* variables defined here. Course scenes come
 * from the content service (/content/...); app scenes are static assets (/assets/scenes/...).
 */
@Component({
  selector: 'app-card-scene',
  host: {
    '[class.la-card-scene-missing]': 'missing()',
    '[class.la-card-scene-card]': 'card()',
  },
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="la-card-scene"
      role="img"
      [attr.aria-label]="alt() || null"
      [attr.data-state]="state()"
    >
      <div #art class="la-card-scene-art" aria-hidden="true"></div>
      @if (!optional() && (state() === 'failed' || state() === 'empty')) {
        @if (fallback(); as mark) {
          <span class="la-card-scene-fallback la-card-scene-mark" aria-hidden="true">{{
            mark
          }}</span>
        } @else {
          <span class="la-card-scene-fallback" aria-hidden="true">{{ alt() }}</span>
        }
      }
    </div>
  `,
  styles: [
    `
      app-card-scene {
        display: block;
      }
      app-card-scene.la-card-scene-missing {
        display: none;
      }
      .la-card-scene {
        --scene-bg: var(--surface-muted);
        --scene-card: var(--surface);
        --scene-ink: var(--text-strong);
        --scene-text: var(--text-body);
        --scene-muted: var(--text-subtle);
        --scene-line: var(--line);
        --scene-accent: var(--accent-strong);
        --scene-accent-soft: var(--surface-accent);
        --scene-link: var(--accent-link);
        --scene-good: var(--success);
        --scene-warn: var(--warning);
        --scene-bad: var(--danger);
        --scene-bubble-in: var(--surface);
        --scene-bubble-out: var(--surface-accent);
        --scene-learn: var(--path-learn);
        --scene-grow: var(--path-grow);
        --scene-ahead: var(--path-look-ahead);
        position: relative;
        display: grid;
        place-items: center;
        aspect-ratio: var(--card-scene-ratio, 16 / 9);
        width: 100%;
        overflow: hidden;
        background: var(--scene-bg);
        color: var(--scene-text);
      }
      :root[data-theme='dark'] .la-card-scene {
        --scene-bubble-in: color-mix(in srgb, var(--surface) 78%, var(--accent-link));
        --scene-bubble-out: color-mix(in srgb, var(--surface-accent) 85%, var(--accent-strong));
      }
      .la-card-scene-art {
        position: absolute;
        inset: 0;
      }
      .la-card-scene-art > svg {
        display: block;
        width: 100%;
        height: 100%;
      }
      /* Card drawings: words read as part of the picture and never compete with the card
         title. All text takes the shared card text face and weight, and words take the muted
         card ink (tokens in styles.css). The scene ink tokens are redirected on text elements
         only, so shapes keep their colours; node values and single marks (data-scene-mark:
         7, L, ✓, ♞) keep their drawn colour inside their cells; status words (good, warn,
         bad) keep their status colour; text on a filled shape (--scene-card, or hard-coded
         white marked data-scene-on-fill) follows --scene-card, which turns dark in dark mode
         where the fills turn light. Code keeps a monospace face (data-scene-code). The marks
         are set by sanitizeSceneSvg. */
      app-card-scene.la-card-scene-card .la-card-scene-art :is(text, tspan) {
        font-family: var(--card-scene-text-font, system-ui, sans-serif) !important;
        font-weight: var(--card-scene-text-weight, 600) !important;
      }
      app-card-scene.la-card-scene-card
        .la-card-scene-art
        :is(text:not([data-scene-mark]), text:not([data-scene-mark]) tspan) {
        --scene-ink: var(--card-scene-text-color, var(--text-subtle));
        --scene-text: var(--card-scene-text-color, var(--text-subtle));
        --scene-muted: var(--card-scene-text-color, var(--text-subtle));
        --scene-accent: var(--card-scene-text-color, var(--text-subtle));
        --scene-link: var(--card-scene-text-color, var(--text-subtle));
        --scene-learn: var(--card-scene-text-color, var(--text-subtle));
        --scene-grow: var(--card-scene-text-color, var(--text-subtle));
        --scene-ahead: var(--card-scene-text-color, var(--text-subtle));
      }
      app-card-scene.la-card-scene-card
        .la-card-scene-art
        :is(text[data-scene-code], text[data-scene-code] tspan) {
        font-family: var(--card-scene-code-font, ui-monospace, monospace) !important;
      }
      app-card-scene.la-card-scene-card .la-card-scene-art text[data-scene-on-fill] {
        fill: var(--scene-card) !important;
      }
      /* Drawing text stays smaller than the card title (DLV-408 round 7). The card sets
         --card-title-size; the caps below resolve to px here and the component turns them into
         the drawing's own units (--card-scene-text-limit, --card-scene-mark-limit on the svg)
         whenever the drawing's rendered scale changes. Each text keeps its authored size
         (--scene-size) when that is already smaller, so only big words shrink, in place. */
      app-card-scene.la-card-scene-card {
        --card-scene-text-max: calc(
          var(--card-title-size, 1.3rem) * var(--card-scene-text-max-ratio, 0.75)
        );
        --card-scene-mark-max: calc(
          var(--card-title-size, 1.3rem) * var(--card-scene-mark-max-ratio, 0.85)
        );
      }
      app-card-scene.la-card-scene-card .la-card-scene-art > svg[data-card-text-fit] [data-scene-size] {
        font-size: min(
          var(--scene-size),
          var(--card-scene-text-limit, var(--scene-size))
        ) !important;
      }
      app-card-scene.la-card-scene-card
        .la-card-scene-art
        > svg[data-card-text-fit]
        :is(text[data-scene-mark][data-scene-size], text[data-scene-mark] [data-scene-size]) {
        font-size: min(
          var(--scene-size),
          var(--card-scene-mark-limit, var(--scene-size))
        ) !important;
      }
      .la-card-scene-fallback {
        position: relative;
        max-width: 34ch;
        padding: 16px 20px;
        color: var(--scene-muted);
        font-size: 0.86rem;
        line-height: 1.45;
        text-align: center;
      }
      .la-card-scene:is([data-state='failed'], [data-state='empty']):has(.la-card-scene-mark) {
        background:
          radial-gradient(
            circle at 50% 50%,
            color-mix(in srgb, var(--scene-accent) 14%, transparent) 0 32%,
            transparent 62%
          ),
          linear-gradient(135deg, var(--scene-bg), var(--scene-accent-soft));
      }
      .la-card-scene-mark {
        display: grid;
        place-items: center;
        min-width: 2.6em;
        height: 2.6em;
        max-width: none;
        padding: 0 0.5em;
        border: 1.5px solid color-mix(in srgb, var(--scene-accent) 45%, transparent);
        border-radius: 999px;
        color: var(--scene-accent);
        background: var(--scene-card);
        font-size: 1.35rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        line-height: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .la-card-scene-art *,
        .la-card-scene-art *::before,
        .la-card-scene-art *::after {
          animation-play-state: paused !important;
        }
      }
      @media (forced-colors: active) {
        .la-card-scene {
          background: Canvas;
        }
      }
    `,
  ],
})
export class CardScene {
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly art = viewChild.required<ElementRef<HTMLElement>>('art');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private subscription: Subscription | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeUpdate: (() => void) | null = null;

  readonly src = input<string | undefined>(undefined);
  readonly alt = input<string>('');
  /** Short mark (e.g. initials) shown on a soft background when the scene is missing; else the alt text. */
  readonly fallback = input<string>('');
  /** Optional scenes render nothing (the host is hidden) when there is no path or the file fails. */
  readonly optional = input(false);
  /**
   * A catalog course/group card or course unit card drawing: its words take the shared card
   * text styling, so the card title stays the strongest text.
   */
  readonly card = input(false, { transform: booleanAttribute });
  protected readonly state = signal<SceneState>('empty');
  protected readonly missing = computed(
    () => this.optional() && (this.state() === 'failed' || this.state() === 'empty'),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.unsubscribe();
      this.resizeObserver?.disconnect();
    });
    effect(() => {
      const src = this.src();
      const cardText = this.card();
      const host = this.art().nativeElement;
      this.subscription?.unsubscribe();
      this.resizeObserver?.disconnect();
      this.resizeUpdate = null;
      host.replaceChildren();
      if (!src) {
        this.state.set('empty');
        return;
      }
      this.state.set('loading');
      this.subscription = this.load(src).subscribe({
        next: (text) => {
          const svg = sanitizeSceneSvg(text, undefined, { cardText });
          if (!svg) {
            this.state.set('failed');
            return;
          }
          const shown = this.document.importNode(svg, true);
          host.replaceChildren(shown);
          if (cardText) this.fitCardText(shown, host);
          this.state.set('ready');
        },
        error: () => this.state.set('failed'),
      });
    });
  }

  /**
   * Card mode: records each text's authored size, then keeps the rendered size of words below
   * --card-scene-text-max (node values and marks below --card-scene-mark-max) as the drawing's
   * scale changes with the card width.
   */
  private fitCardText(svg: SVGSVGElement, art: HTMLElement): void {
    const view = this.document.defaultView;
    if (!view) return;
    const update = () => {
      // Sizes are read once the drawing is in the document, before any cap applies.
      if (!svg.hasAttribute('data-card-text-fit')) {
        if (!svg.isConnected) return;
        recordSceneTextSizes(svg, view);
        svg.setAttribute('data-card-text-fit', '');
      }
      const style = view.getComputedStyle(this.host.nativeElement);
      const scale = sceneScale(svg, art.clientWidth, art.clientHeight);
      for (const [cap, limit] of [
        ['--card-scene-text-max', '--card-scene-text-limit'],
        ['--card-scene-mark-max', '--card-scene-mark-limit'],
      ]) {
        const value = sceneTextLimit(parseFloat(style.getPropertyValue(cap)), scale);
        if (value) svg.style.setProperty(limit, value);
        else svg.style.removeProperty(limit);
      }
    };
    update();
    this.resizeUpdate = update;
    if (typeof view.ResizeObserver !== 'function') return;
    this.resizeObserver ??= new view.ResizeObserver(() => this.resizeUpdate?.());
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(art);
  }

  /**
   * App scenes are static assets; every other path goes through the content service,
   * which serves public copies of Look Ahead unit card scenes first.
   */
  private load(src: string): Observable<string> {
    return isSceneAssetPath(src)
      ? this.injector.get(SceneAssets).get(src)
      : this.injector.get(ContentService).getCardScene(src);
  }
}
