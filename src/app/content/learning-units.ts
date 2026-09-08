import {
  ContentItemSummary,
  CourseContent,
  CourseLearningUnit,
  CourseOutline,
  InterviewQuestion,
} from './content.models';

/**
 * Returns every navigable unit while preserving the curriculum's parent-first order.
 * Consumers that project lessons, questions, or practice should not assume a flat map.
 */
export function flattenLearningUnits(units: CourseLearningUnit[]): CourseLearningUnit[] {
  return units.flatMap((unit) => [unit, ...flattenLearningUnits(unit.subUnits ?? [])]);
}

/** Resolves both lesson modules and practice modules to the same governed catalog filter. */
export function handsOnPatternIdForModule(
  courseId: string,
  units: CourseLearningUnit[],
  moduleId: string,
): string {
  const unit = flattenLearningUnits(units).find(
    (candidate) => candidate.theoryModuleId === moduleId || candidate.practiceModuleId === moduleId,
  );
  return unit ? `${courseId}:${unit.id}` : '';
}

/**
 * Theory navigation follows the curriculum's module order while skipping
 * embedded retrieval questions and practice items.
 */
export function orderedTheoryArticles(
  course: CourseContent,
  moduleIds?: string[],
): InterviewQuestion[];
export function orderedTheoryArticles(
  course: CourseOutline,
  moduleIds?: string[],
): ContentItemSummary[];
export function orderedTheoryArticles(
  course: CourseContent | CourseOutline,
  moduleIds?: string[],
): (InterviewQuestion | ContentItemSummary)[] {
  const orderedModuleIds =
    moduleIds ??
    [...course.modules].sort((left, right) => left.order - right.order).map(({ id }) => id);
  const moduleOrder = new Map(orderedModuleIds.map((id, index) => [id, index]));

  return course.questions
    .filter((question) => question.contentType === 'theory' && moduleOrder.has(question.moduleId))
    .sort((left, right) => {
      const moduleDifference = moduleOrder.get(left.moduleId)! - moduleOrder.get(right.moduleId)!;
      return moduleDifference || left.order - right.order;
    });
}
