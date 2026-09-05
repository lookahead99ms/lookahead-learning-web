export type ContentReviewStatus = 'reviewed' | 'needs-review' | 'evolving' | 'planned';
export type ContentPath = 'learn' | 'grow' | 'look-ahead';
export type ContentType =
  | 'q-and-a'
  | 'theory'
  | 'dsa-pattern'
  | 'dsa-problem'
  | 'system-design'
  | 'language-comparison'
  | 'guide';
export type SubscriptionScope = 'platform' | 'path' | 'catalog' | 'module' | 'content-type';
export type PatternLessonSchemaVersion = 'pattern-lesson/v1' | 'pattern-lesson/v2';
export type FoundationLessonSchemaVersion = 'foundation-lesson/v1';
export type LessonSchemaVersion = PatternLessonSchemaVersion | FoundationLessonSchemaVersion;
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
    case 'reviewed':
      return 'Reviewed';
    case 'needs-review':
      return 'Review pending';
    case 'evolving':
      return 'Evolving topic';
    case 'planned':
      return 'Planned';
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
  /** Short learner-facing label used by the sticky article navigation. */
  navLabel?: string;
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
  /** Complete non-visual account of the visual's important states and transitions. */
  visualTranscript?: string[];
}

export interface CodeSolution {
  language: string;
  title: string;
  source: string;
}

export interface EvidenceResponse {
  note: string;
  carl: {
    context: string;
    action: string;
    result: string;
    learning: string;
  };
  star: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
}

export interface PracticeProblemMetadata {
  sourceSets: string[];
  tier: 'guided' | 'core' | 'stretch';
  objective: string;
  constraints?: string[];
  examples?: { input: string; output: string; explanation?: string }[];
  testCases?: {
    name: string;
    input: string;
    expectedOutput: string;
    category: 'representative' | 'boundary' | 'failure';
  }[];
  hints?: string[];
  externalUrl?: string;
  /**
   * `complete` means the entry satisfies the self-contained practice contract.
   * `starter` is catalogued for discovery but still depends on an external contract.
   */
  implementationStatus: 'complete' | 'starter';
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
  /** Optional interview-evidence framing. Never presented as the learner's personal story. */
  evidence?: EvidenceResponse;
  /** Structured metadata for a Hands-On DSA problem. */
  practiceProblem?: PracticeProblemMetadata;
  relatedQuestionIds?: string[];
  visual?: TheoryVisual;
  /** Versioned pattern lessons use the stricter pattern-lesson contract. */
  schemaVersion?: LessonSchemaVersion;
  /** Canonical problem references used by pattern-lesson/v2 source records. */
  essentialProblemRefs?: DsaProblemReference[];
  canonicalProblemRef?: { problemId: string; lessonId?: string };
  /** Runtime-only resolution of a canonical problem reference. */
  canonicalProblem?: PatternProblemV1;
}

export interface PatternSourceLine {
  id: string;
  text: string;
}

export interface PatternCodeBlock {
  language: 'pseudocode' | PatternLanguage;
  title: string;
  lines: PatternSourceLine[];
  controlFlow?: {
    entryAnchor: string;
    transitions: Record<string, string[]>;
    terminalAnchors: string[];
  };
}

export type GuidedTraceCellState =
  'active' | 'boundary' | 'changed' | 'discarded' | 'range' | 'related' | 'resolved';

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
  category?: 'representative' | 'boundary' | 'failure';
  explanation?: string;
}

export interface PatternProblemV1 {
  id: string;
  title: string;
  description: string;
  difficulty: InterviewQuestion['difficulty'];
  variation: string;
  invariantAdaptation: string;
  complexity: {
    time: string;
    space: string;
    why: string;
    /** Important qualification such as hash-table worst case or a bounded alphabet. */
    caveat?: string;
  };
  fixtures: PatternProblemFixture[];
  implementations: PatternCodeBlock[];
  traceSemantics?: 'source-line/v1';
  trace: GuidedTraceV1;
  fixtureTraces?: GuidedTraceV1[];
  practice?: PatternProblemPractice;
  practiceQuestionId?: string;
}

