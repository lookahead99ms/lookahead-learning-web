/** The approved representative pilot; this does not replace the wider Arrays workspace. */
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

export type FocusStudioPattern = (typeof FOCUS_STUDIO_PILOT)[keyof typeof FOCUS_STUDIO_PILOT];

export function focusStudioPattern(id: string): FocusStudioPattern | null {
  return Object.hasOwn(FOCUS_STUDIO_PILOT, id)
    ? FOCUS_STUDIO_PILOT[id as keyof typeof FOCUS_STUDIO_PILOT]
    : null;
}
