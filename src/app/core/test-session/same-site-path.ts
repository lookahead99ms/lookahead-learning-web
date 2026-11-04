/**
 * The value when it is a path on this site ("/learn/java?x=1"), else null. It must start with a single "/": "//host"
 * and "/\host" (which browsers read as "//host"), full addresses and anything with control characters are refused.
 */
export function sameSitePath(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?![\/\\])/.test(value) && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}
