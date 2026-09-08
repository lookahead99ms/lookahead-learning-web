import {
  ContentItemSummary,
  CourseContent,
  CourseOutline,
  InterviewQuestion,
  isFoundationLessonV1,
  isPatternLesson,
} from './content.models';
import { flattenLearningUnits } from './learning-units';

/** Distinguishes a real lesson from legacy Q&A records that carried a theory tag. */
export function isTheoryArticle(item: InterviewQuestion | ContentItemSummary): boolean {
  if ('isTheoryArticle' in item) return item.isTheoryArticle;
  return (
    item.contentType === 'theory' &&
    (isPatternLesson(item) || isFoundationLessonV1(item) || Boolean(item.sections?.length))
  );
}

/** Returns every non-lesson item exposed by a module-level question bank. */
export function questionsForModule(
  course: CourseContent,
  moduleId: string | null | undefined,
): InterviewQuestion[];
export function questionsForModule(
  course: CourseOutline,
  moduleId: string | null | undefined,
): ContentItemSummary[];
export function questionsForModule(
  course: CourseContent | CourseOutline,
  moduleId: string | null | undefined,
): (InterviewQuestion | ContentItemSummary)[] {
  if (!moduleId) return [];
  return course.questions
    .filter((item) => item.moduleId === moduleId && !isTheoryArticle(item))
    .sort((left, right) => left.order - right.order);
}

/** Resolves both same-module foundation lessons and split-module pattern lessons. */
export function questionModuleIdForArticle(
  course: CourseContent | CourseOutline,
  article: InterviewQuestion | ContentItemSummary,
): string | null {
  const unit = flattenLearningUnits(course.learningUnits ?? []).find(
    (candidate) => candidate.theoryModuleId === article.moduleId,
  );
  return unit?.questionModuleId ?? null;
}
