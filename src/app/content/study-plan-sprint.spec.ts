import { buildStudyPlan, StudyPlanConfig, StudyPlanTopic } from './study-plan';
import { SearchDocument } from './content.models';

const topics: StudyPlanTopic[] = ['dsa', 'design'].map((id) => ({
  id,
  path: 'learn',
  title: id,
  description: '',
  courseIds: [id],
}));
function doc(id: string, courseId: string, unit: number, lesson = false): SearchDocument {
  return {
    id,
    contentId: id,
    canonicalContentId: id,
    courseId,
    courseTitle: courseId,
    path: 'learn',
    moduleId: `unit-${unit}`,
    moduleTitle: `unit-${unit}`,
    title: id,
    contentType: lesson ? 'theory' : 'q-and-a',
    discoveryKind: lesson ? 'lesson' : 'practice',
    studySequence: unit,
    tags: [],
    filterTags: [],
    languages: [],
    preview: '',
    searchableText: id,
    access: { tier: 'free' },
    route: ['/', 'learn', courseId, id],
  };
}
const documents = topics.flatMap((t) =>
  Array.from({ length: 18 }, (_, i) => doc(`${t.id}-${i}`, t.id, Math.floor(i / 3))),
);
const config: StudyPlanConfig = {
  days: 7,
  dailyHours: 1,
  topicIds: ['dsa', 'design'],
  accessTopicIds: ['dsa', 'design'],
  goalType: 'interview',
  familiarity: { dsa: 'familiar', design: 'refresh' },
};

describe('interview revision sprint', () => {
  it('represents selected topics and distinct curriculum areas before repeating variants', () => {
    const plan = buildStudyPlan(documents, config, topics);
    expect(plan.mode).toBe('interview-revision');
    expect(new Set(plan.days[0].assignments.map((a) => a.topicId)).size).toBe(2);
    const first = plan.days
      .flatMap((d) => d.assignments)
      .filter((a) => a.kind === 'new' && a.topicId === 'dsa')
      .slice(0, 3);
    expect(new Set(first.map((a) => a.coverageKey)).size).toBe(first.length);
    expect(plan.topicCoverage?.every((t) => t.scheduledItems > 0)).toBe(true);
    for (const day of plan.days) expect(day.focusedMinutes + day.bufferMinutes!).toBe(60);
    expect(plan.days.slice(1, 6).some((d) => d.reviewCount > 0)).toBe(true);
    expect(plan.days[6].newCount).toBe(0);
    expect(plan.days[6].assignments.every((a) => a.activity === 'Rehearse')).toBe(true);
    expect(new Set(plan.days[6].assignments.map((a) => a.topicId)).size).toBe(2);
    expect(plan.futureReviews).toHaveLength(plan.uniqueNewItems);
    expect(plan.overdueReviewCount).toBe(0);
    expect(buildStudyPlan(documents, config, topics)).toEqual(plan);
  });
  it('keeps related references optional in revision but never bypasses hard dependencies from self-report', () => {
    const related = { ...doc('related', 'dsa', 0), studyRelatedLessonIds: ['outside'] };
    const hard = { ...doc('hard', 'dsa', 1), studyPrerequisiteIds: ['outside'] };
    const plan = buildStudyPlan([related, hard], config, topics);
    expect(plan.uniqueNewItems).toBe(1);
    expect(plan.days[0].assignments[0].relatedLessonIds).toEqual(['outside']);
    expect(plan.blockedItems?.map((i) => i.id)).toEqual(['hard']);
    expect(
      buildStudyPlan([hard], { ...config, completedContentIds: ['outside'] }, topics)
        .uniqueNewItems,
    ).toBe(1);
  });
  it('gives a novice full learning estimates and foundation ordering with explicit short-window limits', () => {
    const lesson = doc('foundation', 'dsa', 0, true);
    const practice = { ...doc('practice', 'dsa', 0), studyRelatedLessonIds: ['foundation'] };
    const plan = buildStudyPlan(
      [practice, lesson],
      { ...config, topicIds: ['dsa'], familiarity: { dsa: 'new' } },
      topics,
    );
    const sessions = plan.days.flatMap((d) => d.assignments).filter((a) => a.kind === 'new');
    expect(sessions.map((a) => a.sourceContentId)).toEqual(['foundation', 'practice']);
    expect(sessions.map((a) => a.minutes)).toEqual([45, 50]);
    expect(sessions.every((a) => a.timebox === false)).toBe(true);
    expect(
      buildStudyPlan(
        [practice],
        { ...config, topicIds: ['dsa'], familiarity: { dsa: 'new' } },
        topics,
      ).blockedItems,
    ).toHaveLength(1);
  });
  it('deepens only the single selected topic and reports uncovered broad scope without tiny filler tasks', () => {
    const single = buildStudyPlan(documents, { ...config, topicIds: ['dsa'] }, topics);
    expect(single.days.flatMap((d) => d.assignments).every((a) => a.topicId === 'dsa')).toBe(true);
    expect(single.topicCoverage![0].representedOutcomes).toBeLessThan(single.uniqueNewItems);
    expect(single.topicCoverage![0].scheduledItems).toBeGreaterThan(
      buildStudyPlan(documents, config, topics).topicCoverage![0].scheduledItems,
    );
    const manyTopics = Array.from({ length: 40 }, (_, i) => ({
      ...topics[0],
      id: `t${i}`,
      courseIds: [`t${i}`],
    }));
    const many = buildStudyPlan(
      manyTopics.map((t) => doc(t.id, t.id, 0)),
      {
        ...config,
        topicIds: manyTopics.map((t) => t.id),
        accessTopicIds: manyTopics.map((t) => t.id),
      },
      manyTopics,
    );
    expect(many.topicCoverage?.filter((t) => !t.scheduledItems).length).toBeGreaterThan(0);
    expect(many.days.flatMap((d) => d.assignments).every((a) => a.minutes >= 15)).toBe(true);
    expect(many.uniqueNewItems + many.remainingNewItems! + many.blockedItems!.length).toBe(40);
  });
  it('uses published priority within representative areas, handles cycles and preserves longer learning plans', () => {
    const plan = buildStudyPlan(
      documents,
      config,
      topics,
      new Map(),
      new Map(documents.map((d, i) => [d.id, d.id === 'dsa-2' ? 1 : 100 + i])),
    );
    expect(plan.days[0].assignments[0].sourceContentId).toBe('dsa-2');
    const cyclic = [
      { ...doc('a', 'dsa', 0), studyPrerequisiteIds: ['b'] },
      { ...doc('b', 'dsa', 0), studyPrerequisiteIds: ['a'] },
    ];
    expect(buildStudyPlan(cyclic, config, topics).blockedItems).toHaveLength(2);
    for (const days of [30, 120]) {
      const longer = buildStudyPlan(documents, { ...config, days }, topics);
      expect(longer.schedulingVersion).toBe('study-schedule/v2');
      expect(longer.days.flatMap((d) => d.assignments).some((a) => a.minutes === 50)).toBe(true);
    }
  });
});
