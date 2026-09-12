import { StudyPlan, StudyPlanAssignment, StudyPlanDay } from './study-plan';
import {
  assumedStudyPrerequisiteIds,
  isStudyReview,
  requiredStudySessionIds,
} from './study-plan-dependencies';

export interface StudyPlanRecoveryProgress {
  /** First day available for recovery, 1-based. days + 1 means the window has ended. */
  currentDay: number;
  completedAssignmentIds?: readonly string[];
  completedContentIds?: readonly string[];
  sessionOutcomes?: Readonly<Record<string, 'attempted' | 'needs-review' | 'completed'>>;
  /** Previously disclosed work, reconsidered after an explicit extension or later recovery. */
  deferredSessions?: ReadonlyArray<StudyPlanRecoveryPreview['deferred'][number]>;
}

export type StudyPlanDeferralReason =
  | 'window-ended'
  | 'daily-budget'
  | 'prerequisite'
  | 'review-session'
  | 'review-spacing'
  | 'remaining-capacity';

export interface StudyPlanRecoveryPreview {
  currentDay: number;
  snapshot: StudyPlan;
  deferred: {
    assignment: StudyPlanAssignment;
    originalDay: number | null;
    reason: StudyPlanDeferralReason;
  }[];
  moved: { assignmentId: string; fromDay: number | null; toDay: number }[];
}

interface RecoveryEntry {
  assignment: StudyPlanAssignment;
  originalDay: number | null;
}

/**
 * Produces a proposal only. Callers must display deferred work and obtain confirmation
 * before saving a new version. The old version remains the historical schedule.
 * No dates, durations, access grants, completion records or content are invented.
 */
