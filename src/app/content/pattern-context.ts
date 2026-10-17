/**
 * DLV-962 no-spoiler URLs: the Hands-On pattern a page is practised in travels in `?pattern=` as
 * an opaque context id, never as the readable pattern id (`algorithmic-patterns:prefix-state`),
 * so hovering a Previous/Next link or reading the address bar does not name the pattern before
 * the learner asks for it.
 *
 * The id is a 32-bit FNV-1a hash of the pattern id, written in base 36 and padded to 7
 * characters. It needs no lookup table: it is the same on every device and in every build, so it
 * survives reload, Back/Forward, shared links and new tabs, and it stays valid when patterns are
 * added or reordered. Pages resolve it by hashing the pattern ids they already know and comparing.
 * Old links that carry a readable id still match, and the router rewrites them to the opaque form
 * before the page loads (see `retired-content-routes.ts`).
 */
export const PATTERN_CONTEXT_PARAM = 'pattern';

/** 2^32 in base 36 is `1z141z4`, so a padded hash always starts with 0 or 1. */
const TOKEN_SHAPE = /^[01][0-9a-z]{6}$/;

/** The opaque context id for a pattern id; '' for none. */
export function patternContextToken(patternId: string | null | undefined): string {
  if (!patternId) return '';
  let hash = 0x811c9dc5;
  for (let index = 0; index < patternId.length; index += 1) {
    hash ^= patternId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

/** True for a value already in the opaque form. Readable ids never have this shape. */
export function isPatternContextToken(value: string | null | undefined): boolean {
  return !!value && TOKEN_SHAPE.test(value);
}

/** Whether a `?pattern=` value (opaque, or an old readable id) names this pattern id. */
export function matchesPatternContext(
  value: string | null | undefined,
  patternId: string | null | undefined,
): boolean {
  if (!value || !patternId) return false;
  return value === patternId || value === patternContextToken(patternId);
}

/** The pattern id, among the ones a page knows, that a `?pattern=` value names. */
export function resolvePatternContext(
  value: string | null | undefined,
  patternIds: Iterable<string>,
): string | null {
  if (!value) return null;
  for (const id of patternIds) if (matchesPatternContext(value, id)) return id;
  return null;
}

/** The URL form of a `?pattern=` value: readable ids become opaque; opaque ids stay as they are. */
export function normalizePatternContext(value: string): string {
  return !value || isPatternContextToken(value) ? value : patternContextToken(value);
}

/** `{ pattern: <opaque id> }` for links, or `{}` when there is no pattern. */
export function patternContextQuery(patternId: string | null | undefined): Record<string, string> {
  const token = patternContextToken(patternId);
  return token ? { [PATTERN_CONTEXT_PARAM]: token } : {};
}
