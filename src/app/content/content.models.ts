export type ContentReviewStatus = 'reviewed' | 'needs-review' | 'evolving' | 'planned';
export type ContentPath = 'learn' | 'grow' | 'look-ahead';
export type ContentType = 'q-and-a' | 'theory' | 'dsa-pattern' | 'system-design' | 'language-comparison' | 'guide';
export type SubscriptionScope = 'platform' | 'path' | 'catalog' | 'module' | 'content-type';
export type PatternLessonSchemaVersion = 'pattern-lesson/v1';
export type PatternLanguage = 'java' | 'python' | 'go';

export interface ContentAccess {
  tier: 'free' | 'premium';
  subscriptionIds?: string[];
  scope?: SubscriptionScope;
  resourceId?: string;
}

/**
 * Records an intended entitlement boundary without changing a resource's
 * current availability. It lets curriculum work proceed before pricing is set.
 */
export interface AccessPlaceholder {
  candidateSubscriptionIds: string[];
  scope: SubscriptionScope;
  note: string;
}

export function highlightGrow(text: string | undefined): string {
  return (text ?? '').replace(/\bgrow\b/gi, '<strong class="grow-highlight">GROW</strong>');
}

export function highlightLearn(text: string | undefined): string {
  return (text ?? '').replace(/\blearn\b/gi, '<strong class="learn-highlight">LEARN</strong>');
}

export function growTagline(text: string | undefined): string {
  return (text ?? '').match(/\bgrow\b[\s\S]*/i)?.[0] ?? '';
}

export function reviewStatusLabel(status: ContentReviewStatus): string {
  switch (status) {
    case 'reviewed': return 'Reviewed';
    case 'needs-review': return 'Review pending';
    case 'evolving': return 'Evolving topic';
    case 'planned': return 'Planned';
  }
}

export interface CompatibilityRequirement {
  technology: string;
  version: string;
}

export interface TheoryCallout {
  type: 'key-idea' | 'example' | 'production';
  title: string;
  text: string;
}

export interface TheoryVisual {
  type: 'diagram' | 'chart' | 'comparison' | 'interactive';
  assetPath: string;
  alt: string;
  caption?: string;
}

export interface TheorySection {
  id: string;
  heading: string;
  body: string[];
  callout?: TheoryCallout;
  code?: { language: string; title: string; source: string };
  solutions?: CodeSolution[];
  /** Hide the editable practice tab when the solutions are reference material. */
  showPractice?: boolean;
  /** Apply a language-specific editor theme to reference solutions. */
  useLanguageThemes?: boolean;
  /** Three independently selectable, traceable pattern problems. */
  essentialProblems?: PatternEssentialProblem[];
  visual?: TheoryVisual;
}

export interface CodeSolution {
  language: string;
  title: string;
  source: string;
}

/** A selectable, fully worked problem within a pattern article. */
export interface PatternEssentialProblem {
  id: string;
  title: string;
  description: string;
  complexity: { time: string; space: string };
  variants: { id: string; label: string; input: string; expectedOutput: string }[];
  solutions: CodeSolution[];
  visual?: TheoryVisual;
}

export interface InterviewQuestion {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tags: string[];
  interviewAnswer: string;
  explanation: string[];
  code?: { language: string; title: string; source: string };
  solutions?: CodeSolution[];
  complexity?: { time: string; space: string; note: string };
  compatibility?: CompatibilityRequirement[];
  versionNotes: string[];
  followUps: { question: string; answer: string }[];
  reviewStatus?: ContentReviewStatus;
  contentType?: ContentType;
  access?: ContentAccess;
  accessPlaceholder?: AccessPlaceholder;
  summary?: string;
  estimatedReadMinutes?: number;
  sections?: TheorySection[];
  visuals?: TheoryVisual[];
  keyTakeaways?: string[];
  /** Per-language implementation notes, rendered as their own callout card. */
  languageNotes?: { language: string; note: string }[];
  /** Canonical theory article for a Q&A or practice item. */
  relatedArticleId?: string;
  relatedQuestionIds?: string[];
  visual?: TheoryVisual;
  /** Versioned pattern lessons use the stricter PatternLessonV1 contract. */
  schemaVersion?: PatternLessonSchemaVersion;
}

export interface PatternSourceLine {
  id: string;
  text: string;
}

export interface PatternCodeBlock {
  language: 'pseudocode' | PatternLanguage;
  title: string;
  lines: PatternSourceLine[];
}

export type GuidedTraceCellState = 'active' | 'boundary' | 'changed' | 'discarded' | 'range' | 'related' | 'resolved';

export interface GuidedTraceCell {
  value: string;
  note?: string;
  states?: GuidedTraceCellState[];
}

export interface GuidedTraceRow {
  id: string;
  label: string;
  cells: GuidedTraceCell[];
}

export interface GuidedTraceVariable {
  name: string;
  type: string;
  value: string;
  changed?: boolean;
}

export interface GuidedTraceEvent {
  id: string;
  label: string;
  phase: string;
  timing: 'before' | 'after';
  sourceAnchor: Record<PatternLanguage, string>;
  what: string;
  why: string;
  variables: GuidedTraceVariable[];
  rows: GuidedTraceRow[];
  result?: string;
}

