/** A line that holds nothing but one code element, e.g. a whole Java statement. */
const CODE_ONLY_LINE = /^<code>(?:(?!<\/?code\b)[^])*<\/code>$/;

/**
 * Lesson paragraph HTML split on <br> into readable points: a list, a numbered list, or (system lessons) prose
 * lines with code-only lines on their own. Shared by the lesson shell and its Debug split diff.
 */
export function cardPoints(content: string, system = false): string {
  const points = content.split(/<br\s*\/?\s*>/i).map((point) => point.trim()).filter(Boolean);
  if (points.length < 2 || /<(?:ul|ol|pre|table)\b/i.test(content)) return content;
  // System lessons: a line that is only code (a whole statement) gets its own line,
  // and the sentences around it stay prose instead of turning into bullets.
  if (system && points.some((point) => CODE_ONLY_LINE.test(point))) {
    return points
      .map((point) =>
        CODE_ONLY_LINE.test(point)
          ? point.replace(/^<code>/, '<code class="code-line">')
          : `<span class="prose-line">${point}</span>`,
      )
      .join('');
  }
  const lead = /^<strong>[^]*<\/strong>$/.test(points[0]) ? points.shift()! : '';
  const heading = lead && `<span class="points-heading">${lead}</span>`;
  if (points.length < 2) return content;
  // "1. …<br>2. …" becomes a real ordered list instead of bullets that repeat the number.
  if (points.every((point, index) => point.startsWith(`${index + 1}. `))) {
    return `${heading}<ol>${points.map((point) => `<li>${point.replace(/^\d+\.\s+/, '')}</li>`).join('')}</ol>`;
  }
  return `${heading}<ul>${points.map((point) => `<li>${point}</li>`).join('')}</ul>`;
}
