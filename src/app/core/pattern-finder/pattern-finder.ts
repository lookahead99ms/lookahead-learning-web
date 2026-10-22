import { hasWords } from './words';

/**
 * Pattern finder: the four checks on the Recognize the Pattern map (user, 2026-10-16). The learner
 * answers what the input is, what the problem wants back, how big it can be and which key words it
 * uses; each answer narrows the 20 units. Scores come from our own catalogue: every problem card
 * (generated from the problem's contract and statement) votes for its unit, and the best-matching
 * problems become the examples and the reasons. Nothing is chosen for the learner: every result
 * shows which checks matched, so the learner can verify it. Framework-free, so the coverage report
 * runs this exact code outside Angular.
 */

export type FinderShape = 'string' | 'array' | 'grid' | 'tree' | 'linked-list' | 'graph' | 'intervals' | 'numbers';
export type FinderWant = 'count' | 'best' | 'yes-no' | 'all' | 'kth' | 'order' | 'structure' | 'changed' | 'value';
export type FinderSize = 'small' | 'medium' | 'large' | 'unknown';
export type FinderCheck = 'input' | 'wants' | 'size' | 'words';

export interface RecognitionProblem {
  id: string;
  title: string;
  /** The unit that teaches this problem; every card votes for exactly one unit. */
  unit: number;
  href: string;
  input: FinderShape[];
  wants: FinderWant[];
  size: FinderSize;
  phrases: string[];
  /** v2: true when a reviewer set the card from the statement (DLV-964); auto-generated cards are false. */
  reviewed?: boolean;
  /**
   * v2, derived and read-only: this unit first, then the units of the problem's Approach-N siblings
   * (DLV-965: an equally optimal approach is its own problem under its own unit). Used by the coverage
   * report and the learner-answer gate, not by the scorer: each sibling card votes for its own unit.
   */
  optimalUnits?: number[];
  /** v2: how to tell this problem's unit from a genuine look-alike unit, in the learner's words. */
  tellApart?: string;
}

export interface RecognitionPhrase {
  key: string;
  forms: string[];
}

export type RecognitionIndexVersion = 'pattern-recognition-index/v1' | 'pattern-recognition-index/v2';

export interface RecognitionIndex {
  schemaVersion: RecognitionIndexVersion;
  units: { n: number; name: string }[];
  vocabulary: RecognitionPhrase[];
  problems: RecognitionProblem[];
}

export interface FinderAnswers {
  input: readonly FinderShape[];
  wants: readonly FinderWant[];
  size: FinderSize | null;
  words: string;
}

export interface FinderReason {
  check: FinderCheck;
  /** The answer as the learner picked or typed it (a shape, a want, a size or a key phrase). */
  value: string;
  matched: boolean;
}

export interface FinderExample {
  id: string;
  title: string;
  href: string;
}

export interface UnitMatch {
  unit: number;
  name: string;
  score: number;
  /** True when one of the unit's problems agrees with every chip the learner picked. */
  consistent: boolean;
  /** Every answer, checked against the unit's best-matching problem. */
  reasons: FinderReason[];
  examples: FinderExample[];
  /** The best-matching problem's note on telling this unit from its look-alike, when its card has one (v2). */
  tellApart?: string;
}

export interface FinderResult {
  /** False while nothing is answered: nothing is filtered and every unit keeps study order. */
  active: boolean;
  /** Key phrases recognised in the typed words. */
  phrases: string[];
  ranked: UnitMatch[];
}

/** The tap options, in display order, with the label the learner sees. */
export const FINDER_SHAPES: readonly { value: FinderShape; label: string }[] = [
  { value: 'string', label: 'string' },
  { value: 'array', label: 'array' },
  { value: 'grid', label: 'grid / matrix' },
  { value: 'tree', label: 'tree' },
  { value: 'linked-list', label: 'linked list' },
  { value: 'graph', label: 'graph' },
  { value: 'intervals', label: 'intervals' },
  { value: 'numbers', label: 'numbers' },
];

