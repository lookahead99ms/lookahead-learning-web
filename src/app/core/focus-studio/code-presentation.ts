import { tags, highlightTree, tagHighlighter } from '@lezer/highlight';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { go } from '@codemirror/lang-go';
import { PatternLanguage } from '../../content/content.models';
export const languages = { python: python(), java: java(), go: go() };
export const editorPalettes = {
  java: {
    name: 'Material',
    bg: '#263238',
    fg: '#b2ccd6',
    keyword: '#c792ea',
    string: '#c3e88d',
    number: '#f78c6c',
    comment: '#8ba3af',
    type: '#ffcb6b',
  },
  python: {
    name: 'One Dark',
    bg: '#282c34',
    fg: '#abb2bf',
    keyword: '#c678dd',
    string: '#98c379',
    number: '#d19a66',
    comment: '#9198a5',
    type: '#e5c07b',
  },
  go: {
    name: 'Gerry',
    bg: '#14161a',
    fg: '#c7ccd1',
    keyword: '#ff6ac1',
    string: '#7fd88f',
    number: '#ffb86c',
    comment: '#969dc0',
    type: '#7aa2f7',
  },
};
export const syntaxTags = [
  [tags.keyword, 'keyword'],
  [tags.string, 'string'],
  [tags.number, 'number'],
  [tags.comment, 'comment'],
  [tags.typeName, 'type'],
  [tags.bool, 'keyword'],
] as const;
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function highlightStudioSource(source: string, language: PatternLanguage): string[] {
  let result = '',
    offset = 0;
  highlightTree(
    languages[language].language.parser.parse(source),
    tagHighlighter(syntaxTags.map(([tag, name]) => ({ tag, class: `syntax-${name}` }))),
    (from, to, classes) => {
      result +=
        escapeHtml(source.slice(offset, from)) +
        source
          .slice(from, to)
          .split('\n')
          .map((text) => `<span class="${classes}">${escapeHtml(text)}</span>`)
          .join('\n');
      offset = to;
    },
  );
  return (result + escapeHtml(source.slice(offset))).split('\n');
}


/** Languages shown as escaped plain text: prose-like pseudo-code would be mis-highlighted. */
const PLAIN_CODE_LANGUAGES = new Set(['pseudo', 'pseudocode', 'pseudo-code', 'text', 'plaintext', 'plain']);

export function isPlainCodeLanguage(language: string | undefined | null): boolean {
  return PLAIN_CODE_LANGUAGES.has((language ?? 'text').trim().toLowerCase());
}

/** Learner-facing label for a code block's language; other languages keep their authored name. */
export function codeLanguageLabel(language: string | undefined | null): string {
  const key = (language ?? '').trim().toLowerCase();
  if (key === 'pseudo' || key === 'pseudocode' || key === 'pseudo-code') return 'Pseudo-code';
  if (key === 'text' || key === 'plaintext' || key === 'plain') return 'Text';
  return language ?? '';
}

/** Escaped, lossless highlighting for read-only lesson code. */
export function highlightLearningCode(source: string, language = 'text'): string {
  language = language.toLowerCase();
  if (isPlainCodeLanguage(language)) return escapeHtml(source);
  if (language === 'java' || language === 'python' || language === 'go') {
    return highlightStudioSource(source, language).join('\n');
  }
  // Other teaching languages retain every character, including unsupported syntax.
  return source.split(/(\/\/[^\n]*|--[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b(?:SELECT|FROM|WHERE|ORDER|BY|GROUP|HAVING|JOIN|LEFT|INNER|ON|AS|DISTINCT|CREATE|TABLE|INSERT|INTO|VALUES|AND|OR|NULL|IS|IN|NOT|ASC|DESC|LIMIT|const|let|var|function|return|if|else|for|while|class|new|async|await|throw|try|catch|finally|import|export|true|false|null|undefined)\b)/g)
    .map(part => {
      const safe = escapeHtml(part);
      const kind = /^(\/\/|--|#)/.test(part) ? 'comment'
        : /^['"`]/.test(part) ? 'string'
        : /^\d+(?:\.\d+)?$/.test(part) ? 'number'
        : /^(?:SELECT|FROM|WHERE|ORDER|BY|GROUP|HAVING|JOIN|LEFT|INNER|ON|AS|DISTINCT|CREATE|TABLE|INSERT|INTO|VALUES|AND|OR|NULL|IS|IN|NOT|ASC|DESC|LIMIT|const|let|var|function|return|if|else|for|while|class|new|async|await|throw|try|catch|finally|import|export|true|false|null|undefined)$/.test(part) ? 'keyword' : '';
      return kind ? `<span class="syntax-${kind}">${safe}</span>` : safe;
    }).join('');
}
