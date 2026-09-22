import { StudyPlan, StudyPlanAssignment } from '../../content/study-plan';
import { StudyLogEntry, findStudyActivity, studyDayQueue } from '../../content/study-plan-daily';

export interface StudyDeskActivity {
  assignment: StudyPlanAssignment;
  day: number;
  outsideWindow: boolean;
}

/** A view of the saved schedule. Browsing never changes this recommendation or its pins. */
export function studyDeskActivities(
  plan: StudyPlan,
  completed: ReadonlySet<string>,
  outcomes: Record<string, string>,
  log: StudyLogEntry[],
  minimumDay: number,
  completionDays: boolean,
  canAccess: (item: StudyPlanAssignment) => boolean,
) {
  const anchorDay = Math.min(
    plan.config.days,
    Math.max(1, minimumDay, ...log.map((entry) => entry.day)),
  );
  const entries = new Map<string, StudyDeskActivity>();
  for (const day of plan.days) {
    for (const assignment of day.assignments)
      entries.set(assignment.id, { assignment, day: day.day, outsideWindow: false });
  }
  for (const assignment of plan.futureReviews ?? []) {
    if (!entries.has(assignment.id))
      entries.set(assignment.id, {
        assignment,
        day: assignment.reviewDueDay ?? plan.config.days + 1,
        outsideWindow: (assignment.reviewDueDay ?? Infinity) > plan.config.days,
      });
  }
  for (const entry of log) {
    const assignment = findStudyActivity(plan, entry.assignmentId, entry.day);
    if (assignment && !entries.has(assignment.id))
      entries.set(assignment.id, { assignment, day: entry.day, outsideWindow: false });
  }
  let resume: StudyDeskActivity | null = null;
  const days = [...new Set([anchorDay, ...plan.days.map((day) => day.day)])]
    .filter((day) => day >= anchorDay)
    .sort((a, b) => a - b);
  for (const day of days) {
    const next = studyDayQueue(plan, day, completed, outcomes, log, completionDays, canAccess)
      .selected[0];
    if (next) {
      resume = { assignment: next, day, outsideWindow: false };
      if (!entries.has(next.id)) entries.set(next.id, resume);
      break;
    }
  }
  return { entries: [...entries.values()], resume, anchorDay };
}

export interface StudyDeskEntry extends StudyDeskActivity {
  sourceId: string;
  route: string[];
  query: Record<string, string | number>;
  unavailableReason: string;
  completed: boolean;
  outcome: string;
  note: string;
  refreshLinks: { title: string; route: string[] }[];
}
