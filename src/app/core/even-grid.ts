/**
 * Column count for a grid of `count` cards, so no row ends with one lonely card where it can
 * be avoided (user review notes #1, #2, #10, #21, 2026-10-03): 2 cards share the full width,
 * 4 are 2×2, 5 are 3 + 2, 6 are 3 + 3. One card gets the whole row. Narrow containers still
 * drop to fewer columns in CSS.
 */
export function evenGridColumns(count: number, max = 3): number {
  if (count <= 1) return 1;
  if (count <= max) return count;
  for (let columns = max; columns >= 2; columns--) {
    if (count % columns !== 1) return columns;
  }
  return max;
}
