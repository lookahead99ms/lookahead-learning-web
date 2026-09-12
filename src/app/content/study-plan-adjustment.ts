import { StudyPlan } from './study-plan';
import { isStudyReview } from './study-plan-dependencies';
import { studyDayQueue } from './study-plan-daily';
import {
  previewStudyPlanRecovery,
  StudyPlanRecoveryProgress,
  StudyPlanRecoveryPreview,
} from './study-plan-recovery';

export type AdjustmentEvaluation =
  | { kind: 'proposal'; preview: StudyPlanRecoveryPreview }
  | { kind: 'no-unfinished-work' | 'no-accepted-proposal' | 'evaluation-failure' };

/** A suggestion must find room for unfinished work without dropping scheduled work. */
export function evaluateStudyPlanAdjustment(
  plan: StudyPlan,
  progress: StudyPlanRecoveryProgress,
  queue: ReturnType<typeof studyDayQueue>,
  eligibleDeferredIds: ReadonlySet<string>,
): AdjustmentEvaluation {
  const unfinished = queue.deferred.filter(
    (item) => !isStudyReview(item) && eligibleDeferredIds.has(item.id),
  );
  if (!unfinished.length) return { kind: 'no-unfinished-work' };
  try {
    const preview = previewStudyPlanRecovery(plan, progress);
    if (!preview.moved.some((move) => unfinished.some((item) => item.id === move.assignmentId)))
      return { kind: 'no-accepted-proposal' };
    const scheduledIds = new Set(
      plan.days.flatMap((day) => day.assignments.map((item) => item.id)),
    );
    if (preview.deferred.some((item) => scheduledIds.has(item.assignment.id)))
      return { kind: 'no-accepted-proposal' };
    const today = preview.snapshot.days.find((day) => day.day === progress.currentDay);
    if (!today) return { kind: 'no-accepted-proposal' };
    // Today's reserved recall and actual recorded time cannot be traded away to fit a lesson.
    if (
      queue.selected.some(
        (item) => scheduledIds.has(item.id) && !today.assignments.some((a) => a.id === item.id),
      )
    )
      return { kind: 'no-accepted-proposal' };
    const completed = new Set(progress.completedAssignmentIds ?? []);
    const planned = today.assignments.filter(
      (item) => !completed.has(item.id) && !progress.sessionOutcomes?.[item.id],
    );
    if (queue.spent + planned.reduce((sum, item) => sum + item.minutes, 0) > queue.budget)
      return { kind: 'no-accepted-proposal' };
    return { kind: 'proposal', preview };
  } catch {
    return { kind: 'evaluation-failure' };
  }
}

export function suggestStudyPlanAdjustment(
  plan: StudyPlan,
  progress: StudyPlanRecoveryProgress,
  queue: ReturnType<typeof studyDayQueue>,
  eligibleDeferredIds: ReadonlySet<string>,
): StudyPlanRecoveryPreview | null {
  const result = evaluateStudyPlanAdjustment(plan, progress, queue, eligibleDeferredIds);
  return result.kind === 'proposal' ? result.preview : null;
}

/** Local UI preference fingerprint; never an authorization or integrity check. */
export function adjustmentFingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let left = 2166136261,
    right = 5381;
  for (let i = 0; i < text.length; i++) {
    left = Math.imul(left ^ text.charCodeAt(i), 16777619);
    right = Math.imul(right, 33) ^ text.charCodeAt(i);
  }
  return `${(left >>> 0).toString(16)}-${(right >>> 0).toString(16)}`;
}
