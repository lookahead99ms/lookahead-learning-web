import { StudyPlan, StudyPlanAssignment } from './study-plan';

/** Explicit authored familiarity is a planning assumption, never completed progress. */
export function assumedStudyPrerequisiteIds(plan: StudyPlan | null): ReadonlySet<string> {
  const template = plan?.template;
  return new Set([
    ...(template?.assumedPrerequisiteIds ?? []),
    ...(template?.days.flatMap((day) =>
      day.sessions
        .filter((session) => session.review?.basis === 'declared-familiarity' && session.contentId)
        .map((session) => session.contentId!),
    ) ?? []),
  ]);
}

/** Authored practice can use the compatible review projection without being recall. */
export function isStudyReview(item: StudyPlanAssignment): boolean {
  return item.templateKind ? item.templateKind === 'review' : item.kind === 'review';
}

export function requiredStudySessionIds(item: StudyPlanAssignment): string[] {
  return [
    ...new Set([
      ...(item.requiredSessionIds ?? []),
      ...(item.requiredSessionId ? [item.requiredSessionId] : []),
      ...(item.reviewSourceSessionId ? [item.reviewSourceSessionId] : []),
    ]),
  ];
}

/** Explicit session dependencies cannot be replaced by canonical content completion. */
export function studySessionDependencySatisfied(
  id: string,
  assignments: readonly StudyPlanAssignment[],
  completed: ReadonlySet<string>,
  outcomes: Readonly<Record<string, string>>,
): boolean {
  const session = assignments.find((item) => item.id === id);
  return (
    completed.has(id) || outcomes[id] === 'completed' || (!!session?.timebox && !!outcomes[id])
  );
}
