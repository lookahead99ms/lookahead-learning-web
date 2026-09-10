import {
  CourseContent,
  CourseLearningUnit,
  DsaProblemV2,
  InterviewQuestion,
  PatternLesson,
  PatternProblemV1,
  isPatternLesson,
} from './content.models';
import { flattenLearningUnits } from './learning-units';

export type HandsOnDifficulty = InterviewQuestion['difficulty'] | 'All';
export type HandsOnReadiness = 'All' | 'Guided' | 'Practice-ready' | 'Catalogued';
export type HandsOnTierScope = '150' | '365' | '600' | '730';
export type HandsOnSort =
  | 'pattern-order'
  | 'title-ascending'
  | 'title-descending'
  | 'study-order-descending'
  | 'interview-rank-descending'
  | 'study-order'
  | 'interview-rank'
  | 'difficulty-ascending'
  | 'difficulty-descending';
export type HandsOnRankingTier =
  'universal-must-do' | 'interview-core' | 'pattern-depth' | 'advanced-specialized';

export interface HandsOnReadinessCounts {
  guided: number;
  practiceReady: number;
  catalogued: number;
}

export interface HandsOnDsaIndexProblem {
  id: string;
  title: string;
  description: string;
  difficulty: InterviewQuestion['difficulty'];
  variation: string;
  invariantAdaptation: string;
  version: string;
  questionId: string;
  route: string[];
  interviewRank?: number;
  studyOrder?: number;
  tier?: HandsOnRankingTier;
  rankingVersion?: string;
}

export interface HandsOnDsaIndexGroup {
  id: string;
  preparationOrder: number;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string;
  unitId: string;
  practiceModuleId: string;
  lessonId: string;
  lessonTitle: string;
  tags: string[];
  hasGuidedLesson: boolean;
  problems: HandsOnDsaIndexProblem[];
}

export interface HandsOnDsaIndexProblemResult extends HandsOnDsaIndexProblem {
  patternId: string;
  patternTitle: string;
  patternPreparationOrder: number;
}

export interface HandsOnDsaIndex {
  schemaVersion: 'hands-on-dsa-index/v1' | 'hands-on-dsa-index/v2';
  totals: {
    groups: number;
    problemPlacements: number;
    distinctProblems: number;
  };
  ranking?: {
    status: 'unranked' | 'candidate' | 'released';
    rankingVersion: string;
    catalogTarget: number;
    rankedProblems: number;
    lastReviewedAt: string | null;
  };
  groups: HandsOnDsaIndexGroup[];
}

export interface HandsOnDsaGroup {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string;
  unit: CourseLearningUnit;
  lesson: InterviewQuestion;
  goldenLesson: PatternLesson | null;
  essentialProblems: PatternProblemV1[];
  continuationProblems: InterviewQuestion[];
}

export function handsOnProblemRoute(
  problem: PatternProblemV1,
  fallbackCourseId: string,
  practiceModuleId?: string,
): string[] {
  const placements = (problem as Partial<DsaProblemV2>).placements ?? [];
  const placement =
    placements.find(
      (candidate) =>
        candidate.role === 'practice' &&
        candidate.questionId &&
        candidate.moduleId === practiceModuleId,
    ) ?? placements.find((candidate) => candidate.role === 'practice' && candidate.questionId);
  return placement?.questionId
    ? [`/${placement.path}`, placement.courseId, placement.questionId]
    : ['/learn', fallbackCourseId, problem.practiceQuestionId ?? problem.id];
}

