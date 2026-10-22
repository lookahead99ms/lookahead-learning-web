import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal } from '@angular/core';
import { PausableTimer, freezeAnimations } from '../pausable-timer';

/** One change in the wordmark's story: what it is called, its caption, and how long it holds. */
export interface KeyStage {
  id: string;
  /** Letters for the list read by screen readers and shown on phones. */
  letters: string;
  /** Caption lines under the change while it happens. */
  caption: readonly string[];
  /** Fuller wording for the list, where the drawing is not seen. */
  listed?: string;
  /** Centre of the caption, in wordmark units. */
  centre: number;
  /** How long this change holds before the next, in milliseconds. */
  ms: number;
}

/**
 * The wordmark's story (user, 2026-10-17). The plain word LOOKAHEAD; then, one change at a
 * time with its own caption, each symbol appears above its letter and descends onto it: the
 * eyes onto the O's, the wall onto the K's stem, the code brackets onto the K and the H, AI onto
 * the A and the H's first stroke, the circuit onto the E, the algorithm frame onto the A, the
 * door into the D. Then every meaning shows together, and only then does the L become the
 * path and draw through it all to the door, while the whole wordmark reads as one sentence:
 * the way through comes once you have the rest.
 */
export const KEY_STAGES: readonly KeyStage[] = [
  { id: 'word', letters: '', caption: [], centre: 314, ms: 1500 },
  { id: 'eyes', letters: 'OO', caption: ['Look'], listed: 'Look, the eyes', centre: 75, ms: 2600 },
  { id: 'wall', letters: 'K', caption: ['The obstacle'], listed: 'The obstacle, a wall', centre: 151, ms: 2600 },
  { id: 'code', letters: '‹ ›', caption: ['Code'], listed: 'Code, in the K and the H', centre: 237, ms: 2600 },
  { id: 'ai', letters: 'AI', caption: ['AI, in code'], listed: 'AI, on the A and the H’s first stroke', centre: 254, ms: 2600 },
  { id: 'e', letters: 'E', caption: ['Explore and', 'engineer'], centre: 390, ms: 2600 },
  { id: 'a', letters: 'A', caption: ['Algorithms and', 'architecture'], centre: 470, ms: 2600 },
  { id: 'door', letters: 'D', caption: ['The way through'], listed: 'The way through, a door', centre: 577, ms: 2600 },
  { id: 'summary', letters: '', caption: [], centre: 314, ms: 3400 },
  { id: 'path', letters: 'L', caption: [], listed: 'The path, one line from the L to the door, drawn last', centre: 314, ms: 5000 },
];

/** Part of the closing sentence; key words take their symbol's colour. */
export interface SentencePart {
  text: string;
  colour?: string;
}

/**
 * The whole wordmark as one sentence, in its own order, shown once the path is drawn
 * (user, 2026-10-17). "Look ahead to" means seeing the obstacle coming, the platform's idea.
 */
export const KEY_SENTENCE: readonly (readonly SentencePart[])[] = [
  [
    { text: 'Look', colour: 'var(--identity-eyes)' },
    { text: ' ahead to the ' },
    { text: 'obstacle', colour: 'var(--identity-wall)' },
    { text: ', put ' },
    { text: 'AI', colour: 'var(--identity-ai)' },
    { text: ' to work in your ' },
    { text: 'code', colour: 'var(--identity-code)' },
    { text: ',' },
  ],
  [
    { text: 'explore', colour: 'var(--identity-ai)' },
    { text: ' and ' },
    { text: 'engineer', colour: 'var(--identity-ai)' },
    { text: ' with ' },
    { text: 'algorithms', colour: 'var(--identity-ai)' },
    { text: ' and ' },
    { text: 'architecture', colour: 'var(--identity-ai)' },
    { text: ', and find ' },
    { text: 'the way through', colour: 'var(--identity-arrow)' },
    { text: '.' },
  ],
];


/** Every meaning at once, placed so neighbours never overlap, before the path joins them. */
export const KEY_SUMMARY: readonly { centre: number; lines: readonly string[] }[] = [
  { centre: 75, lines: ['Look'] },
  { centre: 151, lines: ['The obstacle'] },
  { centre: 254, lines: ['AI, in code'] },
  { centre: 383, lines: ['Explore and', 'engineer'] },
  { centre: 478, lines: ['Algorithms and', 'architecture'] },
  { centre: 585, lines: ['The way', 'through'] },
];

/** The stage index once every change has happened. */
export const KEY_DONE = KEY_STAGES.length;

