import { describe, expect, it } from 'vitest';
import { CourseContent, CourseLearningUnit } from './content.models';
import {
  courseHasUnitCards,
  flattenLearningUnits,
  handsOnPatternIdForModule,
  orderedTheoryArticles,
  unitSceneForModule,
} from './learning-units';

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

  it('resolves lesson and practice modules to the same canonical Hands-On filter', () => {
    const units: CourseLearningUnit[] = [
      {
        id: 'tree-dfs-bfs',
        title: 'Trees',
        description: 'Choose the traversal order deliberately.',
        theoryModuleId: 'theory-tree-dfs-bfs',
        practiceModuleId: 'practice-tree-dfs-bfs',
      },
    ];

    expect(handsOnPatternIdForModule('algorithmic-patterns', units, 'theory-tree-dfs-bfs')).toBe(
      'algorithmic-patterns:tree-dfs-bfs',
    );
    expect(handsOnPatternIdForModule('algorithmic-patterns', units, 'practice-tree-dfs-bfs')).toBe(
      'algorithmic-patterns:tree-dfs-bfs',
    );
  });
});

describe('courseHasUnitCards', () => {
  const unit = { id: 'a', title: 'A', description: 'A.', theoryModuleId: 'a' };

  it('turns on for every learning map with units, with or without authored cards', () => {
    expect(
      courseHasUnitCards({
        layout: 'learning-map',
        learningUnits: [unit, { ...unit, id: 'b', card: { summary: 'One line.' } }],
      }),
    ).toBe(true);
    expect(courseHasUnitCards({ layout: 'learning-map', learningUnits: [unit] })).toBe(true);
    expect(
      courseHasUnitCards({ layout: 'learning-map', learningUnits: [{ ...unit, planned: true }] }),
    ).toBe(true);
  });

  it('stays off for tiles and learning maps without units', () => {
    const card = { summary: 'One line.' };
    expect(courseHasUnitCards({ layout: 'tiles', learningUnits: [{ ...unit, card }] })).toBe(false);
    expect(courseHasUnitCards({ layout: 'learning-map', learningUnits: [] })).toBe(false);
    expect(courseHasUnitCards({ layout: 'learning-map' })).toBe(false);
  });
});

describe('unitSceneForModule', () => {
  const units: CourseLearningUnit[] = [
    {
      id: 'caching',
      title: 'Caching',
      description: 'Copies.',
      theoryModuleId: 'caching',
      practiceModuleId: 'caching-practice',
      questionModuleId: 'caching-questions',
      subUnits: [
        { id: 'cdn', title: 'CDN', description: 'Edge.', theoryModuleId: 'cdn' },
      ],
    },
    {
      id: 'reservation-round',
      title: 'Reservation System',
      description: 'A round.',
      theoryModuleId: 'reservation-round',
      card: {
        summary: 'A round.',
        scene: '/content/look-ahead/design-systems/visuals/cards/reservation.svg',
        sceneAlt: ' Two fans tap one seat. ',
      },
    },
    { id: 'later', title: 'Later', description: 'Soon.', theoryModuleId: 'later', planned: true },
  ];
  const course = { id: 'design-fundamentals', layout: 'learning-map' as const, learningUnits: units };

  it('uses the conventional unit scene for the unit owning a lesson, practice or question module', () => {
    for (const moduleId of ['caching', 'caching-practice', 'caching-questions']) {
      expect(unitSceneForModule('look-ahead', course, moduleId)).toEqual({
        src: '/assets/scenes/units/look-ahead/design-fundamentals/caching.svg',
        alt: '',
        unitTitle: 'Caching',
      });
    }
    expect(unitSceneForModule('look-ahead', course, 'cdn')?.src).toBe(
      '/assets/scenes/units/look-ahead/design-fundamentals/cdn.svg',
    );
  });

  it('prefers the authored card scene and its description', () => {
    expect(unitSceneForModule('look-ahead', course, 'reservation-round')).toEqual({
      src: '/content/look-ahead/design-systems/visuals/cards/reservation.svg',
      alt: 'Two fans tap one seat.',
      unitTitle: 'Reservation System',
    });
  });

  it('resolves nothing for tile courses, planned units or unknown modules', () => {
    expect(unitSceneForModule('look-ahead', { ...course, layout: 'tiles' }, 'caching')).toBeNull();
    expect(unitSceneForModule('look-ahead', { ...course, layout: undefined }, 'caching')).toBeNull();
    expect(unitSceneForModule('look-ahead', course, 'later')).toBeNull();
    expect(unitSceneForModule('look-ahead', course, 'unknown')).toBeNull();
    expect(unitSceneForModule('look-ahead', course, '')).toBeNull();
  });
});
