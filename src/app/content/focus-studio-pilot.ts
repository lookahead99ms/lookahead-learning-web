import { DsaProblemV2 } from './content.models';

/**
 * Visual families used by the shared Focus Studio diagram. The reviewed twelve
 * keep their exact family; the rest of the catalog is classified from authored
 * problem metadata and falls back to a recorded-state view.
 */
export const FOCUS_STUDIO_PILOT = {
  'core-ds-array-diagonal-matrix-traversal': 'arrays',
  'algorithmic-two-sum': 'maps',
  'algorithmic-binary-tree-level-order': 'trees',
  'algorithmic-number-connected-components-graph': 'graphs',
  'algorithmic-kth-largest-element-array': 'heaps',
  'algorithmic-valid-parentheses': 'stacks',
  'algorithmic-maximum-sum-subarray-size-k': 'sliding-window',
  'algorithmic-container-water': 'two-pointers',
  'algorithmic-climbing-stairs': 'dynamic-programming',
  'algorithmic-merge-intervals': 'intervals',
  'algorithmic-subarray-sum-k': 'prefix-sum',
  'algorithmic-lru-cache': 'lru',
} as const;

export type FocusStudioPattern =
  | (typeof FOCUS_STUDIO_PILOT)[keyof typeof FOCUS_STUDIO_PILOT]
  | 'generic';

// Whole words only: a bare substring put "Selected-entries" (en-trie-s) in trees, "Cheapest" in heaps
// and "Lexicographic" in graphs. Plurals and the sub- prefix (subtree, subarray) are listed explicitly.
const metadataFamilies: ReadonlyArray<[FocusStudioPattern, RegExp]> = [
  ['lru', /\blru\b|\bleast recently used\b/i],
  ['sliding-window', /\bsliding windows?\b|\bwindows?\b/i],
  ['two-pointers', /\btwo pointers?\b|\bfast.?slow pointers?\b/i],
  ['heaps', /\bheaps?\b|\bpriority queues?\b/i],
  ['stacks', /\bstacks?\b/i],
  ['trees', /\b(?:sub)?trees?\b|\btries?\b/i],
  ['graphs', /\bgraphs?\b|\bunion find\b|\bconnectivity\b|\bshortest paths?\b|\btopological\b/i],
  ['intervals', /\bintervals?\b|\bsweep lines?\b/i],
  ['dynamic-programming', /\bdynamic programming\b|\bdp\b|\brecurrences?\b/i],
  ['prefix-sum', /\bprefix(?:es)?\b|\bdifference arrays?\b/i],
  ['maps', /\bhash(?:es|ed|ing)?\b|\bmaps?\b|\bmapping\b|\bfrequency\b/i],
  ['arrays', /\b(?:sub)?arrays?\b|\bmatrix\b|\bmatrices\b/i],
];

export function focusStudioPattern(
  problem: string | Pick<DsaProblemV2, 'id' | 'title' | 'variation' | 'tags'>,
): FocusStudioPattern | null {
  const id = typeof problem === 'string' ? problem : problem.id;
  if (Object.hasOwn(FOCUS_STUDIO_PILOT, id)) {
    return FOCUS_STUDIO_PILOT[id as keyof typeof FOCUS_STUDIO_PILOT];
  }
  if (typeof problem === 'string') return null;
  const metadata = [problem.title, problem.variation, ...problem.tags].join(' ');
  return metadataFamilies.find(([, pattern]) => pattern.test(metadata))?.[0] ?? 'generic';
}
