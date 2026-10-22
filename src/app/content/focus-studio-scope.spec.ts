import { describe, expect, it } from 'vitest';
import { DsaProblemV2 } from './content.models';
import { FOCUS_STUDIO_PATTERN, usesFocusStudio } from './focus-studio-scope';
import { patternContextToken } from './pattern-context';

const arraysRoute = {
  path: 'learn',
  courseId: 'core-data-structures',
  questionId: 'array-example',
};
const sharedRoute = {
  path: 'learn',
  courseId: 'algorithmic-patterns',
  questionId: 'shared-example',
};
const context = (handsOnPatternId: string) => ({
  handsOnPatternId,
  lesson: {
    path: 'learn',
    courseId: 'core-data-structures',
    questionId: 'arrays-lesson',
    title: 'Arrays',
  },
});
// The selector reads only authored placement/context metadata, never account state.
const sharedProblem = {
  practice: {},
  navigation: {
    ...context('algorithmic-patterns:greedy'),
    alternates: [context(FOCUS_STUDIO_PATTERN)],
  },
  placements: [{ ...arraysRoute, moduleId: 'practice-arrays', role: 'practice' }],
} as unknown as DsaProblemV2;

describe('Focus Studio Arrays rollout boundary', () => {
  it('uses the Arrays alias route by default without changing the shared canonical route', () => {
    expect(usesFocusStudio(sharedProblem, arraysRoute, '')).toBe(true);
    expect(usesFocusStudio(sharedProblem, sharedRoute, '')).toBe(false);
  });
  it('honors an actual alternate context and ignores an invented context', () => {
    expect(usesFocusStudio(sharedProblem, sharedRoute, FOCUS_STUDIO_PATTERN)).toBe(true);
    expect(usesFocusStudio(sharedProblem, arraysRoute, 'algorithmic-patterns:greedy')).toBe(false);
    expect(usesFocusStudio(sharedProblem, sharedRoute, 'invented')).toBe(false);
    expect(usesFocusStudio(sharedProblem, arraysRoute, 'invented')).toBe(true);
  });
  it('reads the opaque ?pattern= context id the same way as the readable id (DLV-962)', () => {
    expect(usesFocusStudio(sharedProblem, sharedRoute, patternContextToken(FOCUS_STUDIO_PATTERN))).toBe(true);
    expect(
      usesFocusStudio(sharedProblem, arraysRoute, patternContextToken('algorithmic-patterns:greedy')),
    ).toBe(false);
  });
  it('cannot opt unrelated problems into the pilot through a URL flag', () => {
    const unrelated = {
      ...sharedProblem,
      navigation: context('algorithmic-patterns:hashing'),
    } as DsaProblemV2;
    expect(usesFocusStudio(unrelated, arraysRoute, FOCUS_STUDIO_PATTERN)).toBe(false);
    expect(usesFocusStudio(null, arraysRoute, FOCUS_STUDIO_PATTERN)).toBe(false);
  });
  it('covers dedicated Arrays problems even through canonical direct links', () => {
    const dedicated = {
      ...sharedProblem,
      navigation: context(FOCUS_STUDIO_PATTERN),
    } as DsaProblemV2;
    expect(usesFocusStudio(dedicated, arraysRoute, '')).toBe(true);
  });
});
