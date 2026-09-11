/** Stable tie-breaking only; collisions are allowed and never displace prerequisites. */
export function variationRank(key: string, value: string): number {
  let hash = 2166136261;
  for (const char of key + ':' + value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export function variedTopics<T extends { id: string }>(topics: T[], key?: string): T[] {
  return key
    ? [...topics].sort(
        (a, b) => variationRank(key, a.id) - variationRank(key, b.id) || a.id.localeCompare(b.id),
      )
    : topics;
}
