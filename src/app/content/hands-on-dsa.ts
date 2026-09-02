import {
  CourseContent,
  CourseLearningUnit,
  InterviewQuestion,
  PatternLessonV1,
  PatternProblemV1,
  isPatternLessonV1,
} from './content.models';
import { flattenLearningUnits } from './learning-units';

export type HandsOnDifficulty = InterviewQuestion['difficulty'] | 'All';

export interface HandsOnDsaGroup {
  id: string;
  title: string;
  description: string;
  unit: CourseLearningUnit;
  lesson: InterviewQuestion;
  goldenLesson: PatternLessonV1 | null;
  essentialProblems: PatternProblemV1[];
  continuationProblems: InterviewQuestion[];
}

export function buildHandsOnDsaGroups(course: CourseContent): HandsOnDsaGroup[] {
  const questionsById = new Map(course.questions.map((question) => [question.id, question]));

  return flattenLearningUnits(course.learningUnits ?? []).flatMap((unit) => {
    const lesson = course.questions.find(
      (question) => question.moduleId === unit.theoryModuleId && question.contentType === 'theory',
    );
    if (!lesson) return [];

    const goldenLesson = isPatternLessonV1(lesson) ? lesson : null;
    const continuationProblems = goldenLesson
      ? goldenLesson.practice.flatMap(({ questionId }) => {
          const question = questionsById.get(questionId);
          return question ? [question] : [];
        })
      : course.questions
          .filter(
            (question) =>
              question.moduleId === unit.practiceModuleId &&
              question.relatedArticleId === lesson.id,
          )
          .sort((left, right) => left.order - right.order);
    const essentialProblems = goldenLesson?.essentialProblems ?? [];

    if (essentialProblems.length === 0 && continuationProblems.length === 0) return [];

    return [
      {
        id: unit.id,
        title: unit.title,
        description: unit.description,
        unit,
        lesson,
        goldenLesson,
        essentialProblems,
        continuationProblems,
      },
    ];
  });
}

export function resolveHandsOnDsaGroup(
  groups: HandsOnDsaGroup[],
  patternId: string,
): HandsOnDsaGroup | null {
  if (!patternId) return null;
  return groups.find((group) => group.id === patternId || group.lesson.id === patternId) ?? null;
}

export function filterHandsOnDsaGroups(
  groups: HandsOnDsaGroup[],
  query: string,
  difficulty: HandsOnDifficulty,
): HandsOnDsaGroup[] {
  const normalizedQuery = query.trim().toLowerCase();

  return groups.flatMap((group) => {
    const groupMatches = [group.title, group.description, group.lesson.title, ...group.lesson.tags]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery);
    const essentialProblems = group.essentialProblems.filter(
      (problem) =>
        (difficulty === 'All' || problem.difficulty === difficulty) &&
        (groupMatches ||
          [problem.title, problem.description, problem.variation, problem.invariantAdaptation]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)),
    );
    const continuationProblems = group.continuationProblems.filter(
      (problem) =>
        (difficulty === 'All' || problem.difficulty === difficulty) &&
        (groupMatches ||
          [problem.title, problem.interviewAnswer, ...problem.tags]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)),
    );

    return essentialProblems.length > 0 || continuationProblems.length > 0
      ? [{ ...group, essentialProblems, continuationProblems }]
      : [];
  });
}
