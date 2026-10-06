/** Convert authored HTML to text for interpolation, labels and tooltips.
 * The parsed document stays detached; never use the result as HTML.
 * HTML entities are decoded once by the parser, rather than by chained replacements.
 */
export function htmlText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, style, template').forEach((node) => node.remove());
  return parsed.body.textContent ?? '';
}
