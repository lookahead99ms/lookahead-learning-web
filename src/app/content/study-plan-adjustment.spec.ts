import { expect, it } from 'vitest';
import { StudyPlan, StudyPlanAssignment } from './study-plan';
import { studyDayQueue } from './study-plan-daily';
import {
  adjustmentFingerprint,
  evaluateStudyPlanAdjustment,
  suggestStudyPlanAdjustment,
} from './study-plan-adjustment';

function fixture(days = 7): StudyPlan {
  const original = (id: string, minutes: number): StudyPlanAssignment => ({
    id,
    minutes,
    title: id,
    kind: 'new',
    activity: 'Understand',
    topicId: 'java',
    topicTitle: 'Java',
    courseTitle: 'Java',
    contentType: 'theory',
    route: ['/learn', 'java', id],
  });
  const recall = (id: string, from: number, interval: number): StudyPlanAssignment => ({
    ...original(id, 20),
    id: `${id}:review:v2:${interval}`,
    kind: 'review',
    activity: 'Recall',
    sourceContentId: id,
    requiredSessionId: id,
    reviewFromDay: from,
    reviewDueDay: from + interval,
  });
  const assignments = [
    [original('execution', 45)],
    [recall('execution', 1, 1)],
    [recall('execution', 1, 2), original('java', 50)],
    [recall('java', 3, 1)],
  ];
  return {
    config: { days, dailyHours: 1, topicIds: ['java'], accessTopicIds: ['java'] },
    focusedDailyHours: 1,
    bufferHours: 0,
    includedTopics: [],
    excludedTopics: [],
    weeks: [],
    uniqueNewItems: 2,
    reviewAssignments: 3,
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      phase: 'Learn',
      focus: 'Java',
      assignments: assignments[i] ?? [],
      newCount: 0,
      reviewCount: 0,
      focusedMinutes: (assignments[i] ?? []).reduce((sum, a) => sum + a.minutes, 0),
    })),
  };
}
const progress = {
  currentDay: 4,
  completedAssignmentIds: ['execution'],
  completedContentIds: ['execution'],
};
it('finds a real 50-minute slot without spending the reserved 20-minute recall or splitting the original', () => {
  const plan = fixture(),
    before = JSON.stringify(plan);
  const queue = studyDayQueue(plan, 4, new Set(['execution']));
  expect(queue).toMatchObject({ budget: 60, spent: 0, minutes: 20, remaining: 40 });
  const proposal = suggestStudyPlanAdjustment(plan, progress, queue, new Set(['java']));
  expect(proposal).not.toBeNull();
  expect(proposal!.moved).toContainEqual({ assignmentId: 'java', fromDay: 3, toDay: 6 });
  expect(proposal!.snapshot.days[3].assignments[0].id).toBe('execution:review:v2:1');
  expect(proposal!.snapshot.days[5].assignments[0].minutes).toBe(50);
  expect(proposal!.snapshot.days.every((day) => day.focusedMinutes <= 60)).toBe(true);
  expect(proposal!.deferred).toEqual([]);
  expect(JSON.stringify(plan)).toBe(before);
});
it('does not offer an adjustment when remaining days still cannot fit the original and its recalls', () => {
  const plan = fixture(5);
  expect(
    suggestStudyPlanAdjustment(
      plan,
      progress,
      studyDayQueue(plan, 4, new Set(['execution'])),
      new Set(['java']),
    ),
  ).toBeNull();
});
it('does not treat unused buffer or inaccessible/blocked work as an automatic mismatch', () => {
  const plan = fixture();
  expect(
    suggestStudyPlanAdjustment(
      plan,
      progress,
      studyDayQueue(plan, 4, new Set(['execution'])),
      new Set(),
    ),
  ).toBeNull();
  const queue = { ...studyDayQueue(plan, 4, new Set(['execution'])), deferred: [] };
  expect(suggestStudyPlanAdjustment(plan, progress, queue, new Set(['java']))).toBeNull();
});
it('does not reuse actual spent time as free budget', () => {
  const plan = fixture(),
    queue = studyDayQueue(plan, 4, new Set(['execution']));
  expect(
    suggestStudyPlanAdjustment(plan, progress, { ...queue, spent: 50 }, new Set(['java'])),
  ).toBeNull();
});
it('fingerprints changing progress and revision independently of caller object identity', () => {
  expect(adjustmentFingerprint({ revision: 1, ids: [] })).toBe(
    adjustmentFingerprint({ revision: 1, ids: [] }),
  );
  expect(adjustmentFingerprint({ revision: 1, ids: [] })).not.toBe(
    adjustmentFingerprint({ revision: 2, ids: [] }),
  );
  expect(adjustmentFingerprint({ revision: 1, ids: [] })).not.toBe(
    adjustmentFingerprint({ revision: 1, ids: ['done'] }),
  );
});

it('distinguishes no work, rejected proposal, and evaluation failure', () => {
  const plan = fixture(5);
  const queue = studyDayQueue(plan, 4, new Set(['execution']));
  expect(
    evaluateStudyPlanAdjustment(plan, progress, { ...queue, deferred: [] }, new Set(['java'])).kind,
  ).toBe('no-unfinished-work');
  expect(evaluateStudyPlanAdjustment(plan, progress, queue, new Set(['java'])).kind).toBe(
    'no-accepted-proposal',
  );
  const broken = {
    ...plan,
    get days(): never {
      throw new Error('injected evaluation failure');
    },
  };
  expect(evaluateStudyPlanAdjustment(broken, progress, queue, new Set(['java'])).kind).toBe(
    'evaluation-failure',
  );
});