/** The whole story, from the plain word to the line reaching the door, in milliseconds. */
export const KEY_STORY_MS = KEY_STAGES.reduce((total, stage) => total + stage.ms, 0);

/** Hidden until the card is on screen, then telling its story, then the finished wordmark. */
export type KeyState = 'hidden' | 'telling' | 'joined';

/** A short blank before the word appears, so a replay starts from nothing. */
export const KEY_RESET_MS = 80;

/** A loop round's start and end, so the statements can step aside for the captions and return. */
export type KeyCycle = 'apart' | 'joined';

/** Loop rounds start from the summary: every symbol in place, every meaning showing, the plain L. */
export const LOOP_FROM = KEY_STAGES.findIndex((stage) => stage.id === 'summary');

/** While looping, how long the stairs' arrow takes after the path reaches the door: one quick run. */
export const LOOP_ARROW_MS = 2400;

/** While looping, the rest before the story is told again. */
export const LOOP_REST_MS = 3000;

/** How much of the card must be on screen before it plays: a share of the card, or of the screen when the card is taller. */
export const STAGE_SHOWN = 0.75;

/** How much of the card is on screen, as a share of the card or of the screen, whichever is smaller. */
export function shownShare(entry: IntersectionObserverEntry, viewportHeight: number): number {
  const room = Math.min(entry.boundingClientRect.height, entry.rootBounds?.height ?? viewportHeight);
  return room > 0 ? entry.intersectionRect.height / room : 0;
}

/**
 * The LookAhead wordmark telling its story (user, 2026-10-16/17). It plays when most of the
 * card is on screen; if the reader leaves before the card has finished, it starts over when
 * they come back. It tells the page when it restarts and when the line has reached the door, so
 * the sentence, statements and steps can follow. Once the card has settled, it loops while on
 * screen from the summary: every meaning shows again, then the L becomes the path and draws to
 * the door (the sentence is not repeated: it already stands below the steps). Pausing freezes everything where it is; play carries on from
 * there. With reduced motion the finished wordmark shows with its meanings listed beneath.
 */
