import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { TheoryPatternMap, TheoryTable } from '../../content/content.models';
import { RecognitionIndex } from '../pattern-finder/pattern-finder';
import { ASK_HINTS, closestSpelling, DATA_TYPE_WORDS, editDistance, hasWords, PATTERN_RECOGNITION_INDEX, PatternMap, routeColumns } from './pattern-map';

const table: TheoryTable = {
  columns: ['#', 'Unit', 'Signal in the problem', 'What you remember while you scan'],
  rows: [
    ['1', 'Hashing', '"Seen before?", counts, a pair in unsorted data', 'A set or map of what you read'],
    ['2', 'Two Pointers', 'A pair in sorted data; a palindrome', 'Two indexes'],
    ['3', 'Recursion and Divide &amp; Conquer', 'The problem splits into smaller copies of itself', 'One call per subproblem'],
  ],
};
const map: TheoryPatternMap = {
  orderLabel: 'Suggested study order',
  orderNote: 'not prerequisites; open any unit',
  lessonHrefs: ['/learn/algorithmic-patterns/hashing', '/learn/algorithmic-patterns/two-pointers', '/learn/algorithmic-patterns/recursion'],
  signals: [
    {
      key: 'sorted',
      aliases: ['sorted', 'ascending'],
      intro: 'Sorted input narrows your options.',
      candidates: [{ unit: 2, when: 'A pair with a target sum' }],
      check: 'Check the output you need.',
    },
  ],
};

