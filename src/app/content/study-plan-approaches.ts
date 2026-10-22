import { Injectable, Injector, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ContentService } from './content.service';
import { HandsOnApproachFamily, HandsOnDsaIndex } from './hands-on-dsa';

/**
 * DLV-962 (user decision 2026-10-17): a DSA problem with several equally optimal approaches is
 * published once per approach ("<Title> (Approach-1)", "<Title> (Approach-2)"). Study plans keep
 * their items, timings and order. An item whose problem belongs to such a family offers every
 * approach, and completing the item with any of them completes it.
 *
 * Completion stays item-based (the plan's own Mark complete / outcome records the assignment and
 * its plan content id), so whichever approach the learner opened, the item completes. On top of
 * that, a completion recorded against any family member counts for the plan's member too
 * (`approachCompletedIds`), and the approach the learner opened is remembered in this browser so
 * the plan can say which one was used.
 *
 * No spoilers: the choice is on screen before the learner tries, so it carries only approach
 * numbers and routes, never a pattern, a method or bounds.
 */
export interface PlanApproachMember {
  problemId: string;
  approach: number;
  title: string;
  route: string[];
}

/** Plan problem id -> every approach, the plan's own included, in approach order. */
export type PlanApproachFamilies = ReadonlyMap<string, PlanApproachMember[]>;

interface FamilySource {
  approach: number;
  siblings: { problemId: string; approach: number; title: string; path: string; courseId: string; questionId: string }[];
}

/** The plan's own problem plus its siblings; empty unless there are at least two approaches. */
export function planApproachMembers(
  self: { problemId: string; title: string; route: string[] },
  family: FamilySource | null | undefined,
): PlanApproachMember[] {
  if (!family || !Number.isInteger(family.approach) || !family.siblings?.length) return [];
  const members = new Map<string, PlanApproachMember>([
    [self.problemId, { problemId: self.problemId, approach: family.approach, title: self.title, route: self.route }],
  ]);
  for (const sibling of family.siblings) {
    if (
      !sibling?.problemId ||
      members.has(sibling.problemId) ||
      !Number.isInteger(sibling.approach) ||
      !sibling.path ||
      !sibling.courseId ||
      !sibling.questionId
    )
      continue;
    members.set(sibling.problemId, {
      problemId: sibling.problemId,
      approach: sibling.approach,
      title: sibling.title,
      route: ['/', sibling.path, sibling.courseId, sibling.questionId],
    });
  }
  return members.size > 1 ? [...members.values()].sort((left, right) => left.approach - right.approach) : [];
}

/**
 * Completed ids with each family's plan member added when any of its approaches is complete, so
 * prerequisites, recalls and the daily queue treat "solved with Approach 2" as done.
 */
export function approachCompletedIds(
  completed: ReadonlySet<string>,
  families: PlanApproachFamilies,
): Set<string> {
  const result = new Set(completed);
  for (const [planProblemId, members] of families) {
    if (!result.has(planProblemId) && members.some(({ problemId }) => completed.has(problemId)))
      result.add(planProblemId);
  }
  return result;
}

export const APPROACH_CHOICE_KEY = 'look-ahead.study-plan.approach-choice.v1';
const MAX_REMEMBERED_CHOICES = 500;

export function approachChoiceKey(planKey: string, assignmentId: string): string {
  return `${planKey}|${assignmentId}`;
}

/** Remembered choices, per browser: `<account>:<plan>|<assignment>` -> problem id. */
export function readApproachChoices(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(APPROACH_CHOICE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

export function rememberApproachChoice(
  planKey: string,
  assignmentId: string,
  problemId: string,
): Record<string, string> {
  const key = approachChoiceKey(planKey, assignmentId);
  const current = readApproachChoices();
  if (current[key] === problemId) return current;
  delete current[key];
  const next = Object.fromEntries(
    [...Object.entries(current), [key, problemId] as [string, string]].slice(-MAX_REMEMBERED_CHOICES),
  );
  try {
    localStorage.setItem(APPROACH_CHOICE_KEY, JSON.stringify(next));
  } catch {
    /* Storage can be unavailable; the choice then lasts for this page only. */
  }
  return next;
}

export interface PlanProblemItem {
  problemId: string;
  title: string;
  route: string[];
}

@Injectable({ providedIn: 'root' })
export class StudyPlanApproaches {
  // Resolved on first lookup, so pages that only remember a choice need no content transport.
  private readonly injector = inject(Injector);
  private readonly familyMap = signal<Map<string, PlanApproachMember[]>>(new Map());
  readonly families = this.familyMap.asReadonly();
  readonly choices = signal<Record<string, string>>(readApproachChoices());
  private index?: Promise<Record<string, HandsOnApproachFamily> | null>;
  private readonly requested = new Set<string>();

  /**
   * Family membership for the plan's problems. The Hands-On index carries every family in one
   * cached file; an index built before DLV-962 has no `approachFamilies`, and then only `visible`
   * problems are looked up one detail at a time.
   */
  async resolve(all: PlanProblemItem[], visible: PlanProblemItem[] = all): Promise<void> {
    const families = await this.indexFamilies();
    const pending = (families ? all : visible).filter(({ problemId }) => !this.requested.has(problemId));
    if (!pending.length) return;
    for (const { problemId } of pending) this.requested.add(problemId);
    const found = await Promise.all(
      pending.map(async (item) => {
        const family = families ? families[item.problemId] : await this.detailFamily(item.problemId);
        return [item.problemId, planApproachMembers(item, family)] as const;
      }),
    );
    const additions = found.filter(([, members]) => members.length);
    if (!additions.length) return;
    this.familyMap.update((current) => new Map([...current, ...additions]));
  }

  choose(planKey: string, assignmentId: string, problemId: string): void {
    this.choices.set(rememberApproachChoice(planKey, assignmentId, problemId));
  }

  chosen(planKey: string, assignmentId: string): string | undefined {
    return this.choices()[approachChoiceKey(planKey, assignmentId)];
  }

  private indexFamilies(): Promise<Record<string, HandsOnApproachFamily> | null> {
    this.index ??= (async () => {
      try {
        const index: HandsOnDsaIndex = await firstValueFrom(
          this.injector.get(ContentService).getHandsOnDsaIndex(),
        );
        return index?.approachFamilies ?? null;
      } catch {
        return null;
      }
    })();
    return this.index;
  }

  private async detailFamily(problemId: string): Promise<FamilySource | null> {
    try {
      const problem = await firstValueFrom(this.injector.get(ContentService).getDsaProblem(problemId));
      return problem?.approachFamily ?? null;
    } catch {
      return null;
    }
  }
}
