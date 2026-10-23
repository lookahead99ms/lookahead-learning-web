import type { GlossaryTerm } from '../../content/content.models';

/** One mention of a glossary term inside a string of text. */
export interface GlossaryMatch {
  start: number;
  end: number;
  term: GlossaryTerm;
}

interface MatchKey {
  term: GlossaryTerm;
  /** The form as authored when it is written in capitals (CDN, TTL): the text must then match it exactly. */
  exact: string | null;
}

export interface GlossaryMatcher {
  regex: RegExp;
  keys: Map<string, MatchKey>;
}

export const GLOSSARY_TERM_CLASS = 'glossary-term';
export const GLOSSARY_TERM_ATTRIBUTE = 'data-glossary-term';
/** The first mark of a term on the page: the only one with a visible cue at rest. */
export const GLOSSARY_FIRST_CLASS = 'glossary-term-first';

/** Elements whose text is never marked: links and controls, code, headings, and terms already marked. */
const SKIP_SELECTOR = [
  'a',
  'button',
  'code',
  'pre',
  'kbd',
  'samp',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'svg',
  'label',
  'input',
  'textarea',
  'select',
  'summary',
  'dialog',
  `.${GLOSSARY_TERM_CLASS}`,
  '[data-glossary="skip"]',
].join(', ');

const WORD_CHARACTER = '[\\p{L}\\p{N}]';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** "CDN", "HTTP/2" and "S3" are capitals-only; "mTLS", "B-tree" and "CAP theorem" are not. */
export function isCapitalsOnly(text: string): boolean {
  return text === text.toUpperCase() && text !== text.toLowerCase();
}

/**
 * One regular expression for every word form of every term, longest form first so "inverted index"
 * wins over "index" at the same position. Terms taught by `excludeLessonId`, and terms that list it in
 * `skipLessons`, are left out: a lesson never marks the terms it defines itself or uses in another sense.
 */
export function buildGlossaryMatcher(terms: GlossaryTerm[], excludeLessonId = ''): GlossaryMatcher | null {
  const keys = new Map<string, MatchKey>();
  const forms: string[] = [];
  for (const term of terms) {
    if (
      excludeLessonId &&
      (term.lessons.some((lesson) => lesson.lessonId === excludeLessonId) || term.skipLessons?.includes(excludeLessonId))
    )
      continue;
    for (const raw of term.match) {
      const form = raw.trim();
      const key = form.toLowerCase();
      if (!form || keys.has(key)) continue;
      keys.set(key, { term, exact: isCapitalsOnly(form) ? form : null });
      forms.push(form);
    }
  }
  if (!forms.length) return null;
  forms.sort((left, right) => right.length - left.length);
  const alternatives = forms.map(escapeRegExp).join('|');
  return {
    regex: new RegExp(`(?<!${WORD_CHARACTER})(?:${alternatives})(?!${WORD_CHARACTER})`, 'giu'),
    keys,
  };
}

export function findGlossaryMatches(text: string, matcher: GlossaryMatcher): GlossaryMatch[] {
  const matches: GlossaryMatch[] = [];
  for (const found of text.matchAll(matcher.regex)) {
    const key = matcher.keys.get(found[0].toLowerCase());
    if (!key || (key.exact !== null && found[0] !== key.exact)) continue;
    matches.push({ start: found.index, end: found.index + found[0].length, term: key.term });
  }
  return matches;
}

function scopeOf(node: Node, root: Element): Element {
  return node.parentElement?.closest('section') ?? root;
}

/**
 * Wrap the first mention of each term in each section of `root` in a button that carries the term id.
 * The first mark of a term on the whole page also gets GLOSSARY_FIRST_CLASS, so only one mention per
 * term shows a cue at rest while every mark still answers hover and click. Running it again changes
 * nothing: marked text is skipped and counts as already seen. Returns how many terms were newly marked.
 */
export function markGlossaryTerms(root: Element, matcher: GlossaryMatcher): number {
  const document = root.ownerDocument;
  const seen = new Map<Element, Set<string>>();
  const seenIn = (scope: Element): Set<string> => {
    let ids = seen.get(scope);
    if (!ids) {
      ids = new Set();
      seen.set(scope, ids);
    }
    return ids;
  };
  const firstSeen = new Set<string>();
  for (const marked of Array.from(root.querySelectorAll<HTMLElement>(`.${GLOSSARY_TERM_CLASS}`))) {
    const id = marked.getAttribute(GLOSSARY_TERM_ATTRIBUTE);
    if (!id) continue;
    seenIn(scopeOf(marked, root)).add(id);
    if (marked.classList.contains(GLOSSARY_FIRST_CLASS)) firstSeen.add(id);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !(node as Text).data.trim() || parent.closest(SKIP_SELECTOR)) continue;
    textNodes.push(node as Text);
  }

  let marked = 0;
  for (const node of textNodes) {
    const matches = findGlossaryMatches(node.data, matcher);
    if (!matches.length) continue;
    const ids = seenIn(scopeOf(node, root));
    const fresh = matches.filter((match) => {
      if (ids.has(match.term.id)) return false;
      ids.add(match.term.id);
      return true;
    });
    if (!fresh.length) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of fresh) {
      if (match.start > cursor) fragment.append(node.data.slice(cursor, match.start));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = GLOSSARY_TERM_CLASS;
      if (!firstSeen.has(match.term.id)) {
        firstSeen.add(match.term.id);
        button.classList.add(GLOSSARY_FIRST_CLASS);
      }
      button.setAttribute(GLOSSARY_TERM_ATTRIBUTE, match.term.id);
      button.setAttribute('aria-haspopup', 'dialog');
      button.textContent = node.data.slice(match.start, match.end);
      fragment.append(button);
      cursor = match.end;
      marked += 1;
    }
    if (cursor < node.data.length) fragment.append(node.data.slice(cursor));
    node.replaceWith(fragment);
  }
  return marked;
}
