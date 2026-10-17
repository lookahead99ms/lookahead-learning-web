/**
 * Word matching shared by the pattern map's typing box and the pattern finder. Framework-free, so the
 * finder's coverage report can run the same code outside Angular.
 */

/** One word as a pattern that also accepts its singular or plural form (pair/pairs, query/queries). */
function wordForms(word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (word.length <= 3 || !/^[a-z]+$/.test(word)) return escaped;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}(?:y|ies)`;
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return `${word.slice(0, -2)}(?:es)?`;
  if (word.endsWith('s') && !word.endsWith('ss')) return `${word.slice(0, -1)}(?:s|es)?`;
  if (/[aeiou]y$/.test(word)) return `${word}s?`; // array/arrays, subarray/subarrays
  if (word.endsWith('y')) return `${word.slice(0, -1)}(?:y|ies)`;
  return `${word}(?:s|es)?`;
}

/**
 * Whole-word match, so "sorted" never matches "unsorted"; singular and plural forms match each
 * other (user, 2026-10-16: "pairs" must find what "pair" finds). A hyphen counts as a space between
 * words, so "linked list" finds "linked-list" and "in place" finds "in-place" (DLV-964).
 */
export function hasWords(text: string, phrase: string): boolean {
  const words = phrase.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return false;
  const pattern = words.map(wordForms).join('[\\s-]+');
  return new RegExp(`(^|[^a-z])${pattern}([^a-z]|$)`, 'i').test(text);
}

/** Edits between two words (insert, delete, replace, swap two neighbours). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The closest spelling of each unknown word, from the map's own words (user, 2026-10-16: a typo
 * such as "paird" should still reach the closest pattern). One edit for words of 4-6 letters, two
 * from 7; shorter words are left alone. Null when nothing changes.
 */
export function closestSpelling(query: string, vocabulary: ReadonlySet<string>): string | null {
  let changed = false;
  const words = query.trim().toLowerCase().split(/\s+/).map((word) => {
    if (word.length < 4 || !/^[a-z]+$/.test(word) || [...vocabulary].some((known) => hasWords(known, word))) return word;
    const limit = word.length >= 7 ? 2 : 1;
    let best = '';
    let bestDistance = limit + 1;
    for (const known of vocabulary) {
      if (Math.abs(known.length - word.length) > limit) continue;
      const distance = editDistance(word, known);
      if (distance < bestDistance) [best, bestDistance] = [known, distance];
    }
    if (!best) return word;
    changed = true;
    return best;
  });
  return changed ? words.join(' ') : null;
}
