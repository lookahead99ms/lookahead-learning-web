import { describe, expect, it } from 'vitest';
import { StudyPlan, StudyPlanAssignment } from './study-plan';
import { previewStudyPlanRecovery } from './study-plan-recovery';

function item(
  id: string,
  minutes = 30,
  extra: Partial<StudyPlanAssignment> = {},
): StudyPlanAssignment {
  return {
    id,
    minutes,
    kind: 'new',
    activity: 'Understand',
    topicId: 'dsa',
    topicTitle: 'DSA',
    title: id,
    courseTitle: 'DSA',
    contentType: 'theory',
    route: ['/learn', id],
    ...extra,
  };
}

function planFor(
  schedule: StudyPlanAssignment[][],
  futureReviews: StudyPlanAssignment[] = [],
): StudyPlan {
  const days = schedule.map((assignments, index) => ({
    day: index + 1,
    phase: 'Learn',
    focus: 'DSA',
    assignments,
    newCount: assignments.filter((assignment) => assignment.kind === 'new').length,
    reviewCount: assignments.filter((assignment) => assignment.kind === 'review').length,
    focusedMinutes: assignments.reduce((sum, assignment) => sum + assignment.minutes, 0),
  }));
  return {
    config: {
      days: days.length,
      dailyHours: 1,
      topicIds: ['dsa'],
      accessTopicIds: ['dsa'],
      goalType: 'interview',
    },
    focusedDailyHours: 1,
    bufferHours: 0,
    includedTopics: [],
    excludedTopics: [],
    days,
    weeks: [{ number: 1, label: 'Learn', days }],
    uniqueNewItems: schedule.flat().filter((assignment) => assignment.kind === 'new').length,
    reviewAssignments: schedule.flat().filter((assignment) => assignment.kind === 'review').length,
    futureReviews,
    remainingNewItems: 2,
  };
}

function ids(plan: StudyPlan): string[][] {
  return plan.days.map((day) => day.assignments.map((assignment) => assignment.id));
}

