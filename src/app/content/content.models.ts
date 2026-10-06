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
export type PracticeFormat = 'explain' | 'solve' | 'design' | 'debug' | 'rehearse';
export type SubscriptionScope = 'platform' | 'path' | 'catalog' | 'module' | 'content-type';
export type PatternLessonSchemaVersion = 'pattern-lesson/v1' | 'pattern-lesson/v2';
export type FoundationLessonSchemaVersion = 'foundation-lesson/v1';
export type LessonSchemaVersion = PatternLessonSchemaVersion | FoundationLessonSchemaVersion;
export type PatternLanguage = 'java' | 'python' | 'go';

export interface ContentAccess {
  tier: 'free' | 'premium';
  public?: boolean;
  scopes?: string[];
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
  type: 'diagram' | 'chart' | 'comparison' | 'interactive' | 'storyboard';
  assetPath: string;
  alt: string;
  caption?: string;
  /** type "storyboard" only: how the lesson shell plays the SVG frame by frame. */
  storyboard?: TheoryStoryboard;
}

/**
 * A scripted animation (algo-pattern-v1 and the DSA concept courses): an SVG drawn in its last frame plus frames.
 * The lesson page (LessonStoryboard) inlines a sanitized copy (allowlisted SVG elements and attributes only; no
 * script, style, event handler, image or link) and plays it when it scrolls into view, holds the last frame,
 * loops, and pauses off screen; under reduced motion it shows the last frame. Elements opt in with data attributes:
 *   data-sb-show="2" | "2-5" | "2-" | "0,4-6"  visible only on those frames ("2-" = to the end; fades in and out);
 *   data-sb-text="start|step 1|…"               one text per frame;
 *   data-sb-at="n10 n20 …"                      a mover: the id of the element it stands on, per frame;
 *   data-sb-route="#pathId"                     optional: the mover travels along that path between frames;
 *   data-sb-stops="0 0.1 …"                     instead of data-sb-at: a fraction of the route's length per frame.
 * Colors come from the app theme through fixed class names (node, val, edge, edge-back, label, box, entry, hit,
 * result, counter, ring inside a slow, fast, p or walker mover, …); see storyboard-player.ts.
 */
export interface TheoryStoryboard {
  /** One entry per frame. ms: travel time into this frame; wait: pause after it (default 300 ms). */
  frames: { ms: number; wait?: number }[];
  /** Pause on the final frame before the loop starts again (default 5000 ms). */
  holdMs?: number;
  /** Optional drawing for narrow columns (same frames and data attributes), used below narrowBelow px of drawing width. */
  narrowAssetPath?: string;
  narrowBelow?: number;
  /** Status line beside the Pause/Play toggle: while playing, and on the final frame. */
  playingStatus?: string;
  doneStatus?: string;
  /** Small key under the drawing: a pointer ring style and its meaning. */
  legend?: { mark: 'slow' | 'fast' | 'p' | 'walker' | 'none'; text: string }[];
}

