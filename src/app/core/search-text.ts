/**
 * Shared text matching for platform Search and the header quick search.
 *
 * The rule a result count describes: every word of the query occurs in the item's text, in any
 * order. A word also matches its singular or plural form (pair/pairs, query/queries), and
 * "two-sum" matches "two sum". Longer words match inside other words (lock in deadlock, script
 * in JavaScript), so a half-typed "kafk" finds Kafka. Words of up to three letters must start a
 * word, so "sum" finds summary but not assume and "go" never finds algorithm; a half-typed "ja"
 * still finds Java, and ranking puts the exact word (Go) first. A spelling fix (jvaa -> java) is only offered when
 * the typed words find nothing, and the page says which words it used, so every count stays
 * exact.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

// Only well-formed tags of the inline HTML authors use, with quoted attribute values. Plain-text
// comparisons such as "i<j" or "i<b and c>d" are statement text, not markup, and must survive.
const AUTHORED_TAG =
  /<\/?(?:a|b|br|code|div|em|h[1-6]|i|kbd|li|mark|ol|p|pre|small|span|strong|sub|sup|u|ul)(?:\s+[a-z-]+="[^"]*")*\s*\/?>/gi;

/** Plain text from an index preview: authored tags removed, entities decoded, spaces collapsed. */
export function plainSearchText(value: string): string {
  return decodeEntities(value.replace(AUTHORED_TAG, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X'
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/** The text an indexed item is searched by: its searchable text plus its tags, folded. */
export function searchDocumentText(document: {
  searchableText: string;
  tags?: readonly string[];
}): string {
  return foldSearchText(`${document.searchableText} ${(document.tags ?? []).join(' ')}`);
}

/** Lower case, decoded, with word joiners (two-sum, snake_case, read/write) read as spaces. */
export function foldSearchText(value: string): string {
  return decodeEntities(value)
    .toLowerCase()
    .replace(/(?<=[\p{L}\p{N}])[-_/](?=[\p{L}\p{N}])/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const QUOTES = /["“”«»`]/g;
const EDGE_PUNCTUATION = /^[?!.,;:'‘’]+|[?!.,;:'‘’]+$/g;

/** The words a query asks for. Quotes and sentence punctuation are ignored; C++ and C# stay. */
export function searchWords(query: string): string[] {
  const tokens = foldSearchText(query).replace(QUOTES, ' ').split(' ').filter(Boolean);
  const words = tokens.map((token) => token.replace(EDGE_PUNCTUATION, '')).filter(Boolean);
  // A query of only punctuation, such as "(" or "*", still searches for that character.
  return words.length ? words : tokens;
}

type WordForm = { text: string; wholeEnd: boolean };

/** A word plus its singular or plural form. Short words and symbols are taken as typed. */
export function wordForms(word: string): WordForm[] {
  const forms: WordForm[] = [{ text: word, wholeEnd: false }];
  if (word.length <= 3 || !/^[a-z]+$/.test(word)) return forms;
  if (word.endsWith('ies')) forms.push({ text: `${word.slice(0, -3)}y`, wholeEnd: false });
  else if (word.endsWith('es')) {
    forms.push({ text: word.slice(0, -1), wholeEnd: false });
    // boxes -> box, patches -> patch; must end a word so caches never turns into "caching".
    if (/(?:s|x|z|ch|sh)es$/.test(word)) forms.push({ text: word.slice(0, -2), wholeEnd: true });
  } else if (word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) {
    forms.push({ text: word.slice(0, -1), wholeEnd: false });
  } else if (/[^aeiou]y$/.test(word)) forms.push({ text: `${word.slice(0, -1)}ies`, wholeEnd: false });
  return forms;
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const SHORT_WORD = /^[\p{L}\p{N}]{1,3}$/u;

function occurs(text: string, form: WordForm, wholeStart: boolean): boolean {
  if (!form.wholeEnd && !wholeStart) return text.includes(form.text);
  let index = text.indexOf(form.text);
  while (index >= 0) {
    const before = index === 0 ? undefined : text[index - 1];
    const after = text[index + form.text.length];
    if (
      (!wholeStart || before === undefined || !WORD_CHARACTER.test(before)) &&
      (!form.wholeEnd || after === undefined || !WORD_CHARACTER.test(after))
    )
      return true;
    index = text.indexOf(form.text, index + 1);
  }
  return false;
}

/** True when the folded text contains this word or its singular/plural form. */
export function hasSearchWord(foldedText: string, word: string): boolean {
  const wholeStart = SHORT_WORD.test(word);
  return wordForms(word).some((form) => occurs(foldedText, form, wholeStart));
}

/** True when every query word occurs in the folded text. An empty query matches everything. */
export function matchesSearchWords(foldedText: string, words: readonly string[]): boolean {
  return words.every((word) => hasSearchWord(foldedText, word));
}

function startsWord(text: string, word: string): boolean {
  return wordForms(word).some((form) => occurs(text, form, true));
}

export type RankFields = {
  title: string;
  subjects?: readonly string[];
  context?: readonly string[];
  kind?: string;
  /** The item's folded text; a multi-word phrase found as typed ranks above scattered words. */
  text?: string;
};

const KIND_BONUS: Record<string, number> = { course: 8, topic: 6, lesson: 4, tool: 3 };

/**
 * Relevance for an item that already matches. Exact titles come first, then titles that start
 * with the query, then titles that hold every word (whole words before parts of words), then
 * subjects and course or module names. Courses and topics win a tie with single questions.
 */
export function searchRank(fields: RankFields, words: readonly string[]): number {
  if (!words.length) return 1;
  const phrase = words.join(' ');
  const title = foldSearchText(fields.title);
  let score = 1 + (KIND_BONUS[fields.kind ?? ''] ?? 0);
  if (title === phrase) score += 1000;
  else if (title.startsWith(phrase)) score += 400;
  else if (startsWord(title, phrase)) score += 250;
  else if (title.includes(phrase)) score += 150;
  if (matchesSearchWords(title, words)) score += 100;
  for (const word of words) if (startsWord(title, word)) score += 20;
  const subjects = (fields.subjects ?? []).map(foldSearchText);
  if (subjects.some((subject) => subject === phrase)) score += 80;
  else if (subjects.some((subject) => matchesSearchWords(subject, words))) score += 40;
  if ((fields.context ?? []).some((value) => matchesSearchWords(foldSearchText(value), words)))
    score += 30;
  if (words.length > 1 && fields.text?.includes(phrase)) score += 60;
  return score;
}

/** Edits between two words (insert, delete, replace, swap two neighbours). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Word counts across the folded texts, for spelling fixes. Letters only, three or more. */
export function searchVocabulary(foldedTexts: Iterable<string>): Map<string, number> {
  const vocabulary = new Map<string, number>();
  for (const text of foldedTexts) {
    for (const word of text.match(/[a-z]{3,}/g) ?? [])
      vocabulary.set(word, (vocabulary.get(word) ?? 0) + 1);
  }
  return vocabulary;
}

/**
 * The query words with each unknown word replaced by its closest known spelling: one edit for
 * words of four to six letters, two from seven; the most common word wins a tie. Null when no
 * word changes. A word is known when any indexed text contains it.
 */
export function closestSearchWords(
  words: readonly string[],
  vocabulary: ReadonlyMap<string, number>,
  isKnown: (word: string) => boolean,
): string[] | null {
  let changed = false;
  const fixed = words.map((word) => {
    if (word.length < 4 || !/^[a-z]+$/.test(word) || isKnown(word)) return word;
    const limit = word.length >= 7 ? 2 : 1;
    let best = '';
    let bestDistance = limit + 1;
    let bestCount = 0;
    for (const [known, count] of vocabulary) {
      if (Math.abs(known.length - word.length) > limit) continue;
      const distance = editDistance(word, known);
      if (distance < bestDistance || (distance === bestDistance && count > bestCount))
        [best, bestDistance, bestCount] = [known, distance, count];
    }
    if (!best || bestDistance > limit) return word;
    changed = true;
    return best;
  });
  return changed ? fixed : null;
}
