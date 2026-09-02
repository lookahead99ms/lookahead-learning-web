import { describe, expect, it } from 'vitest';
import {
  buildHandsOnDsaGroups,
  filterHandsOnDsaGroups,
  resolveHandsOnDsaGroup,
} from './hands-on-dsa';
import {
  CourseContent,
  InterviewQuestion,
  PatternLessonV1,
  PatternProblemV1,
} from './content.models';

function practice(
  id: string,
  articleId: string,
  difficulty: InterviewQuestion['difficulty'],
): InterviewQuestion {
  return {
    id,
    moduleId: 'practice-two-pointers',
    order: 1,
    title: id,
    difficulty,
    tags: ['transfer'],
    interviewAnswer: 'Use the invariant.',
    explanation: ['Reason first.'],
    versionNotes: [],
    followUps: [],
    relatedArticleId: articleId,
  };
}

function essential(id: string, difficulty: InterviewQuestion['difficulty']): PatternProblemV1 {
  return {
    id,
    title: id,
    description: 'A guided problem',
    difficulty,
    variation: 'Boundary movement',
    invariantAdaptation: 'Discard only proven candidates.',
    complexity: { time: 'O(n)', space: 'O(1)', why: 'Each value is visited once.' },
    fixtures: [{ id: 'sample', label: 'Sample', input: '[1,2]', expectedOutput: 'true' }],
    implementations: [],
    trace: {
      schemaVersion: 'guided-trace/v1',
      id: `${id}-trace`,
      fixtureId: 'sample',
      invariant: 'The boundary remains valid.',
      legend: [],
      events: [],
    },
  };
}

function course(): CourseContent {
  const lesson = {
    id: 'algorithmic-two-pointers',
    moduleId: 'theory-two-pointers',
    order: 1,
    title: 'Two Pointers',
    difficulty: 'Intermediate',
    tags: ['pointers'],
    contentType: 'theory',
    schemaVersion: 'pattern-lesson/v1',
    essentialProblems: [essential('palindrome', 'Beginner'), essential('water', 'Intermediate')],
    practice: [
      { questionId: 'container', reason: 'Transfer the boundary proof.', variation: 'Converging' },
    ],
  } as PatternLessonV1;
  return {
    id: 'algorithmic-patterns',
    path: 'learn',
    title: 'Algorithmic Patterns',
    description: 'Patterns',
    version: '1',
    modules: [],
    questions: [lesson, practice('container', lesson.id, 'Intermediate')],
    learningUnits: [
      {
        id: 'pointer-patterns',
        title: 'Pointer Patterns',
        description: 'Choose a pointer relationship.',
        theoryModuleId: 'theory-pointer-patterns',
        subUnits: [
          {
            id: 'two-pointers',
            title: 'Two Pointers',
            description: 'Move boundaries deliberately.',
            theoryModuleId: lesson.moduleId,
            practiceModuleId: 'practice-two-pointers',
          },
        ],
      },
    ],
  };
}

describe('Hands-On DSA projection', () => {
  it('resolves guided and continuation problems from canonical lesson data', () => {
    const groups = buildHandsOnDsaGroups(course());

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('two-pointers');
    expect(groups[0].essentialProblems.map(({ id }) => id)).toEqual(['palindrome', 'water']);
    expect(groups[0].continuationProblems.map(({ id }) => id)).toEqual(['container']);
    expect(resolveHandsOnDsaGroup(groups, 'algorithmic-two-pointers')?.id).toBe('two-pointers');
  });

  it('filters by problem text and difficulty without duplicating groups', () => {
    const groups = buildHandsOnDsaGroups(course());

    expect(
      filterHandsOnDsaGroups(groups, 'water', 'Intermediate')[0].essentialProblems,
    ).toHaveLength(1);
    expect(filterHandsOnDsaGroups(groups, '', 'Beginner')[0].continuationProblems).toHaveLength(0);
    expect(filterHandsOnDsaGroups(groups, 'missing', 'All')).toEqual([]);
  });
});
