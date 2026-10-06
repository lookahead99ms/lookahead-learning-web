/** What the timeline asks the page to do with one path-card scene. */
export interface PathSceneControls<Id extends string = string> {
  /** Restart the scene's story from its first frame (summary → story → summary). */
  play(id: Id): void;
  /** Stop the scene and show its resting summary frame. */
  hold(id: Id): void;
  /** Freeze or unfreeze a scene that is playing, keeping its current frame. */
  freeze(id: Id, frozen: boolean): void;
  /** Story length in ms, or null when the scene has not loaded (it then sits out the round). */
  duration(id: Id): number | null;
}

/** Why the timeline is stopped; it runs only when no reason applies. */
export type PathSceneStopReason = 'offscreen' | 'hidden' | 'user' | 'reduced-motion';

/**
 * Each round, the first story starts 1.5 s after all three cards show their summary. Each story
 * holds its first frame for 1.5 s, so the first drawing visibly moves 3 s after load.
 */
export const FIRST_START_MS = 1500;
/** Each card's story starts this long after the previous card's. */
export const STAGGER_MS = 1000;

type SceneState = 'waiting' | 'playing' | 'done';

/**
 * One shared timeline for the three landing path cards. Every round starts with all three on
 * their summary; the stories then start 1 s apart (1.5, 2.5, 3.5 s) and overlap, each playing once.
 * When every card is back on its summary the next round begins the same way. Time only passes
 * while the timeline runs, so a stop (off screen, hidden tab, Pause, reduced motion) keeps it.
 */
export class PathSceneTimeline<Id extends string = string> {
  /** Running time (ms) since the current round began. */
  private elapsed = 0;
  private resumedAt = 0;
  private starts: number[] = [];
  private ends: number[] = [];
  private states: SceneState[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly reasons = new Set<PathSceneStopReason>();
  private started = false;

  constructor(
    private readonly ids: readonly Id[],
    private readonly controls: PathSceneControls<Id>,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.newRound(FIRST_START_MS);
  }

  /** The scenes playing now, in card order. */
  get playing(): Id[] {
    return this.ids.filter((_, i) => this.states[i] === 'playing');
  }

  get running(): boolean {
    return this.started && this.reasons.size === 0;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.ids.forEach((id) => this.controls.hold(id));
    this.resume();
  }

  /** Adds or clears a reason to stop. Reduced motion also returns every card to its summary. */
  setStopped(reason: PathSceneStopReason, stopped: boolean): void {
    const wasRunning = this.running;
    if (stopped) this.reasons.add(reason);
    else this.reasons.delete(reason);
    if (reason === 'reduced-motion' && stopped) {
      this.clearTimer();
      this.ids.forEach((id) => this.controls.hold(id));
      this.newRound(FIRST_START_MS);
      return;
    }
    if (wasRunning && !this.running) this.pause();
    else if (!wasRunning && this.running) this.resume();
  }

  destroy(): void {
    this.clearTimer();
    this.started = false;
  }

  private newRound(firstStart: number): void {
    this.elapsed = 0;
    this.starts = this.ids.map((_, i) => firstStart + i * STAGGER_MS);
    this.ends = this.ids.map(() => Infinity);
    this.states = this.ids.map(() => 'waiting');
  }

  private pause(): void {
    this.clearTimer();
    this.elapsed += this.now() - this.resumedAt;
    this.playing.forEach((id) => this.controls.freeze(id, true));
  }

  private resume(): void {
    if (!this.running) return;
    this.playing.forEach((id) => this.controls.freeze(id, false));
    this.resumedAt = this.now();
    this.schedule();
  }

  /** Waits for the next start or end in this round. */
  private schedule(): void {
    this.clearTimer();
    const next = Math.min(
      ...this.states.map((state, i) =>
        state === 'waiting' ? this.starts[i] : state === 'playing' ? this.ends[i] : Infinity,
      ),
    );
    const wait = Math.max(0, next - this.elapsed);
    this.timer = setTimeout(() => this.tick(wait), wait);
  }

  private tick(waited: number): void {
    this.timer = undefined;
    this.elapsed += waited;
    this.resumedAt = this.now();
    this.ids.forEach((id, i) => {
      if (this.states[i] === 'playing' && this.ends[i] <= this.elapsed) {
        this.states[i] = 'done';
        this.controls.hold(id);
      }
    });
    this.ids.forEach((id, i) => {
      if (this.states[i] !== 'waiting' || this.starts[i] > this.elapsed) return;
      const ms = this.controls.duration(id);
      if (ms && ms > 0) {
        this.states[i] = 'playing';
        this.ends[i] = this.starts[i] + ms;
        this.controls.play(id);
      } else {
        this.states[i] = 'done';
      }
    });
    // Every card is back on its summary: the next round starts the same way (1.5, 2.5, 3.5 s).
    if (this.states.every((state) => state === 'done')) this.newRound(FIRST_START_MS);
    this.schedule();
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
