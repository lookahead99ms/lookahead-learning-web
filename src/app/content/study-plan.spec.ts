import { describe, expect, it } from 'vitest';
import { SearchDocument } from './content.models';
import { buildStudyPlan } from './study-plan';

function document(
  id: string,
  path: SearchDocument['path'],
  courseId: string,
  contentType: SearchDocument['contentType'] = 'theory',
): SearchDocument {
  return {
    id,
    contentId: id,
    path,
    courseId,
    courseTitle: courseId,
    moduleId: 'module',
    moduleTitle: 'Module',
    title: id,
    contentType,
    tags: [],
    filterTags: [],
    languages: [],
    preview: '',
    access: { tier: 'free' },
    searchableText: id,
    route: ['/', path, courseId, id],
  };
}

describe('study plan generator', () => {
  it('schedules only selected topics covered by the learner access', () => {
    const plan = buildStudyPlan(
      [
        document('java', 'learn', 'core-java'),
        document('spring', 'grow', 'spring-boot'),
        document('design', 'look-ahead', 'system-design'),
      ],
      {
        days: 7,
        dailyHours: 2,
        topicIds: ['java-foundations', 'backend-production', 'architecture'],
        accessTopicIds: ['java-foundations', 'architecture'],
      },
    );

    expect(plan.includedTopics.map(({ id }) => id)).toEqual(['java-foundations', 'architecture']);
    expect(plan.excludedTopics.map(({ id }) => id)).toEqual(['backend-production']);
    expect(
      plan.days.flatMap(({ assignments }) => assignments).some(({ title }) => title === 'spring'),
    ).toBe(false);
  });

  it('adds retrieval practice from earlier days and caps focused work at nine hours', () => {
    const documents = Array.from({ length: 80 }, (_, index) =>
      document(`problem-${index}`, 'learn', 'algorithmic-patterns', 'dsa-problem'),
    );
    const plan = buildStudyPlan(documents, {
      days: 14,
      dailyHours: 15,
      topicIds: ['dsa'],
      accessTopicIds: ['dsa'],
    });

    expect(plan.focusedDailyHours).toBe(9);
    expect(plan.bufferHours).toBe(6);
    expect(plan.days[1].assignments.some(({ reviewFromDay }) => reviewFromDay === 1)).toBe(true);
    expect(plan.days[7].assignments.some(({ reviewFromDay }) => reviewFromDay === 1)).toBe(true);
    expect(plan.weeks).toHaveLength(2);
  });
});
