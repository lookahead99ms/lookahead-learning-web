import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { PatternLanguage } from '../../content/content.models';
import { REFERENCE_LANGUAGES } from '../reference-language';
import { WalkthroughCode } from './walkthrough-code';
import {
  WalkthroughApproach,
  WalkthroughCodeLine,
  WalkthroughExample,
  WalkthroughValue,
  walkthroughKey,
} from './walkthrough.model';

let nextPlayerId = 0;
const LANGUAGE_LABELS: Record<PatternLanguage, string> = { java: 'Java', python: 'Python', go: 'Go' };

/**
 * Option B "Code beside" (user-approved, 2026-10-06): the one player of the Visual walkthrough.
 *
 * - One header row: the example, the language (the page-wide choice) and Approach, one line
 *   until opened. Narrow screens add a Drawing | Code switch instead of two columns.
 * - Left: one control bar pinned while the column scrolls (Previous, Play/Pause, Next, a step
 *   scrubber, Restart, and Steps | Every line when a recorded trace exists), then the drawing
 *   (projected `[walkthroughStage]`), one caption and the values not already drawn.
 * - Right: the reference code, always visible, current line highlighted; the ideas as a jump list.
 *
 * The host owns the position and playback; this component only reports what the learner asked.
 */
@Component({
  selector: 'app-walkthrough-player',
  imports: [WalkthroughCode],
  templateUrl: './walkthrough-player.html',
  styleUrl: './walkthrough-player.css',
})
export class WalkthroughPlayer {
  readonly label = input('How the solution runs');
  readonly examples = input<WalkthroughExample[]>([]);
  readonly example = input<string | null>(null);
  readonly language = input.required<PatternLanguage>();
  readonly approach = input<WalkthroughApproach | null>(null);
  readonly notice = input<string | null>(null);
  readonly index = input(0);
  readonly count = input(1);
  readonly playing = input(false);
  readonly everyLine = input(false);
  /** Hides the Steps | Every line switch when the example has no recorded line trace. */
  readonly everyLineAvailable = input(false);
  readonly caption = input('');
  /** The source line a recorded step ran, shown in code type above the caption. */
  readonly captionLine = input<string | null>(null);
  readonly captionDetail = input<string | null>(null);
  readonly values = input<WalkthroughValue[]>([]);
  readonly valuesNote = input<string | null>(null);
  readonly code = input<WalkthroughCodeLine[]>([]);
  readonly source = input('');
  readonly ideas = input<string[]>([]);
  readonly idea = input(-1);

  readonly exampleChange = output<string>();
  readonly languageChange = output<PatternLanguage>();
  readonly everyLineChange = output<boolean>();
  readonly step = output<number>();
  readonly toggle = output<void>();
  readonly ideaSelect = output<number>();

  protected readonly uid = `walkthrough-${++nextPlayerId}`;
  protected readonly languages = REFERENCE_LANGUAGES;
  protected readonly languageLabels = LANGUAGE_LABELS;
  /** Narrow screens: which half of the player shows (the caption and controls show in both). */
  readonly pane = signal<'drawing' | 'code'>('drawing');
  protected readonly approachOpen = signal(false);
  protected readonly showDrawn = signal(false);
  protected readonly drawnCount = computed(() => this.values().filter((row) => row.drawn).length);
  protected readonly shownValues = computed(() =>
    this.showDrawn() ? this.values() : this.values().filter((row) => !row.drawn),
  );
  private readonly previousButton = viewChild.required<ElementRef<HTMLElement>>('previousButton');
  private readonly nextButton = viewChild.required<ElementRef<HTMLElement>>('nextButton');
  private readonly section = viewChild.required<ElementRef<HTMLElement>>('section');
  private readonly controls = viewChild.required<ElementRef<HTMLElement>>('controls');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly captionRow = viewChild.required<ElementRef<HTMLElement>>('captionRow');
  /** Drawing below the stage's visible part: how many views start there (0: part of one). */
  protected readonly below = signal<{ views: number } | null>(null);

