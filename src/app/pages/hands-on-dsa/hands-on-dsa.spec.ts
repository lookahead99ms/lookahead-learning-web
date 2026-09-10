import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, Scroll, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { routes } from '../../app.routes';
import {
  ContentItemSummary,
  CourseContent,
  CourseOutline,
  InterviewQuestion,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { HandsOnDsaIndex } from '../../content/hands-on-dsa';
import { Course } from '../course/course';
import { Question } from '../question/question';
import { HandsOnDsa } from './hands-on-dsa';

const question = (id: string, moduleId: string): InterviewQuestion => ({
  id,
  moduleId,
  order: 1,
  title: id,
  difficulty: 'Beginner',
  tags: [],
  interviewAnswer: 'Synthetic test answer.',
  explanation: [],
  versionNotes: [],
  followUps: [],
});

function practiceCourse(): CourseContent {
  const units = ['hashing', 'two-pointers'];
  return {
    id: 'algorithmic-patterns',
    path: 'learn',
    title: 'Pattern tests',
    description: 'Synthetic routing fixture.',
    version: '1',
    layout: 'learning-map',
    modules: units.flatMap((id, order) => [
      { id: `${id}-theory`, order, title: id, description: 'Concept' },
      { id: `${id}-practice`, order, title: `${id} practice`, description: 'Practice' },
    ]),
    learningUnits: units.map((id) => ({
      id,
      title: id,
      description: 'Concept',
      theoryModuleId: `${id}-theory`,
      practiceModuleId: `${id}-practice`,
    })),
    questions: units.flatMap((id) => [
      { ...question(`${id}-lesson`, `${id}-theory`), contentType: 'theory' },
      ...(['complete', 'starter'] as const).map((status): InterviewQuestion => ({
        ...question(`${id}-${status}`, `${id}-practice`),
        contentType: 'dsa-problem',
        relatedArticleId: `${id}-lesson`,
        practiceProblem: {
          sourceSets: [],
          tier: 'core',
          objective: 'Exercise routing',
          implementationStatus: status,
        },
      })),
    ]),
  };
}

function practiceOutline(course: CourseContent): CourseOutline {
  return {
    ...course,
    questions: course.questions.map((item) => ({
      id: item.id,
      moduleId: item.moduleId,
      order: item.order,
      title: item.title,
      difficulty: item.difficulty,
      tags: item.tags,
      contentType: item.contentType ?? 'q-and-a',
      isTheoryArticle: item.contentType === 'theory',
      detailRef: {
        kind: 'content-item',
        href: `/content/details/learn/${course.id}/${item.moduleId}/${item.id}.json`,
        version: 'fixture-version',
      },
      ...(item.relatedArticleId ? { relatedArticleId: item.relatedArticleId } : {}),
    })),
    moduleDetailRefs: [],
  };
}

function practiceIndex(): HandsOnDsaIndex {
  const groups = ['hashing', 'two-pointers'].map((id, index) => ({
    id: `algorithmic-patterns:${id}`,
    preparationOrder: index + 1,
    courseId: 'algorithmic-patterns',
    courseTitle: 'Pattern tests',
    title: id,
    description: 'Concept',
    unitId: id,
    practiceModuleId: `${id}-practice`,
    lessonId: `${id}-lesson`,
    lessonTitle: id,
    tags: [],
    hasGuidedLesson: true,
    problems: [
      {
        id: `${id}-canonical`,
        title: `${id}-complete`,
        description: 'A complete canonical problem.',
        difficulty: 'Beginner' as const,
        variation: 'Canonical invariant',
        invariantAdaptation: 'Preserve the invariant.',
        version: 'fixture-version',
        questionId: `${id}-complete`,
        route: ['/learn', 'algorithmic-patterns', `${id}-complete`],
        interviewRank: index === 0 ? 151 : 1,
        studyOrder: index + 1,
        tier: index === 0 ? ('interview-core' as const) : ('universal-must-do' as const),
        rankingVersion: 'fixture-ranking',
      },
    ],
  }));
  return {
    schemaVersion: 'hands-on-dsa-index/v2',
    totals: { groups: groups.length, problemPlacements: groups.length, distinctProblems: 2 },
    ranking: {
      status: 'candidate',
      rankingVersion: 'fixture-ranking',
      catalogTarget: 730,
      rankedProblems: 2,
      lastReviewedAt: '2026-09-06',
    },
    groups,
  };
}

function emptyPracticeIndex(): HandsOnDsaIndex {
  return {
    schemaVersion: 'hands-on-dsa-index/v1',
    totals: { groups: 0, problemPlacements: 0, distinctProblems: 0 },
    groups: [],
  };
}

function paginatedIndex(count: number): HandsOnDsaIndex {
  const index = practiceIndex();
  const first = index.groups[0];
  const template = first.problems[0];
  first.problems = Array.from({ length: count }, (_, position) => ({
    ...template,
    id: `problem-${position + 1}`,
    title: `Problem ${position + 1}`,
    questionId: `problem-${position + 1}`,
    route: ['/learn', 'algorithmic-patterns', `problem-${position + 1}`],
    interviewRank: count - position,
    studyOrder: position + 1,
  }));
  index.groups = [first];
  index.totals = { groups: 1, distinctProblems: count, problemPlacements: count };
  return index;
}

describe('Hands-On DSA route contracts', () => {
  let course: CourseContent;
  let catalog: HandsOnDsaIndex;
  const content = {
    getCourseOutline: vi.fn(),
    getContentItem: vi.fn(),
    getHandsOnDsaIndex: vi.fn(),
    getCatalog: vi.fn(() => of([{ id: 'algorithmic-patterns', title: 'Pattern tests' }])),
  };

  beforeEach(async () => {
    course = practiceCourse();
    catalog = practiceIndex();
    content.getCourseOutline
      .mockReset()
      .mockImplementation((_path, id) =>
        of(
          practiceOutline(
            id === course.id
              ? course
              : { ...course, id, modules: [], questions: [], learningUnits: [] },
          ),
        ),
      );
    content.getContentItem
      .mockReset()
      .mockImplementation((summary: ContentItemSummary) =>
        of(course.questions.find(({ id }) => id === summary.id)!),
      );
    content.getHandsOnDsaIndex.mockReset().mockImplementation(() => of(catalog));
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ContentService, useValue: content }],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses a semantic table with both stable orders and plain pattern context by default', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    expect(
      harness
        .routeNativeElement!.querySelector('[data-sort-column="learning"]')!
        .closest('th')!
        .getAttribute('aria-sort'),
    ).toBe('ascending');
    expect(harness.routeNativeElement!.querySelectorAll('ul.practice-proof li')).toHaveLength(4);
    expect(harness.routeNativeElement!.querySelector('details')).toBeNull();
    expect(
      [...harness.routeNativeElement!.querySelectorAll('th')].map((cell) =>
        cell.textContent?.replace(/[↑↓↕]/g, '').trim(),
      ),
    ).toEqual(['Problem', 'Difficulty', 'Interview priority', 'Learning order']);
    expect(
      [...harness.routeNativeElement!.querySelectorAll('th')].every(
        (cell) => cell.getAttribute('scope') === 'col',
      ),
    ).toBe(true);
    const rows = [...harness.routeNativeElement!.querySelectorAll('.problem-table-row')];
    expect(rows.map((row) => row.querySelector('.problem-link')!.textContent)).toEqual([
      'hashing-complete',
      'two-pointers-complete',
    ]);
    expect(
      rows.map((row) => row.querySelector('.problem-interview-order')!.textContent?.trim()),
    ).toEqual(['151', '1']);
    expect(
      rows.map((row) => row.querySelector('.problem-learning-order')!.textContent?.trim()),
    ).toEqual(['1', '2']);
    expect(rows[0].querySelector('.problem-pattern')!.textContent).toBe('hashing');
    expect(rows[0].querySelector('.problem-difficulty')!.getAttribute('data-label')).toBe(
      'Difficulty',
    );
    expect(rows[0].querySelector('.problem-interview-order')!.getAttribute('data-label')).toBe(
      'Interview priority',
    );
    expect(rows[0].querySelector('.problem-learning-order')!.getAttribute('data-label')).toBe(
      'Learning order',
    );
    expect(rows[0].textContent).not.toMatch(/Rank #|Study #|Interview #/);
    expect(harness.routeNativeElement!.querySelector('.ranked-problem-number')).toBeNull();
  });

  it('takes Practice to its pattern, opens a problem, and returns via the DSA breadcrumb', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/algorithmic-patterns', Course);
    const practice = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      '.learning-action.practice',
    )!;
    practice.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing',
    );
    // This test covers the legacy question shell after proving the indexed
    // catalog route. Canonical fast-path behavior has focused tests below.
    content.getHandsOnDsaIndex.mockReturnValueOnce(of(emptyPracticeIndex()));
    harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a.problem-link')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(
      '/learn/algorithmic-patterns/hashing-complete?pattern=algorithmic-patterns:hashing&returnTo=' +
        encodeURIComponent('/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing').replace(
          '%3A',
          ':',
        ),
    );
    const breadcrumbs = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.breadcrumbs a'),
    ];
    const libraryBreadcrumb = breadcrumbs.find(
      (link) => link.textContent.trim() === 'Hands-On DSA',
    )!;
    const patternBreadcrumb = breadcrumbs.find((link) =>
      link.getAttribute('href')?.includes('pattern=algorithmic-patterns:hashing'),
    )!;
    expect(libraryBreadcrumb.getAttribute('href')).toBe('/learn/hands-on-dsa');
    expect(patternBreadcrumb.getAttribute('href')).toBe(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing',
    );
    expect(
      harness.routeNativeElement!.querySelector('.breadcrumbs [aria-current="page"]')!.textContent,
    ).toBe('hashing-complete');
    patternBreadcrumb.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing',
    );
  });

  it('exposes a clear-filter action and restores the complete ordered table', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:two-pointers',
      HandsOnDsa,
    );
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(1);
    const clearFilter =
      harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.clear-pattern-filter')!;
    expect(clearFilter.textContent).toContain('Clear filter');
    expect(clearFilter.getAttribute('aria-label')).toBe('Clear two-pointers pattern filter');
    clearFilter.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/learn/hands-on-dsa');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(2);
    expect(harness.routeNativeElement!.querySelectorAll('details[open]')).toHaveLength(0);
    expect(harness.routeNativeElement!.querySelectorAll('.problem-card')).toHaveLength(0);
  });

  it('restores a deep-linked pattern when the existing practice route changes', async () => {
    const harness = await RouterTestingHarness.create();
    const original = await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    const reused = await harness.navigateByUrl(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:two-pointers',
      HandsOnDsa,
    );
    expect(reused).toBe(original);
    const selectedPattern = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      '.pattern-filter [aria-current="page"]',
    )!;
    expect(selectedPattern.textContent?.replace(/\s/g, '')).toBe('02two-pointers');
    expect(selectedPattern.getAttribute('aria-label')).toBe('Clear pattern 2, two-pointers filter');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(1);
  });

  it('restores tier and sort selections from the URL and preserves them across filters', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?scope=150&sort=interview-rank&difficulty=Beginner&q=complete',
      HandsOnDsa,
    );

    const controls = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>(
        '.practice-controls select',
      ),
    ];
    expect(controls.map(({ value }) => value)).toEqual(['Beginner', '150']);
    expect([...controls[1].options].map(({ text }) => text.trim())).toEqual([
      'Universal Must-Do · 150',
      'Interview Core · 365',
      'Pattern Depth · 600',
      'Full Library',
    ]);
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>(
        '[data-sort-column="difficulty"]',
      )!.disabled,
    ).toBe(true);
    expect(harness.routeNativeElement!.textContent).not.toContain('View problems by');
    expect(harness.routeNativeElement!.querySelector('.ranking-context')).toBeNull();
    expect(harness.routeNativeElement!.textContent).not.toContain('Ranking candidate');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(1);
    expect(harness.routeNativeElement!.textContent).toContain('1–1 of 1 problem');
    expect(
      harness
        .routeNativeElement!.querySelector('.problem-table-row .problem-link')!
        .textContent?.trim(),
    ).toBe('two-pointers-complete');

    controls[1].value = '365';
    controls[1].dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toContain('scope=365');
    expect(TestBed.inject(Router).url).toContain('sort=interview-rank');
    expect(TestBed.inject(Router).url).toContain('difficulty=Beginner');
    expect(TestBed.inject(Router).url).toContain('q=complete');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(2);
    expect(
      [
        ...harness.routeNativeElement!.querySelectorAll<HTMLHeadingElement>(
          '.problem-table-row .problem-link',
        ),
      ].map((heading) => heading.textContent?.trim()),
    ).toEqual(['two-pointers-complete', 'hashing-complete']);
    const rankedRows = [...harness.routeNativeElement!.querySelectorAll('.problem-table-row')];
    expect(
      rankedRows.map((row) => row.querySelector('.problem-interview-order')!.textContent?.trim()),
    ).toEqual(['1', '151']);
    expect(
      rankedRows.map((row) => row.querySelector('.problem-learning-order')!.textContent?.trim()),
    ).toEqual(['2', '1']);

    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.clear-catalog-filters')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/learn/hands-on-dsa');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(2);
  });

  it.each([0, 1, 25, 26, 730])('pages %i problems without phantom rows', async (count) => {
    catalog = paginatedIndex(count);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=study-order', HandsOnDsa);
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(
      Math.min(25, count),
    );
    expect(harness.routeNativeElement!.querySelector('.load-more-problems')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.problem-pagination') !== null).toBe(
      count > 25,
    );
    expect(harness.routeNativeElement!.querySelector('.pagination-previous')).toBeNull();
    if (count)
      expect(harness.routeNativeElement!.textContent).toContain(
        `1–${Math.min(25, count)} of ${count} ${count === 1 ? 'problem' : 'problems'}`,
      );
    else expect(harness.routeNativeElement!.textContent).toContain('0 problems');
  });

  it('visits 730 unique problems across 30 replacement pages, ending with five', async () => {
    catalog = paginatedIndex(730);
    // The same canonical problem may be placed in another pattern; it must not consume another slot.
    catalog.groups.push({
      ...catalog.groups[0],
      id: 'second-pattern',
      preparationOrder: 2,
      problems: catalog.groups[0].problems.slice(0, 3),
    });
    const harness = await RouterTestingHarness.create();
    const ids: string[] = [];
    for (let page = 1; page <= 30; page++) {
      await harness.navigateByUrl(
        `/learn/hands-on-dsa?sort=study-order${page === 1 ? '' : '&page=' + page}`,
        HandsOnDsa,
      );
      const rows = [
        ...harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.problem-table-row'),
      ];
      expect(rows).toHaveLength(page === 30 ? 5 : 25);
      expect(rows[0].querySelector('.problem-learning-order')!.textContent?.trim()).toBe(
        String((page - 1) * 25 + 1),
      );
      ids.push(
        ...rows.map(
          (row) => new URL(row.querySelector<HTMLAnchorElement>('.problem-link')!.href).pathname,
        ),
      );
      expect(
        harness
          .routeNativeElement!.querySelector('.problem-pagination [aria-current="page"]')!
          .textContent?.trim(),
      ).toBe(String(page));
      expect(
        harness.routeNativeElement!.querySelectorAll('.problem-pagination a').length,
      ).toBeLessThanOrEqual(7);
    }
    expect(new Set(ids).size).toBe(730);
    expect(harness.routeNativeElement!.textContent).toContain('726–730 of 730 problems');
    expect(harness.routeNativeElement!.querySelector('.pagination-next')).toBeNull();
    const previous =
      harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.pagination-previous')!;
    expect(previous.getAttribute('href')).toContain('page=29');
    previous.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('701–725 of 730 problems');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(25);
  });

  it.each(['0', '-2', 'abc', '2.5', 'Infinity', '9007199254740993', '01', '1'])(
    'canonicalizes invalid or redundant first-page URL %s',
    async (page) => {
      catalog = paginatedIndex(26);
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/learn/hands-on-dsa?sort=study-order&page=${page}`);
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(TestBed.inject(Router).url).toBe('/learn/hands-on-dsa?sort=study-order');
      expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(25);
    },
  );

  it('clamps an out-of-range page after loading and removes pagination for zero matches', async () => {
    const loading = new Subject<HandsOnDsaIndex>();
    content.getHandsOnDsaIndex.mockReturnValueOnce(loading);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=study-order&page=999', HandsOnDsa);
    expect(TestBed.inject(Router).url).toContain('page=999');
    expect(harness.routeNativeElement!.textContent).toContain('Loading the practice catalog');
    loading.next(paginatedIndex(26));
    loading.complete();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toContain('page=2');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(1);
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(
      '.practice-controls input',
    )!;
    input.value = 'no-match-available';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).not.toContain('page=');
    expect(harness.routeNativeElement!.querySelector('.problem-pagination')).toBeNull();
    expect(harness.routeNativeElement!.textContent).toContain('No matching practice yet');
  });

  it('keeps native page links and problem return links filtered, resetting page for membership and ordering changes', async () => {
    catalog = paginatedIndex(80);
    const harness = await RouterTestingHarness.create();
    const context =
      'sort=study-order&scope=365&difficulty=Beginner&q=Problem&pattern=algorithmic-patterns:hashing';
    await harness.navigateByUrl('/learn/hands-on-dsa?' + context + '&page=2', HandsOnDsa);
    const next = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.pagination-next')!;
    expect(next.getAttribute('href')).toBe('/learn/hands-on-dsa?' + context + '&page=3');
    const row = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.problem-table-row')!;
    expect(
      new URL(row.querySelector<HTMLAnchorElement>('.problem-link')!.href).searchParams.get(
        'returnTo',
      ),
    ).toBe('/learn/hands-on-dsa?' + context + '&page=2');
    const pattern =
      harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.pattern-filter a')!;
    expect(pattern.getAttribute('href')).not.toContain('page=');
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('[data-sort-column="interview"]')!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).not.toContain('page=');
    expect(TestBed.inject(Router).url).toContain('sort=interview-rank');
    expect(TestBed.inject(Router).url).toContain('q=Problem');
    expect(
      harness.routeNativeElement!.querySelector('.problem-interview-order')!.textContent?.trim(),
    ).toBe('1');
  });

  it('focuses the updated range only after an ordinary page activation and router scrolling', async () => {
    catalog = paginatedIndex(80);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=study-order', HandsOnDsa);
    const results = harness.routeNativeElement!.querySelector<HTMLElement>('#practice-results')!;
    const focus = vi.spyOn(results, 'focus');
    const scroll = vi.fn();
    Object.defineProperty(results, 'scrollIntoView', { value: scroll });
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const router = TestBed.inject(Router);
    const events = router.events as Subject<unknown>;
    const next = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.pagination-next')!;
    next.dispatchEvent(new MouseEvent('click', { button: 0, ctrlKey: true }));
    events.next(new Scroll(new NavigationEnd(10, '', ''), null, null));
    for (const frame of frames.splice(0)) frame(0);
    expect(focus).not.toHaveBeenCalled();
    next.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(focus).not.toHaveBeenCalled();
    events.next(new Scroll(new NavigationEnd(11, router.url, router.url), null, null));
    for (const frame of frames.splice(0)) frame(0);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(results.textContent).toContain('26–50 of 80 problems');
    events.next(new Scroll(new NavigationEnd(12, '', ''), [0, 500], null));
    for (const frame of frames.splice(0)) frame(0);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('keeps explicit Pattern mode with visible bounded tables and concept links across pages', async () => {
    catalog = paginatedIndex(40);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?sort=pattern-order&pattern=algorithmic-patterns:hashing&page=2',
      HandsOnDsa,
    );
    expect(harness.routeNativeElement!.textContent).toContain('26–40 of 40 problems');
    expect(harness.routeNativeElement!.querySelector('details')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.pattern-group-header h2')!.textContent).toBe(
      'hashing',
    );
    expect(
      harness
        .routeNativeElement!.querySelector<HTMLAnchorElement>('.lesson-link')!
        .getAttribute('href'),
    ).toBe('/learn/algorithmic-patterns/hashing-lesson');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(15);
    expect(harness.routeNativeElement!.querySelector('.problem-link')!.textContent).toBe(
      'Problem 26',
    );
    expect(
      harness.routeNativeElement!.querySelector('.group-patterns')!.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('retains both pattern headings when a page crosses a group boundary without duplicating problems', async () => {
    catalog = paginatedIndex(40);
    const all = catalog.groups[0].problems;
    catalog.groups.push({
      ...catalog.groups[0],
      id: 'algorithmic-patterns:second',
      title: 'Second pattern',
      preparationOrder: 2,
      problems: all.slice(20),
    });
    catalog.groups[0].problems = all.slice(0, 30);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=pattern-order&page=2', HandsOnDsa);
    expect(harness.routeNativeElement!.querySelectorAll('.pattern-group')).toHaveLength(2);
    const links = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.problem-link'),
    ];
    expect(links).toHaveLength(15);
    expect(new Set(links.map((link) => new URL(link.href).pathname)).size).toBe(15);
    expect(harness.routeNativeElement!.textContent).toContain('26–40 of 40 problems');
    expect(
      [...harness.routeNativeElement!.querySelectorAll('.problem-pattern')].map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual([...Array(5).fill('hashing'), ...Array(10).fill('Second pattern')]);
  });

  it('keeps an explicit Pattern URL and returns to default Learning order without a redundant sort parameter', async () => {
    catalog = paginatedIndex(40);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=pattern-order&page=2', HandsOnDsa);
    expect(
      harness.routeNativeElement!.querySelector('.group-patterns')!.getAttribute('aria-pressed'),
    ).toBe('true');
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('[data-sort-column="learning"]')!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/learn/hands-on-dsa');
    expect(harness.routeNativeElement!.querySelector('.pattern-group')).toBeNull();
    expect(
      harness.routeNativeElement!.querySelector('.problem-learning-order')!.textContent?.trim(),
    ).toBe('1');
  });

  it('maps the legacy difficulty sort URL to ascending difficulty', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=difficulty', HandsOnDsa);

    const controls = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>(
        '.practice-controls select',
      ),
    ];
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>(
      '[data-sort-column="difficulty"]',
    )!;
    expect(button.closest('th')!.getAttribute('aria-sort')).toBe('ascending');
    expect(button.disabled).toBe(false);
  });

  it('disables redundant difficulty orders and resets one when a difficulty is selected', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=difficulty-descending', HandsOnDsa);
    const controls = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>(
        '.practice-controls select',
      ),
    ];

    controls[0].value = 'Intermediate';
    controls[0].dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(
      harness
        .routeNativeElement!.querySelector('[data-sort-column="learning"]')!
        .closest('th')!
        .getAttribute('aria-sort'),
    ).toBe('ascending');
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>(
        '[data-sort-column="difficulty"]',
      )!.disabled,
    ).toBe(true);
    expect(TestBed.inject(Router).url).toContain('difficulty=Intermediate');
    expect(TestBed.inject(Router).url).not.toContain('sort=');
  });

  it('sorts through every column in both directions and restores the URL state', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=pattern-order', HandsOnDsa);
    for (const column of ['title', 'difficulty', 'interview', 'learning']) {
      for (const direction of ['ascending', 'descending']) {
        harness
          .routeNativeElement!.querySelector<HTMLButtonElement>(`[data-sort-column="${column}"]`)!
          .click();
        await harness.fixture.whenStable();
        harness.detectChanges();
        const header = harness
          .routeNativeElement!.querySelector(`[data-sort-column="${column}"]`)!
          .closest('th')!;
        expect(header.getAttribute('aria-sort')).toBe(direction);
        const titles = [...harness.routeNativeElement!.querySelectorAll('.problem-link')].map((e) =>
          e.textContent?.trim(),
        );
        const ascending =
          column === 'interview'
            ? ['two-pointers-complete', 'hashing-complete']
            : ['hashing-complete', 'two-pointers-complete'];
        expect(titles).toEqual(
          direction === 'ascending' || column === 'difficulty'
            ? ascending
            : [...ascending].reverse(),
        );
        const url = TestBed.inject(Router).url;
        await harness.navigateByUrl(url, HandsOnDsa);
        expect(header.getAttribute('aria-sort')).toBe(direction);
      }
    }
  });

  it('chooses only self-contained problems and requests the hidden-pattern mode', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    // A deterministic stream exercises every candidate slot without flaky randomness.
    vi.spyOn(window.crypto, 'getRandomValues').mockImplementation((values) => {
      (values as Uint32Array)[0] = 1;
      return values;
    });
    const button =
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.surprise-problem')!;
    for (let count = 0; count < 4; count++) button.click();
    const selections = navigate.mock.calls.map(([commands, extras]) => {
      expect(extras?.queryParams).toEqual({ mode: 'surprise' });
      expect(commands[0]).toBe('/learn');
      expect(commands[1]).toBe('algorithmic-patterns');
      expect(commands[2]).toMatch(/-complete$/);
      return commands[2];
    });
    expect(selections).toHaveLength(4);
    expect(selections.every((id, index) => index === 0 || id !== selections[index - 1])).toBe(true);
  });

  it('disables Surprise me when the catalog has only unfinished entries', async () => {
    catalog = emptyPracticeIndex();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.surprise-problem')!.disabled,
    ).toBe(true);
  });

  it('shows a failure state instead of claiming an empty practice catalog loaded successfully', async () => {
    content.getHandsOnDsaIndex.mockReturnValueOnce(throwError(() => new Error('404')));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    expect(harness.routeNativeElement!.textContent).toContain(
      'The practice catalog could not be loaded.',
    );
    expect(harness.routeNativeElement!.querySelector('.pattern-groups')).toBeNull();
    expect(
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.surprise-problem')!.disabled,
    ).toBe(true);
  });

  it('hides the pattern context for a random challenge and restores it when that mode is removed', async () => {
    content.getHandsOnDsaIndex.mockImplementation(() => of(emptyPracticeIndex()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/algorithmic-patterns/hashing-complete?mode=surprise',
      Question,
    );
    expect(harness.routeNativeElement!.querySelector('.surprise-challenge')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('.question-context-panel')).toBeNull();
    await harness.navigateByUrl('/learn/algorithmic-patterns/hashing-complete', Question);
    expect(harness.routeNativeElement!.querySelector('.surprise-challenge')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.question-context-panel')).not.toBeNull();
  });
});