export interface PatternProblemPractice {
  statement: {
    prompt: string;
    inputs: string[];
    output: string;
    constraints: string[];
    edgeCases: string[];
  };
  starters: Record<PatternLanguage, string>;
  sourceUrl?: string;
  hints: string[];
  canonicalApproach: {
    whyThisApproach: string;
    whyOptimal: string;
    whenAssumptionChanges: string;
  };
  commonMistakes: string[];
  checks: { kind: 'explain' | 'trace' | 'transfer'; prompt: string; expected: string }[];
}

export type DsaFixtureValue =
  null | boolean | number | string | DsaFixtureValue[] | { [key: string]: DsaFixtureValue };

export interface DsaProblemReference {
  problemId: string;
}

export interface DsaProblemPlacement {
  path: ContentPath;
  courseId: string;
  role: 'essential' | 'practice' | 'transfer';
  lessonId?: string;
  moduleId?: string;
  questionId?: string;
  order?: number;
}

export interface DsaContentRoute {
  path: ContentPath;
  courseId: string;
  questionId: string;
  title: string;
}

export interface DsaProblemNavigationLink extends DsaContentRoute {
  problemId: string;
}

export interface DsaProblemNavigationContext {
  lesson: DsaContentRoute;
  handsOnPatternId: string;
  previous?: DsaProblemNavigationLink;
  next?: DsaProblemNavigationLink;
}

export interface DsaProblemNavigation extends DsaProblemNavigationContext {
  /** Alternate curriculum contexts for problems intentionally reused across patterns. */
  alternates?: DsaProblemNavigationContext[];
}

export interface DsaProblemContract {
  entryPoints: Record<PatternLanguage, string>;
  parameters: { name: string; type: string; description: string }[];
  returns: { type: string; description: string };
}

export interface DsaProblemFixtureV2 extends PatternProblemFixture {
  arguments: Record<string, DsaFixtureValue>;
  expected: DsaFixtureValue;
}

/** Canonical, course-independent source for one complete DSA practice experience. */
export interface DsaProblemV2 extends Omit<
  PatternProblemV1,
  'fixtures' | 'practice' | 'practiceQuestionId'
> {
  schemaVersion: 'dsa-problem/v2';
  contentType: 'dsa-problem';
  aliases: string[];
  tags: string[];
  languages: PatternLanguage[];
  contract: DsaProblemContract;
  placements: DsaProblemPlacement[];
  navigation: DsaProblemNavigation;
  fixtures: DsaProblemFixtureV2[];
  practice: PatternProblemPractice;
  /** Derived by the compatibility loader from the primary practice placement. */
  practiceQuestionId?: string;
}

export type UnderstandingCheckCategory =
  'recognition' | 'invariant' | 'complexity' | 'edge-case' | 'comparison';

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
  /** Canonical theory lesson when this is an intentional cross-lesson transfer. */
  sourceLessonId?: string;
}

export interface PatternWorkedExample {
  id: string;
  title: string;
  input: string;
  expectedOutput: string;
  explanation: string;
  steps: string[];
}

export interface PatternMemoryAnchor {
  phrase: string;
  mentalModel: string;
  retrievalCue: string;
}

export interface PatternInterviewRecall {
  prompt: string;
  answerFramework: string[];
}

export interface LessonReviewEvidence {
  technical: boolean;
  editorial: boolean;
  ux: boolean;
  accessibility: boolean;
  note: string;
}

export interface LessonPitfall {
  failedAssumption: string;
  symptom: string;
  correction: string;
}

export interface FoundationLessonModel {
  heading: string;
  representation: string;
  invariant: string;
  operationLens: string;
  selectionRule: string;
}

/**
 * A compact golden contract for foundation topics. It preserves the same
 * orientation, invariant, retrieval, and transfer loop as a pattern lesson
 * without pretending every structure or complexity concept is a pattern.
 */
