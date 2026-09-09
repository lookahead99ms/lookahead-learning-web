import { createHash } from 'node:crypto';

export const answerSlideSchemaVersion = 'answer-slides/v1';
export const answerSlidePlanSchemaVersion = 'answer-slide-plan/v1';
export const answerSlideKinds = Object.freeze([
  'interview-question',
  'real-world-scenario',
  'mental-model',
  'visual-comparison',
  'code-and-execution',
  'trade-offs-and-failure-modes',
  'interview-answer',
  'practice-and-follow-ups',
]);
export const answerSlideContentFields = Object.freeze([
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
export const answerSlideAudiences = Object.freeze(['beginner', 'sde', 'fde', 'leadership']);

const slideKindSet = new Set(answerSlideKinds);
const contentFieldSet = new Set(answerSlideContentFields);
const audienceSet = new Set(answerSlideAudiences);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^[a-zA-Z0-9_-]{1,64}$/;

export function contentVersion(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function meaningful(value) {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function normalizedText(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((candidate) => typeof candidate === 'string')
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function ref(field) {
  return { field };
}

function visualComparisonFields(question) {
  const fields = [];
  if (question.visual?.type === 'comparison') fields.push('visual');
  if (question.visuals?.some(({ type }) => type === 'comparison')) fields.push('visuals');
  if (question.sections?.some((section) => section.visual?.type === 'comparison')) {
    fields.push('sections');
  }
  return fields;
}

function codeFields(question) {
  const fields = [];
  if (meaningful(question.code)) fields.push('code');
  if (meaningful(question.solutions)) fields.push('solutions');
  if (
    question.sections?.some((section) => meaningful(section.code) || meaningful(section.solutions))
  ) {
    fields.push('sections');
  }
  return fields;
}

function derivedPlan(question, practiceFormat) {
  const slides = [{ id: 'question', kind: 'interview-question', contentRefs: [ref('title')] }];
  const summary = normalizedText(question.summary);
  if (
    ['design', 'debug', 'rehearse'].includes(practiceFormat) &&
    summary &&
    summary !== normalizedText(question.title) &&
    summary !== normalizedText(question.interviewAnswer)
  ) {
    slides.push({ id: 'scenario', kind: 'real-world-scenario', contentRefs: [ref('summary')] });
  }
  if (
    meaningful(question.explanation) &&
    normalizedText(question.explanation) !== normalizedText(question.interviewAnswer)
  ) {
    slides.push({ id: 'mental-model', kind: 'mental-model', contentRefs: [ref('explanation')] });
  }
  const comparisonFields = visualComparisonFields(question);
  if (comparisonFields.length) {
    slides.push({
      id: 'visual-comparison',
      kind: 'visual-comparison',
      contentRefs: comparisonFields.map(ref),
    });
  }
  const executableFields = codeFields(question);
  if (executableFields.length) {
    slides.push({
      id: 'code-and-execution',
      kind: 'code-and-execution',
      contentRefs: executableFields.map(ref),
    });
  }
  if (meaningful(question.complexity)) {
    slides.push({
      id: 'trade-offs',
      kind: 'trade-offs-and-failure-modes',
      contentRefs: [ref('complexity')],
    });
  }
  slides.push({ id: 'answer', kind: 'interview-answer', contentRefs: [ref('interviewAnswer')] });
  const practiceFields = ['followUps', 'practiceProblem'].filter((field) =>
    meaningful(question[field]),
  );
  if (practiceFields.length) {
    slides.push({
      id: 'practice',
      kind: 'practice-and-follow-ups',
      contentRefs: practiceFields.map(ref),
    });
  }
  return { slides };
}

function validateAnnotation(annotation, slideKind, label) {
  if (annotation === undefined) return;
  requireValue(
    annotation?.reviewStatus === 'reviewed' &&
      typeof annotation.text === 'string' &&
      annotation.text.trim(),
    `${label}: annotations must contain reviewed text`,
  );
  requireValue(
    (annotation.kind === 'scenario' && slideKind === 'real-world-scenario') ||
      (annotation.kind === 'comparison' && slideKind === 'visual-comparison'),
    `${label}: annotation kind does not match ${slideKind}`,
  );
}

function validateAudience(audienceEmphasis, label) {
  if (audienceEmphasis === undefined) return;
  requireValue(
    Array.isArray(audienceEmphasis) &&
      audienceEmphasis.length > 0 &&
      new Set(audienceEmphasis).size === audienceEmphasis.length &&
      audienceEmphasis.every((audience) => audienceSet.has(audience)),
    `${label}: invalid audience emphasis`,
  );
}

function validateSlideContent(slide, question, label, runtime) {
  requireValue(slideKindSet.has(slide.kind), `${label}: unsupported slide kind ${slide.kind}`);
  requireValue(
    Array.isArray(slide.contentRefs) &&
      (slide.contentRefs.length > 0 || slide.annotation !== undefined),
    `${label}: slide has no canonical content or reviewed annotation`,
  );
  for (const reference of slide.contentRefs ?? []) {
    requireValue(contentFieldSet.has(reference?.field), `${label}: unsupported content target`);
    if (runtime) {
      requireValue(
        reference.contentId === question.id,
        `${label}: content reference does not target ${question.id}`,
      );
    }
    requireValue(
      meaningful(question[reference.field]),
      `${label}: missing canonical target ${reference.field}`,
    );
  }
  validateAnnotation(slide.annotation, slide.kind, label);
  validateAudience(slide.audienceEmphasis, label);
}

export function validateAnswerSlidePlan(question) {
  const plan = question.answerSlides;
  if (plan === undefined) return;
  const label = `${question.id}: answer slide plan`;
  requireValue(
    plan?.schemaVersion === answerSlidePlanSchemaVersion,
    `${label}: unsupported schema version`,
  );
  requireValue(Array.isArray(plan.slides) && plan.slides.length > 0, `${label}: empty deck`);
  validateAudience(plan.audienceEmphasis, label);
  const ids = new Set();
  for (const slide of plan.slides) {
    requireValue(idPattern.test(slide?.id ?? ''), `${label}: invalid slide id ${slide?.id}`);
    requireValue(!ids.has(slide.id), `${label}: duplicate slide id ${slide.id}`);
    ids.add(slide.id);
    validateSlideContent(slide, question, `${label} ${slide.id}`, false);
  }
}

export function validateAnswerSlideDeck(deck, { question, detailRef }) {
  const label = `${question.id}: answer slide deck`;
  requireValue(deck?.schemaVersion === answerSlideSchemaVersion, `${label}: unsupported schema`);
  requireValue(deck.id === `${question.id}-answer`, `${label}: unstable deck id`);
  requireValue(
    deck.mode === 'derived' || deck.mode === 'curated',
    `${label}: unsupported derivation mode`,
  );
  requireValue(deck.sourceContentId === question.id, `${label}: source content id mismatch`);
  requireValue(
    detailRef?.kind === 'content-item' &&
      deck.source?.kind === detailRef.kind &&
      deck.source?.href === detailRef.href,
    `${label}: source reference mismatch`,
  );
  requireValue(
    versionPattern.test(deck.source?.version ?? '') && deck.source.version === detailRef.version,
    `${label}: stale source content version`,
  );
  requireValue(Array.isArray(deck.slides) && deck.slides.length > 0, `${label}: empty deck`);
  validateAudience(deck.audienceEmphasis, label);
  const ids = new Set();
  for (const [index, slide] of deck.slides.entries()) {
    requireValue(
      idPattern.test(slide?.id ?? '') && slide.id.startsWith(`${deck.id}-`),
      `${label}: invalid slide id ${slide?.id}`,
    );
    requireValue(!ids.has(slide.id), `${label}: duplicate slide id ${slide.id}`);
    ids.add(slide.id);
    requireValue(slide.order === index + 1, `${label}: non-deterministic slide order`);
    validateSlideContent(slide, question, `${label} ${slide.id}`, true);
  }
  return deck;
}

export function buildAnswerSlideDeck(question, { detailRef, practiceFormat = 'explain' }) {
  validateAnswerSlidePlan(question);
  const plan = question.answerSlides ?? derivedPlan(question, practiceFormat);
  const deckId = `${question.id}-answer`;
  const deck = {
    schemaVersion: answerSlideSchemaVersion,
    id: deckId,
    mode: question.answerSlides ? 'curated' : 'derived',
    sourceContentId: question.id,
    source: { ...detailRef },
    ...(plan.audienceEmphasis ? { audienceEmphasis: plan.audienceEmphasis } : {}),
    slides: plan.slides.map((slide, index) => ({
      id: `${deckId}-${slide.id}`,
      order: index + 1,
      kind: slide.kind,
      contentRefs: (slide.contentRefs ?? []).map(({ field }) => ({
        contentId: question.id,
        field,
      })),
      ...(slide.audienceEmphasis ? { audienceEmphasis: slide.audienceEmphasis } : {}),
      ...(slide.annotation ? { annotation: slide.annotation } : {}),
    })),
  };
  return validateAnswerSlideDeck(deck, { question, detailRef });
}

export function answerSlideDeckReference(deck, href) {
  return {
    kind: 'answer-slides',
    href,
    version: contentVersion(deck),
    sourceVersion: deck.source.version,
  };
}
