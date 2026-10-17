import { DOCUMENT } from '@angular/common';
import { PausableTimer } from '../pausable-timer';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

/** Part of the line above a step; coloured parts are emphasised. */
interface LabelPart {
  text: string;
  colour?: string;
  gradient?: boolean;
}

/** One step of the climb, coloured like the part of the wordmark it echoes. */
interface Step {
  label: readonly LabelPart[];
  verb: string;
  word: string;
  colour: string;
}

/** One drawn piece of the stair line: the riser up to a step, then its tread, in the step's colour. */
export interface StairLine {
  d: string;
  colour: string;
}

/** From play to the arrow resting on the top step: statements (2.8 s) then four 2.9 s steps. */
export const STEPS_MS = 14400;

/** In loop rounds the arrow runs the whole staircase without stopping, in this many milliseconds. */
export const LOOP_DASH_MS = 2000;

/**
 * The arrow that travels the stair line: its route, how far along the route each step ends
 * (as percentages, for the CSS keyframes) and the colour of each step's stretch.
 */
export interface StairTraveller {
  route: string;
  /** Where the arrow rests on each step: at the end of its tread, just short of the corner, pointing right. */
  stops: readonly number[];
  /** Where the arrow passes each step's dot, for the loop's pulses. */
  dots: readonly number[];
  colours: readonly string[];
}

/** One growth phrase: the verb in its catalog's colour, the outcome in a contrasting one. */
interface GrowthLine {
  verb: string;
  middle: string;
  outcome: string;
  colour: string;
  outcomeColour: string;
}

/**
 * The Essence copy as a staircase: the platform sentence climbs from "Learn to code" to
 * "Look ahead" while the four ways of thinking rise underneath it. When told to play, the three
 * statements are drawn in one after another; then, step by step, each step appears, then its
 * circle and label, then the arrow (SVG) climbs up to it, turns right and runs to its end.
 */
