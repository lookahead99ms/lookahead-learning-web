import {
  closestSearchWords,
  decodeEntities,
  editDistance,
  foldSearchText,
  hasSearchWord,
  matchesSearchWords,
  plainSearchText,
  searchDocumentText,
  searchRank,
  searchVocabulary,
  searchWords,
  wordForms,
} from './search-text';

describe('search text matching (DLV-962 search audit)', () => {
  it('keeps comparison signs in problem statements as text and decodes entities once', () => {
    expect(plainSearchText('Count index pairs i<j such that words[i] is a prefix of words[j] >')).toBe(
      'Count index pairs i<j such that words[i] is a prefix of words[j] >',
    );
    expect(plainSearchText('<p>A concise <strong>lesson</strong> overview.</p>')).toBe(
      'A concise lesson overview.',
    );
    expect(plainSearchText('<a href="/x">Link</a> text')).toBe('Link text');
    expect(plainSearchText('as in List&lt;String&gt; and a &amp; b')).toBe(
      'as in List<String> and a & b',
    );
    expect(plainSearchText('i<b and c>d')).toBe('i<b and c>d');
    expect(decodeEntities('&#65;&#x42;&quot;&apos;&nbsp;&unknown;&#0;')).toBe('AB"\' &unknown;&#0;');
  });

  it('folds case, entities and word joiners so two-sum and two sum match each other', () => {
    expect(foldSearchText('Two-Sum   for snake_case and read/write')).toBe(
      'two sum for snake case and read write',
    );
    expect(foldSearchText('A - B stays')).toBe('a - b stays');
    expect(searchDocumentText({ searchableText: 'Counter', tags: ['Java', 'Concurrency'] })).toBe(
      'counter java concurrency',
    );
    expect(searchDocumentText({ searchableText: 'only text' })).toBe('only text');
  });

  it('reads query words without quotes or sentence punctuation, keeping C++ and C#', () => {
    expect(searchWords('  "Redis"  ')).toEqual(['redis']);
    expect(searchWords('“java” streams?')).toEqual(['java', 'streams']);
    expect(searchWords('C++ and C#')).toEqual(['c++', 'and', 'c#']);
    expect(searchWords('two-sum')).toEqual(['two', 'sum']);
    expect(searchWords('(')).toEqual(['(']);
    expect(searchWords('?')).toEqual(['?']);
    expect(searchWords('   ')).toEqual([]);
  });

  it('pairs singular and plural forms without turning redis or status into other words', () => {
    expect(wordForms('pairs').map(({ text }) => text)).toEqual(['pairs', 'pair']);
    expect(wordForms('queries').map(({ text }) => text)).toEqual(['queries', 'query']);
    expect(wordForms('query').map(({ text }) => text)).toEqual(['query', 'queries']);
    expect(wordForms('boxes').map(({ text }) => text)).toEqual(['boxes', 'boxe', 'box']);
    expect(wordForms('queues').map(({ text }) => text)).toEqual(['queues', 'queue']);
    expect(wordForms('redis').map(({ text }) => text)).toEqual(['redis']);
    expect(wordForms('class').map(({ text }) => text)).toEqual(['class']);
    expect(wordForms('dfs').map(({ text }) => text)).toEqual(['dfs']);
    expect(wordForms('c++').map(({ text }) => text)).toEqual(['c++']);
    expect(wordForms('key').map(({ text }) => text)).toEqual(['key']);
  });

  it('matches every word in any order, singular or plural, and short words only at a word start', () => {
    const text = foldSearchText('Binary Search finds a pair in a sorted array of boxes');
    expect(matchesSearchWords(text, searchWords('search binary'))).toBe(true);
    expect(matchesSearchWords(text, searchWords('pairs'))).toBe(true);
    expect(matchesSearchWords(text, searchWords('box'))).toBe(true);
    expect(matchesSearchWords(text, searchWords('binary tree'))).toBe(false);
    expect(matchesSearchWords(text, [])).toBe(true);
    expect(hasSearchWord(foldSearchText('Algorithms in Go'), 'go')).toBe(true);
    expect(hasSearchWord(foldSearchText('An algorithm'), 'go')).toBe(false);
    expect(hasSearchWord(foldSearchText('Go, and Go-style errors'), 'go')).toBe(true);
    expect(hasSearchWord(foldSearchText('Jakarta EE'), 'ja')).toBe(true);
    expect(hasSearchWord(foldSearchText('A summary'), 'sum')).toBe(true);
    expect(hasSearchWord(foldSearchText('We assume'), 'sum')).toBe(false);
    expect(hasSearchWord(foldSearchText('JavaScript closures'), 'script')).toBe(true);
    expect(hasSearchWord(foldSearchText('caching layers'), 'caches')).toBe(false);
    expect(hasSearchWord(foldSearchText('one patch'), 'patches')).toBe(true);
    expect(hasSearchWord(foldSearchText('patching'), 'patches')).toBe(false);
    expect(hasSearchWord(foldSearchText('f(x) and (a)'), '(')).toBe(true);
  });

  it('ranks the exact title first, then a title start, whole words, and context', () => {
    const words = searchWords('graph');
    const exact = searchRank({ title: 'Graph', kind: 'practice' }, words);
    const starts = searchRank({ title: 'Graph Traversal', kind: 'course' }, words);
    const wholeWord = searchRank({ title: 'Directed graph cycles' }, words);
    const inside = searchRank({ title: 'Subgraph isomorphism' }, words);
    const subjectOnly = searchRank({ title: 'Bridges', subjects: ['Graph'] }, words);
    const contextOnly = searchRank({ title: 'Bridges', context: ['Graph Algorithms'] }, words);
    expect(exact).toBeGreaterThan(starts);
    expect(starts).toBeGreaterThan(wholeWord);
    expect(wholeWord).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(subjectOnly);
    expect(subjectOnly).toBeGreaterThan(contextOnly);
    expect(contextOnly).toBeGreaterThan(searchRank({ title: 'Bridges' }, words));
    expect(searchRank({ title: 'Anything' }, [])).toBe(1);
    expect(
      searchRank({ title: 'Bridges', subjects: ['Two pointers'] }, searchWords('two pointers')),
    ).toBeGreaterThan(searchRank({ title: 'Bridges', subjects: ['Pointers for two'] }, searchWords('two pointers')));
    const phrase = searchWords('two sum');
    expect(searchRank({ title: 'Hashing', text: 'the two sum problem' }, phrase)).toBeGreaterThan(
      searchRank({ title: 'Hashing', text: 'two arrays and a sum' }, phrase),
    );
  });

  it('fixes an unknown word to its closest common spelling and leaves known words alone', () => {
    expect(editDistance('jvaa', 'java')).toBe(1);
    expect(editDistance('garbge', 'garbage')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
    const vocabulary = searchVocabulary([
      foldSearchText('Java streams and garbage collection in Java'),
      foldSearchText('Lava lamps'),
    ]);
    expect(vocabulary.get('java')).toBe(2);
    const known = (word: string) => [...vocabulary.keys()].some((entry) => entry.includes(word));
    expect(closestSearchWords(['jvaa'], vocabulary, known)).toEqual(['java']);
    expect(closestSearchWords(['garbge', 'collection'], vocabulary, known)).toEqual([
      'garbage',
      'collection',
    ]);
    expect(closestSearchWords(['java'], vocabulary, known)).toBeNull();
    expect(closestSearchWords(['zzqqxx'], vocabulary, known)).toBeNull();
    expect(closestSearchWords(['jva', 'c++'], vocabulary, known)).toBeNull();
    expect(closestSearchWords(['strems'], vocabulary, known)).toEqual(['streams']);
  });
});
