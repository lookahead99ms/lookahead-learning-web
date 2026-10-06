import { computed, signal } from '@angular/core';

/**
 * Practice tools for Try it yourself (user-approved preview, 2026-10-05): a timed attempt and a
 * complexity prediction. Both are browser-only and kept per problem for this tab session; neither
 * changes saved progress.
 */
export const TIMER_MINUTES = [15, 25, 45] as const;
/** Default attempt length by difficulty: Beginner 15, Intermediate 25, Advanced 45 minutes. */
export function defaultTimerMinutes(difficulty: string | undefined): number {
  return difficulty === 'Beginner' ? 15 : difficulty === 'Advanced' ? 45 : 25;
}
export const TIMER_KEY = 'look-ahead-practice-timer-v1';
export const PREDICTION_KEY = 'look-ahead-complexity-prediction-v1';
export const TIME_UP = 'Time is up: hints and the solution are unlocked.';
export const TIME_OPTIONS = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'] as const;
export const SPACE_OPTIONS = ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'] as const;

export interface ComplexityPrediction {
  time: string;
  space: string;
}
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
interface SavedTimer {
  minutes: number;
  remaining: number;
  running: boolean;
  savedAt: number;
}

/** sessionStorage can be missing or throw (private windows, blocked site data). */
export function sessionStore(): Store {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}
function read<T>(storage: Store, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(storage: Store, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Memory-only for this view when storage is unavailable.
  }
}

/** A countdown per problem. While it runs, hints and the solution stay locked. */
export class PracticeTimer {
  readonly minutes = signal<number>(25);
  readonly remaining = signal(25 * 60);
  readonly running = signal(false);
  /** Set only when the countdown reaches zero, for a polite live region. */
  readonly announcement = signal('');
  readonly started = computed(() => this.running() || this.remaining() < this.minutes() * 60);
  readonly expired = computed(() => !this.running() && this.remaining() === 0);
  readonly low = computed(() => this.remaining() < 5 * 60);
  readonly clock = computed(() => {
    const seconds = this.remaining();
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });
  private problemId = '';
  private interval?: ReturnType<typeof setInterval>;

  constructor(private readonly storage: Store = sessionStore()) {}

  /** Restores this problem's timer; a running one keeps counting from when it was last saved. */
  load(problemId: string, defaultMinutes = 25): void {
    this.halt();
    this.problemId = problemId;
    this.announcement.set('');
    const saved = read<SavedTimer>(this.storage, this.key());
    const fallback = TIMER_MINUTES.find((value) => value === defaultMinutes) ?? 25;
    const minutes = TIMER_MINUTES.find((value) => value === saved?.minutes) ?? fallback;
    let remaining = Number.isFinite(saved?.remaining)
      ? Math.min(minutes * 60, Math.max(0, Math.round(saved!.remaining)))
      : minutes * 60;
    if (saved?.running && Number.isFinite(saved.savedAt))
      remaining = Math.max(
        0,
        remaining - Math.max(0, Math.floor((Date.now() - saved.savedAt) / 1000)),
      );
    this.minutes.set(minutes);
    this.remaining.set(remaining);
    if (saved?.running && remaining > 0) this.run();
    else if (saved?.running) this.save();
  }
  setMinutes(minutes: number): void {
    if (this.started() || !TIMER_MINUTES.some((value) => value === minutes)) return;
    this.minutes.set(minutes);
    this.remaining.set(minutes * 60);
    this.save();
  }
  start(): void {
    this.remaining.set(this.minutes() * 60);
    this.announcement.set('');
    this.run();
  }
  stop(): void {
    this.halt();
    this.save();
  }
  resume(): void {
    if (this.remaining() > 0) this.run();
  }
  reset(): void {
    this.halt();
    this.remaining.set(this.minutes() * 60);
    this.announcement.set('');
    this.save();
  }
  /** Stops ticking without saving, so a running attempt continues when the problem opens again. */
  destroy(): void {
    clearInterval(this.interval);
  }
  private run(): void {
    clearInterval(this.interval);
    this.running.set(true);
    this.save();
    this.interval = setInterval(() => this.tick(), 1000);
  }
  private tick(): void {
    const next = Math.max(0, this.remaining() - 1);
    this.remaining.set(next);
    if (!next) {
      this.halt();
      this.announcement.set(TIME_UP);
    }
    this.save();
  }
  private halt(): void {
    clearInterval(this.interval);
    this.interval = undefined;
    this.running.set(false);
  }
  private key(): string {
    return `${TIMER_KEY}:${this.problemId}`;
  }
  private save(): void {
    if (!this.problemId) return;
    write(this.storage, this.key(), {
      minutes: this.minutes(),
      remaining: this.remaining(),
      running: this.running(),
      savedAt: Date.now(),
    } satisfies SavedTimer);
  }
}

export function loadPrediction(
  problemId: string,
  storage: Store = sessionStore(),
): ComplexityPrediction | null {
  const saved = read<ComplexityPrediction>(storage, `${PREDICTION_KEY}:${problemId}`);
  return typeof saved?.time === 'string' && typeof saved.space === 'string'
    ? { time: saved.time, space: saved.space }
    : null;
}
export function savePrediction(
  problemId: string,
  prediction: ComplexityPrediction,
  storage: Store = sessionStore(),
): void {
  write(storage, `${PREDICTION_KEY}:${problemId}`, prediction);
}

/**
 * The leading O(...) term of a published cost, normalized for comparison: "O(n log n) average"
 * and "O(n·log(n))" both become "nlogn"; "O(n^2)" and "O(n²)" both become "n^2".
 */
export function leadingBigO(text: string): string | null {
  const match = /\bO\s*\(/.exec(text);
  if (!match) return null;
  let depth = 0;
  const start = match.index + match[0].length;
  for (let index = start; index < text.length; index++) {
    if (text[index] === '(') depth++;
    else if (text[index] === ')' && depth-- === 0)
      return text
        .slice(start, index)
        .toLowerCase()
        .replaceAll('²', '^2')
        .replaceAll('ⁿ', '^n')
        .replace(/[\s()·*×]/g, '');
  }
  return null;
}
export function complexityVerdict(reference: string, predicted: string): 'match' | 'miss' {
  const expected = leadingBigO(reference);
  return expected !== null && expected === leadingBigO(predicted) ? 'match' : 'miss';
}