/** algo-pattern-v1 Problem first: the problem the lesson opens with, shown as a card above the drawing. */
export interface TheoryProblemCard {
  title: string;
  /** Easy, Medium or Hard (shown in capitals). */
  difficulty: string;
  /** Where the problem is known from, e.g. "LeetCode 141". */
  source?: string;
  statement: string;
  /** One line of inputs and answers; inline HTML allowed. */
  example?: string;
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
  /** System lessons (lessonPattern "system-v1") group sections by team stage. */
  stage?: LessonStageId;
  /** Also link this section from the right sidebar's practice list. */
  sidebar?: boolean;
  /** A small comparison table (cells allow inline HTML), shown after body[afterParagraph]. */
  table?: TheoryTable;
  /** System lessons: what the code printed, shown as a run console under the code. */
  output?: TheoryOutput;
  /** System lessons: several files shown as tabs, each with its own explanation. */
  codeTabs?: TheoryCodeTab[];
  /** System lessons, Debug stage: numbered problem/fix pairs. */
  pairs?: TheoryPair[];
  /** Column labels for pairs, e.g. {broken: 'Weak answer', fixed: 'Strong answer'}. */
  pairLabels?: { broken: string; fixed: string };
  /** Story practice: a speaking timer with an optional prompt. */
  practiceTimer?: { seconds: number; prompt?: string };
  /** System lessons: Quick revision as numbered cheat-sheet tiles plus exact facts. */
  cheatSheet?: TheoryCheatSheet;
  /** 2-4 small titled cards after the body, e.g. "Functional requirements" | "Non-functional requirements". */
  cards?: TheorySectionCard[];
  /** algo-pattern-v1: show the table and the visual side by side (a trace beside its animation). */
  tableBesideVisual?: boolean;
  /** algo-pattern-v1 Problems stage: practice problems from easy to hard, each linked to its problem page. */
  ladder?: TheoryLadderStep[];
  /** algo-pattern-v1 Spot the pattern stage: one-line problems; the learner picks a pattern, then sees why. */
  spot?: TheorySpotDrill;
  /** Recognize the Pattern: draw this section's table (#, Unit, Signal, What you remember) as the pattern explorer. */
  patternMap?: TheoryPatternMap;
  /** algo-pattern-v1 Problem first: the problem card; the body explains the first approach beside the storyboard. */
  problem?: TheoryProblemCard;
  /** Problem first: one cost line under the explanation (inline HTML). */
  cost?: string;
  /** A storyboard visual with the body beside it (stacked in a narrow column); code and tables follow below. */
  visualBeside?: boolean;
}

/** One rung of a practice ladder: a hands-on DSA problem and what it adds to the rung before. */
export interface TheoryLadderStep {
  /** Practice page in the same course (route /<path>/<courseId>/<questionId>). */
  questionId: string;
  /** Canonical DSA problem id (runtime/learn/dsa-problems). */
  problemId: string;
  title: string;
  difficulty: string;
  /** One line on what this rung adds; inline HTML allowed. */
  newIdea: string;
}

export interface TheorySpotDrill {
  /** This lesson's pattern; one of the options. */
  pattern: string;
  options: string[];
  items: { statement: string; answer: string; why: string }[];
}

/** A small side-by-side card inside a section; points allow the same inline HTML as body text. */
export interface TheorySectionCard {
  title: string;
  points: string[];
}

/** Design Rounds: one timed step of the interview walkthrough (e.g. "0-5 min" Requirements). */
export interface QuestionWalkthroughStep {
  id: string;
  /** Time label, e.g. "0-5 min". */
  label: string;
  heading: string;
  body: string[];
  visual?: TheoryVisual;
  visualTranscript?: string[];
  /** A small comparison table, same shape as a lesson section table; follows body[afterParagraph] (default: the end). */
  table?: TheoryTable;
  /** 2-4 small titled cards after the step body, same shape and rules as lesson section cards. */
  cards?: TheorySectionCard[];
}

/** Short title for side navigation, module lists and sticky navigation; the page heading keeps the full title. */
export function navTitle(item: { title: string; navTitle?: string }): string {
  return item.navTitle?.trim() || item.title;
}

export interface TheoryCheatSheet {
  /** DSA core courses: the template as Java | Python | Go tabs (lines of the Walkthrough program, no console). */
  codeTabs?: Omit<TheoryCodeTab, 'body' | 'output'>[];
  tiles: { title: string; points: string[] }[];
  facts: string[];
}

export interface TheoryOutput {
  title: string;
  command?: string;
  text: string;
  /** Tool window label: Run (default), Build (compiler) or Test. */
  tool?: string;
  exitCode?: number;
  /** Shown under the console, e.g. which lines of a longer log are shown. */
  note?: string;
  /** "clock": a real run whose times and verdict depend on when it ran. */
  varies?: string;
}

