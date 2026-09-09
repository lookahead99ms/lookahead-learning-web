import {
  AnswerSlideAudience,
  AnswerSlideContentField,
  AnswerSlideDeckReference,
  AnswerSlideDeckV1,
  AnswerSlideKind,
  ContentDetailReference,
  InterviewQuestion,
} from './content.models';

const answerSlideKinds = new Set<AnswerSlideKind>([
  'interview-question',
  'real-world-scenario',
  'mental-model',
  'visual-comparison',
  'code-and-execution',
  'trade-offs-and-failure-modes',
  'interview-answer',
  'practice-and-follow-ups',
]);
const answerSlideFields = new Set<AnswerSlideContentField>([
  'title',
  'summary',
  'interviewAnswer',
  'explanation',
  'code',
  'solutions',
  'complexity',
  'versionNotes',
  'followUps',
  'sections',
  'visuals',
  'keyTakeaways',
  'languageNotes',
  'evidence',
  'practiceProblem',
  'visual',
]);
const answerSlideAudiences = new Set<AnswerSlideAudience>(['beginner', 'sde', 'fde', 'leadership']);
const stableIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function meaningful(value: unknown): boolean {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function validAudience(values: AnswerSlideAudience[] | undefined): boolean {
  return (
    values === undefined ||
    (Array.isArray(values) &&
      values.length > 0 &&
      new Set(values).size === values.length &&
      values.every((value) => answerSlideAudiences.has(value)))
  );
}

function sameDetailReference(
  actual: ContentDetailReference,
  expected: ContentDetailReference,
): boolean {
  return (
    actual?.kind === 'content-item' &&
    actual.kind === expected.kind &&
    actual.href === expected.href &&
    actual.version === expected.version
  );
}

export function validateAnswerSlideDeck(
  deck: AnswerSlideDeckV1,
  reference: AnswerSlideDeckReference,
  detailRef: ContentDetailReference,
  question: InterviewQuestion,
): AnswerSlideDeckV1 {
  const fail = (reason: string): never => {
    throw new Error(`Invalid answer slide deck for ${question.id}: ${reason}`);
  };
  if (deck?.schemaVersion !== 'answer-slides/v1') fail('unsupported schema version');
  if (deck.id !== `${question.id}-answer`) fail('unstable deck id');
  if (deck.mode !== 'derived' && deck.mode !== 'curated') fail('unsupported derivation mode');
  if (deck.sourceContentId !== question.id) fail('source content id mismatch');
  if (!sameDetailReference(deck.source, detailRef)) fail('stale source reference');
  if (reference.sourceVersion !== detailRef.version) fail('stale source version');
  if (!validAudience(deck.audienceEmphasis)) fail('invalid audience emphasis');
  if (!Array.isArray(deck.slides) || deck.slides.length === 0) fail('empty deck');

  const ids = new Set<string>();
  for (const [index, slide] of deck.slides.entries()) {
    if (!stableIdPattern.test(slide?.id ?? '') || !slide.id.startsWith(`${deck.id}-`)) {
      fail(`invalid slide id ${slide?.id}`);
    }
    if (ids.has(slide.id)) fail(`duplicate slide id ${slide.id}`);
    ids.add(slide.id);
    if (slide.order !== index + 1) fail('non-deterministic slide order');
    if (!answerSlideKinds.has(slide.kind)) fail(`unsupported slide kind ${slide.kind}`);
    if (!validAudience(slide.audienceEmphasis)) fail(`invalid audience on ${slide.id}`);
    if (!Array.isArray(slide.contentRefs)) fail(`invalid content references on ${slide.id}`);
    if (slide.contentRefs.length === 0 && !slide.annotation) fail(`empty slide ${slide.id}`);
    for (const contentRef of slide.contentRefs) {
      if (
        contentRef?.contentId !== question.id ||
        !answerSlideFields.has(contentRef.field) ||
        !meaningful(question[contentRef.field])
      ) {
        fail(`missing canonical target on ${slide.id}`);
      }
    }
    if (slide.annotation) {
      const validAnnotation =
        slide.annotation.reviewStatus === 'reviewed' &&
        meaningful(slide.annotation.text) &&
        ((slide.annotation.kind === 'scenario' && slide.kind === 'real-world-scenario') ||
          (slide.annotation.kind === 'comparison' && slide.kind === 'visual-comparison'));
      if (!validAnnotation) fail(`invalid reviewed annotation on ${slide.id}`);
    }
  }
  return deck;
}
