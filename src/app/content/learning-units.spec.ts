import { describe, expect, it } from 'vitest';
import { CourseContent, CourseLearningUnit } from './content.models';
import { flattenLearningUnits, orderedTheoryArticles } from './learning-units';

describe('learning unit hierarchy', () => {
  it('preserves parent-first curriculum order across nested concept families', () => {
    const units: CourseLearningUnit[] = [
      {
        id: 'linked-lists',
        title: 'Linked Lists',
        description: 'Reason about linked state.',
        theoryModuleId: 'theory-linked-lists',
        subUnits: [
          {
            id: 'fast-slow',
            title: 'Fast/Slow Pointers',
            description: 'Detect repeated state.',
            theoryModuleId: 'theory-fast-slow',
          },
          {
            id: 'list-reversal',
            title: 'List Reversal',
            description: 'Rewire while preserving reachability.',
            theoryModuleId: 'theory-list-reversal',
          },
        ],
      },
      {
        id: 'trees',
        title: 'Trees',
        description: 'Traverse hierarchical state.',
        theoryModuleId: 'theory-trees',
      },
    ];

    expect(flattenLearningUnits(units).map(({ id }) => id)).toEqual([
      'linked-lists',
      'fast-slow',
      'list-reversal',
      'trees',
    ]);
  });

  it('orders theory articles by curriculum module and skips embedded Q&A', () => {
    const course = {
      modules: [
        { id: 'errors', order: 2, title: 'Errors', description: 'Failure behavior.' },
        { id: 'values', order: 1, title: 'Values', description: 'Value behavior.' },
      ],
      questions: [
        { id: 'values-q', moduleId: 'values', order: 2, contentType: 'q-and-a' },
        { id: 'errors-article', moduleId: 'errors', order: 1, contentType: 'theory' },
        { id: 'values-article', moduleId: 'values', order: 1, contentType: 'theory' },
      ],
    } as CourseContent;

    expect(orderedTheoryArticles(course).map(({ id }) => id)).toEqual([
      'values-article',
      'errors-article',
    ]);
  });
});