/** One side of a Debug pair: the code, a short note and what the run printed. */
export interface TheoryPairSide {
  /** Fixed side only: the fix in a few words. */
  title?: string;
  body: string[];
  /** Absent or empty for a side that is a note plus a table (no code). */
  codeTabs?: Omit<TheoryCodeTab, 'body'>[];
  /** Absent for plain-text pairs (for example a weak and a strong interview answer). */
  output?: TheoryOutput;
  /** A small comparison table shown where the run console would be (same shape as a section table). */
  table?: TheoryTable;
  /** Fixed side only: names of broken-side files the fix deletes. A file left out without being named here is unchanged. */
  deletedFiles?: string[];
}

/** DLV-408 Debug stage: one problem the testers found, with the broken and fixed code side by side. */
export interface TheoryPair {
  n: number;
  title: string;
  problem: string[];
  broken: TheoryPairSide;
  fixed: TheoryPairSide;
}

export interface TheoryCodeTab {
  id: string;
  title: string;
  language: string;
  source: string;
  body: string[];
  /**
   * DSA core courses: Java | Python | Go tabs (id = language) carry the console of their own run,
   * so the console switches with the code. File tabs leave it out.
   */
  output?: TheoryOutput;
}

/** One signal in the pattern explorer: what it narrows, which units fit and when, and what to check first. */
export interface TheoryPatternSignal {
  key: string;
  /** Words a learner might type for this signal (matched as whole words). */
  aliases: string[];
  intro: string;
  /** `unit` is the 1-based row of the section table. */
  candidates: { unit: number; when: string }[];
  check: string;
}

export interface TheoryPatternMap {
  orderLabel: string;
  orderNote?: string;
  /** Lesson route for each table row, in row order. */
  lessonHrefs: string[];
  signals: TheoryPatternSignal[];
}

export interface LessonRunLocally {
  /** What to install (JDK, build tool, versions the code was tested on). */
  requirements: string[];
  /** Differences on other supported versions. */
  versionNotes?: string[];
  /** How to open and run the project. */
  steps: string[];
  /** The project bundle (JSON) that the page packs into a .zip. */
  download?: { href: string; label?: string };
}

export interface TheoryTable {
  caption?: string;
  columns: string[];
  rows: string[][];
  /** Index of the body paragraph the table follows; defaults to the end of the body. */
  afterParagraph?: number;
}

/** DLV-408: the nine stages a team takes a problem through, used as lesson navigation groups. */
export const LESSON_STAGES = [
  { id: 'brief', label: 'Brief' },
  { id: 'understand', label: 'Understand' },
  { id: 'build', label: 'Build' },
  /** Break and Fix, merged: each problem and its fix side by side (troubleshooting). */
  { id: 'debug', label: 'Debug' },
  { id: 'ship', label: 'Ship' },
  { id: 'own', label: 'Own' },
  { id: 'prove', label: 'Prove' },
  { id: 'keep', label: 'Keep' },
] as const;

/**
 * Look Ahead family patterns (DLV-408 follow-up). Each pattern has its own stage list; `slots` say
 * which stage hosts the fixed blocks (scenario card, common mistakes, interview answer, checks and
 * practice, takeaways). system-v1 keeps the Learn and Grow flow unchanged.
 */
export interface LessonStage {
  id: string;
  label: string;
}

export interface LessonPatternDefinition {
  stages: readonly LessonStage[];
  /** null: the pattern does not show that fixed block (its own sections cover it). */
  slots: {
    scenario: string | null;
    mistakes: string | null;
    interview: string | null;
    prove: string;
    keep: string | null;
  };
  /** Stages that render even without authored sections, because they host fixed blocks. */
  alwaysRendered: readonly string[];
}

