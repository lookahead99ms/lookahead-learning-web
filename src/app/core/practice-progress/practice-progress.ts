import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';

/**
 * Hands-On DSA practice progress, kept in this browser only (current milestone: browser-local
 * frontend). Nothing here reaches an account or another device. Storage can be missing or throw
 * (private windows, blocked site data), so every access is guarded and progress then lasts until
 * the page is left.
 */
export const PRACTICE_PROGRESS_KEY = 'look-ahead.dsa-practice.v1';
const SCHEMA_VERSION = 'dsa-practice-local/v1';

export const PRACTICE_RATINGS = [
  'Solved on my own',
  'Solved with hints',
  'Needed the solution',
] as const;
export type PracticeRating = (typeof PRACTICE_RATINGS)[number];
export type PracticeStatus = 'started' | 'solved';
/** What the catalog shows: a due review outranks solved, which outranks started. */
export type PracticeDisplayStatus = PracticeStatus | 'review-due' | null;

export const REVIEW_CHOICES = [
  { id: '3d', label: 'In 3 days', days: 3 },
  { id: '1w', label: 'In 1 week', days: 7 },
  { id: 'none', label: 'No review needed', days: null },
] as const;
export type ReviewChoice = (typeof REVIEW_CHOICES)[number]['id'];

export interface PracticeRecord {
  /** Null once progress is cleared but the learner kept their notes. */
  status: PracticeStatus | null;
  rating: PracticeRating | null;
  /** Local calendar date, `YYYY-MM-DD`, or null when no review is planned. */
  reviewAt: string | null;
  /** The review button last chosen; records saved before this field existed have none. */
  reviewChoice?: ReviewChoice;
  notes: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
}

interface SavedProgress {
  schemaVersion: typeof SCHEMA_VERSION;
  problems: Record<string, PracticeRecord>;
}

/** The clock behind "today" and review dates; tests replace it. */
export const PRACTICE_CLOCK = new InjectionToken<() => Date>('PRACTICE_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** `YYYY-MM-DD` for the local calendar day of `date`. */
export function localDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** "Thursday 8 October" for a stored `YYYY-MM-DD`. */
export function reviewDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(year, month - 1, day));
}

/** A review is due on its day and every day after it. */
export function isReviewDue(record: PracticeRecord | undefined, today: string): boolean {
  return !!record?.reviewAt && record.reviewAt <= today;
}

function validRecord(value: unknown): value is PracticeRecord {
  const record = value as PracticeRecord | null;
  return (
    !!record &&
    typeof record === 'object' &&
    (record.status === null || record.status === 'started' || record.status === 'solved') &&
    (record.rating === null || PRACTICE_RATINGS.includes(record.rating)) &&
    (record.reviewChoice === undefined ||
      REVIEW_CHOICES.some(({ id }) => id === record.reviewChoice)) &&
    (record.reviewAt === null ||
      (typeof record.reviewAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.reviewAt))) &&
    typeof record.notes === 'string' &&
    typeof record.updatedAt === 'string'
  );
}

