import { signal } from '@angular/core';

/** How long the last frame stays on screen before an autoplaying story loops. */
export const STORY_HOLD_MS = 5000;
export const STORY_STEP_MS = 1800;
/** Remembered per browser: once a learner pauses, stories stay paused until they press Play. */
export const STORY_PAUSED_KEY = 'look-ahead-dsa-story-paused-v1';

/**
 * Playback for an Option B story, with the same rules as lesson animations: play while the
 * story is in view, stop when it scrolls away, hold the last frame for 5 s, then loop. Reduced
 * motion never autoplays; Play still works and steps without transitions. A learner's Pause
 * is remembered in this browser. Manual stepping pauses playback.
 *
 * With `autoplay: false` (the Visual walkthrough's "Code beside" player, 2026-10-06) nothing
 * starts on its own: Play runs to the last step and stops there, and a remembered Pause is moot.
 */
export class StoryPlayer {
  readonly index = signal(0);
  readonly playing = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private userPaused: boolean;

  constructor(
    private readonly count: () => number,
    private readonly stepMs: () => number = () => STORY_STEP_MS,
    private readonly reducedMotion: () => boolean = () => false,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
    private readonly options: { autoplay?: boolean } = {},
  ) {
    this.userPaused = this.read() === '1';
  }
  private get autoplay(): boolean {
    return this.options.autoplay !== false;
  }

  /** Called by the viewport observer. */
  setVisible(visible: boolean): void {
    if (!visible) this.stop();
    else if (this.autoplay && !this.userPaused && !this.reducedMotion()) this.start(false);
  }

  toggle(): void {
    if (this.playing()) {
      this.userPaused = true;
      this.write('1');
      this.stop();
      return;
    }
    this.userPaused = false;
    this.write('0');
    if (this.index() >= this.count() - 1) this.index.set(0);
    this.start(true);
  }

  go(index: number): void {
    this.pauseByUser();
    this.index.set(Math.max(0, Math.min(this.count() - 1, index)));
  }
  next(): void {
    this.go(this.index() + 1);
  }
  previous(): void {
    this.go(this.index() - 1);
  }
  restart(): void {
    this.go(0);
  }
  reset(): void {
    this.stop();
    this.index.set(0);
  }
  /** Stops playback without remembering it as the learner's Pause (another mode took over). */
  pause(): void {
    this.stop();
  }
  destroy(): void {
    this.stop();
  }

  private pauseByUser(): void {
    if (this.playing()) {
      this.userPaused = true;
      this.write('1');
    }
    this.stop();
  }
  private start(now: boolean): void {
    if (this.timer !== undefined || this.count() < 2) return;
    this.playing.set(true);
    const last = () => this.index() >= this.count() - 1;
    const tick = () => {
      if (!this.autoplay && last()) {
        this.stop();
        return;
      }
      this.index.set(last() ? 0 : this.index() + 1);
      if (!this.autoplay && last()) {
        this.timer = undefined;
        this.playing.set(false);
        return;
      }
      this.timer = setTimeout(tick, last() ? STORY_HOLD_MS : this.stepMs());
    };
    this.timer = setTimeout(tick, now ? 350 : last() ? STORY_HOLD_MS : this.stepMs());
  }
  private stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.playing.set(false);
  }
  private read(): string | null {
    try {
      return this.storage?.getItem(STORY_PAUSED_KEY) ?? null;
    } catch {
      return null;
    }
  }
  private write(value: string): void {
    try {
      this.storage?.setItem(STORY_PAUSED_KEY, value);
    } catch {
      /* Storage can be unavailable; the choice still applies on this page. */
    }
  }
}