export const LESSON_PATTERNS: Record<string, LessonPatternDefinition> = {
  'system-v1': {
    stages: LESSON_STAGES,
    slots: { scenario: 'brief', mistakes: 'debug', interview: 'own', prove: 'prove', keep: 'keep' },
    alwaysRendered: ['brief', 'debug', 'own', 'prove', 'keep'],
  },
  'fundamental-v1': {
    stages: [
      { id: 'overview', label: 'Overview' },
      { id: 'brief', label: 'Brief' },
      { id: 'understand', label: 'How it works' },
      { id: 'debug', label: 'Debug' },
      { id: 'scale', label: 'At scale' },
      { id: 'interview', label: 'Interview' },
      { id: 'keep', label: 'Keep' },
    ],
    slots: { scenario: 'brief', mistakes: 'debug', interview: 'interview', prove: 'interview', keep: 'keep' },
    alwaysRendered: ['brief', 'debug', 'interview', 'keep'],
  },
  'pattern-v1': {
    stages: [
      { id: 'overview', label: 'Overview' },
      { id: 'brief', label: 'Problem' },
      { id: 'pattern', label: 'Pattern' },
      { id: 'variants', label: 'Variants' },
      { id: 'debug', label: 'Debug' },
      { id: 'tradeoffs', label: 'Trade-offs' },
      { id: 'used', label: 'Where it is used' },
      { id: 'interview', label: 'Interview' },
      { id: 'keep', label: 'Keep' },
    ],
    slots: { scenario: 'brief', mistakes: 'debug', interview: 'interview', prove: 'interview', keep: 'keep' },
    alwaysRendered: ['brief', 'debug', 'interview', 'keep'],
  },
  'design-v1': {
    stages: [
      { id: 'overview', label: 'Overview' },
      { id: 'brief', label: 'Brief' },
      { id: 'estimate', label: 'Estimate' },
      { id: 'design', label: 'Design' },
      { id: 'deepdive', label: 'Deep dive' },
      { id: 'debug', label: 'Debug' },
      { id: 'tradeoffs', label: 'Trade-offs' },
      { id: 'interview', label: 'Interview' },
      { id: 'keep', label: 'Keep' },
    ],
    slots: { scenario: 'brief', mistakes: 'debug', interview: 'interview', prove: 'interview', keep: 'keep' },
    alwaysRendered: ['brief', 'debug', 'interview', 'keep'],
  },
  'leadership-v1': {
    stages: [
      { id: 'situation', label: 'Situation' },
      { id: 'options', label: 'Options' },
      { id: 'decide', label: 'Decide' },
      { id: 'debug', label: 'Debug' },
      { id: 'conversation', label: 'Conversation' },
      { id: 'interview', label: 'Interview' },
      { id: 'keep', label: 'Keep' },
    ],
    slots: { scenario: 'situation', mistakes: 'debug', interview: 'interview', prove: 'interview', keep: 'keep' },
    alwaysRendered: ['situation', 'debug', 'interview', 'keep'],
  },
  'story-v1': {
    stages: [
      { id: 'question', label: 'The question' },
      { id: 'asking', label: 'What they are asking' },
      { id: 'build', label: 'Build your story' },
      { id: 'debug', label: 'Debug' },
      { id: 'followups', label: 'Follow-ups' },
      { id: 'practice', label: 'Practice' },
      { id: 'keep', label: 'Keep' },
    ],
    slots: { scenario: 'question', mistakes: 'debug', interview: 'practice', prove: 'practice', keep: 'keep' },
    alwaysRendered: ['question', 'debug', 'practice', 'keep'],
  },
  /**
   * Learn → Algorithmic Patterns, problem first (pilot 2026-10-01). Authored sections carry every stage;
   * only the checks and Try it yourself block is fixed (in Spot the pattern). Must match PATTERN_STAGES in
   * the content repository's apply_system_lessons.py.
   */
  'algo-pattern-v1': {
    stages: [
      { id: 'problem', label: 'Problem first' },
      { id: 'brief', label: 'Brief' },
      { id: 'walkthrough', label: 'Walkthrough' },
      { id: 'variations', label: 'Variations' },
      { id: 'use', label: 'When to use' },
      { id: 'debug', label: 'Common mistakes' },
      { id: 'problems', label: 'Problems' },
      { id: 'spot', label: 'Spot the pattern' },
      { id: 'keep', label: 'Cheat sheet' },
      { id: 'references', label: 'References' },
    ],
    slots: { scenario: null, mistakes: null, interview: null, prove: 'spot', keep: null },
    alwaysRendered: ['spot'],
  },
  /**
   * Learn → Core Data Structures, Big O, Sorting and Searching: a concept, not a problem (pilot 2026-10-02,
   * Hash Tables). Concept is a storyboard story on a real system; Check yourself holds the fixed checks and
   * Try it yourself block, so it needs no authored section. Must match PATTERN_STAGES in the content
   * repository's apply_system_lessons.py.
   */
  'concept-v1': {
    stages: [
      { id: 'concept', label: 'Concept' },
      { id: 'how', label: 'How it works' },
      { id: 'cost', label: 'Operations and cost' },
      { id: 'code', label: 'Code' },
      { id: 'use', label: 'When to use' },
      { id: 'debug', label: 'Common mistakes' },
      { id: 'practice', label: 'Practice' },
      { id: 'check', label: 'Check yourself' },
      { id: 'keep', label: 'Cheat sheet' },
      { id: 'references', label: 'References' },
    ],
    slots: { scenario: null, mistakes: null, interview: null, prove: 'check', keep: null },
    alwaysRendered: ['check'],
  },
};