/** Parses saved progress, keeping only well-formed records; anything else reads as empty. */
export function parsePracticeProgress(raw: string | null): Record<string, PracticeRecord> {
  if (!raw) return {};
  try {
    const saved = JSON.parse(raw) as SavedProgress | null;
    if (saved?.schemaVersion !== SCHEMA_VERSION || !saved.problems || typeof saved.problems !== 'object')
      return {};
    return Object.fromEntries(
      Object.entries(saved.problems).filter(([id, record]) => id && validRecord(record)),
    );
  } catch {
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class PracticeProgressService {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly clock = inject(PRACTICE_CLOCK);
  readonly records = signal<Readonly<Record<string, PracticeRecord>>>({});
  /** False when this browser refused to save; progress then lasts only until the page is left. */
  readonly persisted = signal(true);
  readonly today = signal(localDateKey(this.clock()));
  readonly solvedIds = computed(
    () =>
      new Set(
        Object.entries(this.records())
          .filter(([, record]) => record.status === 'solved')
          .map(([id]) => id),
      ),
  );
  readonly startedIds = computed(
    () =>
      new Set(
        Object.entries(this.records())
          .filter(([, record]) => record.status === 'started')
          .map(([id]) => id),
      ),
  );
  readonly reviewDueIds = computed(() => {
    const today = this.today();
    return new Set(
      Object.entries(this.records())
        .filter(([, record]) => isReviewDue(record, today))
        .map(([id]) => id),
    );
  });

  constructor() {
    this.load();
    const synchronize = (event: StorageEvent) => {
      // A null key means another tab cleared this site's storage.
      if (event.key !== null && event.key !== PRACTICE_PROGRESS_KEY) return;
      this.today.set(localDateKey(this.clock()));
      this.records.set(parsePracticeProgress(event.key === null ? null : event.newValue));
    };
    this.view?.addEventListener('storage', synchronize);
    inject(DestroyRef).onDestroy(() => this.view?.removeEventListener('storage', synchronize));
  }

  record(problemId: string): PracticeRecord | undefined {
    return this.records()[problemId];
  }

  displayStatus(problemId: string): PracticeDisplayStatus {
    if (this.reviewDueIds().has(problemId)) return 'review-due';
    return this.records()[problemId]?.status ?? null;
  }

  /** First edit of the draft, or the first hint or solution opened. Never downgrades a solve. */
  markStarted(problemId: string): void {
    if (!problemId || this.records()[problemId]?.status) return;
    this.write(problemId, { status: 'started' });
  }

  rate(problemId: string, rating: PracticeRating): void {
    if (!PRACTICE_RATINGS.includes(rating)) return;
    this.write(problemId, { status: 'solved', rating });
  }

  /** Takes a rating back: the problem is no longer solved, only started. */
  unrate(problemId: string): void {
    if (!this.records()[problemId]?.rating) return;
    this.write(problemId, { status: 'started', rating: null });
  }

  /**
   * Clears this problem's progress (status, rating and review). Notes stay unless `withNotes`;
   * with nothing left to keep, the record is removed.
   */
  clear(problemId: string, withNotes = false): void {
    const notes = withNotes ? '' : (this.records()[problemId]?.notes ?? '');
    if (!notes) {
      this.commit(problemId, null);
      return;
    }
    this.commit(problemId, {
      status: null,
      rating: null,
      reviewAt: null,
      notes,
      updatedAt: this.clock().toISOString(),
    });
  }

  scheduleReview(problemId: string, choice: ReviewChoice): void {
    const option = REVIEW_CHOICES.find(({ id }) => id === choice);
    if (!option) return;
    this.today.set(localDateKey(this.clock()));
    this.write(problemId, {
      reviewAt: option.days === null ? null : localDateKey(addDays(this.clock(), option.days)),
      reviewChoice: option.id,
      // Planning a review counts as engaging with the problem.
      status: this.records()[problemId]?.status ?? 'started',
    });
  }

  setNotes(problemId: string, notes: string): void {
    if ((this.records()[problemId]?.notes ?? '') === notes) return;
    this.write(problemId, { notes });
  }

  private write(problemId: string, patch: Partial<PracticeRecord>): void {
    if (!problemId) return;
    const previous: PracticeRecord = this.records()[problemId] ?? {
      status: 'started',
      rating: null,
      reviewAt: null,
      notes: '',
      updatedAt: '',
    };
    this.commit(problemId, { ...previous, ...patch, updatedAt: this.clock().toISOString() });
  }

  /** Saves one record, or removes it when `next` is null. */
  private commit(problemId: string, next: PracticeRecord | null): void {
    if (!problemId) return;
    const place = (records: Readonly<Record<string, PracticeRecord>>) => {
      const updated = { ...records };
      if (next) updated[problemId] = next;
      else delete updated[problemId];
      return updated;
    };
    this.records.update(place);
    try {
      const storage = this.view?.localStorage;
      if (!storage) throw new Error('Storage unavailable');
      // Merge with what another tab may have written since this one last read.
      const stored = parsePracticeProgress(storage.getItem(PRACTICE_PROGRESS_KEY));
      const problems = place({ ...this.records(), ...stored });
      storage.setItem(
        PRACTICE_PROGRESS_KEY,
        JSON.stringify({ schemaVersion: SCHEMA_VERSION, problems } satisfies SavedProgress),
      );
      this.records.set(problems);
      this.persisted.set(true);
    } catch {
      this.persisted.set(false);
    }
  }

  private load(): void {
    try {
      this.records.set(
        parsePracticeProgress(this.view?.localStorage.getItem(PRACTICE_PROGRESS_KEY) ?? null),
      );
    } catch {
      this.persisted.set(false);
    }
  }
}
