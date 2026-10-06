import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { TheoryVisual } from '../../content/content.models';
import { StoryboardClock, StoryboardPlayer, StoryboardState, sanitizeStoryboardSvg } from './storyboard-player';

/** One fetch per drawing, shared by every storyboard on the page that shows it. */
const sources = new Map<string, Promise<string>>();
let instances = 0;

/**
 * An animated lesson drawing (TheoryVisual type "storyboard"). It starts playing when it scrolls into view,
 * holds the last frame (5 s by default), loops, and pauses when it leaves the screen, when the tab is hidden or
 * when the reader presses Pause. Under prefers-reduced-motion it shows the last frame and no control.
 * Until the drawing is inlined (or when it cannot be) the SVG file is shown as an image of its last frame.
 *
 * variant "story": the Problem-first storyboard, with a sticky Pause/Play bar and a status line.
 * variant "scene": a smaller toggle under the drawing.
 * Projected content sits beside the drawing (stacked in a narrow column) when beside is true.
 */
@Component({
  selector: 'app-lesson-storyboard',
  imports: [NgTemplateOutlet],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'lesson-storyboard',
    '[class.storyboard-story]': "variant() === 'story'",
    '[class.storyboard-has-beside]': 'beside()',
  },
  template: `
    <figure class="storyboard-figure">
      <div class="storyboard-main">
        <div class="storyboard-visual">
          <div class="storyboard-canvas" #canvas>
            @if (!inline()) {
              <img [src]="assetPath()" [alt]="visual().alt" />
            }
            <div class="storyboard-svg" #host [hidden]="!inline()"></div>
          </div>
          @if (board()?.legend?.length) {
            <div class="storyboard-legend">
              @for (entry of board()!.legend!; track entry.text) {
                <span><i [class]="'storyboard-mark mark-' + entry.mark" aria-hidden="true"></i>{{ entry.text }}</span>
              }
            </div>
          }
          @if (visual().caption; as caption) {
            <figcaption>{{ caption }}</figcaption>
          }
          @if (variant() !== 'story') {
            <ng-container [ngTemplateOutlet]="bar" />
          }
        </div>
        @if (beside()) {
          <div class="storyboard-beside"><ng-content /></div>
        }
      </div>
      @if (variant() === 'story') {
        <ng-container [ngTemplateOutlet]="bar" />
      }
    </figure>
    <ng-template #bar>
      <div class="storyboard-bar">
        @if (!reduced()) {
          <button
            type="button"
            class="storyboard-toggle"
            [attr.aria-pressed]="userPaused()"
            [attr.aria-label]="userPaused() ? 'Play animation' : 'Pause animation'"
            (click)="toggle()"
          >
            <span aria-hidden="true">{{ userPaused() ? '▶' : '❚❚' }}</span> {{ userPaused() ? 'Play' : 'Pause' }}
          </button>
        }
        <span class="storyboard-status" aria-live="polite">{{ status() }}</span>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .lesson-storyboard {
        --sb-node: var(--surface);
        --sb-line: color-mix(in srgb, var(--text-subtle) 72%, var(--surface));
        --sb-ink: var(--text-strong);
        --sb-muted: var(--text-subtle);
        --sb-back: var(--danger);
        --sb-box: var(--accent-link);
        --sb-entry: color-mix(in srgb, var(--accent-link) 13%, var(--surface));
        --sb-hit: color-mix(in srgb, var(--warning) 32%, var(--surface));
        --sb-hit-line: var(--warning);
        --sb-slow: var(--accent-strong);
        --sb-fast: var(--danger);
        --sb-p: var(--accent-link);
        --sb-walker: var(--accent-link);
        display: block;
        container-type: inline-size;
        margin-top: 1.25rem;
      }
      .lesson-storyboard .storyboard-figure {
        margin: 0;
      }
      .lesson-storyboard .storyboard-main {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1rem;
        align-items: center;
      }
      @container (min-width: 700px) {
        .lesson-storyboard.storyboard-has-beside .storyboard-main {
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
        }
      }
      .lesson-storyboard .storyboard-visual {
        min-width: 0;
      }
      .lesson-storyboard .storyboard-canvas {
        min-width: 0;
        padding: 6px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: color-mix(in srgb, var(--surface-muted) 55%, var(--surface));
      }
      .lesson-storyboard .storyboard-canvas :is(img, svg) {
        display: block;
        width: 100%;
        max-width: 560px;
        height: auto;
        margin: 0 auto;
      }
      .lesson-storyboard:not(.storyboard-has-beside) .storyboard-canvas :is(img, svg) {
        max-width: 440px;
      }
      .lesson-storyboard .storyboard-beside {
        min-width: 0;
      }
      /* Problem first fits one 1280 x 720 screen: a slightly smaller explanation beside the drawing, with a small
         gap between its paragraphs. The shell projects these .prose paragraphs; its scoped .system .prose rule
         (line-height 1.8, no margin) cannot see this template, so these selectors carry one class more than it. */
      .lesson-storyboard.storyboard-story .storyboard-beside {
        font-size: 1rem;
      }
      .lesson-storyboard.storyboard-story.storyboard-has-beside .storyboard-beside .prose {
        margin: 0 0 0.6rem;
        line-height: 1.55;
      }
      .lesson-storyboard .storyboard-legend {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.4rem 1.1rem;
        margin-top: 0.6rem;
        color: var(--text-subtle);
        font-size: 0.88rem;
      }
      .lesson-storyboard .storyboard-legend span {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .lesson-storyboard .storyboard-mark {
        display: inline-block;
        width: 0.85rem;
        height: 0.85rem;
        border: 3px solid var(--sb-slow);
        border-radius: 50%;
      }
      .lesson-storyboard .storyboard-mark.mark-fast {
        border-color: var(--sb-fast);
        border-style: dashed;
      }
      .lesson-storyboard .storyboard-mark.mark-p {
        border-color: var(--sb-p);
      }
      .lesson-storyboard .storyboard-mark.mark-walker {
        border-color: var(--sb-walker);
      }
      .lesson-storyboard .storyboard-mark.mark-none {
        display: none;
      }
      .lesson-storyboard figcaption {
        margin-top: 0.5rem;
        color: var(--text-subtle);
        font-size: 0.9rem;
        text-align: center;
      }
      .lesson-storyboard .storyboard-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        margin-top: 0.5rem;
      }
      .lesson-storyboard:not(.storyboard-story) .storyboard-status {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .lesson-storyboard .storyboard-toggle {
        min-height: 2.1rem;
        padding: 0.25rem 0.8rem;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text-strong);
        font: inherit;
        font-size: 0.85rem;
        font-weight: 650;
        cursor: pointer;
      }
      .lesson-storyboard .storyboard-toggle:hover {
        border-color: var(--accent-link);
      }
      .lesson-storyboard .storyboard-toggle:focus-visible {
        outline: 3px solid var(--accent-focus);
        outline-offset: 2px;
      }
      /* Problem first: the control stays on screen while the story plays (sticky to the bottom of the view). */
      .lesson-storyboard.storyboard-story {
        margin-top: 1rem;
      }
      .lesson-storyboard.storyboard-story .storyboard-bar {
        position: sticky;
        bottom: 0;
        z-index: 2;
        justify-content: flex-start;
        margin-top: 0.6rem;
        padding: 0.45rem 0;
        border-top: 1px solid var(--line);
        background: var(--surface);
      }
      .lesson-storyboard.storyboard-story .storyboard-toggle {
        min-height: 2.35rem;
        padding: 0.3rem 1rem;
        border: 1.5px solid var(--accent-strong);
        color: var(--accent-strong);
        font-size: 0.95rem;
      }
      .lesson-storyboard .storyboard-status {
        color: var(--text-subtle);
        font-size: 0.92rem;
      }
      /* The drawing's classes, colored by the app theme (light and dark). */
      .lesson-storyboard svg {
        font-family: inherit;
      }
      .lesson-storyboard svg .node {
        fill: var(--sb-node);
        stroke: var(--sb-line);
        stroke-width: 2;
      }
      .lesson-storyboard svg :is(.val, .entry-text) {
        fill: var(--sb-ink);
        font-size: 18px;
        font-weight: 700;
        text-anchor: middle;
        dominant-baseline: central;
      }
      .lesson-storyboard svg .entry-text {
        font-size: 17px;
      }
      .lesson-storyboard svg .edge {
        fill: none;
        stroke: var(--sb-line);
        stroke-width: 2;
      }
      .lesson-storyboard svg .arrowhead {
        fill: var(--sb-line);
      }
      .lesson-storyboard svg .edge-back {
        stroke: var(--sb-back);
        stroke-width: 2.5;
      }
      .lesson-storyboard svg :is(.arrowhead-back, .back-label, .result) {
        fill: var(--sb-back);
      }
      .lesson-storyboard svg :is(.label, .back-label) {
        font-size: 18px;
        font-weight: 650;
        text-anchor: middle;
      }
      .lesson-storyboard svg :is(.label, .muted, .counter-sub) {
        fill: var(--sb-muted);
      }
      .lesson-storyboard svg .muted {
        font-size: 15px;
        font-weight: 600;
      }
      .lesson-storyboard svg .box {
        fill: var(--sb-node);
        stroke: var(--sb-box);
        stroke-width: 2;
      }
      .lesson-storyboard svg :is(.title, .counter) {
        fill: var(--sb-ink);
        font-size: 18px;
        font-weight: 800;
      }
      .lesson-storyboard svg .counter {
        font-size: 20px;
        text-anchor: middle;
      }
      .lesson-storyboard svg .counter-sub {
        font-size: 18px;
        font-weight: 700;
        text-anchor: middle;
      }
      .lesson-storyboard svg .slot {
        fill: none;
        stroke: var(--sb-line);
        stroke-width: 1.5;
        stroke-dasharray: 4 3;
      }
      .lesson-storyboard svg .entry {
        fill: var(--sb-entry);
        stroke: var(--sb-box);
        stroke-width: 2;
      }
      .lesson-storyboard svg .hit {
        fill: var(--sb-hit);
        stroke: var(--sb-hit-line);
        stroke-width: 3;
      }
      .lesson-storyboard svg .result {
        font-size: 19px;
        font-weight: 800;
        text-anchor: middle;
      }
      .lesson-storyboard svg .ring {
        fill: none;
        stroke: var(--sb-walker);
        stroke-width: 3.5;
      }
      .lesson-storyboard svg .slow .ring {
        stroke: var(--sb-slow);
      }
      .lesson-storyboard svg .fast .ring {
        stroke: var(--sb-fast);
        stroke-dasharray: 5 4;
      }
      .lesson-storyboard svg .p .ring {
        stroke: var(--sb-p);
      }
      .lesson-storyboard svg .route {
        fill: none;
        stroke: none;
      }
      @media (forced-colors: active) {
        .lesson-storyboard svg :is(.node, .box, .entry, .hit) {
          fill: Canvas;
          stroke: CanvasText;
        }
        .lesson-storyboard svg :is(text, tspan) {
          fill: CanvasText;
        }
        .lesson-storyboard svg :is(.edge, .ring) {
          stroke: CanvasText;
        }
      }
    `,
  ],
})
export class LessonStoryboard {
  readonly visual = input.required<TheoryVisual>();
  readonly variant = input<'story' | 'scene'>('scene');
  /** Projected content (the explanation) sits beside the drawing. */
  readonly beside = input(false);
  /** Tests pass a manual clock; the page uses animation frames. */
  readonly clock = input<StoryboardClock | undefined>(undefined);

  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient, { optional: true });
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly prefix = `sb${++instances}`;
  private player: StoryboardPlayer | null = null;
  private observers: { disconnect(): void }[] = [];
  private loadedPath = '';
  /** Until the observer reports, the drawing counts as off screen, so it starts when the reader reaches it. */
  private offscreen = true;

  protected readonly board = computed(() => this.visual().storyboard ?? null);
  protected readonly narrow = signal(false);
  protected readonly assetPath = computed(() => {
    const board = this.board();
    return this.narrow() && board?.narrowAssetPath ? board.narrowAssetPath : this.visual().assetPath;
  });
  protected readonly inline = signal(false);
  protected readonly reduced = signal(false);
  protected readonly userPaused = signal(false);
  private readonly state = signal<StoryboardState>('idle');
  protected readonly status = computed(() => {
    const board = this.board();
    if (this.reduced()) return board?.doneStatus ?? '';
    if (this.userPaused()) return 'Paused.';
    if (this.state() === 'hold') {
      const seconds = Math.round((board?.holdMs ?? 5000) / 1000);
      return board?.doneStatus ? `${board.doneStatus} Replaying in ${seconds} s.` : '';
    }
    return this.state() === 'playing' ? (board?.playingStatus ?? '') : '';
  });

  constructor() {
    const view = this.document.defaultView;
    this.reduced.set(!!view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    afterNextRender(() => this.setUp());
    const visibility = () => this.player?.setPaused('hidden', this.document.visibilityState === 'hidden');
    this.document.addEventListener('visibilitychange', visibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', visibility);
      this.observers.forEach((observer) => observer.disconnect());
      this.player?.stop();
    });
  }

  protected toggle(): void {
    this.userPaused.update((paused) => !paused);
    this.player?.setPaused('user', this.userPaused());
  }

  private setUp(): void {
    const view = this.document.defaultView;
    const canvas = this.canvas().nativeElement;
    const board = this.board();
    if (board?.narrowAssetPath && board.narrowBelow && view && 'ResizeObserver' in view) {
      const resize = new view.ResizeObserver(() => {
        const narrow = canvas.clientWidth > 0 && canvas.clientWidth < board.narrowBelow!;
        if (narrow !== this.narrow()) {
          this.narrow.set(narrow);
          void this.load();
        }
      });
      resize.observe(canvas);
      this.observers.push(resize);
      this.narrow.set(canvas.clientWidth > 0 && canvas.clientWidth < board.narrowBelow);
    }
    if (view && 'IntersectionObserver' in view) {
      const intersection = new view.IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            this.offscreen = !entry.isIntersecting;
            this.player?.setPaused('offscreen', this.offscreen);
          }
        },
        { threshold: 0.25 },
      );
      intersection.observe(this.canvas().nativeElement);
      this.observers.push(intersection);
    } else {
      this.offscreen = false;
    }
    void this.load();
  }

  /** Fetches the drawing, inlines a sanitized copy and starts (or, under reduced motion, shows the last frame). */
  private async load(): Promise<void> {
    const path = this.assetPath();
    const board = this.board();
    if (!board?.frames?.length || !this.http || path === this.loadedPath) return;
    this.loadedPath = path;
    let source: string;
    try {
      if (!sources.has(path)) {
        const request = firstValueFrom(this.http.get(path, { responseType: 'text' }));
        sources.set(path, request);
        request.catch(() => sources.delete(path));
      }
      source = await sources.get(path)!;
    } catch {
      this.loadedPath = '';
      return; // the image stays
    }
    if (path !== this.assetPath()) return;
    const svg = sanitizeStoryboardSvg(source, this.document, this.prefix);
    if (!svg) return;
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', this.visual().alt);
    svg.setAttribute('focusable', 'false');
    const host = this.host().nativeElement;
    this.player?.stop();
    host.replaceChildren(svg);
    const player = new StoryboardPlayer(svg, board.frames, {
      holdMs: board.holdMs,
      clock: this.clock(),
      onState: (state) => this.state.set(state),
    });
    this.player = player;
    this.inline.set(true);
    if (this.reduced()) {
      player.showFinal();
      return;
    }
    player.setPaused('user', this.userPaused());
    player.setPaused('offscreen', this.offscreen);
    player.setPaused('hidden', this.document.visibilityState === 'hidden');
    player.start();
  }
}
