import { CourseContent, CourseLearningUnit, InterviewQuestion } from './content.models';

/**
 * Returns every navigable unit while preserving the curriculum's parent-first order.
 * Consumers that project lessons, questions, or practice should not assume a flat map.
 */
export function flattenLearningUnits(units: CourseLearningUnit[]): CourseLearningUnit[] {
  return units.flatMap((unit) => [unit, ...flattenLearningUnits(unit.subUnits ?? [])]);
}

/**
 * Theory navigation follows the curriculum's module order while skipping
 * embedded retrieval questions and practice items.
 */
export function orderedTheoryArticles(
  course: CourseContent,
  moduleIds?: string[],
): InterviewQuestion[] {
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
