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

/**
 * Every learning-map course with units shows the course banner plus the unit card grid.
 * Units without authored card data use their conventional scene file.
 */
export function courseHasUnitCards(
  course: Pick<CourseOutline, 'layout' | 'learningUnits'>,
): boolean {
  return course.layout === 'learning-map' && (course.learningUnits?.length ?? 0) > 0;
}

/** The animated scene of the learning unit a lesson or question belongs to. */
export interface UnitScene {
  src: string;
  /** Authored scene description; empty when the scene is decorative. */
  alt: string;
  unitTitle: string;
}

/**
 * Resolves the scene of the unit that owns a module, matching the course page's unit card:
 * authored card scenes first, otherwise the conventional unit scene file. Only learning-map
 * courses with units have unit scenes; old tile courses return null.
 */
export function unitSceneForModule(
  path: string,
  course: Pick<CourseOutline, 'id' | 'layout' | 'learningUnits'>,
  moduleId: string,
): UnitScene | null {
  if (!moduleId || !courseHasUnitCards(course)) return null;
  const unit = flattenLearningUnits(course.learningUnits ?? []).find(
    (candidate) =>
      !candidate.planned &&
      (candidate.theoryModuleId === moduleId ||
        candidate.practiceModuleId === moduleId ||
        candidate.questionModuleId === moduleId),
  );
  if (!unit) return null;
  return {
    src: unit.card?.scene ?? `/assets/scenes/units/${path}/${course.id}/${unit.id}.svg`,
    alt: unit.card?.sceneAlt?.trim() ?? '',
    unitTitle: unit.title,
  };
}