export function previewStudyPlanRecovery(
  plan: StudyPlan,
  progress: StudyPlanRecoveryProgress,
): StudyPlanRecoveryPreview {
  const { currentDay } = progress;
  if (!Number.isInteger(currentDay) || currentDay < 1 || currentDay > plan.config.days + 1) {
    throw new Error('Recovery day must be within the plan or the first day after its end.');
  }
  const budget = Math.floor(Math.min(plan.config.dailyHours, plan.focusedDailyHours) * 60);
  if (!Number.isFinite(budget) || budget <= 0 || plan.days.length !== plan.config.days) {
    throw new Error('Recovery requires a valid fixed plan window and daily budget.');
  }
  plan = structuredClone(plan);
  const assumedPrerequisites = assumedStudyPrerequisiteIds(plan);
  const dayBudget = (day: number) =>
    Math.max(
      0,
      budget - (plan.template?.days.find((entry) => entry.day === day)?.recoveryMinutes ?? 0),
    );
  const completedAssignments = new Set(progress.completedAssignmentIds ?? []);
  const completedContent = new Set([
    ...(plan.config.completedContentIds ?? []),
    ...(progress.completedContentIds ?? []),
  ]);
  const outcomes = progress.sessionOutcomes ?? {};
  const recorded = (item: StudyPlanAssignment) =>
    completedAssignments.has(item.id) ||
    Object.hasOwn(outcomes, item.id) ||
    (item.kind === 'new' && !item.timebox && completedContent.has(sourceId(item)));
  const entries: RecoveryEntry[] = [];
  const originalSessionDays = new Map<string, number>();
  const seenIds = new Set<string>();
  const days: StudyPlanDay[] = plan.days.map((day, index) => {
    if (day.day !== index + 1) throw new Error('Recovery requires consecutive plan days.');
    const retained: StudyPlanAssignment[] = [];
    for (const assignment of day.assignments) {
      if (seenIds.has(assignment.id)) throw new Error('Recovery requires unique assignment IDs.');
      if (!Number.isFinite(assignment.minutes) || assignment.minutes <= 0) {
        throw new Error('Recovery requires positive assignment durations.');
      }
      seenIds.add(assignment.id);
      originalSessionDays.set(assignment.id, day.day);
      if (recorded(assignment)) retained.push({ ...assignment });
      else entries.push({ assignment: { ...assignment }, originalDay: day.day });
    }
    const retainedMinutes = retained.reduce((sum, item) => sum + item.minutes, 0);
    if (day.day >= currentDay && retainedMinutes > dayBudget(day.day)) {
      throw new Error('Recorded work already exceeds this day’s budget; it cannot be moved.');
    }
    return { ...day, assignments: retained };
  });
  for (const assignment of plan.futureReviews ?? []) {
    if (seenIds.has(assignment.id)) continue;
    if (
      !isStudyReview(assignment) ||
      !Number.isFinite(assignment.minutes) ||
      assignment.minutes <= 0
    ) {
      throw new Error('Future reviews must have valid review durations.');
    }
    seenIds.add(assignment.id);
    if (!recorded(assignment)) entries.push({ assignment: { ...assignment }, originalDay: null });
  }
  for (const entry of progress.deferredSessions ?? []) {
    const { assignment, originalDay } = entry;
    // Current scheduled/future-review records are authoritative, including any
    // review timing already projected by the accepted preceding recovery.
    if (seenIds.has(assignment.id)) continue;
    if (
      !Number.isFinite(assignment.minutes) ||
      assignment.minutes <= 0 ||
      (originalDay !== null && (!Number.isInteger(originalDay) || originalDay < 1))
    ) {
      throw new Error('Deferred sessions require valid durations and original days.');
    }
    seenIds.add(assignment.id);
    if (originalDay !== null) originalSessionDays.set(assignment.id, originalDay);
    if (!recorded(assignment))
      entries.push({ assignment: structuredClone(assignment), originalDay });
  }

  const sessionDays = new Map<string, number>();
  const contentDays = new Map<string, number>([...completedContent].map((id) => [id, 0]));
  const lastReviewDay = new Map<string, number>();
  const remember = (item: StudyPlanAssignment, day: number) => {
    sessionDays.set(item.id, day);
    if (isStudyReview(item)) {
      lastReviewDay.set(sourceId(item), day);
    } else if (
      !item.timebox &&
      (!recorded(item) ||
        completedAssignments.has(item.id) ||
        completedContent.has(sourceId(item)) ||
        outcomes[item.id] === 'completed')
    ) {
      // Scheduled prerequisites establish order, not mastery. The existing runtime
      // completion gate must still be checked when opening the dependent session.
      contentDays.set(sourceId(item), day);
    }
  };
  // Outcomes without a known original slot do not fabricate a date or satisfy
  // retrieval timing. Known recorded sessions are seeded as their day is visited.
  const moved: StudyPlanRecoveryPreview['moved'] = [];
  const pending = [...entries];
  const reviewParentId = (item: StudyPlanAssignment) =>
    item.reviewSourceSessionId ??
    item.requiredSessionId ??
    requiredStudySessionIds(item)[0] ??
    sourceId(item);
  const minimumDay = (entry: RecoveryEntry): number => {
    const item = entry.assignment;
    let earliest = Math.max(currentDay, entry.originalDay ?? item.reviewDueDay ?? currentDay);
    if (isStudyReview(item)) {
      const parentId = reviewParentId(item);
      const parentDay =
        item.reviewBasis === 'declared-familiarity'
          ? undefined
          : (sessionDays.get(parentId) ?? contentDays.get(sourceId(item)));
      if (parentDay !== undefined) {
        const originalParentDay = originalSessionDays.get(parentId) ?? item.reviewFromDay;
        const originalDueDay = item.reviewDueDay ?? entry.originalDay;
        const spacing =
          originalParentDay !== undefined && originalDueDay !== null && originalDueDay !== undefined
            ? Math.max(1, originalDueDay - originalParentDay)
            : 1;
        earliest = Math.max(earliest, parentDay + spacing);
      }
      earliest = Math.max(earliest, (lastReviewDay.get(sourceId(item)) ?? -1) + 1);
    }
    return earliest;
  };
  const dependenciesReady = (item: StudyPlanAssignment): boolean =>
    (item.prerequisiteIds ?? []).every((id) => contentDays.has(id) || assumedPrerequisites.has(id));
  const sessionReady = (item: StudyPlanAssignment): boolean => {
    const required = requiredStudySessionIds(item);
    if (!required.every((id) => sessionDays.has(id))) return false;
    return (
      !isStudyReview(item) ||
      item.reviewBasis === 'declared-familiarity' ||
      required.length > 0 ||
      sessionDays.has(sourceId(item)) ||
      contentDays.has(sourceId(item))
    );
  };

  for (const day of days) {
    // Retained recorded work can unlock its dependent work on this day, but cannot
    // retroactively unlock earlier days when a learner completed ahead of schedule.
    for (const item of day.assignments) remember(item, day.day);
    if (day.day < currentDay) continue;
    let left = dayBudget(day.day) - day.assignments.reduce((sum, item) => sum + item.minutes, 0);
    for (let index = 0; index < pending.length;) {
      const entry = pending[index];
      const item = entry.assignment;
      const earlierReviewPending =
        isStudyReview(item) &&
        pending
          .slice(0, index)
          .some(
            (earlier) =>
              isStudyReview(earlier.assignment) && sourceId(earlier.assignment) === sourceId(item),
          );
      if (
        item.minutes > left ||
        earlierReviewPending ||
        !dependenciesReady(item) ||
        !sessionReady(item) ||
        minimumDay(entry) > day.day
      ) {
        index++;
        continue;
      }
      const scheduled = { ...item };
      if (isStudyReview(scheduled)) {
        const parentDay = sessionDays.get(reviewParentId(scheduled));
        if (scheduled.reviewFromDay !== undefined && parentDay !== undefined)
          scheduled.reviewFromDay = parentDay;
        scheduled.reviewDueDay = minimumDay(entry);
      }
      day.assignments.push(scheduled);
      left -= scheduled.minutes;
      remember(scheduled, day.day);
      if (entry.originalDay !== day.day)
        moved.push({ assignmentId: item.id, fromDay: entry.originalDay, toDay: day.day });
      pending.splice(index, 1);
    }
  }

  const deferred = pending.map((entry): StudyPlanRecoveryPreview['deferred'][number] => ({
    ...entry,
    // The ledger preserves its source assignment for audit/import validation.
    // Proposed review timing belongs to snapshot.futureReviews, not this record.
    reason:
      currentDay > plan.config.days
        ? 'window-ended'
        : entry.assignment.minutes > budget
          ? 'daily-budget'
          : !dependenciesReady(entry.assignment)
            ? 'prerequisite'
            : !sessionReady(entry.assignment)
              ? 'review-session'
              : minimumDay(entry) > plan.config.days
                ? 'review-spacing'
                : 'remaining-capacity',
  }));
  for (const day of days) {
    day.newCount = day.assignments.filter((item) => item.kind === 'new').length;
    day.reviewCount = day.assignments.length - day.newCount;
    day.focusedMinutes = day.assignments.reduce((sum, item) => sum + item.minutes, 0);
    day.bufferMinutes = Math.max(0, budget - day.focusedMinutes);
    day.focus =
      [...new Set(day.assignments.map((item) => item.topicTitle))].slice(0, 2).join(' + ') ||
      (day.day < currentDay
        ? 'Elapsed day; unfinished work reviewed for recovery'
        : 'No additional work fits this day');
  }
  const weeks = plan.weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => days[day.day - 1]),
  }));
  const assignments = days.flatMap((day) => day.assignments);
  const uniqueNewItems = new Set(assignments.filter((item) => item.kind === 'new').map(sourceId))
    .size;
  const futureReviews = deferred
    .filter(({ assignment }) => isStudyReview(assignment))
    .map((entry) => {
      const assignment = entry.assignment;
      const parentDay = sessionDays.get(reviewParentId(assignment));
      return {
        ...assignment,
        reviewDueDay: minimumDay(entry),
        ...(assignment.reviewFromDay !== undefined && parentDay !== undefined
          ? { reviewFromDay: parentDay }
          : {}),
      };
    });
  return {
    currentDay,
    moved,
    deferred,
    snapshot: {
      ...plan,
      days,
      weeks,
      uniqueNewItems,
      reviewAssignments: assignments.filter((item) => item.kind === 'review').length,
      remainingNewItems: Math.max(
        0,
        (plan.remainingNewItems ?? 0) + plan.uniqueNewItems - uniqueNewItems,
      ),
      futureReviews,
      overdueReviewCount: futureReviews.filter(
        (item) => (item.reviewDueDay ?? Infinity) <= plan.config.days,
      ).length,
      topicCoverage: plan.topicCoverage?.map((topic) => {
        const items = assignments.filter((item) => item.topicId === topic.id);
        return {
          ...topic,
          scheduledItems: items.filter((item) => item.kind === 'new').length,
          minutes: items.reduce((sum, item) => sum + item.minutes, 0),
          representedOutcomes: new Set(items.map((item) => item.coverageKey).filter(Boolean)).size,
        };
      }),
    },
  };
}

function sourceId(item: StudyPlanAssignment): string {
  return item.sourceContentId ?? item.id.replace(/:review.*$/, '');
}
