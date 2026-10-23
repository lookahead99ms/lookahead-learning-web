import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../../content/content.models';
import {
  GLOSSARY_FIRST_CLASS,
  GLOSSARY_TERM_ATTRIBUTE,
  buildGlossaryMatcher,
  findGlossaryMatches,
  isCapitalsOnly,
  markGlossaryTerms,
} from './glossary-matcher';

function term(id: string, match: string[], lessonId = `${id}-lesson`): GlossaryTerm {
  return {
    id,
    term: id,
    match,
    definition: `${id} definition`,
    lessons: [{ courseId: 'design-fundamentals', lessonId, title: id }],
  };
}

const TERMS = [
  term('shard', ['shard', 'shards', 'sharding']),
  term('index', ['index', 'indexes']),
  term('inverted-index', ['inverted index']),
  term('cdn', ['CDN', 'content delivery network']),
  term('cap', ['CAP', 'CAP theorem']),
  term('http', ['HTTP/2']),
];

describe('glossary matcher', () => {
  it('tells capitals-only forms from the rest', () => {
    expect(isCapitalsOnly('CDN')).toBe(true);
    expect(isCapitalsOnly('HTTP/1.1')).toBe(true);
    expect(isCapitalsOnly('S3')).toBe(true);
    expect(isCapitalsOnly('mTLS')).toBe(false);
    expect(isCapitalsOnly('B-tree')).toBe(false);
    expect(isCapitalsOnly('42')).toBe(false);
  });

  it('matches whole words in any case, and capitals-only forms only in capitals', () => {
    const matcher = buildGlossaryMatcher(TERMS)!;
    const text = 'Shards and sharding, a shard-key, not shardy. The CDN; a cap on cost; the CAP theorem. HTTP/2 and http/2.';
    const found = findGlossaryMatches(text, matcher).map((match) => [text.slice(match.start, match.end), match.term.id]);
    expect(found).toEqual([
      ['Shards', 'shard'],
      ['sharding', 'shard'],
      ['shard', 'shard'],
      ['CDN', 'cdn'],
      ['CAP theorem', 'cap'],
      ['HTTP/2', 'http'],
    ]);
  });

  it('prefers the longest form at a position', () => {
    const matcher = buildGlossaryMatcher(TERMS)!;
    const text = 'An inverted index beside an index.';
    expect(findGlossaryMatches(text, matcher).map((match) => match.term.id)).toEqual(['inverted-index', 'index']);
  });

  it('leaves out the terms a lesson teaches itself, and yields no matcher without forms', () => {
    const matcher = buildGlossaryMatcher(TERMS, 'shard-lesson')!;
    expect(findGlossaryMatches('shards and indexes', matcher).map((match) => match.term.id)).toEqual(['index']);
    expect(buildGlossaryMatcher([])).toBeNull();
    expect(buildGlossaryMatcher([term('blank', ['  ', ''])])).toBeNull();
  });

  it('leaves out a term in the lessons that list it under skipLessons', () => {
    const terms = [{ ...term('index', ['index']), skipLessons: ['raft-lesson'] }, term('shard', ['shard'])];
    expect(findGlossaryMatches('index and shard', buildGlossaryMatcher(terms, 'raft-lesson')!).map((match) => match.term.id)).toEqual(['shard']);
    expect(findGlossaryMatches('index and shard', buildGlossaryMatcher(terms, 'other-lesson')!).map((match) => match.term.id)).toEqual(['index', 'shard']);
  });

  it('ignores duplicate forms across terms by keeping the first', () => {
    const matcher = buildGlossaryMatcher([term('a', ['queue']), term('b', ['Queue'])])!;
    expect(findGlossaryMatches('a queue', matcher)[0].term.id).toBe('a');
  });
});

describe('markGlossaryTerms', () => {
  function render(html: string): HTMLElement {
    const root = document.createElement('article');
    root.innerHTML = html;
    document.body.append(root);
    return root;
  }

  it('marks the first mention of each term in each section and skips code, links, headings and controls', () => {
    const root = render(
      '<section id="one"><h2>Shards everywhere</h2><p>Add <strong>shards</strong>, then shards again. A <code>shard</code>, <a href="/x">a shard</a>, <button>shard</button>.</p></section>' +
        '<section id="two"><p>Sharding also uses an index.</p><p>More shards.</p></section>' +
        '<p>Outside any section: a CDN and a shard.</p>',
    );
    const matcher = buildGlossaryMatcher(TERMS)!;
    expect(markGlossaryTerms(root, matcher)).toBe(5);
    const marks = Array.from(root.querySelectorAll('button.glossary-term'));
    expect(marks.map((mark) => [mark.closest('section')?.id ?? 'root', mark.getAttribute(GLOSSARY_TERM_ATTRIBUTE), mark.textContent])).toEqual([
      ['one', 'shard', 'shards'],
      ['two', 'shard', 'Sharding'],
      ['two', 'index', 'index'],
      ['root', 'cdn', 'CDN'],
      ['root', 'shard', 'shard'],
    ]);
    expect(marks.every((mark) => mark.getAttribute('aria-haspopup') === 'dialog' && (mark as HTMLButtonElement).type === 'button')).toBe(true);
    expect(marks.map((mark) => mark.classList.contains(GLOSSARY_FIRST_CLASS))).toEqual([true, false, true, true, false]);
    expect(root.querySelector('h2')?.querySelector('.glossary-term')).toBeNull();
    expect(root.querySelector('code')?.textContent).toBe('shard');
    expect(root.querySelector('#one p')?.textContent).toBe('Add shards, then shards again. A shard, a shard, shard.');
    root.remove();
  });

  it('changes nothing on a second run and keeps marking new text', () => {
    const root = render('<section><p>Shards first.</p></section>');
    const matcher = buildGlossaryMatcher(TERMS)!;
    expect(markGlossaryTerms(root, matcher)).toBe(1);
    expect(markGlossaryTerms(root, matcher)).toBe(0);
    root.querySelector('section')!.insertAdjacentHTML('beforeend', '<p>Another shard and an index.</p>');
    expect(markGlossaryTerms(root, matcher)).toBe(1);
    expect(root.querySelectorAll('.glossary-term').length).toBe(2);
    expect(Array.from(root.querySelectorAll(`.${GLOSSARY_FIRST_CLASS}`)).map((mark) => mark.textContent)).toEqual(['Shards', 'index']);
    expect(root.querySelector('[data-glossary="skip"]')).toBeNull();
    root.remove();
  });

  it('leaves opted-out regions and whitespace-only text alone', () => {
    const root = render('<section><p data-glossary="skip">shards</p><p>   </p><p>shards</p></section>');
    expect(markGlossaryTerms(root, buildGlossaryMatcher(TERMS)!)).toBe(1);
    expect(root.querySelector('[data-glossary="skip"] .glossary-term')).toBeNull();
    root.remove();
  });
});
