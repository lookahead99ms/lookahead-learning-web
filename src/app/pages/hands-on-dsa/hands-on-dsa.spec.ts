import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, Scroll, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { routes } from '../../app.routes';
import {
  ContentItemSummary,
  CourseContent,
  CourseOutline,
  DsaProblemV2,
  InterviewQuestion,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { HandsOnDsaIndex } from '../../content/hands-on-dsa';
import { PRACTICE_PROGRESS_KEY } from '../../core/practice-progress/practice-progress';
import { PageSidebarContext } from '../../core/page-sidebars/page-sidebar-context';
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

function problemDetail(): DsaProblemV2 {
  return {
    id: 'hashing-canonical',
    description: 'Fallback description.',
    practice: {
      statement: {
        prompt:
          'Given an integer array, return the first repeated value. Return -1 when no value repeats. Later sentences stay on the problem page.',
        inputs: [],
        output: '',
        constraints: [],
        edgeCases: [],
      },
    },
    fixtures: [
      { id: 'fixture-1', label: 'Repeat', input: 'values = [3,1,3]', expectedOutput: '3' },
      { id: 'fixture-2', label: 'None', input: 'values = [1]', expectedOutput: '-1' },
    ],
  } as unknown as DsaProblemV2;
}

function searchParams(router: Router): URLSearchParams {
  return new URL('http://localhost' + router.url).searchParams;
}

describe('Hands-On DSA route contracts', () => {
  let course: CourseContent;
  let catalog: HandsOnDsaIndex;
  const content = {
    getCourseOutline: vi.fn(),
    getContentItem: vi.fn(),
    getHandsOnDsaIndex: vi.fn(),
    getDsaProblem: vi.fn(),
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
    content.getDsaProblem.mockReset().mockImplementation(() => of(problemDetail()));
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ContentService, useValue: content }],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses a semantic table with both stable orders and hidden pattern names by default', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    // The page title is a name, not a statement.
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent?.trim()).toBe(
      'Hands-On DSA',
    );
    expect(
      harness
        .routeNativeElement!.querySelector('[data-sort-column="learning"]')!
        .closest('th')!
        .getAttribute('aria-sort'),
    ).toBe('ascending');
    expect(harness.routeNativeElement!.querySelectorAll('ul.practice-proof li')).toHaveLength(4);
    // The hero carries no curriculum status line (user review 2026-10-05).
    expect(harness.routeNativeElement!.querySelector('.practice-hero')!.textContent).not.toContain(
      'Curriculum status',
    );
    expect(harness.routeNativeElement!.querySelector('[data-review-status]')).toBeNull();
    // The hero counts come from the catalog: distinct problems, and only patterns that have problems.
    const hero = harness.routeNativeElement!.querySelector('.practice-hero > p')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(hero.startsWith('2 problems across 2 patterns. Start from the pattern you just learned')).toBe(true);
    expect(hero).toContain('problems that make you adapt the same reasoning.');
    expect(harness.routeNativeElement!.querySelector('details')).toBeNull();
    expect(
      [...harness.routeNativeElement!.querySelectorAll('th')].map((cell) =>
        cell.textContent?.replace(/[↑↓↕]/g, '').trim(),
      ),
    ).toEqual(['Learning order', 'Problem', 'Difficulty', 'Interview priority', 'Status']);
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
    expect(rows[0].querySelector('.problem-pattern')).toBeNull();
    // Hidden pattern names leave only the title, with Preview beside it.
    const titleText = rows[0].querySelector('.problem-title-cell .problem-title-text')!;
    expect(titleText.querySelector('.problem-link')).not.toBeNull();
    expect(titleText.querySelector('.problem-pattern')).toBeNull();
    expect(
      rows[0].querySelector('.problem-title-layout > .problem-preview-toggle')?.textContent?.trim(),
    ).toBe('Preview');
    // The narrow Status column shows the mark only; its label stays for screen readers.
    expect(rows[0].querySelector('app-practice-status-mark')!.classList).toContain('mark-only');
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

  it('opens a pattern from the course card, opens a problem, and returns via the DSA breadcrumb', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/algorithmic-patterns', Course);
    // Course pages show one card per unit; a unit with a lesson opens the lesson,
    // and pattern practice is reached through the filtered Hands-On DSA library.
    const card = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('#unit-hashing')!;
    expect(card.getAttribute('href')).toBe('/learn/algorithmic-patterns/hashing-lesson');
    expect(harness.routeNativeElement!.querySelector('.learning-action.practice')).toBeNull();
    await harness.navigateByUrl('/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing');
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
      '/learn/algorithmic-patterns/hashing-complete?pattern=algorithmic-patterns:hashing&returnTo=%2Flearn%2Fhands-on-dsa%3Fpattern%3Dalgorithmic-patterns:hashing',
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
    const selectedPattern =
      harness.routeNativeElement!.querySelector<HTMLSelectElement>('#practice-pattern')!;
    expect(selectedPattern.value).toBe('algorithmic-patterns:two-pointers');
    expect(selectedPattern.selectedOptions[0].textContent?.trim()).toBe('02 · two-pointers');
    expect(
      harness.routeNativeElement!.querySelector('#practice-results h2')?.textContent,
    ).toBe('two-pointers problem set');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(1);
  });

  it('exposes the full pattern catalog in one labeled native selector, including its last entry', async () => {
    const template = catalog.groups[0];
    catalog.groups = Array.from({ length: 44 }, (_, index) => ({
      ...template,
      id: `algorithmic-patterns:pattern-${index + 1}`,
      title: `Pattern ${index + 1}`,
      preparationOrder: index + 1,
    }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:pattern-44',
      HandsOnDsa,
    );
    const select =
      harness.routeNativeElement!.querySelector<HTMLSelectElement>('#practice-pattern')!;
    expect(select.labels?.[0].textContent).toContain('Practice pattern');
    expect(select.options).toHaveLength(45);
    expect(select.options[0].textContent).toBe('All patterns');
    expect([...select.options].slice(1).map((option) => option.value)).toEqual(
      catalog.groups.map((group) => group.id),
    );
    expect(select.value).toBe(catalog.groups[43].id);
    expect(select.selectedOptions[0].textContent?.trim()).toBe('44 · Pattern 44');
    expect(
      harness.routeNativeElement!.querySelector('#practice-results h2')?.textContent,
    ).toBe('Pattern 44 problem set');
  });

  it('changes and clears the pattern while retaining the other filters and resetting pagination', async () => {
    catalog = paginatedIndex(80);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?sort=interview-rank&scope=365&difficulty=Beginner&q=Problem&page=2',
      HandsOnDsa,
    );
    const select =
      harness.routeNativeElement!.querySelector<HTMLSelectElement>('#practice-pattern')!;
    select.focus();
    select.value = catalog.groups[0].id;
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    let params = new URL('http://localhost' + TestBed.inject(Router).url).searchParams;
    expect(params.get('pattern')).toBe(catalog.groups[0].id);
    expect(params.has('page')).toBe(false);
    expect(document.activeElement).toBe(select);
    const allPatterns = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      '.clear-pattern-filter',
    )!;
    expect(allPatterns.textContent?.trim()).toBe('× Clear filter');
    allPatterns.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    params = new URL('http://localhost' + TestBed.inject(Router).url).searchParams;
    expect(params.has('pattern')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(Object.fromEntries(params)).toEqual({
      sort: 'interview-rank',
      scope: '365',
      difficulty: 'Beginner',
      q: 'Problem',
    });
    expect(select.value).toBe('');
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
    expect(controls.map(({ value }) => value)).toEqual(['Beginner', '150', '']);
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
    // The sort is how the list is shown, not a filter (user, 2026-10-06): clearing filters keeps it.
    expect(TestBed.inject(Router).url).toBe('/learn/hands-on-dsa?sort=interview-rank');
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(2);
    expect(harness.routeNativeElement!.querySelector('.clear-catalog-filters')).toBeNull();
  });

  it.each([0, 1, 25, 26, 782])('pages %i problems without phantom rows', async (count) => {
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

  it('visits 782 unique problems across 32 replacement pages, ending with seven', async () => {
    catalog = paginatedIndex(782);
    // The same canonical problem may be placed in another pattern; it must not consume another slot.
    catalog.groups.push({
      ...catalog.groups[0],
      id: 'second-pattern',
      preparationOrder: 2,
      problems: catalog.groups[0].problems.slice(0, 3),
    });
    const harness = await RouterTestingHarness.create();
    const ids: string[] = [];
    for (let page = 1; page <= 32; page++) {
      await harness.navigateByUrl(
        `/learn/hands-on-dsa?sort=study-order${page === 1 ? '' : '&page=' + page}`,
        HandsOnDsa,
      );
      const rows = [
        ...harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.problem-table-row'),
      ];
      expect(rows).toHaveLength(page === 32 ? 7 : 25);
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
    expect(new Set(ids).size).toBe(782);
    expect(harness.routeNativeElement!.textContent).toContain('776–782 of 782 problems');
    expect(harness.routeNativeElement!.querySelector('.pagination-next')).toBeNull();
    const previous =
      harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.pagination-previous')!;
    expect(previous.getAttribute('href')).toContain('page=31');
    previous.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('751–775 of 782 problems');
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
      harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.clear-pattern-filter')!;
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

  it('opens the legacy Pattern URL as the grouped view, with the whole pattern, its lesson link and no pages', async () => {
    catalog = paginatedIndex(40);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?sort=pattern-order&pattern=algorithmic-patterns:hashing&page=2&patterns=show',
      HandsOnDsa,
    );
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    // The old grouping URL is rewritten in place to the grouped view, keeping the pattern.
    expect(Object.fromEntries(searchParams(TestBed.inject(Router)))).toEqual({
      pattern: 'algorithmic-patterns:hashing',
      patterns: 'show',
      view: 'groups',
    });
    // The result line names the chosen pattern and says how its problems are sorted.
    expect(root.querySelector('.practice-result-range')!.textContent!.trim()).toBe(
      '40 problems in hashing · sorted by learning order, first to last',
    );
    expect(root.querySelector('details')).toBeNull();
    expect(root.querySelector('#pattern-detail-title')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      '01 hashing',
    );
    const lesson = root.querySelector<HTMLAnchorElement>('.pattern-detail .lesson-link')!;
    expect(lesson.getAttribute('href')).toBe('/learn/algorithmic-patterns/hashing-lesson');
    expect(lesson.textContent!.trim()).toBe('hashing lesson');
    // No paging inside a pattern: all 40 problems, in learning order, and no page links.
    expect(root.querySelectorAll('.pattern-problem-row')).toHaveLength(40);
    expect(root.querySelector('.pattern-problem-row .problem-link')!.textContent).toBe('Problem 1');
    expect(root.querySelector('.problem-pagination')).toBeNull();
    expect(root.querySelector('[data-view="groups"]')!.getAttribute('aria-checked')).toBe('true');
    expect(root.querySelector('[data-view="all"]')!.getAttribute('aria-checked')).toBe('false');
  });

  it('lists a problem placed in two patterns under both, counting it once in the total', async () => {
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
    await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&patterns=show', HandsOnDsa);
    const root = harness.routeNativeElement!;
    const counts = () =>
      [...root.querySelectorAll('[role="option"] .option-count')].map((node) => node.textContent!.trim());
    expect(counts()).toEqual(['30', '20']);
    expect(root.querySelector('.practice-result-range')!.textContent!.trim()).toBe(
      '40 problems in 2 patterns · sorted by learning order, first to last',
    );
    const titles = () =>
      [...root.querySelectorAll<HTMLAnchorElement>('.pattern-problem-row .problem-link')].map(
        (link) => link.textContent,
      );
    expect(titles()).toHaveLength(30);
    expect(titles()).toContain('Problem 25');

    root.querySelector<HTMLElement>('[data-pattern-id="algorithmic-patterns:second"]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(titles()).toHaveLength(20);
    expect(titles()[0]).toBe('Problem 21');
    // Problems 21 to 30 sit in both patterns, so they are listed in both.
    expect(titles()).toContain('Problem 25');
    // Rows never repeat the pattern under each title.
    expect(root.querySelector('.pattern-problem-row .problem-pattern')).toBeNull();
    const link = root.querySelector<HTMLAnchorElement>('.pattern-problem-row .problem-link')!;
    expect(new URL(link.href).searchParams.get('pattern')).toBe('algorithmic-patterns:second');
  });

  it('switches back to All problems without a redundant sort parameter', async () => {
    catalog = paginatedIndex(40);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&page=2', HandsOnDsa);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/learn/hands-on-dsa?view=groups');
    const view = (value: string) =>
      harness.routeNativeElement!.querySelector<HTMLButtonElement>(`[data-view="${value}"]`)!;
    expect(view('groups').getAttribute('aria-checked')).toBe('true');
    expect(view('all').getAttribute('aria-checked')).toBe('false');
    view('all').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/learn/hands-on-dsa');
    expect(view('all').getAttribute('aria-checked')).toBe('true');
    expect(view('groups').getAttribute('aria-checked')).toBe('false');
    expect(harness.routeNativeElement!.querySelector('app-pattern-browser')).toBeNull();
    expect(
      harness.routeNativeElement!.querySelector('.problem-learning-order')!.textContent?.trim(),
    ).toBe('1');
    expect(harness.routeNativeElement!.querySelector('.problem-pagination')).not.toBeNull();
  });

  it('has no quick-sort buttons: the column headers are the only sort, and sorting keeps the view', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?view=groups&pattern=algorithmic-patterns:two-pointers',
      HandsOnDsa,
    );
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.quick-sort, [data-quick-sort], .group-patterns')).toBeNull();
    expect(root.querySelector('.order-switch, [data-pattern-order]')).toBeNull();
    expect(root.textContent).not.toContain('Group by pattern');
    root.querySelector<HTMLButtonElement>('.pattern-problems [data-sort-column="interview"]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(Object.fromEntries(searchParams(TestBed.inject(Router)))).toEqual({
      view: 'groups',
      pattern: 'algorithmic-patterns:two-pointers',
      sort: 'interview-rank',
    });
    expect(root.querySelector('app-pattern-browser')).not.toBeNull();
    expect(root.querySelectorAll('.problem-table-row')).toHaveLength(0);
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
    await harness.navigateByUrl('/learn/hands-on-dsa?view=groups', HandsOnDsa);
    // By pattern, the pattern's table carries the same sortable headers as the flat table.
    expect(
      [...harness.routeNativeElement!.querySelectorAll('.pattern-problems [data-sort-column]')].map(
        (button) => button.getAttribute('data-sort-column'),
      ),
    ).toEqual(['learning', 'title', 'difficulty', 'interview']);
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('[data-view="all"]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
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

  it('draws Surprise me only from the current filtered list', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:two-pointers',
      HandsOnDsa,
    );
    expect(
      harness.routeNativeElement!.querySelector('#surprise-problem-description')!.textContent?.trim(),
    ).toBe('Opens a problem from your current filters without revealing its pattern.');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(window.crypto, 'getRandomValues').mockImplementation((values) => {
      (values as Uint32Array)[0] = 0;
      return values;
    });
    const button =
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.surprise-problem')!;
    for (let count = 0; count < 3; count++) button.click();
    expect(navigate.mock.calls.map(([commands]) => commands[2])).toEqual(
      Array(3).fill('two-pointers-complete'),
    );
    expect(navigate.mock.calls.every(([, extras]) => extras?.queryParams?.['mode'] === 'surprise')).toBe(
      true,
    );

    navigate.mockClear();
    await harness.navigateByUrl('/learn/hands-on-dsa?scope=150', HandsOnDsa);
    navigate.mockResolvedValue(true);
    button.click();
    expect(navigate.mock.calls.map(([commands]) => commands[2])).toEqual(['two-pointers-complete']);
  });

  it('disables Surprise me with a visible reason when the filters match nothing', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?q=no-such-problem', HandsOnDsa);
    const button =
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.surprise-problem')!;
    expect(button.disabled).toBe(true);
    const reason = harness.routeNativeElement!.querySelector('#surprise-problem-unavailable')!;
    expect(reason.textContent).toContain('No problem matches your current filters');
    expect(button.getAttribute('aria-describedby')).toContain('surprise-problem-unavailable');

    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    expect(button.disabled).toBe(false);
    expect(harness.routeNativeElement!.querySelector('#surprise-problem-unavailable')).toBeNull();
  });

  it('hides pattern names by default and keeps the choice in the URL', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    const toggle = () =>
      harness.routeNativeElement!.querySelector<HTMLInputElement>('.hide-pattern-names input')!;
    const patternLines = () =>
      [...harness.routeNativeElement!.querySelectorAll('.problem-pattern')].map((node) =>
        node.textContent?.trim(),
      );
    expect(toggle().checked).toBe(true);
    expect(patternLines()).toEqual([]);

    toggle().click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(searchParams(router).get('patterns')).toBe('show');
    expect(toggle().checked).toBe(false);
    expect(patternLines()).toEqual(['hashing', 'two-pointers']);
    // The problem link carries the URL back, so the choice survives a round trip.
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.problem-link')!;
    expect(new URL(link.href).searchParams.get('returnTo')).toContain('patterns=show');

    await harness.navigateByUrl('/learn/hands-on-dsa?patterns=show&difficulty=Beginner', HandsOnDsa);
    expect(toggle().checked).toBe(false);
    expect(patternLines()).toEqual(['hashing', 'two-pointers']);

    toggle().click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(searchParams(router).has('patterns')).toBe(false);
    expect(searchParams(router).get('difficulty')).toBe('Beginner');
    expect(patternLines()).toEqual([]);
  });

  it('does not match pattern titles or pattern text in search while names are hidden', async () => {
    catalog.groups[0].title = 'Sliding Window';
    catalog.groups[0].tags = ['Window'];
    catalog.groups[0].problems[0].variation = 'Variable window';
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa?q=window', HandsOnDsa);
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(0);
    expect(harness.routeNativeElement!.textContent).toContain('No matching practice yet');
    expect(
      harness.routeNativeElement!.querySelector('.practice-controls label')!.textContent?.trim(),
    ).toBe('Search problems');

    await harness.navigateByUrl('/learn/hands-on-dsa?q=hashing-complete', HandsOnDsa);
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(1);

    await harness.navigateByUrl('/learn/hands-on-dsa?q=window&patterns=show', HandsOnDsa);
    const rows = [...harness.routeNativeElement!.querySelectorAll('.problem-table-row')];
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.problem-pattern')!.textContent?.trim()).toBe('Sliding Window');
  });

  it('sorts by interview priority or learning order from the headers and says how the list is sorted', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    const header = (column: string) =>
      harness.routeNativeElement!.querySelector<HTMLButtonElement>(`[data-sort-column="${column}"]`)!;
    const sortOf = (column: string) => header(column).closest('th')!.getAttribute('aria-sort');
    const range = () =>
      harness.routeNativeElement!.querySelector('.practice-result-range')!.textContent?.trim();
    const titles = () =>
      [...harness.routeNativeElement!.querySelectorAll('.problem-link')].map((link) =>
        link.textContent?.trim(),
      );
    expect(sortOf('learning')).toBe('ascending');
    expect(sortOf('interview')).toBe('none');
    expect(range()).toBe('1–2 of 2 problems · sorted by learning order, first to last');

    header('interview').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(searchParams(router).get('sort')).toBe('interview-rank');
    expect(sortOf('learning')).toBe('none');
    expect(titles()).toEqual(['two-pointers-complete', 'hashing-complete']);
    expect(range()).toBe(
      '1–2 of 2 problems · sorted by interview priority, highest priority first',
    );
    expect(
      harness
        .routeNativeElement!.querySelector('[data-sort-column="interview"]')!
        .closest('th')!
        .getAttribute('aria-sort'),
    ).toBe('ascending');

    header('learning').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(searchParams(router).has('sort')).toBe(false);
    expect(titles()).toEqual(['hashing-complete', 'two-pointers-complete']);

    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('[data-sort-column="title"]')!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('[data-sort-column="title"]')!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(range()).toBe('1–2 of 2 problems · sorted by problem name, Z to A');
    expect(sortOf('title')).toBe('descending');
    expect(sortOf('learning')).toBe('none');
    expect(sortOf('interview')).toBe('none');
  });

  it('switches between All problems and By pattern with one radio group, kept in the URL', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/learn/hands-on-dsa?difficulty=Beginner&patterns=show', HandsOnDsa);
    const root = harness.routeNativeElement!;
    const group = root.querySelector('.practice-results-bar [role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('View');
    const radios = () => [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios().map((radio) => radio.textContent!.trim())).toEqual(['All problems', 'By pattern']);
    expect(radios().map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    // One tab stop: the checked option.
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1]);
    expect(radios().every((radio) => radio.type === 'button')).toBe(true);

    radios()[1].click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(Object.fromEntries(searchParams(router))).toEqual({
      difficulty: 'Beginner',
      patterns: 'show',
      view: 'groups',
    });
    expect(radios().map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, 0]);
    expect(root.querySelector('app-pattern-browser')).not.toBeNull();
    expect(root.querySelector('.problem-table')).toBeNull();
    // Choosing the checked view again changes nothing.
    radios()[1].click();
    await harness.fixture.whenStable();
    expect(searchParams(router).get('view')).toBe('groups');

    radios()[0].click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(searchParams(router).has('view')).toBe(false);
    expect(searchParams(router).get('difficulty')).toBe('Beginner');
    expect(root.querySelector('app-pattern-browser')).toBeNull();
    expect(root.querySelector('.problem-table')).not.toBeNull();
  });

  it('moves through the view switch with the arrow, Home and End keys', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    const root = harness.routeNativeElement!;
    const radio = (value: string) => root.querySelector<HTMLButtonElement>(`[data-view="${value}"]`)!;
    const press = async (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      (document.activeElement as HTMLElement).dispatchEvent(event);
      await harness.fixture.whenStable();
      harness.detectChanges();
      return event;
    };
    radio('all').focus();
    expect((await press('ArrowRight')).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(radio('groups'));
    expect(radio('groups').getAttribute('aria-checked')).toBe('true');
    expect(searchParams(router).get('view')).toBe('groups');

    await press('ArrowRight');
    expect(document.activeElement).toBe(radio('all'));
    expect(searchParams(router).has('view')).toBe(false);
    await press('ArrowLeft');
    expect(document.activeElement).toBe(radio('groups'));
    expect(searchParams(router).get('view')).toBe('groups');
    await press('Home');
    expect(document.activeElement).toBe(radio('all'));
    expect(radio('all').getAttribute('aria-checked')).toBe('true');
    await press('End');
    expect(document.activeElement).toBe(radio('groups'));
    await press('ArrowUp');
    expect(document.activeElement).toBe(radio('all'));
    await press('ArrowDown');
    expect(document.activeElement).toBe(radio('groups'));
    expect(searchParams(router).get('view')).toBe('groups');
    // Other keys are left alone.
    expect((await press('a')).defaultPrevented).toBe(false);
    expect(searchParams(router).get('view')).toBe('groups');
  });

  it('keeps old sort links working in both views', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    const root = () => harness.routeNativeElement!;
    const sortOf = (scope: string, column: string) =>
      root().querySelector(`${scope} [data-sort-column="${column}"]`)!.closest('th')!.getAttribute('aria-sort');
    // An old flat sort link still sorts the table.
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=interview-rank', HandsOnDsa);
    expect(sortOf('.problem-table', 'interview')).toBe('ascending');
    expect(root().querySelector('[data-view="all"]')!.getAttribute('aria-checked')).toBe('true');
    expect(
      [...root().querySelectorAll('.problem-table-row .problem-link')].map((link) => link.textContent),
    ).toEqual(['two-pointers-complete', 'hashing-complete']);
    // An old grouped link with an order sorts the pattern's table.
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?view=groups&sort=interview-rank&pattern=algorithmic-patterns:hashing',
      HandsOnDsa,
    );
    expect(sortOf('.pattern-problems', 'interview')).toBe('ascending');
    expect(root().querySelector('.practice-result-range')!.textContent!.trim()).toBe(
      '1 problem in Pattern 1 · sorted by interview priority, highest priority first',
    );
    // The old grouping sort opens By pattern in learning order.
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=pattern-order&q=complete', HandsOnDsa);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(Object.fromEntries(searchParams(router))).toEqual({ q: 'complete', view: 'groups' });
    expect(root().querySelector('[data-view="groups"]')!.getAttribute('aria-checked')).toBe('true');
    expect(sortOf('.pattern-problems', 'learning')).toBe('ascending');
    // An unknown sort falls back to learning order.
    await harness.navigateByUrl('/learn/hands-on-dsa?sort=not-a-sort', HandsOnDsa);
    expect(sortOf('.problem-table', 'learning')).toBe('ascending');
  });

  describe('Group by pattern', () => {
    /** 39 patterns in three courses; pattern N has (N % 3) + 1 problems, each with its own id. */
    function thirtyNinePatterns(): HandsOnDsaIndex {
      const index = practiceIndex();
      const template = index.groups[0];
      const problem = template.problems[0];
      index.groups = Array.from({ length: 39 }, (_, position) => {
        const order = position + 1;
        const course =
          order <= 12 ? 'core-data-structures' : order <= 17 ? 'sorting-and-searching' : 'algorithmic-patterns';
        return {
          ...template,
          id: `${course}:pattern-${order}`,
          preparationOrder: order,
          courseId: course,
          courseTitle: course.replace(/-/g, ' '),
          title: `Named pattern ${order}`,
          lessonId: `pattern-${order}-lesson`,
          problems: Array.from({ length: (order % 3) + 1 }, (_, slot) => ({
            ...problem,
            id: `p${order}-${slot + 1}`,
            title: `Problem ${order}.${slot + 1}`,
            difficulty: (['Beginner', 'Intermediate', 'Advanced'] as const)[slot],
            route: ['/learn', course, `p${order}-${slot + 1}`],
            studyOrder: order * 10 + slot,
            interviewRank: 500 - order * 10 - slot,
          })),
        };
      });
      return index;
    }
    const options = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[role="option"]')];
    const settle = async (harness: RouterTestingHarness) => {
      await harness.fixture.whenStable();
      harness.detectChanges();
      await harness.fixture.whenStable();
    };

    it('lists all 39 patterns in preparation order with counts, mix and progress', async () => {
      catalog = thirtyNinePatterns();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&patterns=show', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const listbox = root.querySelector('[role="listbox"]')!;
      expect(listbox.getAttribute('aria-labelledby')).toBe('pattern-list-label');
      expect(root.querySelector('#pattern-list-label')!.textContent!.trim()).toBe('Patterns');
      const all = options(root);
      expect(all).toHaveLength(39);
      expect(all.map((option) => option.querySelector('.option-order')!.textContent!.trim())).toEqual(
        Array.from({ length: 39 }, (_, index) => String(index + 1).padStart(2, '0')),
      );
      expect(all.map((option) => option.querySelector('.option-count')!.textContent!.trim())).toEqual(
        Array.from({ length: 39 }, (_, index) => String(((index + 1) % 3) + 1)),
      );
      expect(all[0].querySelector('.option-name')!.textContent!.trim()).toBe('Named pattern 1');
      expect(all[0].querySelector('.option-progress')!.textContent!.trim()).toBe('0/2 solved');
      expect(all[0].getAttribute('aria-label')).toBe('1. Named pattern 1, 2 problems, 0 of 2 solved');
      // Patterns sit under their course, each course a labelled group of options.
      const groups = [...listbox.querySelectorAll('[role="group"]')];
      expect(groups.map((group) => group.querySelectorAll('[role="option"]').length)).toEqual([12, 5, 22]);
      expect(groups[0].getAttribute('aria-labelledby')).toBe(groups[0].querySelector('.course-label')!.id);
      // The pane opens on the first pattern, and the header carries its facts.
      expect(all[0].getAttribute('aria-selected')).toBe('true');
      expect(all.filter((option) => option.getAttribute('aria-selected') === 'true')).toHaveLength(1);
      const detail = root.querySelector('.pattern-detail')!;
      expect(detail.getAttribute('role')).toBe('region');
      expect(detail.getAttribute('aria-labelledby')).toBe('pattern-detail-title');
      expect(detail.querySelector('.detail-count')!.textContent!.trim()).toBe('2 problems');
      expect(detail.querySelector('.mix-legend')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
        '1 Beginner 1 Intermediate 0 Advanced',
      );
      expect(detail.querySelector('.detail-progress')!.textContent!.trim()).toBe('0 of 2 solved');
      expect(detail.querySelector('.detail-description')!.textContent).toBe('Concept');
      expect(root.querySelector('[role="status"]')!.textContent).toBe(
        'Named pattern 1: 2 problems shown, 0 of 2 solved.',
      );
      // One header row for the pattern, in the flat table's column order.
      expect(
        [...detail.querySelectorAll('thead th')].map((cell) =>
          cell.textContent!.replace(/[↑↓↕]/g, '').trim(),
        ),
      ).toEqual(['Learning order', 'Problem', 'Difficulty', 'Interview priority', 'Status']);
      expect(detail.querySelectorAll('thead tr')).toHaveLength(1);
      // The flat pattern selector and its "Clear filter" give way to the list.
      expect(root.querySelector('#practice-pattern')).toBeNull();
      expect(root.querySelector('.clear-pattern-filter')).toBeNull();
    });

    it('moves through the list with a roving tab stop and arrow keys, and opens a pattern with Enter', async () => {
      catalog = thirtyNinePatterns();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const stops = () => options(root).filter((option) => option.tabIndex === 0);
      expect(stops()).toHaveLength(1);
      expect(stops()[0]).toBe(options(root)[0]);
      const press = async (key: string) => {
        (document.activeElement as HTMLElement).dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        );
        harness.detectChanges();
      };
      options(root)[0].focus();
      await press('ArrowDown');
      expect(document.activeElement).toBe(options(root)[1]);
      expect(stops()).toEqual([options(root)[1]]);
      await press('End');
      expect(document.activeElement).toBe(options(root)[38]);
      await press('Home');
      expect(document.activeElement).toBe(options(root)[0]);
      await press('ArrowUp');
      expect(document.activeElement).toBe(options(root)[0]);
      await press('ArrowDown');
      await press('ArrowDown');
      await press('Enter');
      await settle(harness);
      expect(searchParams(TestBed.inject(Router)).get('pattern')).toBe('core-data-structures:pattern-3');
      expect(options(root)[2].getAttribute('aria-selected')).toBe('true');
      expect(root.querySelector('#pattern-detail-title')!.textContent).toContain('Pattern 3');
    });

    it('keeps the chosen pattern in the URL, so deep links and history work', async () => {
      catalog = thirtyNinePatterns();
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&patterns=show&difficulty=Beginner', HandsOnDsa);
      const root = harness.routeNativeElement!;
      root.querySelector<HTMLElement>('[data-pattern-id="algorithmic-patterns:pattern-20"]')!.click();
      await settle(harness);
      expect(Object.fromEntries(searchParams(router))).toEqual({
        view: 'groups',
        patterns: 'show',
        difficulty: 'Beginner',
        pattern: 'algorithmic-patterns:pattern-20',
      });
      expect(root.querySelector('#pattern-detail-title')!.textContent).toContain('Named pattern 20');
      // Problem links return here, to the same pattern.
      const link = root.querySelector<HTMLAnchorElement>('.pattern-problem-row .problem-link')!;
      expect(new URL(link.href).searchParams.get('returnTo')).toContain(
        'pattern=algorithmic-patterns:pattern-20',
      );

      // A deep link (or Back to it) opens the same pattern.
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&pattern=sorting-and-searching:pattern-14', HandsOnDsa);
      expect(root.querySelector('[aria-selected="true"]')!.getAttribute('data-pattern-id')).toBe(
        'sorting-and-searching:pattern-14',
      );
      expect(root.querySelector('#pattern-detail-title')!.textContent).toContain('Pattern 14');
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups', HandsOnDsa);
      expect(root.querySelector('[aria-selected="true"]')!.getAttribute('data-pattern-id')).toBe(
        'core-data-structures:pattern-1',
      );
    });

    it('sorts a pattern by its column headers without counting the sort as a filter', async () => {
      catalog = thirtyNinePatterns();
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&pattern=core-data-structures:pattern-2', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const titles = () =>
        [...root.querySelectorAll('.pattern-problem-row .problem-link')].map((link) => link.textContent);
      const header = (column: string) =>
        root.querySelector<HTMLButtonElement>(`.pattern-problems [data-sort-column="${column}"]`)!;
      const sortOf = (column: string) => header(column).closest('th')!.getAttribute('aria-sort');
      const range = () => root.querySelector('.practice-result-range')!.textContent!.trim();
      // The pane has no order switch of its own: the headers are the flat table's sort buttons.
      expect(root.querySelector('.order-switch')).toBeNull();
      expect(sortOf('learning')).toBe('ascending');
      expect(header('learning').getAttribute('aria-label')).toBe('Sort by learning order, descending');
      expect(header('interview').getAttribute('aria-label')).toBe('Sort by interview priority, ascending');
      // Status is not sortable, as in the flat table.
      expect(root.querySelector('.pattern-problems th.col-status button')).toBeNull();
      expect(titles()).toEqual(['Problem 2.1', 'Problem 2.2', 'Problem 2.3']);
      expect(range()).toBe('3 problems in Pattern 2 · sorted by learning order, first to last');

      header('interview').click();
      await settle(harness);
      expect(searchParams(router).get('sort')).toBe('interview-rank');
      expect(searchParams(router).get('view')).toBe('groups');
      expect(sortOf('interview')).toBe('ascending');
      expect(sortOf('learning')).toBe('none');
      expect(titles()).toEqual(['Problem 2.3', 'Problem 2.2', 'Problem 2.1']);
      expect(
        [...root.querySelectorAll('.pattern-problem-row .cell-interview')].map((cell) =>
          cell.textContent!.replace('Interview priority', '').trim(),
        ),
      ).toEqual(['478', '479', '480']);
      expect(range()).toBe(
        '3 problems in Pattern 2 · sorted by interview priority, highest priority first',
      );
      expect(root.querySelector('.clear-catalog-filters')).toBeNull();

      // Name: A to Z, then Z to A.
      header('title').click();
      await settle(harness);
      expect(searchParams(router).get('sort')).toBe('title-ascending');
      expect(titles()).toEqual(['Problem 2.1', 'Problem 2.2', 'Problem 2.3']);
      header('title').click();
      await settle(harness);
      expect(searchParams(router).get('sort')).toBe('title-descending');
      expect(sortOf('title')).toBe('descending');
      expect(titles()).toEqual(['Problem 2.3', 'Problem 2.2', 'Problem 2.1']);
      expect(range()).toBe('3 problems in Pattern 2 · sorted by problem name, Z to A');

      // Difficulty, and back to learning order with no sort parameter.
      header('difficulty').click();
      await settle(harness);
      expect(searchParams(router).get('sort')).toBe('difficulty-ascending');
      expect(
        [...root.querySelectorAll('.pattern-problem-row .cell-difficulty')].map((cell) => cell.textContent!.trim()),
      ).toEqual(['Beginner', 'Intermediate', 'Advanced']);
      header('learning').click();
      await settle(harness);
      expect(searchParams(router).has('sort')).toBe(false);
      expect(titles()).toEqual(['Problem 2.1', 'Problem 2.2', 'Problem 2.3']);
      expect(searchParams(router).get('pattern')).toBe('core-data-structures:pattern-2');
    });

    it('carries the column sort across patterns and both views', async () => {
      catalog = thirtyNinePatterns();
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&pattern=core-data-structures:pattern-2&patterns=show', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const titles = (selector: string) =>
        [...root.querySelectorAll(`${selector} .problem-link`)].map((link) => link.textContent);
      root.querySelector<HTMLButtonElement>('.pattern-problems [data-sort-column="interview"]')!.click();
      await settle(harness);
      root.querySelector<HTMLButtonElement>('.pattern-problems [data-sort-column="interview"]')!.click();
      await settle(harness);
      expect(searchParams(router).get('sort')).toBe('interview-rank-descending');
      expect(titles('.pattern-problem-row')).toEqual(['Problem 2.1', 'Problem 2.2', 'Problem 2.3']);

      // Another pattern keeps the sort.
      root.querySelector<HTMLElement>('[data-pattern-id="core-data-structures:pattern-5"]')!.click();
      await settle(harness);
      expect(searchParams(router).get('pattern')).toBe('core-data-structures:pattern-5');
      expect(searchParams(router).get('sort')).toBe('interview-rank-descending');
      expect(
        root.querySelector('.pattern-problems [data-sort-column="interview"]')!.closest('th')!.getAttribute('aria-sort'),
      ).toBe('descending');
      expect(titles('.pattern-problem-row')).toEqual(['Problem 5.1', 'Problem 5.2', 'Problem 5.3']);
      expect(root.querySelector('.practice-result-range')!.textContent!.trim()).toBe(
        '3 problems in Named pattern 5 · sorted by interview priority, lowest priority first',
      );

      // All problems keeps the sort, and drops the chosen pattern.
      root.querySelector<HTMLButtonElement>('[data-view="all"]')!.click();
      await settle(harness);
      expect(Object.fromEntries(searchParams(router))).toEqual({
        patterns: 'show',
        sort: 'interview-rank-descending',
      });
      expect(
        root.querySelector('.problem-table [data-sort-column="interview"]')!.closest('th')!.getAttribute('aria-sort'),
      ).toBe('descending');
      expect(titles('.problem-table-row')[0]).toBe('Problem 1.1');
      expect(root.querySelector('.practice-result-range')!.textContent).toContain(
        'sorted by interview priority, lowest priority first',
      );

      // A sort chosen in All problems carries back to By pattern.
      root.querySelector<HTMLButtonElement>('.problem-table [data-sort-column="title"]')!.click();
      await settle(harness);
      root.querySelector<HTMLButtonElement>('.problem-table [data-sort-column="title"]')!.click();
      await settle(harness);
      expect(searchParams(router).get('sort')).toBe('title-descending');
      root.querySelector<HTMLButtonElement>('[data-view="groups"]')!.click();
      await settle(harness);
      expect(Object.fromEntries(searchParams(router))).toEqual({
        patterns: 'show',
        sort: 'title-descending',
        view: 'groups',
      });
      expect(
        root.querySelector('.pattern-problems [data-sort-column="title"]')!.closest('th')!.getAttribute('aria-sort'),
      ).toBe('descending');
      expect(titles('.pattern-problem-row')).toEqual(['Problem 1.2', 'Problem 1.1']);
      expect(root.querySelector('.practice-result-range')!.textContent!.trim()).toBe(
        '78 problems in 39 patterns · sorted by problem name, Z to A',
      );
    });

    it('disables the difficulty header inside a pattern while one difficulty is shown', async () => {
      catalog = thirtyNinePatterns();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&difficulty=Beginner&sort=difficulty-descending', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const difficulty = root.querySelector<HTMLButtonElement>('.pattern-problems [data-sort-column="difficulty"]')!;
      expect(difficulty.disabled).toBe(true);
      expect(difficulty.getAttribute('aria-label')).toBe(
        'Difficulty: sorting unavailable while filtered to one difficulty',
      );
      // The redundant difficulty sort falls back to learning order.
      expect(
        root.querySelector('.pattern-problems [data-sort-column="learning"]')!.closest('th')!.getAttribute('aria-sort'),
      ).toBe('ascending');
    });

    it('applies the filters inside each pattern, updating counts and dimming patterns with no match', async () => {
      catalog = thirtyNinePatterns();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&difficulty=Advanced', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const all = options(root);
      // Every pattern stays listed; only those with an Advanced problem (3 problems) keep a count.
      expect(all).toHaveLength(39);
      const counts = all.map((option) => option.querySelector('.option-count')!.textContent!.trim());
      expect(counts).toEqual(
        Array.from({ length: 39 }, (_, index) => ((index + 1) % 3 === 2 ? '1' : '0')),
      );
      expect(all.map((option) => option.classList.contains('is-empty'))).toEqual(
        counts.map((count) => count === '0'),
      );
      expect(all[0].getAttribute('aria-label')).toBe('Pattern 1, no matching problems, 0 of 2 solved');
      // With no pattern in the URL, the pane opens the first pattern that has a match.
      expect(root.querySelector('[aria-selected="true"]')!.getAttribute('data-pattern-id')).toBe(
        'core-data-structures:pattern-2',
      );
      expect(root.querySelector('.detail-count')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
        '1 problem of 3',
      );
      expect(root.querySelector('.practice-result-range')!.textContent).toContain(
        '13 problems in 13 patterns',
      );
      expect(root.querySelector('.clear-catalog-filters')).not.toBeNull();

      // A dimmed pattern still opens, and says why it is empty.
      all[0].click();
      await settle(harness);
      expect(root.querySelector('.pattern-problems')).toBeNull();
      expect(root.querySelector('.pattern-empty')!.textContent).toContain('No problems in this pattern match');

      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&q=Problem%202.', HandsOnDsa);
      expect(options(root).filter((option) => !option.classList.contains('is-empty')).map(
        (option) => option.dataset['patternId'],
      )).toEqual(['core-data-structures:pattern-2']);
    });

    it('keeps grouping with pattern names hidden, and reveals one pattern with Show name', async () => {
      catalog = thirtyNinePatterns();
      catalog.groups[1].title = 'Sliding Window';
      catalog.groups[1].tags = ['Window'];
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const toggle = () => root.querySelector<HTMLInputElement>('.hide-pattern-names input')!;
      expect(toggle().checked).toBe(true);

      root.querySelector<HTMLButtonElement>('[data-view="groups"]')!.click();
      await settle(harness);
      // Neither setting turns the other off, and no note says it did.
      expect(searchParams(router).get('view')).toBe('groups');
      expect(searchParams(router).has('patterns')).toBe(false);
      expect(toggle().checked).toBe(true);
      expect(root.querySelector('.pattern-names-note')).toBeNull();
      const names = () =>
        options(root).map((option) => option.querySelector('.option-name')!.textContent!.trim());
      expect(names().slice(0, 3)).toEqual(['Pattern 1', 'Pattern 2', 'Pattern 3']);
      expect(root.textContent).not.toContain('Named pattern');
      expect(root.textContent).not.toContain('Sliding Window');
      // Course names would hint at the patterns, so they are not shown either.
      expect(root.querySelector('.course-label')).toBeNull();
      const detail = () => root.querySelector('.pattern-detail')!;
      expect(detail().querySelector('.detail-description')).toBeNull();
      expect(detail().querySelector('.lesson-link')).toBeNull();

      // Search matches problem titles only, never a hidden pattern's name or tags.
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&q=window', HandsOnDsa);
      expect(options(root).every((option) => option.classList.contains('is-empty'))).toBe(true);
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&pattern=core-data-structures:pattern-2', HandsOnDsa);

      const reveal = detail().querySelector<HTMLButtonElement>('.show-name')!;
      expect(reveal.textContent!.trim()).toBe('Show name');
      reveal.click();
      await settle(harness);
      expect(root.querySelector('#pattern-detail-title')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
        '02 Sliding Window',
      );
      expect(document.activeElement).toBe(root.querySelector('#pattern-detail-title'));
      expect(detail().querySelector('.show-name')).toBeNull();
      expect(detail().querySelector('.detail-description')!.textContent).toBe('Concept');
      expect(detail().querySelector('.lesson-link')!.textContent!.trim()).toBe('Sliding Window lesson');
      // Only that pattern: the others stay numbered.
      expect(names().slice(0, 3)).toEqual(['Pattern 1', 'Sliding Window', 'Pattern 3']);
      expect(toggle().checked).toBe(true);

      // Showing every name keeps grouping on; hiding them again hides the revealed one too.
      toggle().click();
      await settle(harness);
      expect(searchParams(router).get('patterns')).toBe('show');
      expect(searchParams(router).get('view')).toBe('groups');
      expect(names()[0]).toBe('Named pattern 1');
      toggle().click();
      await settle(harness);
      expect(searchParams(router).get('view')).toBe('groups');
      expect(names().slice(0, 2)).toEqual(['Pattern 1', 'Pattern 2']);
    });

    it('shows Clear all filters only for real filters, and keeps the grouped view when clearing', async () => {
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups', HandsOnDsa);
      const root = harness.routeNativeElement!;
      expect(root.querySelector('.clear-catalog-filters')).toBeNull();
      await harness.navigateByUrl(
        '/learn/hands-on-dsa?view=groups&sort=interview-rank&patterns=show&pattern=algorithmic-patterns:two-pointers',
        HandsOnDsa,
      );
      expect(root.querySelector('.clear-catalog-filters')).toBeNull();

      await harness.navigateByUrl(
        '/learn/hands-on-dsa?view=groups&sort=interview-rank&patterns=show&pattern=algorithmic-patterns:two-pointers&difficulty=Beginner&scope=150&solved=hide&q=complete',
        HandsOnDsa,
      );
      root.querySelector<HTMLButtonElement>('.clear-catalog-filters')!.click();
      await settle(harness);
      expect(Object.fromEntries(searchParams(router))).toEqual({
        patterns: 'show',
        view: 'groups',
        pattern: 'algorithmic-patterns:two-pointers',
        sort: 'interview-rank',
      });
      expect(root.querySelector('.clear-catalog-filters')).toBeNull();
    });

    it('works as two screens on a phone: the list, then one pattern with a way back', async () => {
      catalog = thirtyNinePatterns();
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const panes = () => root.querySelector('.panes')!;
      // No pattern in the URL: a phone shows the list screen.
      expect(panes().getAttribute('data-screen')).toBe('list');

      root.querySelector<HTMLElement>('[data-pattern-id="algorithmic-patterns:pattern-25"]')!.click();
      await settle(harness);
      expect(searchParams(router).get('pattern')).toBe('algorithmic-patterns:pattern-25');
      expect(panes().getAttribute('data-screen')).toBe('detail');
      // The pattern list is hidden on this screen, so focus moves to the pattern's heading.
      expect(document.activeElement).toBe(root.querySelector('#pattern-detail-title'));
      const back = root.querySelector<HTMLButtonElement>('.back-to-patterns')!;
      expect(back.textContent!.replace(/\s+/g, ' ').trim()).toBe('‹ All patterns');

      back.click();
      await settle(harness);
      expect(searchParams(router).has('pattern')).toBe(false);
      expect(searchParams(router).get('view')).toBe('groups');
      expect(panes().getAttribute('data-screen')).toBe('list');
      // Back on the list, focus returns to the pattern the learner came from.
      expect(document.activeElement).toBe(
        root.querySelector('[data-pattern-id="algorithmic-patterns:pattern-25"]'),
      );

      // The browser's Back button walks the same URLs.
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&pattern=algorithmic-patterns:pattern-25', HandsOnDsa);
      expect(panes().getAttribute('data-screen')).toBe('detail');
    });
  });

  it('previews a problem inline on demand, caches it, and closes again', async () => {
    const detail = new Subject<DsaProblemV2>();
    content.getDsaProblem.mockReturnValueOnce(detail);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    const toggle = () =>
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.problem-preview-toggle')!;
    expect(toggle().textContent?.trim()).toBe('Preview');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Preview hashing-complete');
    expect(content.getDsaProblem).not.toHaveBeenCalled();

    toggle().click();
    harness.detectChanges();
    expect(content.getDsaProblem).toHaveBeenCalledWith('hashing-canonical', 'fixture-version');
    const preview = () => harness.routeNativeElement!.querySelector('.problem-preview-row');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(preview()!.id).toBe(toggle().getAttribute('aria-controls'));
    expect(preview()!.textContent).toContain('Loading preview…');
    // The preview is a separate row, so the problem count is unchanged.
    expect(harness.routeNativeElement!.querySelectorAll('.problem-table-row')).toHaveLength(2);

    detail.next(problemDetail());
    detail.complete();
    harness.detectChanges();
    expect(preview()!.querySelector('.problem-preview-summary')!.textContent).toBe(
      'Given an integer array, return the first repeated value. Return -1 when no value repeats.',
    );
    expect(preview()!.textContent).not.toContain('Later sentences');
    expect(
      [...preview()!.querySelectorAll('.problem-preview-example code')].map((code) =>
        code.textContent,
      ),
    ).toEqual(['values = [3,1,3]', '3']);
    const open = preview()!.querySelector<HTMLAnchorElement>('.problem-preview-open')!;
    expect(open.textContent?.trim()).toBe('Open problem');
    expect(new URL(open.href).pathname).toBe('/learn/algorithmic-patterns/hashing-complete');

    toggle().click();
    harness.detectChanges();
    expect(preview()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    toggle().click();
    harness.detectChanges();
    expect(preview()!.querySelector('.problem-preview-summary')).not.toBeNull();
    expect(content.getDsaProblem).toHaveBeenCalledTimes(1);
  });

  it('shows a preview error with a retry that loads the problem', async () => {
    content.getDsaProblem.mockReturnValueOnce(throwError(() => new Error('503')));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.problem-preview-toggle')!.click();
    harness.detectChanges();
    const preview = () => harness.routeNativeElement!.querySelector('.problem-preview-row')!;
    expect(preview().querySelector('[role="alert"]')!.textContent).toContain(
      'The preview could not be loaded.',
    );
    expect(preview().querySelector('.problem-preview-open')).not.toBeNull();
    preview().querySelector<HTMLButtonElement>('.problem-preview-retry')!.click();
    harness.detectChanges();
    expect(content.getDsaProblem).toHaveBeenCalledTimes(2);
    expect(preview().querySelector('.problem-preview-summary')).not.toBeNull();
  });

  it('shows a failure state instead of claiming an empty practice catalog loaded successfully', async () => {
    content.getHandsOnDsaIndex.mockReturnValueOnce(throwError(() => new Error('404')));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
    expect(harness.routeNativeElement!.textContent).toContain('We couldn’t load this content');
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
  describe('device progress', () => {
    let storageDescriptor: PropertyDescriptor | undefined;
    let values: Map<string, string>;
    beforeEach(() => {
      storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
      values = new Map<string, string>();
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => void values.set(key, value),
        },
      });
    });
    afterEach(() => {
      if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
      else Reflect.deleteProperty(window, 'localStorage');
    });
    const saveProgress = (problems: Record<string, object>) =>
      values.set(
        PRACTICE_PROGRESS_KEY,
        JSON.stringify({
          schemaVersion: 'dsa-practice-local/v1',
          problems: Object.fromEntries(
            Object.entries(problems).map(([id, record]) => [
              id,
              { status: 'started', rating: null, reviewAt: null, notes: '', updatedAt: '2026-10-01T00:00:00.000Z', ...record },
            ]),
          ),
        }),
      );
    const statusLabels = (root: HTMLElement) =>
      [...root.querySelectorAll('.problem-table-row')].map((row) =>
        row.querySelector('td.problem-status')!.textContent!.replace(/\s+/g, ' ').trim(),
      );

    it('shows a Status column with marks and screen-reader labels', async () => {
      saveProgress({
        'hashing-canonical': { status: 'solved', rating: 'Solved on my own' },
        'two-pointers-canonical': { status: 'started' },
      });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
      const root = harness.routeNativeElement!;
      expect(root.querySelector('th.problem-status-column')!.textContent!.trim()).toBe('Status');
      expect(statusLabels(root)).toEqual(['✓Solved', '…Started']);
      const marks = [...root.querySelectorAll('app-practice-status-mark')];
      expect(marks.map((mark) => mark.getAttribute('data-status'))).toEqual(['solved', 'started']);
      expect(marks[0].querySelector('.mark')!.getAttribute('aria-hidden')).toBe('true');
      expect(marks[0].querySelector('.label')!.textContent).toBe('Solved');
    });

    it('marks a review as due on and after its date', async () => {
      saveProgress({
        'hashing-canonical': { status: 'solved', rating: 'Solved with hints', reviewAt: '2000-01-01' },
        'two-pointers-canonical': { status: 'solved', rating: 'Solved with hints', reviewAt: '2999-01-01' },
      });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
      expect(statusLabels(harness.routeNativeElement!)).toEqual(['↻Review due', '✓Solved']);
    });

    it('shows a progress strip labelled for this device with honest counts', async () => {
      saveProgress({
        'hashing-canonical': { status: 'solved', rating: 'Solved on my own', reviewAt: '2000-01-01' },
        'two-pointers-canonical': { status: 'started' },
        'retired-problem': { status: 'solved', rating: 'Solved on my own' },
      });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
      const strip = harness.routeNativeElement!.querySelector('app-practice-progress-strip')!;
      const controls = harness.routeNativeElement!.querySelector('.practice-controls')!;
      expect(strip.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(strip.querySelector('.strip-title')!.textContent!.trim()).toBe('On this device');
      expect(strip.querySelector('section')!.getAttribute('aria-labelledby')).toBe(
        strip.querySelector('.strip-title')!.id,
      );
      expect(strip.querySelector('h2')).toBeNull();
      const stats = [...strip.querySelectorAll('.stat')].map((stat) =>
        [stat.querySelector('dt')!, stat.querySelector('dd')!]
          .map((part) => part.textContent!.replace(/\s+/g, ' ').trim())
          .join(' '),
      );
      expect(stats).toEqual(['Solved 1 of 2', 'Started 1', 'Review due 1']);
      expect(strip.querySelector<HTMLElement>('.meter span')!.style.width).toBe('50%');
      expect(strip.textContent).toContain('Progress does not sync to other devices yet.');
    });

    it('keeps the two view switches together and uses the shared navigation default', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const switches = root.querySelector('.practice-controls > .practice-switches')!;
      expect([...switches.querySelectorAll('label')].map((label) => label.textContent!.trim())).toEqual([
        'Hide pattern names',
        'Hide solved',
      ]);
      expect(switches.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
      expect(TestBed.inject(PageSidebarContext).value()).toEqual({ excluded: false });
    });

    it('hides solved problems and keeps the choice in the URL', async () => {
      saveProgress({ 'hashing-canonical': { status: 'solved', rating: 'Needed the solution' } });
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
      const root = harness.routeNativeElement!;
      const toggle = () => root.querySelector<HTMLInputElement>('.hide-solved input')!;
      expect(toggle().closest('label')!.textContent!.trim()).toBe('Hide solved');
      expect(toggle().checked).toBe(false);
      toggle().click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(searchParams(router).get('solved')).toBe('hide');
      expect([...root.querySelectorAll('.problem-link')].map((link) => link.textContent)).toEqual([
        'two-pointers-complete',
      ]);
      expect(root.querySelector('.clear-catalog-filters')).not.toBeNull();

      await harness.navigateByUrl('/learn/hands-on-dsa?solved=hide&difficulty=Beginner', HandsOnDsa);
      expect(toggle().checked).toBe(true);
      expect(root.querySelectorAll('.problem-table-row')).toHaveLength(1);
      toggle().click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(searchParams(router).get('solved')).toBeNull();
      expect(searchParams(router).get('difficulty')).toBe('Beginner');
      expect(root.querySelectorAll('.problem-table-row')).toHaveLength(2);
    });

    it('prefers unsolved problems for Surprise me and falls back when all are solved', async () => {
      saveProgress({ 'hashing-canonical': { status: 'solved', rating: 'Solved on my own' } });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      vi.spyOn(window.crypto, 'getRandomValues').mockImplementation((values) => {
        (values as Uint32Array)[0] = 0;
        return values;
      });
      const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.surprise-problem')!;
      for (let count = 0; count < 3; count++) button.click();
      expect(navigate.mock.calls.map(([commands]) => commands[2])).toEqual(
        Array(3).fill('two-pointers-complete'),
      );

      navigate.mockClear();
      await harness.navigateByUrl('/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing', HandsOnDsa);
      navigate.mockResolvedValue(true);
      button.click();
      expect(navigate.mock.calls.map(([commands]) => commands[2])).toEqual(['hashing-complete']);
    });

    it('shows an empty circle, not a blank cell, for a problem not started', async () => {
      saveProgress({ 'hashing-canonical': { status: 'solved', rating: 'Solved on my own' } });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);
      const root = harness.routeNativeElement!;
      // Status is the last column.
      const row = root.querySelectorAll('.problem-table-row')[1];
      expect(row.lastElementChild!.classList).toContain('problem-status');
      const mark = row.querySelector('app-practice-status-mark')!;
      expect(mark.getAttribute('data-status')).toBe('none');
      expect(mark.querySelector('.mark.empty')).not.toBeNull();
      expect(statusLabels(root)).toEqual(['✓Solved', 'Not started']);
    });

    it('shows progress per pattern and opens the next unsolved problem in the chosen order', async () => {
      catalog = paginatedIndex(4);
      saveProgress({
        'problem-1': { status: 'solved', rating: 'Solved on my own' },
        'problem-4': { status: 'solved', rating: 'Solved on my own' },
        'problem-2': { status: 'started' },
      });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups', HandsOnDsa);
      const root = harness.routeNativeElement!;
      expect(root.querySelector('[role="option"] .option-progress')!.textContent!.trim()).toBe('2/4 solved');
      expect(root.querySelector('.detail-progress')!.textContent!.trim()).toBe('2 of 4 solved');
      expect(root.querySelector<HTMLElement>('.detail-progress .meter span')!.style.width).toBe('50%');
      expect(
        [...root.querySelectorAll('.pattern-problem-row app-practice-status-mark')].map((mark) =>
          mark.getAttribute('data-status'),
        ),
      ).toEqual(['solved', 'started', 'none', 'solved']);
      // Started is not solved, so learning order's next unsolved is Problem 2.
      const next = () => root.querySelector<HTMLAnchorElement>('.next-unsolved')!;
      expect(next().textContent!.replace(/\s+/g, ' ').trim()).toBe('Next unsolved Problem 2');
      expect(next().getAttribute('aria-label')).toBe('Next unsolved: Problem 2');
      expect(new URL(next().href).pathname).toBe('/learn/algorithmic-patterns/problem-2');
      expect(new URL(next().href).searchParams.get('pattern')).toBe('algorithmic-patterns:hashing');

      // Interview priority puts Problem 3 (rank 2) before Problem 2 (rank 3).
      root.querySelector<HTMLButtonElement>('.pattern-problems [data-sort-column="interview"]')!.click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(next().textContent!.replace(/\s+/g, ' ').trim()).toBe('Next unsolved Problem 3');

      // Every column sort counts: problem name Z to A puts Problem 3 first among the unsolved.
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&sort=title-descending', HandsOnDsa);
      expect(
        [...root.querySelectorAll('.pattern-problem-row .problem-link')].map((link) => link.textContent),
      ).toEqual(['Problem 4', 'Problem 3', 'Problem 2', 'Problem 1']);
      expect(next().getAttribute('aria-label')).toBe('Next unsolved: Problem 3');
      // Its description says it follows the current order.
      const help = root.querySelector(`#${next().getAttribute('aria-describedby')}`)!;
      expect(help.textContent!.trim()).toBe(
        'The first unsolved problem in this pattern, in the current order: sorted by problem name, Z to A.',
      );

      // Learning order, last to first: Problem 3 again (Problem 4 is solved).
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&sort=study-order-descending', HandsOnDsa);
      expect(next().getAttribute('aria-label')).toBe('Next unsolved: Problem 3');
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups', HandsOnDsa);
      expect(next().getAttribute('aria-label')).toBe('Next unsolved: Problem 2');
      expect(root.querySelector(`#${next().getAttribute('aria-describedby')}`)!.textContent!.trim()).toBe(
        'The first unsolved problem in this pattern, in the current order: sorted by learning order, first to last.',
      );

      // Hide solved leaves the pattern's progress as it is and lists only what is left.
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&solved=hide', HandsOnDsa);
      expect(root.querySelectorAll('.pattern-problem-row')).toHaveLength(2);
      expect(root.querySelector('[role="option"] .option-count')!.textContent!.trim()).toBe('2');
      expect(root.querySelector('.detail-progress')!.textContent!.trim()).toBe('2 of 4 solved');

      // When every problem shown is solved there is nothing to open next.
      await harness.navigateByUrl('/learn/hands-on-dsa?view=groups&q=Problem%201', HandsOnDsa);
      expect(root.querySelectorAll('.pattern-problem-row')).toHaveLength(1);
      expect(root.querySelector('.next-unsolved')).toBeNull();
      expect(root.querySelector('.all-solved')!.textContent!.trim()).toBe(
        'Every problem shown here is solved.',
      );
    });
  });
});