@Component({
  selector: 'app-essence-steps',
  templateUrl: './essence-steps.html',
  styleUrl: './essence-steps.css',
  host: {
    '[attr.data-state]': 'play() ? "shown" : "hidden"',
    '[attr.data-away]': 'away() ? "" : null',
    '[attr.data-rested]': 'rested() ? "" : null',
  },
})
export class EssenceSteps {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Show the statements and steps; false hides them at once, ready to play again. */
  readonly play = input(false);
  /** The reader paused: the steps hold where they are until play. */
  readonly still = input(false);
  /** The reader skipped to the end: show everything finished at once. */
  readonly instant = input(false);
  /** The statements step aside while the wordmark above retells its story with captions. */
  readonly away = input(false);
  /** Skipped to the end: the arrow rests on the top step instead of climbing. */
  protected readonly rested = signal(false);
  /** Each new loop round sends the arrow up the stairs again; 0 is the first climb. */
  readonly loop = input(0);
  /** The arrow has come to rest on the top step. */
  readonly settled = output<void>();
  private readonly settleTimer = new PausableTimer();
  /** The stair line, measured from the laid-out steps; empty when the steps are stacked. */
  protected readonly lines = signal<readonly StairLine[]>([]);
  protected readonly traveller = signal<StairTraveller | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const injector = inject(Injector);
    effect(() => {
      const route = this.traveller();
      if (!this.loop() || !route) return;
      afterNextRender(() => this.dash(route), { injector });
    });
    effect(() => {
      const play = this.play();
      const instant = this.instant();
      untracked(() => {
        if (!play) {
          this.settleTimer.clear();
          this.rested.set(false);
        } else if (instant) {
          this.settleTimer.clear();
          this.rested.set(true);
          this.settled.emit();
        } else if (!this.rested()) {
          this.settleTimer.start(() => this.settled.emit(), STEPS_MS);
        }
      });
    });
    // Pause holds the wait for the arrow to come to rest; the card pauses the animations.
    effect(() => (this.still() ? this.settleTimer.pause() : this.settleTimer.resume()));
    destroyRef.onDestroy(() => this.settleTimer.clear());
    afterNextRender(() => {
      const view = this.document.defaultView;
      const frame = this.frame();
      this.measure();
      if (view?.ResizeObserver && frame) {
        const resize = new view.ResizeObserver(() => this.measure());
        resize.observe(frame);
        destroyRef.onDestroy(() => resize.disconnect());
      }
    });
  }

  private frame(): HTMLElement | null {
    return this.host.nativeElement.querySelector('.essence-stairs-frame');
  }

  /**
   * Trace the line along the top of each step: up the riser from the step before, then across.
   * The arrow follows the same route and stops where each step's tread ends.
   */
  protected measure(): void {
    const frame = this.frame();
    const box = frame?.getBoundingClientRect();
    const steps = [...(frame?.querySelectorAll('.essence-stairs > li') ?? [])].map((step) =>
      step.getBoundingClientRect(),
    );
    const climbing = steps.every((step, index) => !index || step.left > steps[index - 1].left);
    if (!box?.width || steps.length !== this.steps.length || !climbing) {
      this.lines.set([]);
      this.traveller.set(null);
      return;
    }
    const x = (value: number) => Math.round((value - box.left) * 10) / 10;
    const y = (value: number) => Math.round((value - box.top) * 10) / 10;
    // Each step is drawn once it has appeared: up the riser from the step before, then along it.
    this.lines.set(
      steps.map((step, index) => {
        const start = index
          ? `M${x(step.left)} ${y(steps[index - 1].top)} V${y(step.top)}`
          : `M${x(step.left)} ${y(step.top)}`;
        return { d: `${start} H${x(step.right)}`, colour: this.steps[index].colour };
      }),
    );
    const lengths = steps.map((step, index) =>
      x(step.right) - x(step.left) + (index ? y(steps[index - 1].top) - y(step.top) : 0),
    );
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const percent = (length: number) => Math.round((length / total) * 1000) / 10;
    let travelled = 0;
    const stops: number[] = [];
    const dots: number[] = [];
    steps.forEach((step, index) => {
      const tread = x(step.right) - x(step.left);
      dots.push(percent(travelled + lengths[index] - tread / 2));
      travelled += lengths[index];
      // Rest at the end of the step, a pixel short of the corner, so the arrow points right.
      stops.push(index === steps.length - 1 ? 100 : percent(travelled - 1));
    });
    this.traveller.set({
      route: `M${x(steps[0].left)} ${y(steps[0].top)}${steps
        .map((step, index) => `${index ? ` V${y(step.top)}` : ''} H${x(step.right)}`)
        .join('')}`,
      stops,
      dots,
      colours: this.steps.map((step) => step.colour),
    });
  }

  /**
   * A loop round: the arrow runs the whole staircase at an even pace, taking each step's colour
   * as it climbs onto it. Browsers without the Web Animations API keep the resting arrow.
   */
  private dash(route: StairTraveller): void {
    const arrow = this.host.nativeElement.querySelector<HTMLElement>('.essence-traveller.is-loop');
    if (typeof arrow?.animate !== 'function') return;
    const frames: Keyframe[] = [{ offsetDistance: '0%', color: route.colours[0], offset: 0 }];
    route.stops.forEach((stop, index) => {
      const offset = Math.round(stop * 10) / 1000;
      frames.push({ offsetDistance: `${stop}%`, color: route.colours[index], offset });
      if (index < route.stops.length - 1) {
        frames.push({ offsetDistance: `${stop}%`, color: route.colours[index + 1], offset });
      }
    });
    arrow.animate(frames, { duration: LOOP_DASH_MS, easing: 'linear', fill: 'forwards' });
  }

  /** When the loop's pulse leaves each step's dot: as the running arrow passes it. */
  protected pulseAt(index: number): string {
    const dot = this.traveller()?.dots[index] ?? 0;
    return `${Math.round((dot / 100) * LOOP_DASH_MS)}ms`;
  }

  /** The traveller's route and stops as inline styles the CSS keyframes read. */
  protected travellerStyle(traveller: StairTraveller): Record<string, string> {
    const style: Record<string, string> = { 'offset-path': `path("${traveller.route}")` };
    traveller.stops.forEach((stop, index) => (style[`--stop-${index}`] = `${stop}%`));
    traveller.colours.forEach((colour, index) => (style[`--colour-${index}`] = colour));
    return style;
  }


  protected readonly growth: readonly GrowthLine[] = [
    {
      verb: 'Grow',
      middle: ' your engineering ',
      outcome: 'capabilities',
      colour: 'var(--path-grow)',
      outcomeColour: 'var(--identity-ai)',
    },
    {
      verb: 'Strengthen',
      middle: ' your ',
      outcome: 'competencies',
      colour: 'var(--path-learn)',
      outcomeColour: 'var(--identity-code)',
    },
    {
      verb: 'Build',
      middle: ' expertise in your chosen ',
      outcome: 'specializations',
      colour: 'var(--path-blaze)',
      outcomeColour: 'var(--identity-arrow)',
    },
  ];

  protected readonly steps: readonly Step[] = [
    {
      label: [
        { text: 'Learn', colour: 'var(--path-learn)' },
        { text: ' to ' },
        { text: 'Code', colour: 'var(--identity-code)' },
      ],
      verb: 'Understand the',
      word: 'obstacle',
      colour: 'var(--identity-wall)',
    },
    {
      label: [{ text: 'And ' }, { text: 'Explore', colour: 'var(--identity-eyes)' }],
      verb: 'Find the',
      word: 'way',
      colour: 'var(--identity-arrow)',
    },
    {
      label: [{ text: 'AI Algorithms Architecture', colour: 'var(--identity-ai)' }],
      verb: 'Understand the',
      word: 'invariant',
      colour: 'var(--identity-h)',
    },
    {
      label: [{ text: 'Look ' }, { text: 'Ahead', gradient: true }],
      verb: 'Practice the',
      word: 'reasoning',
      colour: 'var(--identity-ai)',
    },
  ];
}
