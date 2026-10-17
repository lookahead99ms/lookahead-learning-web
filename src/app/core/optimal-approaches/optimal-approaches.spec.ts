import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { DsaApproachFamily } from '../../content/content.models';
import { OptimalApproaches, OptimalApproachesVariant, optimalApproachLinks } from './optimal-approaches';

// Synthetic family only; no curriculum text lives in the public repository.
const second: DsaApproachFamily = {
  approach: 2,
  bestProblemId: 'synthetic-run',
  siblings: [
    {
      problemId: 'synthetic-run',
      approach: 1,
      title: 'Synthetic Run',
      path: 'learn',
      courseId: 'algorithmic-patterns',
      questionId: 'synthetic-run-record',
      pattern: 'Pattern A',
      complexity: { time: 'O(n)', space: 'O(1)' },
      whenToPrefer: 'Prefer A when only the best value is needed.',
    },
    {
      problemId: 'synthetic-run-approach-3',
      approach: 3,
      title: 'Synthetic Run (Approach-3)',
      path: 'learn',
      courseId: 'algorithmic-patterns',
      questionId: 'synthetic-run-approach-3-record',
      pattern: 'Pattern C',
      complexity: { time: 'O(n)', space: 'O(1)' },
      whenToPrefer: 'Prefer C when the input is a stream.',
    },
  ],
};
const first: DsaApproachFamily = {
  approach: 1,
  bestProblemId: 'synthetic-run',
  siblings: [
    {
      problemId: 'synthetic-run-approach-2',
      approach: 2,
      title: 'Synthetic Run (Approach-2)',
      path: 'learn',
      courseId: 'algorithmic-patterns',
      questionId: 'synthetic-run-approach-2-record',
      pattern: 'Pattern B',
      complexity: { time: 'O(n)', space: 'O(1)' },
      whenToPrefer: 'Prefer B when range questions follow.',
    },
  ],
};