@Component({
  selector: 'app-wordmark-key',
  templateUrl: './wordmark-key.html',
  styleUrl: './wordmark-key.css',
  host: {
    '[attr.data-state]': 'state()',
    '[attr.data-reduced]': 'reducedMotion() ? "" : null',
  },
})
export class WordmarkKey {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly timer = new PausableTimer();
  private readonly loopTimer = new PausableTimer();
  /** -1 before the word appears, then the index of the change happening, then KEY_DONE. */
  protected readonly stage = signal(-1);
  protected readonly state = computed<KeyState>(() =>
    this.stage() < 0 ? 'hidden' : this.stage() >= KEY_DONE ? 'joined' : 'telling',
  );
  protected readonly reducedMotion = signal(false);
  protected readonly stages = KEY_STAGES;
  /** The changes that mean something, for captions; the list adds the path. */
  protected readonly explained = KEY_STAGES.filter((stage) => stage.caption.length);
  protected readonly listed = KEY_STAGES.filter((stage) => stage.letters);
  protected readonly summary = KEY_SUMMARY;
  protected readonly sentence = KEY_SENTENCE;
  /** In a loop round: no closing sentence this time. */
  protected readonly inLoop = signal(false);
  /** The card this wordmark belongs to; it plays when most of the card is on screen. */
  readonly stageElement = input<HTMLElement | null>(null, { alias: 'stage' });
  /** The whole card has finished playing, so leaving the screen no longer restarts it. */
  readonly settled = input(false);
  /** The reader paused: everything holds where it is until play. */
  readonly still = input(false);
  /** The wordmark starts (again) from nothing. */
  readonly restarted = output<void>();
  /** The line has reached the door; what follows the wordmark can begin. */
  readonly finished = output<void>();
  /** The reader paused or resumed the motion. */
  readonly stillChange = output<boolean>();
  /** A loop round starts (the captions need the statements' strip) or ends (they can return). */
  readonly cycle = output<KeyCycle>();
  /** In a loop round, the path has reached the door, so the stairs' arrow can run. */
  readonly passed = output<void>();
  /** The reader skipped to the end: everything below should show finished at once. */
  readonly skipped = output<void>();
  /** Once settled, the summary and the path play again now and then, while the card is on screen. */
  private readonly onScreen = signal(false);
  private readonly looping = computed(() => this.settled() && !this.reducedMotion() && this.onScreen());
  private resumeAnimations: (() => void) | undefined;
  private started = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.timer.clear();
      this.loopTimer.clear();
    });
    effect(() => {
      if (this.looping()) {
        this.loopTimer.start(() => this.loopRound(), LOOP_REST_MS);
      } else {
        this.stopLoop();
      }
    });
    // Pause holds the story where it is, like pausing a video; play carries on from there.
    effect(() => {
      if (this.still()) {
        this.timer.pause();
        this.loopTimer.pause();
        this.resumeAnimations = freezeAnimations(this.stageElement() ?? this.host.nativeElement);
      } else {
        this.resumeAnimations?.();
        this.resumeAnimations = undefined;
        this.timer.resume();
        this.loopTimer.resume();
      }
    });
    afterNextRender(() => {
      const view = this.document.defaultView;
      this.reducedMotion.set(view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
      const Observer = view?.IntersectionObserver;
      if (!Observer) {
        this.play();
        return;
      }
      const observer = new Observer(
        (entries) => entries.forEach((entry) => this.seen(shownShare(entry, view.innerHeight))),
        { threshold: Array.from({ length: 21 }, (_, step) => step / 20) },
      );
      observer.observe(this.stageElement() ?? this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /**
   * Play once most of the card is on screen. If the reader leaves before the card has finished,
   * start over when they come back, so nobody is left with a half-played card.
   */
  private seen(share: number): void {
    this.onScreen.set(share > 0);
    if (!this.started && share >= STAGE_SHOWN) {
      this.play();
    } else if (this.started && share === 0 && !this.settled() && !this.still()) {
      this.timer.clear();
      this.started = false;
      this.stage.set(-1);
      this.restarted.emit();
    }
  }

  /** Start from nothing and tell the story; with reduced motion, show the finished wordmark. */
  protected play(): void {
    this.timer.clear();
    this.loopTimer.clear();
    this.inLoop.set(false);
    this.started = true;
    this.restarted.emit();
    if (this.reducedMotion()) {
      this.stage.set(KEY_DONE);
      this.finished.emit();
      return;
    }
    this.stage.set(-1);
    this.timer.start(() => this.tell(0, this.timer, () => this.finished.emit()), KEY_RESET_MS);
  }

  /** Show change `index`, hold it, then the next; after the last, the wordmark is whole. */
  private tell(index: number, timer: PausableTimer, done: () => void): void {
    this.stage.set(index);
    timer.start(() => {
      if (index + 1 < KEY_DONE) {
        this.tell(index + 1, timer, done);
      } else {
        this.stage.set(KEY_DONE);
        done();
      }
    }, KEY_STAGES[index].ms);
  }

  /**
   * One loop round: back to the summary (the path lifts, the plain L returns, every meaning
   * shows), then the L becomes the path again; then the stairs' arrow runs, and after a rest the
   * next round.
   */
  private loopRound(): void {
    this.inLoop.set(true);
    this.cycle.emit('apart');
    this.tell(LOOP_FROM, this.loopTimer, () => {
      this.inLoop.set(false);
      this.cycle.emit('joined');
      this.passed.emit();
      this.loopTimer.start(() => this.loopRound(), LOOP_ARROW_MS + LOOP_REST_MS);
    });
  }

  /** Stop looping; if a round was under way, show the finished wordmark again. */
  private stopLoop(): void {
    this.loopTimer.clear();
    if (this.inLoop()) {
      this.inLoop.set(false);
      this.stage.set(KEY_DONE);
      this.cycle.emit('joined');
    }
  }

  /** Replay everything from the plain word. */
  protected replay(): void {
    if (this.still()) this.stillChange.emit(false);
    this.play();
  }

  /** Jump to the finished card: the whole wordmark now, and everything below at once. */
  protected skipToEnd(): void {
    if (this.still()) this.stillChange.emit(false);
    this.timer.clear();
    this.started = true;
    // Loop rounds only come after the card has finished once.
    const done = this.state() === 'joined' || this.inLoop();
    if (this.inLoop()) {
      // Skipping a loop round finishes it; the next round comes after the usual rest.
      this.stopLoop();
      this.loopTimer.start(() => this.loopRound(), LOOP_REST_MS);
    }
    this.stage.set(KEY_DONE);
    this.skipped.emit();
    if (!done) this.finished.emit();
  }

  /** Pause holds everything where it is; play carries on from there. */
  protected toggleStill(): void {
    this.stillChange.emit(!this.still());
  }

  /** Whether change `id` has happened (or is happening). */
  protected lit(id: string): boolean {
    return this.stage() >= KEY_STAGES.findIndex((stage) => stage.id === id);
  }

  /** Whether `id` is the change happening now, so its caption shows. */
  protected now(id: string): boolean {
    return KEY_STAGES[this.stage()]?.id === id;
  }
}
