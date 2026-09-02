import { describe, expect, it } from 'vitest';
import { CourseLearningUnit } from './content.models';
import { flattenLearningUnits } from './learning-units';

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
});
