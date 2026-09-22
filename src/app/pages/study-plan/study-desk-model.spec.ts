import { describe, expect, it } from 'vitest';
import { StudyPlan, StudyPlanAssignment } from '../../content/study-plan';
import { studyDeskActivities } from './study-desk-model';

const item = (id: string, extra: Partial<StudyPlanAssignment> = {}): StudyPlanAssignment => ({
  id,
  title: id,
  kind: 'new',
  activity: 'Understand',
  topicId: 'java',
  topicTitle: 'Java',
  courseTitle: 'Java foundations',
  contentType: 'theory',
  route: ['/learn', 'java', id],
  minutes: 20,
  sourceContentId: id,
  ...extra,
});
const plan = (days: StudyPlanAssignment[][]): StudyPlan => ({
  config: { days: days.length, dailyHours: 1, topicIds: ['java'], accessTopicIds: ['java'] },
  focusedDailyHours: 1,
  bufferHours: 0,
  includedTopics: [],
  excludedTopics: [],
  weeks: [],
  uniqueNewItems: 2,
  reviewAssignments: 1,
  schedulingVersion: 'pinned-schedule',
  days: days.map((assignments, index) => ({
    day: index + 1,
    assignments,
    phase: 'Learn',
    focus: 'Java',
    newCount: 1,
    reviewCount: 0,
    focusedMinutes: 20,
  })),
});
describe('Study Desk saved-schedule projection', () => {
  it('uses saved order and actual activity kinds without modifying the plan', () => {
    const saved = plan([[item('b', { activity: 'Apply' }), item('a')], []]);
    const before = JSON.stringify(saved);
    const result = studyDeskActivities(saved, new Set(), {}, [], 1, true, () => true);
    expect(result.entries.map((entry) => entry.assignment.id)).toEqual(['b', 'a']);
    expect(result.resume?.assignment.activity).toBe('Apply');
    expect(JSON.stringify(saved)).toBe(before);
  });
  it('restores the same recommendation from saved completion and logs after reload', () => {
    const saved = plan([[item('first'), item('next')], []]);
    const state = {
      completed: ['first'],
      log: [{ assignmentId: 'first', day: 1, minutes: 20, recordedAt: '2026-09-21T12:00:00Z' }],
    };
    const restored = JSON.parse(JSON.stringify(state));
    for (const current of [state, restored]) {
      const result = studyDeskActivities(
        saved,
        new Set(current.completed),
        {},
        current.log,
        1,
        true,
        () => true,
      );
      expect(result.resume?.assignment.id).toBe('next');
      expect(result.resume?.day).toBe(1);
    }
  });
  it('retains a full-budget day and recommends the next eligible saved day', () => {
    const saved = plan([[item('first', { minutes: 60 })], [item('second')]]);
    const result = studyDeskActivities(
      saved,
      new Set(['first']),
      {},
      [{ assignmentId: 'first', day: 1, minutes: 60, recordedAt: '2026-09-21T12:00:00Z' }],
      1,
      false,
      () => true,
    );
    expect(result.resume?.assignment.id).toBe('second');
    expect(result.resume?.day).toBe(2);
  });
  it('keeps future recalls attached to the canonical item without admitting them into the window', () => {
    const saved = plan([[item('first')]]);
    saved.futureReviews = [
      item('review', {
        sourceContentId: 'first',
        kind: 'review',
        activity: 'Recall',
        reviewDueDay: 8,
      }),
    ];
    const result = studyDeskActivities(saved, new Set(['first']), {}, [], 1, true, () => true);
    expect(result.entries[1].outsideWindow).toBe(true);
    expect(result.entries[1].assignment.sourceContentId).toBe('first');
    expect(result.resume).toBeNull();
  });
  it('does not resume inaccessible or prerequisite-blocked work', () => {
    const saved = plan([[item('restricted'), item('blocked', { prerequisiteIds: ['missing'] })]]);
    const result = studyDeskActivities(
      saved,
      new Set(),
      {},
      [],
      1,
      true,
      (entry) => entry.id !== 'restricted',
    );
    expect(result.resume).toBeNull();
    expect(result.entries).toHaveLength(2);
  });
  it('includes completion-day recall with its original canonical source and respects recovery', () => {
    const saved = plan([[item('first')], [], []]);
    const result = studyDeskActivities(saved, new Set(['first']), {}, [], 2, true, () => true);
    expect(result.resume?.assignment.id).toBe('first:daily-recall:2');
    expect(result.resume?.assignment.sourceContentId).toBe('first');
    expect(
      result.entries.some((entry) => entry.assignment.id === result.resume?.assignment.id),
    ).toBe(true);
    expect(saved.days[1].assignments).toEqual([]);
  });
});
