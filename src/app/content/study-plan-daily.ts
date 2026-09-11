import { StudyPlan, StudyPlanAssignment } from './study-plan';

export interface StudyLogEntry {
  assignmentId: string;
  day: number;
  minutes: number;
  recordedAt: string;
}
export const DAILY_RECALL_MINUTES = 10;
const dailyMarker = ':daily-recall:';
const source = (a: StudyPlanAssignment) =>
  a.sourceContentId ?? a.id.replace(/:review:(?:v2:)?\d+$/, '');
export const isDailyRecall = (a: StudyPlanAssignment) => a.id.includes(dailyMarker);
const assignments = (plan: StudyPlan) => [
  ...plan.days.flatMap((d) => d.assignments),
  ...(plan.futureReviews ?? []),
];

/** Dynamic recall uses an owned original's route and identity; it adds no catalog access. */
export function findStudyActivity(
  plan: StudyPlan,
  id: string,
  day: number,
): StudyPlanAssignment | null {
  const all = assignments(plan),
    existing = all.find((a) => a.id === id);
  if (existing) return existing;
  const suffix = `${dailyMarker}${day}`;
  if (!Number.isInteger(day) || day < 1 || day > plan.config.days || !id.endsWith(suffix))
    return null;
  const original = all.find((a) => a.kind === 'new' && a.id === id.slice(0, -suffix.length));
  return original
    ? {
        ...original,
        id,
        kind: 'review',
        activity: 'Recall',
        timebox: false,
        minutes: DAILY_RECALL_MINUTES,
        sourceContentId: source(original),
        requiredSessionId: original.id,
        reviewDueDay: day,
        instructions:
          'Recall the main idea and explain it before reopening the answer. Record this recall separately from the original learning.',
      }
    : null;
}

/** Count one estimated activity allocation per session/day, even after a retry or undo. */
export function recordStudyLog(
  log: StudyLogEntry[] = [],
  item: StudyPlanAssignment,
  day: number,
): StudyLogEntry[] {
  if (log.some((entry) => entry.assignmentId === item.id && entry.day === day)) return log;
  return [
    ...log,
    { assignmentId: item.id, day, minutes: item.minutes, recordedAt: new Date().toISOString() },
  ];
}
export function validStudyLog(value: unknown): value is StudyLogEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= 20000 &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.assignmentId === 'string' &&
        entry.assignmentId.length <= 300 &&
        Number.isInteger(entry.day) &&
        entry.day >= 1 &&
        entry.day <= 180 &&
        Number.isFinite(entry.minutes) &&
        entry.minutes >= 1 &&
        entry.minutes <= 900 &&
        typeof entry.recordedAt === 'string' &&
        Number.isFinite(Date.parse(entry.recordedAt)),
    ) &&
    new Set(value.map((entry) => JSON.stringify([entry.assignmentId, entry.day]))).size ===
      value.length
  );
}

