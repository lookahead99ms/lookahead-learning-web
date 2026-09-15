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

const metadataFamilies: ReadonlyArray<[FocusStudioPattern, RegExp]> = [
  ['lru', /\blru\b|least recently used/i],
  ['sliding-window', /sliding window|window/i],
  ['two-pointers', /two pointers?|fast.?slow pointers?/i],
  ['heaps', /heap|priority queue/i],
  ['stacks', /stack/i],
  ['trees', /tree|trie/i],
  ['graphs', /graph|union find|connectivity|shortest path|topological/i],
  ['intervals', /interval|sweep line/i],
  ['dynamic-programming', /dynamic programming|\bdp\b|recurrence/i],
  ['prefix-sum', /prefix|difference array/i],
  ['maps', /hash|map|frequency/i],
  ['arrays', /array|matrix/i],
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