async function render(family: DsaApproachFamily | null, variant: OptimalApproachesVariant, named = false) {
  const fixture = TestBed.createComponent(OptimalApproaches);
  fixture.componentRef.setInput('family', family);
  fixture.componentRef.setInput('variant', variant);
  fixture.componentRef.setInput('named', named);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('optimalApproachLinks', () => {
  it('orders the siblings by approach, marks Approach 1 as best and builds routes', () => {
    const links = optimalApproachLinks({ ...second, siblings: [...second.siblings].reverse() });
    expect(links.map((link) => link.approach)).toEqual([1, 3]);
    expect(links[0].best).toBe(true);
    expect(links[1].best).toBe(false);
    expect(links[0].route).toEqual(['/', 'learn', 'algorithmic-patterns', 'synthetic-run-record']);
    expect(links[1]).toMatchObject({ time: 'O(n)', space: 'O(1)', pattern: 'Pattern C' });
  });

  it('is empty without a family or without siblings', () => {
    expect(optimalApproachLinks(null)).toEqual([]);
    expect(optimalApproachLinks(undefined)).toEqual([]);
    expect(optimalApproachLinks({ approach: 1, bestProblemId: 'x', siblings: [] })).toEqual([]);
  });
});

describe('OptimalApproaches', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('renders nothing for a problem without a family', async () => {
    const root = await render(null, 'block');
    expect(root.textContent?.trim()).toBe('');
    expect(root.querySelector('a')).toBeNull();
  });

  it('shows a switch like Light / Dark: this page filled, the others link to their pages (user, 2026-10-16)', async () => {
    const root = await render(second, 'label');
    const nav = root.querySelector('nav.approach-switch')!;
    expect(nav.getAttribute('aria-label')).toBe('Optimal approaches');
    const segments = [...nav.querySelectorAll('.segment')];
    expect(segments.map((segment) => segment.textContent?.trim())).toEqual(['Approach 1', 'Approach 2', 'Approach 3']);
    // This page is the filled segment and not a link.
    expect(segments[1].tagName).toBe('SPAN');
    expect(segments[1].getAttribute('aria-current')).toBe('page');
    expect(segments[1].getAttribute('aria-label')).toBe('Approach 2 of 3, this page');
    // The others are links named only by number: no pattern, no "when to prefer" (no spoilers).
    const links = [...nav.querySelectorAll('a.segment')];
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/learn/algorithmic-patterns/synthetic-run-record');
    expect(links[0].textContent?.trim()).toBe('Approach 1');
    expect(links[0].hasAttribute('aria-label')).toBe(false);
    expect(links[0].hasAttribute('title')).toBe(false);
    const everything = [nav.outerHTML, ...[...nav.querySelectorAll('*')].map((element) => element.textContent)].join(' ');
    expect(everything).not.toMatch(/Pattern [ABC]|Prefer/);
    expect(links.some((link) => link.hasAttribute('aria-current'))).toBe(false);
    expect(root.textContent).not.toContain('→');
  });

  it('lists the other approaches with pattern, shared bounds and when to prefer, marking the best', async () => {
    const root = await render(second, 'block');
    const section = root.querySelector('section.other-approaches')!;
    const heading = section.querySelector('h4')!;
    expect(heading.textContent).toBe('Other optimal approaches');
    // The workspace's "Other optimal solutions" control moves focus here.
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(heading.classList).toContain('other-approaches-heading');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(section.querySelector('.same-bounds')?.textContent).toContain('time O(n), extra space O(1)');
    const items = [...section.querySelectorAll('li')];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('a')?.textContent).toBe('Synthetic Run');
    expect(items[0].querySelector('.approach-pattern')?.textContent).toBe('Pattern A, best for this pattern');
    expect(items[0].querySelector('.approach-when')?.textContent).toBe('Prefer A when only the best value is needed.');
    expect(items[1].querySelector('.approach-pattern')?.textContent).toBe('Pattern C');
    expect(items[1].querySelector('a')?.getAttribute('href')).toBe(
      '/learn/algorithmic-patterns/synthetic-run-approach-3-record',
    );
  });

  it('does not call Approach 2 the best when viewed from Approach 1', async () => {
    const root = await render(first, 'block');
    expect(root.querySelector('.approach-pattern')?.textContent).toBe('Pattern B');
    expect(root.querySelector('.approach-switch')).toBeNull();
  });

  it('keeps Finish and review neutral until the learner revealed the pattern or solved it', async () => {
    const root = await render(first, 'finish');
    const line = root.querySelector('li')!;
    expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('Another optimal approach: Synthetic Run (Approach-2)');
    expect(root.textContent).not.toContain('Pattern B');
  });

  it('writes one "also solvable" line per sibling for Finish and review', async () => {
    const root = await render(first, 'finish', true);
    const items = [...root.querySelectorAll('li')];
    expect(items).toHaveLength(1);
    expect(items[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Also solvable optimally with Pattern B: Synthetic Run (Approach-2)',
    );
    expect(items[0].querySelector('a')?.getAttribute('href')).toBe(
      '/learn/algorithmic-patterns/synthetic-run-approach-2-record',
    );
  });

  it('keeps every link a real anchor so the keyboard reaches it', async () => {
    const root = await render(second, 'block');
    for (const link of root.querySelectorAll('a')) {
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBeTruthy();
      expect(link.getAttribute('tabindex')).toBeNull();
    }
  });
});

describe('OptimalApproaches switch opened from a study plan (DLV-962)', () => {
  it('keeps only the plan return context on the other approaches', async () => {
    const { ActivatedRoute, convertToParamMap } = await import('@angular/router');
    const { of } = await import('rxjs');
    for (const [query, expected] of [
      [{ plan: 'browser', day: '2', activity: 'item-1', other: 'x' }, '?plan=browser&day=2&activity=item-1'],
      [{ plan: 'browser', day: '2' }, ''],
    ] as const) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [OptimalApproaches],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
        ],
      });
      const host = await render(first, 'label');
      expect(host.querySelector('a.segment')?.getAttribute('href')).toBe(
        `/learn/algorithmic-patterns/synthetic-run-approach-2-record${expected}`,
      );
    }
  });
});