/** Derive today's work without rewriting immutable schedules or inventing old completion dates. */
export function studyDayQueue(
  plan: StudyPlan,
  day: number,
  completed: ReadonlySet<string>,
  outcomes: Record<string, string> = {},
  log: StudyLogEntry[] = [],
  completionDays = true,
  canAccess: (item: StudyPlanAssignment) => boolean = () => true,
) {
  const all = assignments(plan);
  const scheduledDay = (a: StudyPlanAssignment) =>
    plan.days.find((d) => d.assignments.some((item) => item.id === a.id))?.day ??
    a.reviewDueDay ??
    Infinity;
  const original = (a: StudyPlanAssignment) =>
    all.find(
      (item) =>
        item.kind === 'new' &&
        (a.requiredSessionId ? item.id === a.requiredSessionId : source(item) === source(a)),
    );
  const finished = (a: StudyPlanAssignment) => completed.has(a.id) || !!outcomes[a.id];
  const latestDay = (id: string) =>
    log.filter((e) => e.assignmentId === id).reduce((n, e) => Math.max(n, e.day), 0);
  const originalDay = (a: StudyPlanAssignment) => {
    const first = original(a);
    return first ? latestDay(first.id) || scheduledDay(first) : (a.reviewFromDay ?? 0);
  };
  const eligible = (a: StudyPlanAssignment) => {
    if (!canAccess(a)) return false;
    if ((a.prerequisiteIds ?? []).some((id) => !completed.has(id))) return false;
    if (a.kind !== 'review') return true;
    const first = original(a);
    if (a.requiredSessionId && first?.timebox && outcomes[first.id]) return originalDay(a) < day;
    return completed.has(source(a)) && (!completionDays || originalDay(a) < day);
  };
  const dueDay = (a: StudyPlanAssignment) => {
    const scheduled = a.reviewDueDay ?? scheduledDay(a);
    if (!completionDays || a.kind !== 'review') return scheduledDay(a);
    const first = original(a),
      actualDay = first ? latestDay(first.id) : 0;
    if (!actualDay) return scheduled;
    const interval = Math.max(1, scheduled - (a.reviewFromDay ?? scheduledDay(first!)));
    return actualDay + interval;
  };
  const current = plan.days.find((d) => d.day === day)?.assignments ?? [];
  const unique = [...new Map(all.map((a) => [a.id, a])).values()];
  const pending = unique.filter((a) => !finished(a) && dueDay(a) <= day);
  const recalls = pending
    .filter((a) => a.kind === 'review' && eligible(a))
    .sort((a, b) => dueDay(a) - dueDay(b) || a.id.localeCompare(b.id));
  const reviewedToday = new Set(
    log
      .filter((e) => e.day === day)
      .flatMap((e) => {
        const item = findStudyActivity(plan, e.assignmentId, day);
        return item?.kind === 'review' ? [source(item)] : [];
      }),
  );
  // A short daily recall fills days without an eligible interval review. Rotate least-recently recalled originals.
  let daily: StudyPlanAssignment | null = null;
  if (
    completionDays &&
    !recalls.length &&
    !reviewedToday.size &&
    !current.some((a) => a.kind === 'review' && finished(a))
  ) {
    const candidates = unique.filter(
      (a) =>
        a.kind === 'new' &&
        canAccess(a) &&
        (completed.has(source(a)) || (a.timebox && outcomes[a.id])) &&
        (latestDay(a.id) || scheduledDay(a)) < day,
    );
    const lastRecall = (a: StudyPlanAssignment) =>
      log.reduce(
        (last, e) => {
          const item = findStudyActivity(plan, e.assignmentId, e.day);
          return item?.kind === 'review' && source(item) === source(a)
            ? Math.max(last, e.day)
            : last;
        },
        latestDay(a.id) || scheduledDay(a),
      );
    candidates.sort((a, b) => lastRecall(a) - lastRecall(b) || a.id.localeCompare(b.id));
    if (candidates[0])
      daily = findStudyActivity(plan, `${candidates[0].id}${dailyMarker}${day}`, day);
  }
  const ordered = [
    ...recalls,
    ...(daily ? [daily] : []),
    ...pending.filter((a) => a.kind !== 'review' && scheduledDay(a) < day),
    ...pending.filter((a) => a.kind !== 'review' && scheduledDay(a) === day),
  ];
  const budget = Math.round(plan.focusedDailyHours * 60);
  const loggedIds = new Set(log.map((e) => e.assignmentId));
  const spent =
    log.filter((e) => e.day === day).reduce((n, e) => n + e.minutes, 0) +
    current.filter((a) => finished(a) && !loggedIds.has(a.id)).reduce((n, a) => n + a.minutes, 0);
  let remaining = Math.max(0, budget - spent);
  const selected: StudyPlanAssignment[] = [],
    deferred: StudyPlanAssignment[] = [];
  const recalledSources = new Set(reviewedToday);
  for (const item of ordered) {
    if (
      eligible(item) &&
      item.minutes <= remaining &&
      (item.kind !== 'review' || !recalledSources.has(source(item)))
    ) {
      selected.push(item);
      remaining -= item.minutes;
      if (item.kind === 'review') recalledSources.add(source(item));
    } else deferred.push(item);
  }
  const blocked = pending.filter((a) => a.kind === 'review' && !eligible(a));
  return {
    selected,
    deferred: [...deferred, ...blocked],
    budget,
    spent,
    minutes: selected.reduce((n, a) => n + a.minutes, 0),
    remaining,
    allDue: [...pending, ...(daily ? [daily] : [])],
  };
}