  constructor() {
    // A new step can draw more or less: recount what is below the stage's visible part.
    effect(() => {
      this.index();
      this.everyLine();
      this.example();
      this.language();
      this.pane();
      untracked(() => afterRender(() => this.measureStage()));
    });
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stage = this.stage().nativeElement;
      const measure = () => this.measureStage();
      stage.addEventListener('scroll', measure, { passive: true });
      destroyRef.onDestroy(() => stage.removeEventListener('scroll', measure));
      if (typeof ResizeObserver === 'undefined') return;
      // The stage's height cap leaves room for the pinned controls and the caption (CSS vars).
      const section = this.section().nativeElement;
      const controls = this.controls().nativeElement;
      const caption = this.captionRow().nativeElement;
      // Written in the next frame: a size change never feeds back into the same observation.
      let frame = 0;
      const update = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          section.style.setProperty('--wt-controls-h', `${Math.ceil(controls.offsetHeight)}px`);
          section.style.setProperty('--wt-caption-h', `${Math.ceil(caption.offsetHeight)}px`);
          this.measureStage();
        });
      };
      const observer = new ResizeObserver(update);
      for (const element of [controls, caption, stage]) observer.observe(element);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      });
    });
  }

  private measureStage(): void {
    const stage = this.stage().nativeElement;
    const hidden = stage.scrollHeight - stage.clientHeight - stage.scrollTop;
    if (stage.clientHeight === 0 || hidden <= 4) {
      if (this.below()) this.below.set(null);
      return;
    }
    const bottom = stage.getBoundingClientRect().bottom;
    const views = [...stage.querySelectorAll('figure')].filter(
      (figure) => figure.getBoundingClientRect().top >= bottom - 24,
    ).length;
    if (this.below()?.views !== views) this.below.set({ views });
  }
  /** "+N more views below": scroll the stage to the next view that is cut at its bottom. */
  protected revealBelow(): void {
    const stage = this.stage().nativeElement;
    const box = stage.getBoundingClientRect();
    const next = [...stage.querySelectorAll('figure')].find(
      (figure) => figure.getBoundingClientRect().bottom > box.bottom + 1,
    );
    const top = next
      ? stage.scrollTop + next.getBoundingClientRect().top - box.top - 8
      : stage.scrollTop + stage.clientHeight * 0.8;
    stage.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  protected keys(event: KeyboardEvent): void {
    const action = walkthroughKey(event);
    if (!action) return;
    event.preventDefault();
    if (action === 'toggle') this.toggle.emit();
    else if (action === 'previous') this.go(this.index() - 1);
    else if (action === 'next') this.go(this.index() + 1);
    else if (action === 'first') this.go(0);
    else this.go(this.count() - 1);
  }
  /** A button press: keep focus on a usable control when the pressed one becomes disabled. */
  protected move(target: number): void {
    this.go(target);
    const clamped = Math.max(0, Math.min(this.count() - 1, target));
    const atEnd = clamped >= this.count() - 1;
    const atStart = clamped <= 0;
    const focus = atEnd ? this.previousButton() : atStart ? this.nextButton() : null;
    if (focus) afterRender(() => focus.nativeElement.focus({ preventScroll: true }));
  }
  private go(target: number): void {
    const clamped = Math.max(0, Math.min(this.count() - 1, target));
    if (clamped !== this.index()) this.step.emit(clamped);
  }
  protected languageKeys(event: KeyboardEvent, language: PatternLanguage): void {
    const index = this.languages.indexOf(language);
    const target =
      event.key === 'ArrowRight'
        ? this.languages[(index + 1) % this.languages.length]
        : event.key === 'ArrowLeft'
          ? this.languages[(index + this.languages.length - 1) % this.languages.length]
          : null;
    if (!target) return;
    event.preventDefault();
    this.languageChange.emit(target);
    const tabs = (event.currentTarget as HTMLElement | null)?.parentElement;
    afterRender(() =>
      tabs
        ?.querySelector<HTMLButtonElement>(`[data-walkthrough-language="${target}"]`)
        ?.focus({ preventScroll: true }),
    );
  }
}

function reducedMotion(): boolean {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Runs a focus move after Angular has re-rendered the disabled states. */
function afterRender(task: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(task);
  else setTimeout(task);
}