describe('PatternMap', () => {
  /** Without a finder index (the default here) the map must work exactly as before. */
  function render(load: () => Observable<RecognitionIndex> = () => throwError(() => new Error('not published')), sectionMap = map) {
    TestBed.configureTestingModule({
      imports: [PatternMap],
      providers: [provideRouter([]), { provide: PATTERN_RECOGNITION_INDEX, useValue: load }],
    });
    const fixture = TestBed.createComponent(PatternMap);
    fixture.componentRef.setInput('table', table);
    fixture.componentRef.setInput('map', sectionMap);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const type = (value: string) => {
      const input = root.querySelector('input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, root, type };
  }

  it('matches whole words only, so "sorted" never matches "unsorted"', () => {
    expect(hasWords('a pair in unsorted data', 'sorted')).toBe(false);
    expect(hasWords('a pair in sorted data', 'sorted')).toBe(true);
    expect(hasWords('"In a row", "substring"', 'in a row')).toBe(true);
  });

  it('lists every unit in suggested study order, as plain text, with nothing chosen', () => {
    const { root } = render();
    expect(root.querySelector('.order-label')?.textContent).toContain('Suggested study order');
    expect(Array.from(root.querySelectorAll('.station .name')).map((name) => name.textContent)).toEqual([
      'Hashing',
      'Two Pointers',
      'Recursion and Divide & Conquer',
    ]);
    expect(root.querySelector('.station[aria-current]')).toBeNull();
    expect(root.querySelector('.detail h3')?.textContent).toBe('Start from the words in the problem');
  });

  it('explains a signal: the units that fit, when, and what to check, without opening one', () => {
    const { fixture, root } = render();
    (root.querySelector('.chip') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.chip')?.getAttribute('aria-pressed')).toBe('true');
    expect(Array.from(root.querySelectorAll('.station.hit .name')).map((name) => name.textContent)).toEqual(['Two Pointers']);
    expect(root.querySelector('.detail h3')?.textContent).toBe('Sorted input narrows your options.');
    expect(root.querySelector('.cand-when')?.textContent).toBe('A pair with a target sum');
    expect(root.querySelector('.check')?.textContent).toContain('Check the output you need.');
    expect(root.querySelector('.station[aria-current]')).toBeNull();
  });

  it('opens a unit with a lesson link, returns to the matches, and clears the filter', () => {
    const { fixture, root, type } = render();
    type('ascending order');
    (root.querySelector('.cand') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.station[aria-current] .name')?.textContent).toBe('Two Pointers');
    expect(root.querySelector('.open')?.getAttribute('href')).toBe('/learn/algorithmic-patterns/two-pointers');
    expect(root.querySelector('.open')?.textContent?.trim()).toBe('Two Pointers lesson');
    (root.querySelector('.back') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.detail h3')?.textContent).toBe('Sorted input narrows your options.');
    (root.querySelector('.clear') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.map')?.classList).not.toContain('filtering');
    expect((root.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('falls back to words in the unit signals and says when nothing matches', () => {
    const { root, type } = render();
    type('palindrome');
    expect(Array.from(root.querySelectorAll('.station.hit .name')).map((name) => name.textContent)).toEqual(['Two Pointers']);
    expect(root.querySelector('.detail h3')?.textContent).toBe('One unit mentions this');
    type('zebra');
    expect(root.querySelector('.detail h3')?.textContent).toContain('No unit mentions');
    // No dead end: the panel offers what the problem may ask for, as the map's own signals.
    expect(Array.from(root.querySelectorAll('.ask-hints .cand-unit')).map((e) => e.textContent)).toEqual([
      'Input that is already sorted',
    ]);
  });

  it('explains that an input type cannot point to a pattern and offers what to look for (user, 2026-10-16)', () => {
    const { fixture, root, type } = render();
    type('String');
    expect(root.querySelector('.detail h3')?.textContent).toBe('“String” is the input type, not the pattern');
    expect(root.querySelector('.detail p:not(.eyebrow)')?.textContent).toContain('Many patterns read a string, so it cannot point to one.');
    // The map is not dimmed: nothing was ruled out.
    expect(root.querySelector('.map')?.classList.contains('filtering')).toBe(false);
    const hint = root.querySelector<HTMLButtonElement>('.ask-hints .cand')!;
    expect(hint.querySelector('.cand-unit')?.textContent).toBe('Input that is already sorted');
    expect(hint.querySelector('.cand-when')?.textContent).toBe('Search “sorted”');
    hint.click();
    fixture.detectChanges();
    expect((root.querySelector('input') as HTMLInputElement).value).toBe('sorted');
    expect(Array.from(root.querySelectorAll('.station.hit .name')).map((name) => name.textContent)).toEqual(['Two Pointers']);
    type('arrays');
    expect(root.querySelector('.detail p:not(.eyebrow)')?.textContent).toContain('Many patterns read arrays,');
  });

  it('matches singular and plural forms of the same word, still whole words only (user, 2026-10-16)', () => {
    expect(hasWords('a pair in sorted data', 'pairs')).toBe(true);
    expect(hasWords('two pairs', 'pair')).toBe(true);
    expect(hasWords('many range queries', 'query')).toBe(true);
    expect(hasWords('one box', 'boxes')).toBe(true);
    expect(hasWords('count the subarrays', 'subarray')).toBe(true); // a vowel before y: just add s
    expect(hasWords('two arrays', 'array')).toBe(true);
    expect(hasWords('a pair in unsorted data', 'sorted')).toBe(false);
    expect(hasWords('a class', 'clas')).toBe(false);
    const { root, type } = render();
    type('pairs');
    expect(Array.from(root.querySelectorAll('.station.hit .name')).map((name) => name.textContent)).toEqual(['Hashing', 'Two Pointers']);
  });

  it('resolves a typo to the closest word the map knows and says so (user, 2026-10-16)', () => {
    expect(editDistance('paird', 'pair')).toBe(1);
    expect(editDistance('sortde', 'sorted')).toBe(1); // two neighbours swapped
    const vocabulary = new Set(['pair', 'sorted', 'palindrome', 'unsorted', 'data']);
    expect(closestSpelling('paird', vocabulary)).toBe('pair');
    expect(closestSpelling('palindrmoe', vocabulary)).toBe('palindrome');
    expect(closestSpelling('sorted data', vocabulary)).toBeNull(); // nothing to fix
    expect(closestSpelling('xyz', vocabulary)).toBeNull(); // short words are left alone
    expect(closestSpelling('zebra', vocabulary)).toBeNull(); // too far from every known word
    const { root, type } = render();
    type('paird');
    expect(root.querySelector('.corrected')?.textContent).toBe('Showing matches for “pair”, the closest to “paird”.');
    expect(Array.from(root.querySelectorAll('.station.hit .name')).map((name) => name.textContent)).toEqual(['Hashing', 'Two Pointers']);
    type('sortd');
    expect(root.querySelector('.chip[aria-pressed="true"]')?.textContent).toBe('sorted');
    type('pair');
    expect(root.querySelector('.corrected')).toBeNull();
  });

  it('brings the matching units to the front of the route and keeps the rest after them (user, 2026-10-16)', () => {
    const { root, type } = render();
    const order = () => Array.from(root.querySelectorAll('.route .name')).map((name) => name.textContent);
    expect(order()).toEqual(['Hashing', 'Two Pointers', 'Recursion and Divide & Conquer']);
    type('sorted');
    expect(order()).toEqual(['Two Pointers', 'Hashing', 'Recursion and Divide & Conquer']);
    expect(root.querySelector('.route li:first-child .station')?.classList.contains('hit')).toBe(true);
    // The study-order line is hidden while the order differs from it.
    expect(root.querySelector('.track path')?.getAttribute('d') ?? '').toBe('');
    // ...so no row runs backwards: every station sits left to right in display order.
    const columns = Array.from(root.querySelectorAll<HTMLElement>('.route li')).map((li) => li.style.gridColumn);
    expect(columns).toEqual(['1', '2', '3']);
    type('');
    expect(order()).toEqual(['Hashing', 'Two Pointers', 'Recursion and Divide & Conquer']);
  });

  it('keeps the input-type words and hint signals in step with the published chips', () => {
    expect(DATA_TYPE_WORDS).toEqual(expect.arrayContaining(['string', 'array', 'list', 'integer', 'number', 'character']));
    expect(ASK_HINTS.map((hint) => hint.key)).toEqual(['how many ways', 'in a row', 'min or max', 'seen before', 'top k', 'all combinations', 'sorted', 'next greater', 'prefix']);
  });
});

// Synthetic finder cards for the three synthetic units above; never real curriculum text.
const finderIndex: RecognitionIndex = {
  schemaVersion: 'pattern-recognition-index/v1',
  units: [
    { n: 1, name: 'Hashing' },
    { n: 2, name: 'Two Pointers' },
    { n: 3, name: 'Recursion and Divide & Conquer' },
  ],
  vocabulary: [
    { key: 'sorted', forms: ['ascending'] },
    { key: 'pair', forms: [] },
    { key: 'split', forms: ['halves'] },
  ],
  problems: [
    { id: 'p1', title: 'Find a repeat', unit: 1, href: '/learn/sample/p1', input: ['array'], wants: ['yes-no'], size: 'large', phrases: [] },
    { id: 'p2', title: 'Pair in a bag', unit: 1, href: '/learn/sample/p2', input: ['array'], wants: ['count'], size: 'large', phrases: ['pair'] },
    { id: 'p3', title: 'Pair in a line', unit: 2, href: '/learn/sample/p3', input: ['array'], wants: ['count'], size: 'large', phrases: ['pair', 'sorted'] },
    { id: 'p4', title: 'Mirror word', unit: 2, href: '/learn/sample/p4', input: ['string'], wants: ['yes-no'], size: 'large', phrases: [] },
    { id: 'p5', title: 'Mirror phrase', unit: 2, href: '/learn/sample/p5', input: ['string'], wants: ['yes-no'], size: 'large', phrases: [] },
    { id: 'p6', title: 'Halve the tree', unit: 3, href: '/learn/sample/p6', input: ['tree'], wants: ['best'], size: 'medium', phrases: ['split'] },
  ],
};
const pairMap: TheoryPatternMap = {
  ...map,
  signals: [
    ...map.signals,
    {
      key: 'pair',
      aliases: ['pair'],
      intro: 'Two values that belong together.',
      candidates: [
        { unit: 1, when: 'Unsorted data: remember what you saw' },
        { unit: 2, when: 'Sorted data: move in from both ends' },
      ],
      check: 'Check whether the input is sorted.',
    },
  ],
};

describe('PatternMap pattern finder (user, 2026-10-16)', () => {
  function render(sectionMap = map) {
    TestBed.configureTestingModule({
      imports: [PatternMap],
      providers: [provideRouter([]), { provide: PATTERN_RECOGNITION_INDEX, useValue: () => of(finderIndex) }],
    });
    const fixture = TestBed.createComponent(PatternMap);
    fixture.componentRef.setInput('table', table);
    fixture.componentRef.setInput('map', sectionMap);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const row = (label: string) => Array.from(root.querySelectorAll<HTMLElement>('.check-row')).find((item) => item.querySelector('.check-label')?.textContent === label)!;
    const tap = (label: string, chip: string) => {
      Array.from(row(label).querySelectorAll<HTMLButtonElement>('.chip')).find((button) => button.textContent?.trim() === chip)!.click();
      fixture.detectChanges();
    };
    const pressed = (label: string) => Array.from(row(label).querySelectorAll('.chip[aria-pressed="true"]')).map((chip) => chip.textContent?.trim());
    const type = (value: string) => {
      const input = root.querySelector('input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, root, row, tap, pressed, type };
  }
  const names = (root: HTMLElement, selector: string) => Array.from(root.querySelectorAll(selector)).map((item) => item.textContent?.trim());

  it('hides the three tap rows when the index cannot load, and keeps the map as it was', () => {
    TestBed.configureTestingModule({
      imports: [PatternMap],
      providers: [provideRouter([]), { provide: PATTERN_RECOGNITION_INDEX, useValue: () => throwError(() => new Error('404')) }],
    });
    const fixture = TestBed.createComponent(PatternMap);
    fixture.componentRef.setInput('table', table);
    fixture.componentRef.setInput('map', map);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.check-row')).toHaveLength(0);
    expect(root.querySelectorAll('.chips .chip')).toHaveLength(1);
    expect(root.querySelector('.detail h3')?.textContent).toBe('Start from the words in the problem');
  });

  it('shows Input, Wants back and Size as labelled groups of toggle chips, with nothing chosen', () => {
    const { root, row } = render();
    expect(names(root, '.check-label')).toEqual(['Input', 'Wants back', 'Size']);
    const input = row('Input');
    expect(input.getAttribute('role')).toBe('group');
    expect(root.querySelector(`#${input.getAttribute('aria-labelledby')}`)?.textContent).toBe('Input');
    expect(names(input, '.chip')).toEqual(['string', 'array', 'grid / matrix', 'tree', 'linked list', 'graph', 'intervals', 'numbers']);
    expect(names(row('Wants back'), '.chip')).toEqual(['a count', 'the best', 'yes / no', 'all of them', 'the k-th / top k', 'an order', 'a built structure', 'the input changed', 'one value']);
    expect(names(row('Size'), '.chip')).toEqual(['n ≤ 20', 'up to about 10⁴', '10⁵ and more', 'not stated']);
    expect(root.querySelectorAll('.check-row .chip[aria-pressed="true"]')).toHaveLength(0);
    expect(Array.from(root.querySelectorAll('.check-row .chip')).every((chip) => chip.tagName === 'BUTTON' && chip.getAttribute('type') === 'button')).toBe(true);
    // Untouched rows leave the map unfiltered, in study order.
    expect(root.querySelector('.map')?.classList.contains('filtering')).toBe(false);
    expect(root.querySelector('.detail')?.textContent).toContain('Then tap what the input is');
  });

  it('takes one answer per row: another chip switches it, the same chip clears it (user, 2026-10-16)', () => {
    const { tap, pressed } = render();
    tap('Input', 'string');
    tap('Input', 'array');
    expect(pressed('Input')).toEqual(['array']);
    tap('Input', 'array');
    expect(pressed('Input')).toEqual([]);
    tap('Wants back', 'a count');
    tap('Wants back', 'yes / no');
    expect(pressed('Wants back')).toEqual(['yes / no']);
    tap('Size', 'n ≤ 20');
    tap('Size', '10⁵ and more');
    expect(pressed('Size')).toEqual(['10⁵ and more']);
    tap('Size', '10⁵ and more');
    expect(pressed('Size')).toEqual([]);
  });

  it('names the one unit that fits, with check marks for each answer and problems to compare', () => {
    const { root, tap } = render();
    tap('Input', 'tree');
    tap('Wants back', 'the best');
    expect(root.querySelector('.detail .eyebrow')?.textContent).toBe('Fits your answers');
    // The unit is the heading and the button that opens it; one leader needs no tell-apart line.
    expect(root.querySelectorAll('.detail h3')).toHaveLength(1);
    expect(root.querySelector('.detail h3 button .result-name')?.textContent).toBe('Recursion and Divide & Conquer');
    expect(root.querySelector('.result-when')).toBeNull();
    expect(names(root, '.reasons li')).toEqual(['tree✓matches', 'the best✓matches']);
    const link = root.querySelector<HTMLAnchorElement>('.like a')!;
    expect(link.textContent).toBe('Halve the tree');
    expect(link.getAttribute('href')).toBe('/learn/sample/p6');
    // No map signal lists this unit, so the check asks the learner to compare examples.
    expect(root.querySelector('.check')?.textContent).toContain('Open two of the examples and compare them with your problem');
    // The matching unit leads the route; the others dim.
    expect(root.querySelector('.map')?.classList.contains('filtering')).toBe(true);
    expect(names(root, '.route .station.hit .name')).toEqual(['Recursion and Divide & Conquer']);
    expect(root.querySelector('.route li:first-child .name')?.textContent).toBe('Recursion and Divide & Conquer');
  });

  it('shows two close units with how to tell them apart from a signal both share', () => {
    const { root, tap, type } = render(pairMap);
    tap('Input', 'array');
    tap('Wants back', 'a count');
    type('pair');
    expect(root.querySelector('.detail .eyebrow')?.textContent).toBe('Two close fits');
    expect(names(root, '.result-name')).toEqual(['Hashing', 'Two Pointers']);
    expect(names(root, '.result-when')).toEqual(['Unsorted data: remember what you saw', 'Sorted data: move in from both ends']);
    expect(root.querySelector('.check')?.textContent).toBe('Check first. Check whether the input is sorted.');
    expect(names(root, '.reasons li')[2]).toBe('‘pair’✓matches');
  });

  it('falls back to each unit\'s own signal line when no map signal lists both', () => {
    const { root, tap } = render();
    tap('Input', 'array');
    tap('Wants back', 'a count');
    expect(names(root, '.result-name')).toEqual(['Hashing', 'Two Pointers']);
    expect(names(root, '.result-when')).toEqual(['"Seen before?", counts, a pair in unsorted data', 'A pair in sorted data; a palindrome']);
    expect(root.querySelector('.check')?.textContent).toContain('before you choose Hashing.');
    expect(root.querySelector('.more')).toBeNull();
  });

  it('marks an answer the closest problem does not share, and says when nothing fits at all', () => {
    const { root, tap } = render();
    tap('Input', 'string');
    tap('Wants back', 'a count');
    expect(names(root, '.reasons li')).toContain('a count✗does not match');
    tap('Input', 'string');
    tap('Wants back', 'a count');
    tap('Input', 'linked list');
    expect(root.querySelector('.detail h3')?.textContent).toBe('No problem in our catalogue fits all of these');
  });

  it('opens a result unit, returns to the matches, and Clear filter resets every check', () => {
    const { root, tap, fixture, pressed } = render();
    tap('Input', 'string');
    (root.querySelector('.result-unit') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.station[aria-current] .name')?.textContent).toBe('Two Pointers');
    const back = root.querySelector<HTMLButtonElement>('.back')!;
    expect(back.textContent).toContain('Back to your matches');
    back.click();
    fixture.detectChanges();
    expect(root.querySelector('.result-name')?.textContent).toBe('Two Pointers');
    const clear = root.querySelector<HTMLButtonElement>('.clear')!;
    expect(clear.disabled).toBe(false);
    clear.click();
    fixture.detectChanges();
    expect(pressed('Input')).toEqual([]);
    expect(root.querySelector('.map')?.classList.contains('filtering')).toBe(false);
    expect(clear.disabled).toBe(true);
  });

  it('uses the typed words and signal chips as the key words once a check is tapped', () => {
    const { root, tap, type } = render();
    type('sorted');
    // Before a check is tapped the signal panel shows, as it always has.
    expect(root.querySelector('.detail h3')?.textContent).toBe('Sorted input narrows your options.');
    tap('Input', 'array');
    expect(names(root, '.result-name')[0]).toBe('Two Pointers');
    expect(names(root, '.reasons li')).toEqual(['array✓matches', '‘sorted’✓matches']);
    type('sortd'); // the same spelling fix as the typing box
    expect(names(root, '.reasons li')).toEqual(['array✓matches', '‘sorted’✓matches']);
  });
});

describe('routeColumns (DLV-803)', () => {
  it('keeps a drawn route beside the guide panel inside the centred lesson frame', () => {
    expect(routeColumns(0)).toBe(5); // not measured yet
    expect(routeColumns(900)).toBe(5);
    expect(routeColumns(640)).toBe(5);
    expect(routeColumns(634)).toBe(4); // 1920 and 2560 monitors
    expect(routeColumns(546)).toBe(4); // 14-inch laptop
    expect(routeColumns(474)).toBe(4); // 13-inch laptop
    expect(routeColumns(459)).toBe(1); // phones and high zoom: the numbered list
  });
});
