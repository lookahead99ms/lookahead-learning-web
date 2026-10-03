import { signal } from '@angular/core';

/** Interval between automatic steps while the guided debugger plays. */
export const TRACE_PLAY_INTERVAL_MS = 1000;

/**
 * Play/Pause for a guided debugger. The host owns the step; the player only
 * asks it to advance about once a second and stops at the final step. Manual
 * stepping should call `pause()` first.
 */
export class TracePlayer {
  readonly playing = signal(false);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly position: () => { step: number; count: number },
    private readonly go: (step: number) => void,
    private readonly interval = TRACE_PLAY_INTERVAL_MS,
  ) {}

  toggle(): void {
    if (this.playing()) {
      this.pause();
      return;
    }
    const { step, count } = this.position();
    if (count < 2) return;
    // Playing from the end starts over, matching a media player.
    if (step >= count - 1) this.go(0);
    this.playing.set(true);
    this.timer = setInterval(() => this.tick(), this.interval);
  }

  pause(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.playing.set(false);
  }

  private tick(): void {
    const { step, count } = this.position();
    if (step >= count - 1) {
      this.pause();
      return;
    }
    this.go(step + 1);
    if (step + 1 >= count - 1) this.pause();
  }
}

/** Arrow-key stepping for a focused debugger, ignoring form fields, tabs and code. */
export function traceArrowKey(event: KeyboardEvent): -1 | 1 | 0 {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return 0;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return 0;
  const target = event.target as HTMLElement | null;
  if (
    target?.closest?.(
      'input, select, textarea, pre, [role="tab"], [role="separator"], [contenteditable="true"]',
    )
  ) {
    return 0;
  }
  return event.key === 'ArrowLeft' ? -1 : 1;
}