/**
 * One answer per row (user, 2026-10-16). The hints settle the look-alikes the blind pilot exposed
 * (DLV-964 review rules): a superlative is "the best" even when it counts ("minimum number of"); one
 * count per element is still "a count"; the input given back with elements removed, added or
 * overwritten is "the input changed"; a sum, an index or the one element that fits is "one value"; "the
 * k-th" is a rank by size or order (k-th largest, top k, median), while the symbol at position k of a row
 * is one value.
 */
export const FINDER_WANTS: readonly { value: FinderWant; label: string; hint: string }[] = [
  { value: 'count', label: 'a count', hint: 'how many, also one count per element' },
  { value: 'best', label: 'the best', hint: 'min, max, longest, fewest, minimum number of' },
  { value: 'yes-no', label: 'yes / no', hint: 'true or false' },
  { value: 'all', label: 'all of them', hint: 'every combination or arrangement' },
  { value: 'kth', label: 'the k-th / top k', hint: 'k-th largest or smallest, top k, median' },
  { value: 'order', label: 'an order', hint: 'a sorted, merged, visiting or rearranged sequence' },
  { value: 'structure', label: 'a built structure', hint: 'design or implement, a run of operations' },
  { value: 'changed', label: 'the input changed', hint: 'elements removed, added or overwritten' },
  { value: 'value', label: 'one value', hint: 'a sum, an index, the element that fits' },
];

export const FINDER_SIZES: readonly { value: FinderSize; label: string }[] = [
  { value: 'small', label: 'n ≤ 20' },
  { value: 'medium', label: 'up to about 10⁴' },
  { value: 'large', label: '10⁵ and more' },
  { value: 'unknown', label: 'not stated' },
];

/** Scoring weights. A missing answer adds nothing; a contradicted one costs part of its weight. */
export const FINDER_WEIGHTS = {
  /** Cost of a picked chip the problem does not have, as a share of the chip's weight. */
  miss: 0.75,
  /** Cost of a problem feature the learner did not pick, in a check the learner answered. */
  extra: 0.12,
  /** Weight of a matching size class; a stated size that differs costs `sizeMiss`. */
  size: 1.1,
  sizeMiss: 0.7,
  /** Cost of a typed key phrase the problem does not use. */
  phraseMiss: 0.3,
  /** Cost of each problem phrase the learner did not type, once words are typed. */
  phraseExtra: 0.08,
  /** How much the unit's next three best problems add to its best one, in turn. */
  support: [0.08, 0.05, 0.03] as readonly number[],
  /** Bonus per doubling of the unit's problems that agree with every answer (log2 of 1 + count). */
  agree: 0.4,
};

export const EMPTY_ANSWERS: FinderAnswers = { input: [], wants: [], size: null, words: '' };

export function hasAnswers(answers: FinderAnswers): boolean {
  return answers.input.length > 0 || answers.wants.length > 0 || answers.size !== null || answers.words.trim().length > 0;
}

/** Key phrases the typed words contain: a phrase counts when its key or any of its forms appears. */
export function phrasesIn(words: string, vocabulary: readonly RecognitionPhrase[]): string[] {
  const text = words.trim();
  if (!text) return [];
  return vocabulary.filter((entry) => [entry.key, ...entry.forms].some((form) => hasWords(text, form))).map((entry) => entry.key);
}

/** Feature weights: a feature found in few units says more than one found in most of them. */
export interface FinderWeights {
  input: Map<string, number>;
  wants: Map<string, number>;
  phrases: Map<string, number>;
}

const weightCache = new WeakMap<RecognitionIndex, FinderWeights>();