export interface FoundationLessonV1 extends InterviewQuestion {
  schemaVersion: 'foundation-lesson/v1';
  summary: string;
  learningOutcomes: string[];
  memoryAnchor: PatternMemoryAnchor;
  foundationModel: FoundationLessonModel;
  interviewRecall: PatternInterviewRecall;
  pitfalls: LessonPitfall[];
  checks: PatternCheckReference[];
  practice?: PatternPracticeReference[];
  keyTakeaways: string[];
  languageNotes: { language: string; note: string }[];
  reviewEvidence: LessonReviewEvidence;
  /** Hard, high-frequency topics must use an interactive visual rather than prose alone. */
  visualDepth?: 'standard' | 'enhanced';
  sections: TheorySection[];
  visuals?: never;
  relatedQuestionIds?: never;
}

export interface NamedAlgorithmReference {
  name: string;
  family: string;
  useWhen: string;
  invariant: string;
  complexity: string;
  memoryAnchor: string;
}

export interface PatternLessonV1 extends InterviewQuestion {
  schemaVersion: 'pattern-lesson/v1';
  /** Opts an upgraded lesson into non-overlapping guided and transfer problems. */
  practiceSetPolicy?: 'guided-plus-distinct-transfer';
  /** Temporary reviewer sequence; omit to preserve the curriculum-authored array order. */
  essentialProblemReviewOrder?: string[];
  summary: string;
  learningOutcomes: string[];
  memoryAnchor: PatternMemoryAnchor;
  interviewRecall: PatternInterviewRecall;
  namedAlgorithms?: NamedAlgorithmReference[];
  definition: { heading: string; body: string[]; maintainedState: string };
  motivation: { heading: string; body: string[]; avoidedWork: string };
  recognition: { heading: string; body: string[]; signals: string[]; falseFriends: string[] };
  model: { heading: string; state: string; invariant: string; decisionRule: string; proof: string };
  variations: { id: string; title: string; trigger: string; invariant: string }[];
  template: {
    heading: string;
    introduction: string[];
    pseudocode: PatternCodeBlock;
    implementations: PatternCodeBlock[];
  };
  conceptVisual: { heading: string; body: string[]; visual: TheoryVisual; transcript: string[] };
  complexity: { time: string; space: string; note: string; why: string[]; tradeoffs: string[] };
  pitfalls: LessonPitfall[];
  guidance: { useWhen: string[]; avoidWhen: string[] };
  workedExamples: PatternWorkedExample[];
  essentialProblems: PatternProblemV1[];
  checks: PatternCheckReference[];
  practice: PatternPracticeReference[];
  keyTakeaways: string[];
  languageNotes: { language: string; note: string }[];
  reviewEvidence: LessonReviewEvidence;
  sections?: never;
  visuals?: never;
  relatedQuestionIds?: never;
}

export type PatternLessonV2 = Omit<PatternLessonV1, 'schemaVersion' | 'essentialProblems'> & {
  schemaVersion: 'pattern-lesson/v2';
  essentialProblemRefs: DsaProblemReference[];
  /** Populated in memory by ContentService; canonical source files contain only references. */
  essentialProblems?: DsaProblemV2[];
};

export type PatternLesson = PatternLessonV1 | PatternLessonV2;

export function isPatternLesson(item: InterviewQuestion): item is PatternLesson {
  return item.schemaVersion === 'pattern-lesson/v1' || item.schemaVersion === 'pattern-lesson/v2';
}

export function isFoundationLessonV1(item: InterviewQuestion): item is FoundationLessonV1 {
  return item.schemaVersion === 'foundation-lesson/v1';
}

export interface SearchDocument {
  id: string;
  contentId: string;
  path: ContentPath;
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  contentType: ContentType;
  tags: string[];
  filterTags: string[];
  languages: PatternLanguage[];
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
  /** Replaces "Subpattern" when a family contains tracks, variants, or another unit type. */
  subUnitLabel?: string;
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

/** Catalog metadata derived from the searchable curriculum, never hand-maintained. */
export interface CatalogOverviewItem extends CatalogItem {
  lessonCount: number;
  questionCount: number;
  moduleCount: number;
  topicPreview: string[];
  languages: PatternLanguage[];
}
