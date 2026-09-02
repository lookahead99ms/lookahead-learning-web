import { InterviewQuestion, TheoryVisual } from './content.models';

export function relatedPracticeItems(
  questions: InterviewQuestion[],
  articleId: string,
  practiceModuleId: string,
  limit = 2,
): InterviewQuestion[] {
  return questions
    .filter(
      (question) =>
        question.moduleId === practiceModuleId && question.relatedArticleId === articleId,
    )
    .sort((left, right) => left.order - right.order)
    .slice(0, limit);
}

export function authenticCodingVisual(visual: TheoryVisual | null): TheoryVisual | null {
  if (visual?.assetPath.includes('/algorithmic-code-flow.html')) return null;
  return visual;
}