export function featureWeights(index: RecognitionIndex): FinderWeights {
  const cached = weightCache.get(index);
  if (cached) return cached;
  const units = Math.max(1, index.units.length);
  const spread = (pick: (problem: RecognitionProblem) => readonly string[]) => {
    const seen = new Map<string, Set<number>>();
    for (const problem of index.problems) {
      for (const value of pick(problem)) {
        const set = seen.get(value) ?? new Set<number>();
        set.add(problem.unit);
        seen.set(value, set);
      }
    }
    const weights = new Map<string, number>();
    seen.forEach((set, value) => weights.set(value, Math.max(0.25, Math.log((units + 1) / (set.size + 0.5)))));
    return weights;
  };
  const weights = {
    input: spread((problem) => problem.input),
    wants: spread((problem) => problem.wants),
    phrases: spread((problem) => problem.phrases),
  };
  weightCache.set(index, weights);
  return weights;
}

interface ProblemScore {
  problem: RecognitionProblem;
  score: number;
  consistent: boolean;
  reasons: FinderReason[];
}

function setScore(
  picked: readonly string[],
  has: readonly string[],
  weights: Map<string, number>,
  check: FinderCheck,
  miss: number,
  extra: number,
): { score: number; reasons: FinderReason[] } {
  let score = 0;
  const reasons: FinderReason[] = [];
  if (!picked.length) return { score, reasons };
  for (const value of picked) {
    const weight = weights.get(value) ?? 1;
    const matched = has.includes(value);
    score += matched ? weight : -miss * weight;
    reasons.push({ check, value, matched });
  }
  for (const value of has) if (!picked.includes(value)) score -= extra * (weights.get(value) ?? 1);
  return { score, reasons };
}

