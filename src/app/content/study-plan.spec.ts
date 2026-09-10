import { describe, expect, it } from 'vitest';
import { SearchDocument } from './content.models';
import { buildStudyPlan, STUDY_PLAN_TOPICS, studyPlanOfferings } from './study-plan';

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
    detailRef: {
      kind: 'content-item',
      href: `/content/details/${path}/${courseId}/module/${id}.json`,
      version: 'test-v1',
    },
  };
}

describe('study plan generator', () => {
  it('offers the connected Web Foundations path', () => {
    const topic = STUDY_PLAN_TOPICS.find(({ id }) => id === 'javascript-web-foundations');

    expect(topic?.path).toBe('learn');
    expect(topic?.title).toBe('Web Foundations');
    expect(topic?.description).toBe(
      'JavaScript, TypeScript, and browser fundamentals for frontend and Node.js development.',
    );
    expect(topic?.courseIds).toEqual([
      'javascript-foundations',
      'typescript-foundations',
      'web-platform-foundations',
    ]);
  });

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

describe('adaptive planning contracts', () => {
  it('schedules recall within a one-hour budget', () => {
    const plan = buildStudyPlan(
      Array.from({ length: 20 }, (_, index) => document(`item-${index}`, 'learn', 'core-java')),
      {
        days: 14,
        dailyHours: 1,
        topicIds: ['java-foundations'],
        accessTopicIds: ['java-foundations'],
      },
    );
    expect(plan.reviewAssignments).toBeGreaterThan(0);
    expect(plan.days.every((day) => day.focusedMinutes <= 60)).toBe(true);
  });
  it('creates a complete course checklist and pins deterministic canonical order', () => {
    const first = {
      ...document('placement-a', 'learn', 'algorithmic-patterns', 'dsa-problem'),
      canonicalContentId: 'canonical-a',
    };
    const second = {
      ...document('placement-b', 'learn', 'algorithmic-patterns', 'dsa-problem'),
      canonicalContentId: 'canonical-b',
    };
    const docs = [first, second, { ...first, id: 'another-placement', contentId: 'other' }];
    const topics = studyPlanOfferings(docs);
    const config = {
      days: 7,
      dailyHours: 2,
      topicIds: [topics[0].id],
      accessTopicIds: [topics[0].id],
    };
    const plan = buildStudyPlan(
      docs,
      config,
      topics,
      new Map([
        ['canonical-b', 1],
        ['canonical-a', 2],
      ]),
    );
    expect(topics).toHaveLength(1);
    expect(plan.days[0].assignments.map((item) => item.id)).toEqual(['canonical-b', 'canonical-a']);
    expect(plan.uniqueNewItems).toBe(2);
    expect(
      buildStudyPlan(
        [...docs].reverse(),
        config,
        topics,
        new Map([
          ['canonical-b', 1],
          ['canonical-a', 2],
        ]),
      ).days,
    ).toEqual(plan.days);
  });
});

describe('published curriculum sequence', () => {
  it('keeps a foundations lesson before an alphabetically earlier advanced lesson', () => {
    const foundations = {
      ...document('foundations', 'learn', 'algorithmic-patterns'),
      title: 'Recognizing patterns',
      moduleTitle: 'Start here',
    };
    const advanced = {
      ...document('advanced', 'learn', 'algorithmic-patterns'),
      title: 'Backtracking',
      moduleTitle: 'Backtracking',
    };
    const plan = buildStudyPlan([foundations, advanced], {
      days: 7,
      dailyHours: 1,
      topicIds: ['dsa'],
      accessTopicIds: ['dsa'],
    });
    expect(plan.days[0].assignments[0].id).toBe('foundations');
  });
});
