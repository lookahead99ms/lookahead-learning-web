import { CourseLearningUnit } from './content.models';

/**
 * Returns every navigable unit while preserving the curriculum's parent-first order.
 * Consumers that project lessons, questions, or practice should not assume a flat map.
 */
export function flattenLearningUnits(units: CourseLearningUnit[]): CourseLearningUnit[] {
  return units.flatMap((unit) => [unit, ...flattenLearningUnits(unit.subUnits ?? [])]);
}
