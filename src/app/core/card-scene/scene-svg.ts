const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

/** Elements that can run code, embed another document, or play media. */
const BLOCKED_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'canvas',
  'handler',
  'listener',
]);
const ANIMATION_ELEMENTS = new Set(['animate', 'set', 'animatemotion', 'animatetransform']);

/** Keeps url(#local) references and replaces every other url(...) with none. */
function stripExternalUrls(css: string): string {
  // Escaped CSS tokens cannot be checked as literal local fragment references.
  if (css.includes('\\')) return '';
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote: string, target: string) =>
      isLocalReference(target) ? match : 'none',
    )
    .replace(/expression\s*\(/gi, 'none(');
}

function isLocalReference(value: string): boolean {
  return /^#[A-Za-z_][\w:.-]*$/.test(value.trim());
}

const MONO_FAMILY = /mono|menlo|consolas|courier/i;
/** Scene ink tokens that card-scene.ts redirects to the card text colour on text elements. */
const CARD_TEXT_FILL = /^var\(\s*--scene-(?:ink|text|muted|accent|link|learn|grow|ahead)\b/;
/**
 * A DSA node value, index or single mark (7, 25, L, v1, +1, ✓, ♞): part of the structure it
 * labels, so it keeps its drawn colour. Same rule as isCardNodeValue in
 * scripts/learning-unit-card-contract.mjs.
 */
const NODE_MARK = /^[+\-−]?(?:\d{1,2}|\p{L}{1,2}|\p{L}\d|\d\p{L})$|^[^\p{L}\p{N}\s$€£¥%]$/u;
/** Hard-coded white text sits on a filled shape; it follows --scene-card so it turns dark in dark mode. */
const LITERAL_WHITE = /^(?:#fff|#ffffff|white)$/i;

/** Declarations from the scene's own <style>, keyed by the class a rule's last compound targets. */
function classDeclarations(root: Element): Map<string, string[]> {
  const byClass = new Map<string, string[]>();
  for (const style of Array.from(root.querySelectorAll('style'))) {
    for (const [, selectors, body] of (style.textContent ?? '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const selector of selectors.split(',')) {
        const last = selector.trim().split(/[\s>+~]+/).pop() ?? '';
        if (!/^(?:\.[\w-]+)+$/.test(last)) continue;
        for (const name of last.slice(1).split('.')) {
          byClass.set(name, [...(byClass.get(name) ?? []), body]);
        }
      }
    }
  }
  return byClass;
}

/** The value an element itself declares for a property: style attribute, class rule, attribute. */
function ownDeclaration(
  element: Element,
  pattern: RegExp,
  attribute: string,
  rules: Map<string, string[]>,
): string | null {
  const inline = pattern.exec(element.getAttribute('style') ?? '');
  if (inline) return inline[1].trim();
  let fromClass: string | null = null;
  for (const name of Array.from(element.classList)) {
    for (const body of rules.get(name) ?? []) {
      const match = pattern.exec(body);
      if (match) fromClass = match[1].trim();
    }
  }
  return fromClass ?? element.getAttribute(attribute);
}

function nearestDeclaration(
  element: Element,
  root: Element,
  pattern: RegExp,
  attribute: string,
  rules: Map<string, string[]>,
): { value: string; own: boolean } | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const value = ownDeclaration(node, pattern, attribute, rules);
    if (value) return { value, own: node === element };
    if (node === root) break;
  }
  return null;
}

/**
 * Prepares the words in a card drawing for the shared card text styling (card-scene.ts):
 * code text (a monospace face in the drawing) is marked data-scene-code so it keeps a code
 * face; text that inherits its ink from a group gets that fill on itself so the card text
 * colour can take its place; a node value or single mark is marked data-scene-mark so it
 * keeps its drawn colour; hard-coded white text on a filled shape is marked
 * data-scene-on-fill so it follows --scene-card (white in light mode, dark in dark mode,
 * where the fills behind it turn light).
 */
function prepareCardText(root: Element): void {
  const rules = classDeclarations(root);
  const fillPattern = /(?:^|;|\s)fill\s*:\s*([^;]+)/;
  const familyPattern = /(?:^|;|\s)font(?:-family)?\s*:\s*([^;]+)/;
  for (const text of Array.from(root.querySelectorAll('text'))) {
    const family = nearestDeclaration(text, root, familyPattern, 'font-family', rules);
    if (family && MONO_FAMILY.test(family.value)) text.setAttribute('data-scene-code', '');
    const fill = nearestDeclaration(text, root, fillPattern, 'fill', rules);
    if (fill && !fill.own && CARD_TEXT_FILL.test(fill.value)) text.setAttribute('fill', fill.value);
    if (fill && LITERAL_WHITE.test(fill.value)) text.setAttribute('data-scene-on-fill', '');
    if (NODE_MARK.test((text.textContent ?? '').trim())) text.setAttribute('data-scene-mark', '');
  }
}

export interface SceneSvgOptions {
  /** A catalog or unit card drawing: prepare its text for the shared card text styling. */
  cardText?: boolean;
}

/**
 * Turns authored scene text into a safe SVG element for inline use. Inline SVG lets the
 * scene's own CSS read the app's theme variables. Returns null when the text is not an
 * SVG document so the caller can show its text fallback instead.
 */
export function sanitizeSceneSvg(
  text: string,
  parser = new DOMParser(),
  options: SceneSvgOptions = {},
): SVGSVGElement | null {
  if (!text || !text.trim()) return null;
  const parsed = parser.parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (
    !root ||
    root.namespaceURI !== SVG_NAMESPACE ||
    root.localName !== 'svg' ||
    parsed.getElementsByTagName('parsererror').length > 0
  ) {
    return null;
  }

  for (const element of Array.from(root.querySelectorAll('*'))) {
    const name = element.localName.toLowerCase();
    if (BLOCKED_ELEMENTS.has(name) || element.namespaceURI !== SVG_NAMESPACE) {
      element.remove();
      continue;
    }
    if (ANIMATION_ELEMENTS.has(name)) {
      const target = (element.getAttribute('attributeName') ?? '').toLowerCase();
      if (target === 'href' || target === 'xlink:href' || target.startsWith('on')) {
        element.remove();
        continue;
      }
    }
    if (name === 'style') {
      element.textContent = stripExternalUrls(element.textContent ?? '');
    }
  }

  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase();
      if (attributeName.startsWith('on')) {
        element.removeAttributeNode(attribute);
      } else if (
        (attribute.localName === 'href' &&
          (attribute.namespaceURI === null || attribute.namespaceURI === XLINK_NAMESPACE)) ||
        attributeName === 'xlink:href'
      ) {
        if (!isLocalReference(attribute.value)) element.removeAttributeNode(attribute);
      } else if (attributeName === 'style') {
        attribute.value = stripExternalUrls(attribute.value);
      } else if (attribute.value.includes('\\') || /url\s*\(/i.test(attribute.value)) {
        attribute.value = stripExternalUrls(attribute.value);
      }
    }
  }

  // The card around the scene is the link and carries the description.
  for (const name of ['role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'tabindex']) {
    root.removeAttribute(name);
  }
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');
  root.removeAttribute('width');
  root.removeAttribute('height');
  if (!root.hasAttribute('preserveAspectRatio')) {
    root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
  if (options.cardText) prepareCardText(root);
  return root as unknown as SVGSVGElement;
}