describe('fixed-window recovery preview', () => {
  it('waits for every required practice session and does not move a dependent ahead of a missing prerequisite', () => {
    const dependent = item('practice', 20, {
      kind: 'review',
      templateKind: 'practice',
      activity: 'Practice',
      sourceContentId: 'content',
      requiredSessionId: 'first',
      requiredSessionIds: ['first', 'second'],
    });
    const original = planFor([[item('first', 60)], [item('second', 60)], [dependent], []]);
    const preview = previewStudyPlanRecovery(original, { currentDay: 2 });
    expect(ids(preview.snapshot)).toEqual([[], ['first'], ['second'], ['practice']]);
    expect(preview.deferred).toEqual([]);
    expect(preview.snapshot.days[3].assignments[0].requiredSessionIds).toEqual(['first', 'second']);
    const missing = planFor([[item('first', 20)], [dependent]]);
    const blocked = previewStudyPlanRecovery(missing, {
      currentDay: 2,
      completedContentIds: ['content'],
    });
    expect(ids(blocked.snapshot)).toEqual([[], ['first']]);
    expect(blocked.deferred[0]).toMatchObject({
      assignment: { id: 'practice' },
      reason: 'review-session',
    });
    expect(blocked.snapshot.futureReviews).toEqual([]);
  });

  it('uses the explicit review source for spacing after all required sessions have been scheduled', () => {
    const review = item('recall', 20, {
      kind: 'review',
      templateKind: 'review',
      sourceContentId: 'content',
      requiredSessionId: 'first',
      requiredSessionIds: ['first', 'second'],
      reviewBasis: 'scheduled-session',
      reviewSourceSessionId: 'second',
      reviewFromDay: 2,
      reviewDueDay: 4,
    });
    const original = planFor([[item('first', 60)], [item('second', 60)], [], [review], []]);
    const preview = previewStudyPlanRecovery(original, { currentDay: 2 });
    expect(ids(preview.snapshot)).toEqual([[], ['first'], ['second'], [], ['recall']]);
    expect(preview.snapshot.days[4].assignments[0]).toMatchObject({
      reviewFromDay: 3,
      reviewDueDay: 5,
      requiredSessionIds: ['first', 'second'],
    });
  });

  it('fits missed work into remaining days and discloses displaced work without changing the window or input', () => {
    const original = planFor([[item('a', 60)], [item('b', 60)], [item('c', 60)]]);
    const before = JSON.stringify(original);
    const preview = previewStudyPlanRecovery(original, { currentDay: 2 });
    expect(ids(preview.snapshot)).toEqual([[], ['a'], ['b']]);
    expect(preview.deferred.map(({ assignment, reason }) => [assignment.id, reason])).toEqual([
      ['c', 'remaining-capacity'],
    ]);
    expect(preview.moved).toEqual([
      { assignmentId: 'a', fromDay: 1, toDay: 2 },
      { assignmentId: 'b', fromDay: 2, toDay: 3 },
    ]);
    expect(preview.snapshot.config).toEqual(original.config);
    expect(preview.snapshot.days).toHaveLength(3);
    expect(preview.snapshot.remainingNewItems).toBe(3);
    expect(JSON.stringify(original)).toBe(before);
    expect(preview.snapshot.weeks[0].days[1]).toBe(preview.snapshot.days[1]);
  });

  it('retains completed work and recorded attempts in their original days without inventing completion', () => {
    const original = planFor([
      [item('done'), item('attempt', 30, { timebox: true })],
      [item('next')],
      [],
    ]);
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 2,
      completedAssignmentIds: ['done'],
      sessionOutcomes: { attempt: 'needs-review' },
    });
    expect(ids(preview.snapshot)).toEqual([['done', 'attempt'], ['next'], []]);
    expect(preview.moved).toEqual([]);
    expect(preview.snapshot.config.completedContentIds).toBeUndefined();
  });

  it('recognizes known full-content completion and reserves remaining-day completed work before packing', () => {
    const original = planFor([[item('done', 60)], [item('reserved', 45), item('next', 15)], []]);
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 2,
      completedContentIds: ['done'],
      completedAssignmentIds: ['reserved'],
    });
    expect(ids(preview.snapshot)).toEqual([['done'], ['reserved', 'next'], []]);
    expect(preview.snapshot.days.every((day) => day.focusedMinutes <= 60)).toBe(true);
  });

  it('keeps planned prerequisites before dependent work and defers missing prerequisites', () => {
    const original = planFor([
      [item('base', 60)],
      [item('dependent', 60, { prerequisiteIds: ['base'] })],
      [item('blocked', 10, { prerequisiteIds: ['unknown'] })],
    ]);
    const preview = previewStudyPlanRecovery(original, { currentDay: 2 });
    expect(ids(preview.snapshot)).toEqual([[], ['base'], ['dependent']]);
    expect(preview.deferred[0].reason).toBe('prerequisite');
  });

  it('does not treat an attempted timebox as completed prerequisite content', () => {
    const original = planFor([
      [item('attempt', 20, { timebox: true, sourceContentId: 'base' })],
      [item('dependent', 30, { prerequisiteIds: ['base'] })],
    ]);
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 2,
      sessionOutcomes: { attempt: 'attempted' },
    });
    expect(ids(preview.snapshot)).toEqual([['attempt'], []]);
    expect(preview.deferred[0].reason).toBe('prerequisite');
  });

  it('does not unlock dependent work when a full session explicitly still needs review', () => {
    const original = planFor([
      [item('base')],
      [item('dependent', 30, { prerequisiteIds: ['base'] })],
    ]);
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 2,
      sessionOutcomes: { base: 'needs-review' },
    });
    expect(ids(preview.snapshot)).toEqual([['base'], []]);
    expect(preview.deferred[0].reason).toBe('prerequisite');
  });

  it('moves reviews with their parent and preserves the original retrieval interval', () => {
    const review = item('a:review:v2:2', 20, {
      kind: 'review',
      sourceContentId: 'a',
      reviewFromDay: 1,
      reviewDueDay: 3,
    });
    const original = planFor([[item('a', 30)], [], [review], []]);
    const preview = previewStudyPlanRecovery(original, { currentDay: 2 });
    expect(ids(preview.snapshot)).toEqual([[], ['a'], [], ['a:review:v2:2']]);
    expect(preview.snapshot.days[3].assignments[0]).toMatchObject({
      reviewFromDay: 2,
      reviewDueDay: 4,
    });
  });

  it('allows an attempted parent session to unlock review without marking the content mastered', () => {
    const review = item('review', 20, {
      kind: 'review',
      sourceContentId: 'a',
      requiredSessionId: 'session',
      reviewDueDay: 2,
    });
    const original = planFor([
      [item('session', 30, { sourceContentId: 'a', timebox: true })],
      [review],
    ]);
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 2,
      sessionOutcomes: { session: 'attempted' },
    });
    expect(ids(preview.snapshot)).toEqual([['session'], ['review']]);
    expect(preview.deferred).toEqual([]);
  });

  it('does not substitute content completion for a specifically required session or compress review spacing', () => {
    const missing = item('review-missing', 20, {
      kind: 'review',
      sourceContentId: 'a',
      requiredSessionId: 'missing',
      reviewDueDay: 2,
    });
    const tooLate = item('b:review:v2:2', 20, {
      kind: 'review',
      sourceContentId: 'b',
      reviewFromDay: 1,
      reviewDueDay: 3,
    });
    const original = planFor([[item('b')], [missing], [tooLate]]);
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 3,
      completedContentIds: ['a'],
    });
    expect(preview.deferred.map(({ assignment, reason }) => [assignment.id, reason])).toEqual([
      ['review-missing', 'review-session'],
      ['b:review:v2:2', 'review-spacing'],
    ]);
    expect(preview.snapshot.futureReviews).toHaveLength(2);
    expect(
      preview.snapshot.futureReviews?.find((review) => review.id === 'b:review:v2:2')?.reviewDueDay,
    ).toBe(5);
  });

  it('preserves review order with at most one review per source per day', () => {
    const review = (id: string, minutes: number) =>
      item(id, minutes, {
        kind: 'review',
        sourceContentId: 'a',
        reviewFromDay: 1,
        reviewDueDay: 2,
      });
    const original = planFor([
      [item('a')],
      [item('reserved', 40), review('first-review', 30)],
      [review('second-review', 20)],
      [],
    ]);
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 2,
      completedAssignmentIds: ['a', 'reserved'],
    });
    expect(ids(preview.snapshot)).toEqual([
      ['a'],
      ['reserved'],
      ['first-review'],
      ['second-review'],
    ]);
  });

  it('retains beyond-window reviews as deferred work and includes due future reviews only when they fit', () => {
    const review = (id: string, due: number) =>
      item(id, 20, { kind: 'review', sourceContentId: 'a', reviewFromDay: 1, reviewDueDay: due });
    const original = planFor([[item('a')], [], []], [review('due', 2), review('future', 8)]);
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 2,
      completedAssignmentIds: ['a'],
    });
    expect(ids(preview.snapshot)).toEqual([['a'], ['due'], []]);
    expect(preview.deferred.map(({ assignment, reason }) => [assignment.id, reason])).toEqual([
      ['future', 'review-spacing'],
    ]);
    expect(preview.snapshot.overdueReviewCount).toBe(0);
  });

  it('reports ended windows and oversized assignments instead of extending or splitting them', () => {
    const original = planFor([[item('large', 70)], [item('normal', 30)]]);
    const preview = previewStudyPlanRecovery(original, { currentDay: 2 });
    expect(preview.deferred[0].reason).toBe('daily-budget');
    const ended = previewStudyPlanRecovery(original, {
      currentDay: 3,
      completedAssignmentIds: ['normal'],
    });
    expect(ids(ended.snapshot)).toEqual([[], ['normal']]);
    expect(ended.deferred[0].reason).toBe('window-ended');
    expect(ended.snapshot.days).toHaveLength(2);
  });

  it('rejects invalid windows, duplicate assignments and impossible recorded budgets', () => {
    expect(() => previewStudyPlanRecovery(planFor([[]]), { currentDay: 0 })).toThrow();
    expect(() =>
      previewStudyPlanRecovery(planFor([[item('a')], [item('a')]]), { currentDay: 2 }),
    ).toThrow(/unique/);
    expect(() =>
      previewStudyPlanRecovery(planFor([[item('a', 70)]]), {
        currentDay: 1,
        completedAssignmentIds: ['a'],
      }),
    ).toThrow(/exceeds/);
  });

  it('reconsiders deferred new work after an explicit extension without extending the window itself', () => {
    const original = planFor([[item('a', 60)], [item('b', 60)], [item('c', 60)]]);
    const first = previewStudyPlanRecovery(original, { currentDay: 2 });
    expect(first.deferred.map(({ assignment }) => assignment.id)).toEqual(['c']);
    const extended = planFor([...first.snapshot.days.map((day) => day.assignments), []]);
    extended.remainingNewItems = first.snapshot.remainingNewItems;
    const before = JSON.stringify(first.deferred);
    const second = previewStudyPlanRecovery(extended, {
      currentDay: 4,
      completedAssignmentIds: ['a', 'b'],
      deferredSessions: first.deferred,
    });
    expect(ids(second.snapshot)).toEqual([[], ['a'], ['b'], ['c']]);
    expect(second.deferred).toEqual([]);
    expect(second.moved).toEqual([{ assignmentId: 'c', fromDay: 3, toDay: 4 }]);
    expect(second.snapshot.days).toHaveLength(4);
    expect(second.snapshot.days.every((day) => day.focusedMinutes <= 60)).toBe(true);
    expect(second.snapshot.remainingNewItems).toBe(original.remainingNewItems);
    expect(JSON.stringify(first.deferred)).toBe(before);
  });

  it('deduplicates the ledger against days and future reviews and never repeats recorded deferred work', () => {
    const review = item('review', 20, {
      kind: 'review',
      sourceContentId: 'a',
      reviewFromDay: 1,
      reviewDueDay: 3,
    });
    const original = planFor([[item('a')], [], []], [review]);
    const deferredSessions = [
      { assignment: item('a'), originalDay: 1, reason: 'remaining-capacity' as const },
      {
        assignment: { ...review, reviewDueDay: 2 },
        originalDay: 2,
        reason: 'remaining-capacity' as const,
      },
      { assignment: item('already-done'), originalDay: 1, reason: 'remaining-capacity' as const },
    ];
    const preview = previewStudyPlanRecovery(original, {
      currentDay: 2,
      completedAssignmentIds: ['a', 'already-done'],
      deferredSessions,
    });
    expect(ids(preview.snapshot)).toEqual([['a'], [], ['review']]);
    expect(preview.deferred).toEqual([]);
  });

  it('keeps original timing in the deferred ledger and adjusted timing in projected future reviews', () => {
    const review = item('review', 20, {
      kind: 'review',
      sourceContentId: 'a',
      reviewFromDay: 1,
      reviewDueDay: 3,
    });
    const original = planFor([[item('a')], [], [review]]);
    const preview = previewStudyPlanRecovery(original, { currentDay: 3 });
    expect(preview.deferred[0]).toMatchObject({ originalDay: 3, assignment: review });
    expect(preview.snapshot.futureReviews?.[0]).toMatchObject({
      reviewFromDay: 3,
      reviewDueDay: 5,
    });
  });
});
