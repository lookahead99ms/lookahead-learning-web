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
export type HandsOnReadiness = 'All' | 'Guided' | 'Practice-ready' | 'Catalogued';

export interface HandsOnReadinessCounts {
  guided: number;
  practiceReady: number;
  catalogued: number;
}

export interface HandsOnDsaGroup {
  id: string;
  courseId: string;
  courseTitle: string;
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
      ? allRelatedPractice(course.questions, goldenLesson, unit, questionsById)
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
        id: `${course.id}:${unit.id}`,
        courseId: course.id,
        courseTitle: course.title,
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

function allRelatedPractice(
  questions: InterviewQuestion[],
  lesson: PatternLessonV1,
  unit: CourseLearningUnit,
  questionsById: Map<string, InterviewQuestion>,
): InterviewQuestion[] {
  const guidedIds = lesson.practice.map(({ questionId }) => questionId);
  const guided = guidedIds.flatMap((questionId) => {
    const question = questionsById.get(questionId);
    return question ? [question] : [];
  });
  const guidedIdSet = new Set(guidedIds);
  const independent = questions
    .filter(
      (question) =>
        question.moduleId === unit.practiceModuleId &&
        question.relatedArticleId === lesson.id &&
        !guidedIdSet.has(question.id),
    )
    .sort((left, right) => left.order - right.order);

  return [...guided, ...independent];
}

export function resolveHandsOnDsaGroup(
  groups: HandsOnDsaGroup[],
  patternId: string,
): HandsOnDsaGroup | null {
  if (!patternId) return null;
  return (
    groups.find((group) => group.id === patternId) ??
    groups.find((group) => group.lesson.id === patternId) ??
    groups.find((group) => group.unit.id === patternId) ??
    null
  );
}

export function filterHandsOnDsaGroups(
  groups: HandsOnDsaGroup[],
  query: string,
  difficulty: HandsOnDifficulty,
  readiness: HandsOnReadiness = 'All',
): HandsOnDsaGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const supportedTitles = new Set(
    groups.flatMap((group) => [
      ...group.essentialProblems.map(({ title }) => normalizeProblemTitle(title)),
      ...group.continuationProblems
        .filter((problem) => continuationReadiness(problem) === 'Practice-ready')
        .map(({ title }) => normalizeProblemTitle(title)),
    ]),
  );

  return groups.flatMap((group) => {
    const groupMatches = [group.title, group.description, group.lesson.title, ...group.lesson.tags]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery);
    const essentialProblems = group.essentialProblems.filter(
      (problem) =>
        (readiness === 'All' || readiness === 'Guided') &&
        (difficulty === 'All' || problem.difficulty === difficulty) &&
        (groupMatches ||
          [problem.title, problem.description, problem.variation, problem.invariantAdaptation]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)),
    );
    const continuationProblems = group.continuationProblems.filter(
      (problem) =>
        (readiness === 'All' || continuationReadiness(problem) === readiness) &&
        (readiness !== 'Catalogued' ||
          !supportedTitles.has(normalizeProblemTitle(problem.title))) &&
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

export function continuationReadiness(
  problem: InterviewQuestion,
): Exclude<HandsOnReadiness, 'All' | 'Guided'> {
  return problem.practiceProblem?.implementationStatus === 'complete'
    ? 'Practice-ready'
    : 'Catalogued';
}

export function handsOnReadinessCounts(groups: HandsOnDsaGroup[]): HandsOnReadinessCounts {
  const guided = new Set<string>();
  const practiceReady = new Set<string>();
  const catalogued = new Set<string>();

  for (const group of groups) {
    for (const problem of group.essentialProblems) guided.add(normalizeProblemTitle(problem.title));
    for (const problem of group.continuationProblems) {
      const key = normalizeProblemTitle(problem.title);
      if (continuationReadiness(problem) === 'Practice-ready') practiceReady.add(key);
      else catalogued.add(key);
    }
  }

  // A problem may support both guided and independent practice, but a completed
  // or guided experience must never also be presented as catalogue-only.
  for (const key of practiceReady) catalogued.delete(key);
  for (const key of guided) catalogued.delete(key);

  return {
    guided: guided.size,
    practiceReady: practiceReady.size,
    catalogued: catalogued.size,
  };
}

export function uniqueHandsOnProblemCount(groups: HandsOnDsaGroup[]): number {
  const titles = groups.flatMap((group) => [
    ...group.essentialProblems.map(({ title }) => title),
    ...group.continuationProblems.map(({ title }) => title),
  ]);
  return new Set(titles.map(normalizeProblemTitle)).size;
}

function normalizeProblemTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(the|a|an|of|to|in|from|with|and|or|using|implementation|variant)\b/g, ' ')
    .replace(/\bii\b/g, '2')
    .replace(/\biii\b/g, '3')
    .replace(/\biv\b/g, '4')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
