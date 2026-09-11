import { describe, expect, it } from 'vitest';
import { studyDayQueue } from './study-plan-daily';
import { StudyPlan, StudyPlanAssignment } from './study-plan';
const item = (
  id: string,
  minutes: number,
  extra: Partial<StudyPlanAssignment> = {},
): StudyPlanAssignment => ({
  id,
  minutes,
  title: id,
  activity: 'Understand',
  kind: 'new',
  topicId: 'topic',
  topicTitle: 'Topic',
  courseTitle: 'Course',
  contentType: 'theory',
  route: ['/learn', 'course', id],
  ...extra,
});
const make = (days: StudyPlanAssignment[][]): StudyPlan => ({
  config: { days: days.length, dailyHours: 1, topicIds: ['topic'], accessTopicIds: ['topic'] },
  focusedDailyHours: 1,
  bufferHours: 0,
  includedTopics: [],
  excludedTopics: [],
  weeks: [],
  uniqueNewItems: 0,
  reviewAssignments: 0,
  days: days.map((assignments, index) => ({
    day: index + 1,
    phase: 'Learn',
    focus: 'Study',
    assignments,
    newCount: 0,
    reviewCount: 0,
    focusedMinutes: 0,
  })),
});
it('allocates eligible recall, overdue learning and current work within one budget', () => {
  const plan = make([
    [item('old', 25)],
    [
      item('new', 30),
      item('recall', 15, { kind: 'review', activity: 'Recall', sourceContentId: 'done' }),
    ],
  ]);
  const queue = studyDayQueue(plan, 2, new Set(['done']));
  expect(queue.selected.map((a) => a.id)).toEqual(['recall', 'old']);
  expect(queue.minutes).toBe(40);
  expect(queue.deferred.map((a) => a.id)).toContain('new');
  expect(plan.days[1].assignments[0].id).toBe('new');
});
it('keeps distinct recall IDs separate and waits for the original session', () => {
  const a = item('recall-1', 15, {
    kind: 'review',
    activity: 'Recall',
    sourceContentId: 'original',
  });
  const b = { ...a, id: 'recall-2' };
  const plan = make([[item('original', 20)], [a, b]]);
  expect(studyDayQueue(plan, 2, new Set()).selected.map((a) => a.id)).toEqual(['original']);
  expect(
    studyDayQueue(plan, 2, new Set(['original', 'recall-1'])).selected.map((a) => a.id),
  ).toEqual(['recall-2']);
});
it('does not turn an attempted revision into canonical completion', () => {
  const plan = make([
    [item('original', 20, { timebox: true })],
    [
      item('recall', 15, {
        kind: 'review',
        activity: 'Recall',
        sourceContentId: 'source',
        requiredSessionId: 'original',
      }),
    ],
  ]);
  const completed = new Set<string>();
  expect(
    studyDayQueue(plan, 2, completed, { original: 'attempted' }).selected.map((a) => a.id),
  ).toEqual(['recall']);
  expect(completed.size).toBe(0);
});

it('keeps overdue activity time consumed after reload and completion undo', () => {
  const plan = make([[item('old', 40)], [item('current', 30)]]);
  const log = [{ assignmentId: 'old', day: 2, minutes: 40, recordedAt: '2026-09-11T12:00:00Z' }];
  const restored = JSON.parse(JSON.stringify(log));
  expect(studyDayQueue(plan, 2, new Set(['old']), {}, restored).selected).toEqual([]);
  const undone = studyDayQueue(plan, 2, new Set(), {}, restored);
  expect(undone.spent).toBe(40);
  expect(undone.remaining).toBe(20);
});
it('anchors interval recalls to the recorded completion day', () => {
  const plan = make([
    [item('original', 20)],
    [
      item('recall', 20, {
        kind: 'review',
        activity: 'Recall',
        sourceContentId: 'original',
        reviewFromDay: 1,
        reviewDueDay: 2,
      }),
    ],
    [],
    [],
  ]);
  const log = [
    { assignmentId: 'original', day: 3, minutes: 20, recordedAt: '2026-09-11T12:00:00Z' },
  ];
  expect(studyDayQueue(plan, 3, new Set(['original']), {}, log).selected).toEqual([]);
  expect(studyDayQueue(plan, 4, new Set(['original']), {}, log).selected.map((a) => a.id)).toEqual([
    'recall',
  ]);
});
it('adds one separately recorded daily recall without rewriting the saved schedule', () => {
  const plan = make([[item('original', 20)], [], []]);
  const before = JSON.stringify(plan);
  const first = studyDayQueue(plan, 2, new Set(['original']));
  expect(first.selected.map((a) => a.id)).toEqual(['original:daily-recall:2']);
  const log = [
    {
      assignmentId: 'original:daily-recall:2',
      day: 2,
      minutes: 10,
      recordedAt: '2026-09-11T12:00:00Z',
    },
  ];
  expect(
    studyDayQueue(plan, 2, new Set(['original', 'original:daily-recall:2']), {}, log).selected,
  ).toEqual([]);
  expect(
    studyDayQueue(plan, 3, new Set(['original', 'original:daily-recall:2']), {}, log).selected[0]
      .id,
  ).toBe('original:daily-recall:3');
  expect(JSON.stringify(plan)).toBe(before);
});

it('does not allocate the daily budget to content whose access was removed', () => {
  const plan = make([[item('restricted', 50), item('available', 30)]]);
  const queue = studyDayQueue(plan, 1, new Set(), {}, [], true, (item) => item.id !== 'restricted');
  expect(queue.selected.map((item) => item.id)).toEqual(['available']);
  expect(queue.deferred.map((item) => item.id)).toEqual(['restricted']);
  expect(queue.remaining).toBe(30);
});