export function buildHandsOnDsaGroups(course: CourseContent): HandsOnDsaGroup[] {
  const questionsById = new Map(course.questions.map((question) => [question.id, question]));

  return flattenLearningUnits(course.learningUnits ?? []).flatMap((unit) => {
    const lesson = course.questions.find(
      (question) => question.moduleId === unit.theoryModuleId && question.contentType === 'theory',
    );
    if (!lesson) return [];

    const goldenLesson = isPatternLesson(lesson) ? lesson : null;
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
  lesson: PatternLesson,
  unit: CourseLearningUnit,
  questionsById: Map<string, InterviewQuestion>,
): InterviewQuestion[] {
  const guidedIds = lesson.practice.map(({ questionId }) => questionId);
  const guided = guidedIds.flatMap((questionId) => {
    const question = questionsById.get(questionId);
    return question ? [question] : [];
  });
  const guidedIdSet = new Set(guidedIds);
  const canonicalPracticeIds = new Set(
    (lesson.essentialProblems ?? []).flatMap(({ practiceQuestionId }) =>
      practiceQuestionId ? [practiceQuestionId] : [],
    ),
  );
  const independent = questions
    .filter(
      (question) =>
        question.moduleId === unit.practiceModuleId &&
        question.relatedArticleId === lesson.id &&
        !guidedIdSet.has(question.id),
    )
    .sort((left, right) => left.order - right.order);

  return [...guided, ...independent].filter(({ id }) => !canonicalPracticeIds.has(id));
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
        (readiness === 'All' ||
          (readiness === 'Guided'
            ? continuationHasGuidance(problem)
            : continuationReadiness(problem) === readiness)) &&
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
  return problem.canonicalProblemRef ||
    problem.canonicalProblem?.practice ||
    problem.practiceProblem?.implementationStatus === 'complete'
    ? 'Practice-ready'
    : 'Catalogued';
}

export function continuationHasGuidance(problem: InterviewQuestion): boolean {
  return Boolean(problem.canonicalProblemRef || problem.canonicalProblem?.trace);
}

export function handsOnReadinessCounts(groups: HandsOnDsaGroup[]): HandsOnReadinessCounts {
  const guided = new Set<string>();
  const practiceReady = new Set<string>();
  const catalogued = new Set<string>();

  for (const group of groups) {
    for (const problem of group.essentialProblems) guided.add(normalizeProblemTitle(problem.title));
    for (const problem of group.continuationProblems) {
      const key = normalizeProblemTitle(problem.title);
      if (continuationHasGuidance(problem)) guided.add(key);
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

export function resolveHandsOnDsaIndexGroup(
  groups: HandsOnDsaIndexGroup[],
  patternId: string,
): HandsOnDsaIndexGroup | null {
  if (!patternId) return null;
  return (
    groups.find((group) => group.id === patternId) ??
    groups.find((group) => group.lessonId === patternId) ??
    groups.find((group) => group.unitId === patternId) ??
    null
  );
}

export function filterHandsOnDsaIndexGroups(
  groups: HandsOnDsaIndexGroup[],
  query: string,
  difficulty: HandsOnDifficulty,
  scope: HandsOnTierScope = '730',
  sort: HandsOnSort = 'pattern-order',
): HandsOnDsaIndexGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const scopeLimit = Number(scope);
  const filtered = groups.flatMap((group) => {
    const groupMatches = [group.title, group.description, group.lessonTitle, ...group.tags]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery);
    const problems = group.problems.filter(
      (problem) =>
        (difficulty === 'All' || problem.difficulty === difficulty) &&
        (problem.interviewRank === undefined || problem.interviewRank <= scopeLimit) &&
        (groupMatches ||
          [problem.title, problem.description, problem.variation, problem.invariantAdaptation]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)),
    );
    return problems.length
      ? [{ ...group, problems: [...problems].sort(problemComparator(sort)) }]
      : [];
  });
  return filtered;
}

export function rankedHandsOnDsaIndexProblems(
  groups: HandsOnDsaIndexGroup[],
  sort: Exclude<HandsOnSort, 'pattern-order'>,
): HandsOnDsaIndexProblemResult[] {
  const problemsById = new Map<string, HandsOnDsaIndexProblemResult>();
  for (const group of groups) {
    for (const problem of group.problems) {
      if (problemsById.has(problem.id)) continue;
      problemsById.set(problem.id, {
        ...problem,
        patternId: group.id,
        patternTitle: group.title,
        patternPreparationOrder: group.preparationOrder,
      });
    }
  }
  return [...problemsById.values()].sort(problemComparator(sort));
}

function problemComparator(
  sort: HandsOnSort,
): (left: HandsOnDsaIndexProblem, right: HandsOnDsaIndexProblem) => number {
  const difficultyOrder = { Beginner: 1, Intermediate: 2, Advanced: 3 } as const;
  return (left, right) => {
    let result = 0;
    if (sort === 'title-ascending' || sort === 'title-descending') {
      result = left.title.localeCompare(right.title) * (sort === 'title-descending' ? -1 : 1);
    } else if (
      sort === 'study-order' ||
      sort === 'study-order-descending' ||
      sort === 'interview-rank' ||
      sort === 'interview-rank-descending'
    ) {
      const field = sort.startsWith('study-order') ? 'studyOrder' : 'interviewRank';
      const leftOrder = left[field];
      const rightOrder = right[field];
      // Unranked problems remain last in either direction.
      result =
        leftOrder == null
          ? rightOrder == null
            ? 0
            : 1
          : rightOrder == null
            ? -1
            : (leftOrder - rightOrder) * (sort.endsWith('-descending') ? -1 : 1);
    } else if (sort === 'difficulty-ascending') {
      result = difficultyOrder[left.difficulty] - difficultyOrder[right.difficulty];
    } else if (sort === 'difficulty-descending') {
      result = difficultyOrder[right.difficulty] - difficultyOrder[left.difficulty];
    }
    return (
      result ||
      (left.studyOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.studyOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id)
    );
  };
}

export function uniqueHandsOnIndexProblemCount(groups: HandsOnDsaIndexGroup[]): number {
  return new Set(groups.flatMap((group) => group.problems.map(({ id }) => id))).size;
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