export type LessonStageId = string;

/** The real system a lesson teaches through; brands name the kind of product only. */
export interface LearningScenario {
  systemId: string;
  system: string;
  brands: string[];
  /** How this lesson uses the scenario ("This lesson: <focus> in <system>"). */
  why: string;
  /** The lesson's subject, e.g. "Spring Boot" (2026-10-05): headings read "Why Spring Boot?" and "Why Spring Boot matters". */
  subject?: string;
  /** "Why <subject>?": what the subject is for and its main parts (inline HTML). */
  whySubject?: string;
  /** The part of the subject this lesson focuses on, e.g. "auto-configuration". */
  focus?: string;
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

export type AnswerSlideKind =
  | 'interview-question'
  | 'real-world-scenario'
  | 'mental-model'
  | 'visual-comparison'
  | 'code-and-execution'
  | 'trade-offs-and-failure-modes'
  | 'interview-answer'
  | 'practice-and-follow-ups';

export type AnswerSlideContentField =
  | 'title'
  | 'summary'
  | 'interviewAnswer'
  | 'explanation'
  | 'code'
  | 'solutions'
  | 'complexity'
  | 'versionNotes'
  | 'followUps'
  | 'sections'
  | 'visuals'
  | 'keyTakeaways'
  | 'languageNotes'
  | 'evidence'
  | 'practiceProblem'
  | 'visual';

export type AnswerSlideAudience = 'beginner' | 'sde' | 'fde' | 'leadership';

export interface AnswerSlideReviewedAnnotation {
  kind: 'scenario' | 'comparison';
  reviewStatus: 'reviewed';
  text: string;
}

export interface AnswerSlidePlanItem {
  id: string;
  kind: AnswerSlideKind;
  contentRefs?: { field: AnswerSlideContentField }[];
  audienceEmphasis?: AnswerSlideAudience[];
  annotation?: AnswerSlideReviewedAnnotation;
}

/** Optional reviewed ordering metadata; canonical answer fields remain the content authority. */
export interface AnswerSlidePlanV1 {
  schemaVersion: 'answer-slide-plan/v1';
  audienceEmphasis?: AnswerSlideAudience[];
  slides: AnswerSlidePlanItem[];
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
  /** Short title for side navigation and item lists (60 characters at most). */
  navTitle?: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tags: string[];
  interviewAnswer: string;
  /** Design Rounds: timed walkthrough shown before the written interview answer. */
  walkthrough?: QuestionWalkthroughStep[];
  explanation: string[];
  code?: { language: string; title: string; source: string };
  solutions?: CodeSolution[];
  complexity?: { time: string; space: string; note: string };
  compatibility?: CompatibilityRequirement[];
  versionNotes: string[];
  followUps: { question: string; answer: string }[];
  reviewStatus?: ContentReviewStatus;
  contentType?: ContentType;
  /** Learner action represented by this item; independent from its technical subject. */
  practiceFormat?: PracticeFormat;
  /** Optional curated projection metadata. Ordinary answers receive a deterministic derived deck. */
  answerSlides?: AnswerSlidePlanV1;
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
  stateUnavailable?: boolean;
  stateUnavailableReason?: string;
}

export interface GuidedTracePathStep {
  sourceAnchor: string;
  eventIndex: number;
  /** Sparse target-runtime deltas. Python uses the canonical event state directly. */
  variables?: GuidedTraceVariable[];
  /** Optional curated state; array rows are normally derived from selected-language variables. */
  rows?: GuidedTraceRow[];
  result?: string;
  stateUnavailable?: boolean;
  stateUnavailableReason?: string;
}

export interface GuidedTraceV1 {
  schemaVersion: 'guided-trace/v1';
  id: string;
  fixtureId: string;
  invariant: string;
  legend: { state: GuidedTraceCellState; label: string }[];
  events: GuidedTraceEvent[];
  stateSemantics?: 'target-runtime/v1';
  stateTiming?: 'after';
  languagePaths?: Record<PatternLanguage, GuidedTracePathStep[]>;
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
  sourceAttribution?:
    { kind: 'external'; label: string; url: string } | { kind: 'platform'; label: string };
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

/** Optional authored teaching; never inferred from a problem ID or reference source. */
export interface DsaTeachingV1 {
  schemaVersion: 'dsa-teaching/v1';
  problemFraming: string;
  startingApproach: DsaTeachingApproach;
  selectedApproach: DsaTeachingApproach;
  keyDifference: string;
  workedTransition?: { input: string; steps: string[]; outcome: string };
  recall?: DsaTeachingRecall[];
}

/** What a rewritten recall question tests; template questions published before the rewrite have none. */
export type DsaRecallKind =
  | 'concept'
  | 'state'
  | 'correctness'
  | 'complexity'
  | 'trap'
  | 'boundary'
  | 'transfer';

export interface DsaTeachingRecall {
  id: string;
  kind?: DsaRecallKind;
  label: string;
  question: string;
  answer: string[];
  steps?: string[];
  fixtureId?: string;
}

export interface DsaTeachingApproach {
  title: string;
  theory: string[];
  /** Language-neutral teaching; the canonical implementation remains the solution. */
  pseudocode: string[];
  implementationShape?: string[];
  complexity: { time: string; space: string };
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
  teaching?: DsaTeachingV1;
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
  /** Internal review note: kept in the private source, omitted from the protected publication. */
  note?: string;
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

export interface LessonTeachingGuide {
  prerequisite: string;
  exampleTitle: string;
  language: string;
  code: string;
  walkthrough: string[];
  try: string;
  answer: string;
  takeaways: string[];
  later: string;
}

/**
 * A compact golden contract for foundation topics. It preserves the same
 * orientation, invariant, retrieval, and transfer loop as a pattern lesson
 * without pretending every structure or complexity concept is a pattern.
 */
export interface FoundationLessonV1 extends InterviewQuestion {
  schemaVersion: 'foundation-lesson/v1';
  /** An introductory reading path followed by the full lesson inline. */
  beginnerGuide?: LessonTeachingGuide;
  /** Practical Grow or decision-focused Look Ahead first reading path. */
  teachingGuide?: LessonTeachingGuide;
  summary: string;
  /** Opt-in nine-stage layout; lessons without it render exactly as before. */
  lessonPattern?: string;
  /** The skill the learner gains, shown under the title. */
  subtitle?: string;
  /** Legacy 3-5 short header points; no longer rendered (the Overview stage replaces them). */
  subtitlePoints?: string[];
  learningScenario?: LearningScenario;
  beforeYouStart?: string;
  /** Before you start (2026-10-05): lessons on the platform to know first. */
  prerequisites?: { title: string; href: string; where?: string }[];
  /** Before you start: how to run the lesson's code yourself, and its project download. */
  runLocally?: LessonRunLocally;
  learningFlow?: {
    whyItMatters: string;
    practice: { prompt: string; hint: string; answer: string };
    morePractice?: { prompt: string; hint: string; answer: string }[];
  };
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
  beginnerGuide?: LessonTeachingGuide;
  learningFlow?: FoundationLessonV1['learningFlow'];
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

/** A staged lesson: system-v1 (Learn and Grow) or one of the Look Ahead family patterns. */
export function lessonPatternDefinition(lesson: { lessonPattern?: string }): LessonPatternDefinition | null {
  return (lesson.lessonPattern && LESSON_PATTERNS[lesson.lessonPattern]) || null;
}

export function isSystemLesson(item: InterviewQuestion): item is FoundationLessonV1 {
  return isFoundationLessonV1(item) && lessonPatternDefinition(item) !== null;
}

/** Stages with fixed blocks always render; the others render only when authored sections exist. */
export function systemLessonStages(lesson: FoundationLessonV1) {
  const pattern = lessonPatternDefinition(lesson) ?? LESSON_PATTERNS['system-v1'];
  return pattern.stages.map((stage) => ({
    ...stage,
    sections: lesson.sections.filter((section) => section.stage === stage.id),
  })).filter((stage) => stage.sections.length > 0 || pattern.alwaysRendered.includes(stage.id));
}

export interface ContentDetailReference {
  kind: 'content-item' | 'canonical-dsa';
  href: string;
  version: string;
}

export interface AnswerSlideDeckReference {
  kind: 'answer-slides';
  href: string;
  version: string;
  sourceVersion: string;
}

export interface AnswerSlideV1 {
  id: string;
  order: number;
  kind: AnswerSlideKind;
  contentRefs: { contentId: string; field: AnswerSlideContentField }[];
  audienceEmphasis?: AnswerSlideAudience[];
  annotation?: AnswerSlideReviewedAnnotation;
}

/** Lightweight presentation projection; all learner-facing material resolves from `source`. */
export interface AnswerSlideDeckV1 {
  schemaVersion: 'answer-slides/v1';
  id: string;
  mode: 'derived' | 'curated';
  sourceContentId: string;
  source: ContentDetailReference;
  audienceEmphasis?: AnswerSlideAudience[];
  slides: AnswerSlideV1[];
}

export type DiscoveryKind = 'course' | 'topic' | 'lesson' | 'practice' | 'tool';

/** Navigation metadata only; full answers, lesson bodies, code, and traces live in detail assets. */
export interface ContentItemSummary {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  /** Short title for side navigation and item lists. */
  navTitle?: string;
  difficulty: InterviewQuestion['difficulty'];
  tags: string[];
  contentType: ContentType;
  practiceFormat?: PracticeFormat;
  isTheoryArticle: boolean;
  detailRef: ContentDetailReference;
  answerSlidesRef?: AnswerSlideDeckReference;
  reviewStatus?: ContentReviewStatus;
  access?: ContentAccess;
  relatedArticleId?: string;
  schemaVersion?: LessonSchemaVersion;
  canonicalProblemRef?: { problemId: string; lessonId?: string };
}

export interface SearchDocument {
  /** Explicit hard dependencies only; related lessons are optional refresh references. */
  studyPrerequisiteIds?: string[];
  studyRelatedLessonIds?: string[];
  studySequence?: number;
  id: string;
  contentId: string;
  canonicalContentId?: string;
  practicePlacements?: Pick<
    SearchDocument,
    'path' | 'courseId' | 'courseTitle' | 'moduleId' | 'moduleTitle' | 'contentId' | 'route'
  >[];
  path: ContentPath;
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  contentType: ContentType;
  discoveryKind?: DiscoveryKind;
  practiceFormat?: PracticeFormat;
  subjects?: string[];
  tags: string[];
  filterTags: string[];
  languages: PatternLanguage[];
  difficulty?: InterviewQuestion['difficulty'];
  preview: string;
  access: ContentAccess;
  searchableText: string;
  route?: string[];
  detailRef?: ContentDetailReference;
  answerSlidesRef?: AnswerSlideDeckReference;
  question?: InterviewQuestion;
}

export type ContentIndexRecord = Omit<
  SearchDocument,
  'path' | 'filterTags' | 'searchableText' | 'question'
>;

export interface ContentIndexShard {
  schemaVersion: 'content-index-shard/v1';
  path: ContentPath;
  documents: ContentIndexRecord[];
}

export interface ContentIndexShardReference {
  path: ContentPath;
  href: string;
  documentCount: number;
  practiceDocumentCount: number;
  courses: {
    courseId: string;
    locatorHref: string;
    documentCount: number;
    practiceDocumentCount: number;
  }[];
}

export interface ContentIndexManifest {
  schemaVersion: 'content-index-manifest/v1';
  totals: { searchDocuments: number; practiceDocuments: number };
  practiceContentTypes: ContentType[];
  practiceFormats?: PracticeFormat[];
  shards: ContentIndexShardReference[];
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
  /** Selects the shared practice surface; Learn defaults to Hands-On DSA for legacy pattern units. */
  practiceExperience?: 'handsOnDsa' | 'questionBank';
  /** Related techniques can sit beneath one learner-facing concept family. */
  subUnits?: CourseLearningUnit[];
  /** Replaces "Subpattern" when a family contains tracks, variants, or another unit type. */
  subUnitLabel?: string;
  /** Presents the unit as one linked card with an animated scene on the course page. */
  card?: CourseLearningUnitCard;
}

export type CourseLearningUnitCardLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export interface CourseLearningUnitCardPillGroup {
  label: string;
  items: string[];
}

export interface CourseLearningUnitCard {
  summary: string;
  level?: CourseLearningUnitCardLevel;
  minutes?: number;
  /** Inline SVG scene under /content/...; it is sanitized before it is shown. */
  scene?: string;
  sceneAlt?: string;
  pillGroups?: CourseLearningUnitCardPillGroup[];
}

export type CourseLayout = 'tiles' | 'learning-map';

export interface CourseLearningDirection {
  courseId: string;
  /** Explains why this direction is useful or when an alternative fits. */
  reason: string;
}

export interface CourseLearningBackgroundLink {
  path: ContentPath;
  courseId: string;
  title: string;
}

export interface CourseLearningPath {
  guidance: string;
  /** Courses containing useful concepts, not mandatory full-course prerequisites. */
  backgroundCourseIds: string[];
  /** Helpful courses in another stage, with an explicit route and learner-facing title. */
  backgroundCourseLinks?: CourseLearningBackgroundLink[];
  /** The reviewed default progression; null means this course has no authored next step. */
  recommendedNext: CourseLearningDirection | null;
  /** Deliberate role- or skill-dependent branches, never inferred from array order. */
  otherDirections: CourseLearningDirection[];
}

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
  /** Explicit helpful background and optional immediate directions for this course. */
  learningPath?: CourseLearningPath;
  questions: InterviewQuestion[];
  reviewStatus?: ContentReviewStatus;
  access?: ContentAccess;
  accessPlaceholder?: AccessPlaceholder;
}

export type CourseManifest = Omit<CourseContent, 'questions'>;

export interface CourseModuleDetailReference {
  moduleId: string;
  href: string;
  version: string;
  itemIds: string[];
}

export interface CourseContentLocator {
  schemaVersion: 'course-content-locator/v1';
  course: CourseManifest;
  items: ContentItemSummary[];
  modules: CourseModuleDetailReference[];
}

export interface CourseOutline extends CourseManifest {
  questions: ContentItemSummary[];
  moduleDetailRefs: CourseModuleDetailReference[];
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
  /** Q&A records include both interview questions and question-bank practice exercises. */
  questionCount: number;
  /** Internal content containers, including separate practice modules; not a topic count. */
  moduleCount: number;
  /** Learn and Grow prefer curated course highlights; other catalogs retain module labels. */
  topicPreview: string[];
  languages: PatternLanguage[];
}
