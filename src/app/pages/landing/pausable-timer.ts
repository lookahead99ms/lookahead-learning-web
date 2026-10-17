/**
 * A one-shot timer that can be paused and resumed, like pausing a video: on resume it runs
 * after whatever time was left. Used by the Essence card so its pause button freezes the story
 * where it is.
 */
export class PausableTimer {
  private handle: ReturnType<typeof setTimeout> | undefined;
  private run: (() => void) | undefined;
  private due = 0;
  private left = 0;

  /** Run `run` after `ms`, replacing anything already waiting. */
  start(run: () => void, ms: number): void {
    this.clear();
    this.run = run;
    this.left = ms;
    this.resume();
  }

  /** Hold the remaining time; nothing runs until resumed. */
  pause(): void {
    if (this.handle === undefined) return;
    clearTimeout(this.handle);
    this.handle = undefined;
    this.left = Math.max(0, this.due - Date.now());
  }

  /** Carry on with the time that was left; does nothing if nothing is waiting or it is running. */
  resume(): void {
    if (!this.run || this.handle !== undefined) return;
    this.due = Date.now() + this.left;
    this.handle = setTimeout(() => {
      const run = this.run;
      this.handle = undefined;
      this.run = undefined;
      run?.();
    }, this.left);
  }

  /** Forget whatever was waiting. */
  clear(): void {
    clearTimeout(this.handle);
    this.handle = undefined;
    this.run = undefined;
  }
}

/**
 * Pause every animation and transition running inside `root`, returning a function that plays
 * just those again. Finished ones are left alone, since playing a finished animation restarts it.
 */
export function freezeAnimations(root: Element): () => void {
  const running = (root.getAnimations?.({ subtree: true }) ?? []).filter(
    (animation) => animation.playState === 'running',
  );
  running.forEach((animation) => animation.pause());
  return () => running.forEach((animation) => animation.play());
}
