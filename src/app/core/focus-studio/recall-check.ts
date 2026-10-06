import { Injectable, signal } from '@angular/core';
import { PracticeRating, ReviewChoice } from '../practice-progress/practice-progress';
import { sessionStore } from './practice-tools';

/**
 * The Recall card grid's memory (user-approved preview, option B "Card grid", 2026-10-06): which
 * answers are open and how each card was graded. It is kept per problem for this tab session
 * (sessionStorage, like the practice tools) and never changes saved progress; "Finish and
 * review" only reads it to suggest a rating and a review date.
 */
export type RecallGrade = 'got' | 'partly' | 'missed';
export const RECALL_GRADES: readonly { id: RecallGrade; label: string }[] = [
  { id: 'got', label: 'Got it' },
  { id: 'partly', label: 'Partly' },
  { id: 'missed', label: 'Missed' },
];
export const RECALL_CHECK_KEY = 'look-ahead-recall-check-v1';

export interface RecallCheck {
  /** Card ids whose answers are open. */
  open: readonly string[];
  grades: Readonly<Record<string, RecallGrade>>;
  /** How many cards the grid had when it was last changed. */
  total: number;
}
export interface RecallSuggestion {
  rating: PracticeRating;
  review: ReviewChoice;
  /** "From your answers: …" */
  text: string;
}

const EMPTY: RecallCheck = { open: [], grades: {}, total: 0 };
const GRADE_IDS = new Set<string>(RECALL_GRADES.map((grade) => grade.id));

/**
 * Any Missed suggests "Needed the solution" and a review in 3 days; any Partly suggests "Solved with
 * hints" and a review in 1 week; every card Got it suggests "Solved on my own" with no review. A
 * partial pass with only Got it has nothing to suggest yet.
 */
export function recallSuggestion(check: RecallCheck | undefined): RecallSuggestion | null {
  const grades = Object.values(check?.grades ?? {});
  if (!check || !grades.length) return null;
  if (grades.includes('missed'))
    return {
      rating: 'Needed the solution',
      review: '3d',
      text: 'From your answers: needed the solution, review in 3 days.',
    };
  if (grades.includes('partly'))
    return {
      rating: 'Solved with hints',
      review: '1w',
      text: 'From your answers: solved with hints, review in 1 week.',
    };
  return grades.length >= check.total
    ? {
        rating: 'Solved on my own',
        review: 'none',
        text: 'From your answers: solved on my own, no review needed.',
      }
    : null;
}

function valid(value: unknown): value is RecallCheck {
  const check = value as RecallCheck | null;
  return (
    !!check &&
    Array.isArray(check.open) &&
    check.open.every((id) => typeof id === 'string') &&
    typeof check.grades === 'object' &&
    check.grades !== null &&
    Object.values(check.grades).every((grade) => GRADE_IDS.has(grade)) &&
    Number.isFinite(check.total)
  );
}

@Injectable({ providedIn: 'root' })
export class RecallCheckStore {
  private readonly storage = sessionStore();
  private readonly checks = signal<Readonly<Record<string, RecallCheck>>>(this.restore());

  /** This problem's open answers and grades (empty until the learner uses the grid). */
  check(problemId: string): RecallCheck {
    return this.checks()[problemId] ?? EMPTY;
  }

  setOpen(problemId: string, cardId: string, open: boolean, total: number): void {
    const current = this.check(problemId);
    if (current.open.includes(cardId) === open) return;
    this.commit(problemId, {
      ...current,
      total,
      open: open ? [...current.open, cardId] : current.open.filter((id) => id !== cardId),
    });
  }

  setAllOpen(problemId: string, cardIds: readonly string[], open: boolean): void {
    this.commit(problemId, { ...this.check(problemId), total: cardIds.length, open: open ? [...cardIds] : [] });
  }

  /** Pressing the grade a card already has takes it back. */
  grade(problemId: string, cardId: string, grade: RecallGrade, total: number): void {
    const current = this.check(problemId);
    const grades = { ...current.grades };
    if (grades[cardId] === grade) delete grades[cardId];
    else grades[cardId] = grade;
    this.commit(problemId, { ...current, total, grades });
  }

  private commit(problemId: string, next: RecallCheck): void {
    if (!problemId) return;
    this.checks.update((checks) => ({ ...checks, [problemId]: next }));
    try {
      this.storage?.setItem(RECALL_CHECK_KEY, JSON.stringify(this.checks()));
    } catch {
      // Memory-only for this view when storage is unavailable.
    }
  }

  private restore(): Record<string, RecallCheck> {
    try {
      const raw = this.storage?.getItem(RECALL_CHECK_KEY);
      const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      if (!saved || typeof saved !== 'object') return {};
      return Object.fromEntries(
        Object.entries(saved).filter((entry): entry is [string, RecallCheck] => valid(entry[1])),
      );
    } catch {
      return {};
    }
  }
}