/** One problem card against the answers. */
export function scoreProblem(
  problem: RecognitionProblem,
  answers: FinderAnswers,
  phrases: readonly string[],
  weights: FinderWeights,
): ProblemScore {
  const w = FINDER_WEIGHTS;
  const input = setScore(answers.input, problem.input, weights.input, 'input', w.miss, w.extra);
  const wants = setScore(answers.wants, problem.wants, weights.wants, 'wants', w.miss, w.extra);
  const words = setScore(phrases, problem.phrases, weights.phrases, 'words', w.phraseMiss, phrases.length ? w.phraseExtra : 0);
  let size = 0;
  const reasons = [...input.reasons, ...wants.reasons];
  if (answers.size) {
    const matched = problem.size === answers.size;
    if (matched) size = answers.size === 'unknown' ? w.size / 2 : w.size;
    else if (problem.size !== 'unknown' && answers.size !== 'unknown') size = -w.sizeMiss;
    reasons.push({ check: 'size', value: answers.size, matched });
  }
  reasons.push(...words.reasons);
  const consistent =
    answers.input.every((shape) => problem.input.includes(shape)) &&
    (!answers.wants.length || answers.wants.some((want) => problem.wants.includes(want))) &&
    (!answers.size || answers.size === 'unknown' || problem.size === answers.size || problem.size === 'unknown');
  return { problem, score: input.score + wants.score + size + words.score, consistent, reasons };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Rank the units for the answers. Each unit scores its best problem, a little for its next best
 * ones, and a bonus that grows with how many of its problems agree with every answer, so a unit
 * with many problems like the learner's beats one lucky match. Ties keep study order. With nothing
 * answered every unit scores 0, nothing is filtered and the order is the study order. Weights were
 * tuned on the coverage report (tools/utilities/pattern_finder_coverage.mjs in the content repo).
 */
export function score(index: RecognitionIndex, answers: FinderAnswers, exampleCount = 3): FinderResult {
  const phrases = phrasesIn(answers.words, index.vocabulary);
  const active = answers.input.length > 0 || answers.wants.length > 0 || answers.size !== null || phrases.length > 0;
  const weights = featureWeights(index);
  const byUnit = new Map<number, ProblemScore[]>();
  for (const problem of index.problems) {
    const scored = scoreProblem(problem, answers, phrases, weights);
    const list = byUnit.get(problem.unit) ?? [];
    list.push(scored);
    byUnit.set(problem.unit, list);
  }
  const ranked = index.units.map((unit) => {
    const list = (byUnit.get(unit.n) ?? []).sort(
      (a, b) => b.score - a.score || Number(b.consistent) - Number(a.consistent) || a.problem.title.localeCompare(b.problem.title),
    );
    const best = list[0];
    const agreeing = list.filter((entry) => entry.reasons.length > 0 && entry.reasons.every((reason) => reason.matched)).length;
    const total = list.length
      ? FINDER_WEIGHTS.support.reduce((sum, share, i) => sum + share * Math.max(0, list[i + 1]?.score ?? 0), best.score) +
        FINDER_WEIGHTS.agree * Math.log2(1 + agreeing)
      : Number.NEGATIVE_INFINITY;
    return {
      unit: unit.n,
      name: unit.name,
      score: active ? round(total) : 0,
      consistent: list.some((entry) => entry.consistent),
      reasons: active && best ? best.reasons : [],
      examples: list.slice(0, exampleCount).map(({ problem }) => ({ id: problem.id, title: problem.title, href: problem.href })),
      ...(active && best?.problem.tellApart ? { tellApart: best.problem.tellApart } : {}),
    } satisfies UnitMatch;
  });
  if (active) ranked.sort((a, b) => b.score - a.score || Number(b.consistent) - Number(a.consistent) || a.unit - b.unit);
  return { active, phrases, ranked };
}

/**
 * The units to bring forward on the map: those with a problem that agrees with every picked chip,
 * best first; when the chips contradict every problem, the three best scores instead.
 */
export function matchingUnits(result: FinderResult): number[] {
  if (!result.active) return [];
  const consistent = result.ranked.filter((unit) => unit.consistent && unit.score > 0);
  return (consistent.length ? consistent : result.ranked.slice(0, 3)).map((unit) => unit.unit);
}

/**
 * How many units to show as the answer: one when it clearly leads, otherwise the top two to tell
 * apart. "Clearly" means the runner-up scores less than `share` of the leader.
 */
export function leaders(result: FinderResult, share = 0.8): UnitMatch[] {
  if (!result.active || !result.ranked.length) return [];
  const [first, second] = result.ranked;
  if (first.score <= 0) return [];
  return second && second.score > 0 && second.score >= first.score * share ? [first, second] : [first];
}

/** The units that count as right for a problem: its own, then its Approach-N siblings' (v2). */
export function optimalUnitsOf(problem: RecognitionProblem): number[] {
  const units = [problem.unit, ...(problem.optimalUnits ?? [])];
  return units.filter((unit, i) => units.indexOf(unit) === i);
}

/**
 * A valid index, so a malformed or older publication hides the finder instead of breaking the map.
 * v1 cards (auto-generated) and v2 cards (reviewed flag, derived optimal units, tell-apart note) both
 * load; the v2 fields are optional so a v1 publication keeps working.
 */
export function isRecognitionIndex(value: unknown): value is RecognitionIndex {
  const index = value as RecognitionIndex;
  return (
    !!index &&
    (index.schemaVersion === 'pattern-recognition-index/v1' || index.schemaVersion === 'pattern-recognition-index/v2') &&
    Array.isArray(index.units) &&
    Array.isArray(index.vocabulary) &&
    Array.isArray(index.problems) &&
    index.problems.every(
      (problem) =>
        typeof problem?.title === 'string' &&
        typeof problem.href === 'string' &&
        Number.isInteger(problem.unit) &&
        Array.isArray(problem.input) &&
        Array.isArray(problem.wants) &&
        Array.isArray(problem.phrases) &&
        (problem.optimalUnits === undefined || (Array.isArray(problem.optimalUnits) && problem.optimalUnits.every(Number.isInteger))) &&
        (problem.reviewed === undefined || typeof problem.reviewed === 'boolean') &&
        (problem.tellApart === undefined || typeof problem.tellApart === 'string'),
    )
  );
}
