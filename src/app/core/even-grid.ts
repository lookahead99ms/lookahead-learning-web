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

/**
 * DLV-803: the even column count for every row capacity a responsive card grid can reach, as
 * CSS custom properties (`--even-cols-2: 2; --even-cols-3: 2; …`). CSS works out the capacity
 * from the grid's width and a rem card minimum (container queries), then reads the matching
 * value, so browser zoom changes the number of columns while 4 cards still pair up as 2×2 or a
 * row of 4, never 3 + 1.
 */
export function evenGridColumnVars(count: number, maxCapacity = 5): string {
  const vars: string[] = [];
  for (let capacity = 2; capacity <= maxCapacity; capacity++) {
    vars.push(`--even-cols-${capacity}: ${evenGridColumns(count, capacity)}`);
  }
  return vars.join('; ');
}