export interface GuidedTraceV1 {
  schemaVersion: 'guided-trace/v1';
  id: string;
  fixtureId: string;
  invariant: string;
  legend: { state: GuidedTraceCellState; label: string }[];
  events: GuidedTraceEvent[];
}

export interface PatternProblemFixture {
  id: string;
  label: string;
  input: string;
  expectedOutput: string;
}

export interface PatternProblemV1 {
  id: string;
  title: string;
  description: string;
  difficulty: InterviewQuestion['difficulty'];
  variation: string;
  invariantAdaptation: string;
  complexity: { time: string; space: string; why: string };
  fixtures: PatternProblemFixture[];
  implementations: PatternCodeBlock[];
  trace: GuidedTraceV1;
}

export type UnderstandingCheckCategory = 'recognition' | 'invariant' | 'complexity' | 'edge-case' | 'comparison';

export interface PatternCheckReference {
  questionId: string;
  category: UnderstandingCheckCategory;
}

export interface ResolvedPatternCheck {
  id: string;
  category: UnderstandingCheckCategory;
  prompt: string;
  answer: string;
  explanation: string[];
}

export interface PatternPracticeReference {
  questionId: string;
  reason: string;
  variation: string;
}

export interface PatternWorkedExample {
  id: string;
  title: string;
  input: string;
  expectedOutput: string;
  explanation: string;
  steps: string[];
}

export interface PatternLessonV1 extends InterviewQuestion {
  schemaVersion: 'pattern-lesson/v1';
  /** Opts an upgraded lesson into non-overlapping guided and transfer problems. */
  practiceSetPolicy?: 'guided-plus-distinct-transfer';
  summary: string;
  learningOutcomes: string[];
  definition: { heading: string; body: string[]; maintainedState: string };
  motivation: { heading: string; body: string[]; avoidedWork: string };
  recognition: { heading: string; body: string[]; signals: string[]; falseFriends: string[] };
  model: { heading: string; state: string; invariant: string; decisionRule: string; proof: string };
  variations: { id: string; title: string; trigger: string; invariant: string }[];
  template: { heading: string; introduction: string[]; pseudocode: PatternCodeBlock; implementations: PatternCodeBlock[] };
  conceptVisual: { heading: string; body: string[]; visual: TheoryVisual; transcript: string[] };
  complexity: { time: string; space: string; note: string; why: string[]; tradeoffs: string[] };
  pitfalls: { failedAssumption: string; symptom: string; correction: string }[];
  guidance: { useWhen: string[]; avoidWhen: string[] };
  workedExamples: PatternWorkedExample[];
  essentialProblems: PatternProblemV1[];
  checks: PatternCheckReference[];
  practice: PatternPracticeReference[];
  keyTakeaways: string[];
  languageNotes: { language: string; note: string }[];
  reviewEvidence: { technical: boolean; editorial: boolean; ux: boolean; accessibility: boolean; note: string };
  sections?: never;
  visuals?: never;
  relatedQuestionIds?: never;
}

export function isPatternLessonV1(item: InterviewQuestion): item is PatternLessonV1 {
  return item.schemaVersion === 'pattern-lesson/v1';
}

export interface SearchDocument {
  id: string;
  path: ContentPath;
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  contentType: ContentType;
  tags: string[];
  filterTags: string[];
  difficulty?: InterviewQuestion['difficulty'];
  preview: string;
  access: ContentAccess;
  searchableText: string;
  route?: string[];
  question?: InterviewQuestion;
}

export interface CourseModule {
  id: string;
  order: number;
  title: string;
  description: string;
  reviewStatus?: ContentReviewStatus;
  access?: ContentAccess;
  accessPlaceholder?: AccessPlaceholder;
}

export interface CourseSection {
  id: string;
  title: string;
  description: string;
  moduleIds: string[];
  accessPlaceholder?: AccessPlaceholder;
}

/**
 * An explicit learning journey for courses whose material is organised around
 * repeatable concepts rather than a simple module catalogue.
 */
export interface CourseLearningUnit {
  id: string;
  title: string;
  description: string;
  theoryModuleId: string;
  /** Introductory units can opt out of the numbered pattern sequence. */
  hideOrder?: boolean;
  /** Roadmap entries without published content stay visible but are not navigable. */
  planned?: boolean;
  questionModuleId?: string;
  practiceModuleId?: string;
  /** Related techniques can sit beneath one learner-facing concept family. */
  subUnits?: CourseLearningUnit[];
}

export type CourseLayout = 'tiles' | 'learning-map';

export interface CourseContent {
  id: string;
  path: string;
  title: string;
  description: string;
  chips?: string[];
  version: string;
  modules: CourseModule[];
  sections?: CourseSection[];
  /** Defaults to tiles so existing courses retain their current presentation. */
  layout?: CourseLayout;
  learningUnits?: CourseLearningUnit[];
  questions: InterviewQuestion[];
  reviewStatus?: ContentReviewStatus;
  access?: ContentAccess;
  accessPlaceholder?: AccessPlaceholder;
}

export interface CatalogItem {
  id?: string;
  title: string;
  description?: string;
  /** Optional direct entry lesson for a course with one published learning unit. */
  entryContentId?: string;
  available?: boolean;
  reviewStatus?: ContentReviewStatus;
  access?: ContentAccess;
}
