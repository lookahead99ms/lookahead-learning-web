import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TheoryPatternMap, TheoryTable } from '../../content/content.models';
import { hasWords, PatternMap } from './pattern-map';

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
  function render() {
    TestBed.configureTestingModule({ imports: [PatternMap], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PatternMap);
    fixture.componentRef.setInput('table', table);
    fixture.componentRef.setInput('map', map);
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
  });
});
