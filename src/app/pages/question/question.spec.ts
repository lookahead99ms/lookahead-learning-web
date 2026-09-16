import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { routes } from '../../app.routes';
import {
  ContentItemSummary,
  CourseContent,
  CourseOutline,
  DsaProblemNavigationLink,
  DsaProblemV2,
  InterviewQuestion,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { HandsOnDsaIndex } from '../../content/hands-on-dsa';
import { Question } from './question';

type CanonicalRouteCase = {
  problemId: string;
  title: string;
  courseId: string;
  previous?: DsaProblemNavigationLink;
  next?: DsaProblemNavigationLink;
};

const containsDuplicate: DsaProblemNavigationLink = {
  problemId: 'core-ds-contains-duplicate',
  title: 'Contains Duplicate',
  path: 'learn',
  courseId: 'core-data-structures',
  questionId: 'core-ds-contains-duplicate',
};
const twoSum: DsaProblemNavigationLink = {
  problemId: 'algorithmic-two-sum',
  title: 'Two Sum',
  path: 'learn',
  courseId: 'algorithmic-patterns',
  questionId: 'algorithmic-two-sum',
};
const firstUnique: DsaProblemNavigationLink = {
  problemId: 'algorithmic-first-unique-character',
  title: 'First Unique Character',
  path: 'learn',
  courseId: 'algorithmic-patterns',
  questionId: 'algorithmic-first-unique-character',
};

const routeCases: CanonicalRouteCase[] = [
  { ...containsDuplicate, previous: undefined, next: twoSum },
  { ...twoSum, previous: containsDuplicate, next: firstUnique },
  { ...firstUnique, previous: twoSum, next: undefined },
];

function canonicalProblem(testCase: CanonicalRouteCase): DsaProblemV2 {
  const lineId = `${testCase.problemId}-line`;
  const fixtureId = `${testCase.problemId}-fixture`;
  return {
    schemaVersion: 'dsa-problem/v2',
    contentType: 'dsa-problem',
    id: testCase.problemId,
    aliases: [],
    title: testCase.title,
    description: `Practice ${testCase.title}.`,
    difficulty: 'Beginner',
    tags: ['Hashing'],
    languages: ['java', 'python', 'go'],
    variation: 'Hashing variation',
    invariantAdaptation: 'Retain only state justified by earlier input.',
    complexity: { time: 'O(n)', space: 'O(n)', why: 'Each input is visited once.' },
    contract: {
      entryPoints: { java: 'solve', python: 'solve', go: 'solve' },
      parameters: [{ name: 'values', type: 'integer[]', description: 'Input values.' }],
      returns: { type: 'integer', description: 'The computed result.' },
    },
    placements: [
      {
        path: 'learn',
        courseId: 'algorithmic-patterns',
        role: 'essential',
        lessonId: 'algorithmic-hashing-lookup',
      },
      {
        path: 'learn',
        courseId: testCase.courseId,
        role: 'practice',
        moduleId: 'practice-hashing',
        questionId: testCase.problemId,
      },
    ],
    navigation: {
      lesson: {
        path: 'learn',
        courseId: 'algorithmic-patterns',
        questionId: 'algorithmic-hashing-lookup',
        title: 'Hashing',
      },
      handsOnPatternId: 'algorithmic-patterns:hashing-lookup',
      previous: testCase.previous,
      next: testCase.next,
      ...(testCase.problemId === 'algorithmic-two-sum'
        ? {
            alternates: [
              {
                lesson: {
                  path: 'learn' as const,
                  courseId: 'algorithmic-patterns',
                  questionId: 'algorithmic-prefix-state',
                  title: 'Prefix State',
                },
                handsOnPatternId: 'algorithmic-patterns:prefix-state',
              },
            ],
          }
        : {}),
    },
    fixtures: [
      {
        id: fixtureId,
        label: 'Representative case',
        input: 'values = [1]',
        expectedOutput: '1',
        category: 'representative',
        explanation: 'A compact route-test fixture.',
        arguments: { values: [1] },
        expected: 1,
      },
    ],
    implementations: (['java', 'python', 'go'] as const).map((language) => ({
      language,
      title: `${language} solution`,
      lines: [{ id: lineId, text: 'return 1' }],
    })),
    trace: {
      schemaVersion: 'guided-trace/v1',
      id: `${testCase.problemId}-trace`,
      fixtureId,
      invariant: 'The result follows the current input.',
      legend: [{ state: 'resolved', label: 'Resolved' }],
      events: [
        {
          id: `${testCase.problemId}-return`,
          label: 'Return the result',
          phase: 'Resolve',
          timing: 'after',
          sourceAnchor: { java: lineId, python: lineId, go: lineId },
          what: 'Return the result.',
          why: 'The fixture is complete.',
          variables: [{ name: 'result', type: 'int', value: '1', changed: true }],
          rows: [{ id: 'values', label: 'Values', cells: [{ value: '1', states: ['resolved'] }] }],
          result: '1',
        },
      ],
    },
    practice: {
      statement: {
        prompt: `Solve ${testCase.title}.`,
        inputs: ['One integer array.'],
        output: 'One computed result.',
        constraints: ['At least one value is present.'],
        edgeCases: ['A one-value input is valid.'],
      },
      starters: { java: 'return 0;', python: 'return 0', go: 'return 0' },
      hints: ['Track the required state.'],
      canonicalApproach: {
        whyThisApproach: 'Retain useful prior state.',
        whyOptimal: 'Each input is inspected once.',
        whenAssumptionChanges: 'A bounded domain may permit direct addressing.',
      },
      commonMistakes: ['Using state from a later input.'],
      checks: [{ kind: 'explain', prompt: 'What is retained?', expected: 'Earlier state.' }],
    },
  };
}

function courseFor(courseId: string): CourseContent {
  const questions: InterviewQuestion[] = routeCases
    .filter((testCase) => testCase.courseId === courseId)
    .map((testCase, index) => ({
      id: testCase.problemId,
      moduleId: 'practice-hashing',
      order: index + 1,
      title: testCase.title,
      difficulty: 'Beginner',
      tags: ['Hashing', 'Common Problem'],
      interviewAnswer: 'Use the canonical problem detail.',
      explanation: [],
      versionNotes: [],
      followUps: [],
      contentType: 'dsa-problem',
      canonicalProblemRef: { problemId: testCase.problemId },
      canonicalProblem: canonicalProblem(testCase),
    }));
  return {
    id: courseId,
    path: 'learn',
    title: 'Legacy host course',
    description: 'Canonical route test.',
    version: '1',
    modules: [
      { id: 'practice-hashing', order: 1, title: 'Legacy practice module', description: '' },
    ],
    questions,
  };
}

function outlineFor(course: CourseContent): CourseOutline {
  return {
    ...course,
    questions: course.questions.map((question) => ({
      id: question.id,
      moduleId: question.moduleId,
      order: question.order,
      title: question.title,
      difficulty: question.difficulty,
      tags: question.tags,
      contentType: question.contentType ?? 'q-and-a',
      isTheoryArticle: question.contentType === 'theory',
      detailRef: {
        kind: question.canonicalProblemRef ? 'canonical-dsa' : 'content-item',
        href: question.canonicalProblemRef
          ? `/content/learn/dsa-problems/${question.canonicalProblemRef.problemId}.json`
          : `/content/details/${course.path}/${course.id}/${question.moduleId}/${question.id}.json`,
        version: 'fixture-version',
      },
      ...(question.canonicalProblemRef
        ? { canonicalProblemRef: question.canonicalProblemRef }
        : {}),
    })),
    moduleDetailRefs: [],
  };
}

function indexFor(
  testCase: CanonicalRouteCase,
  version = 'fixture-version',
  groupTitle = 'Hashing',
): HandsOnDsaIndex {
  return {
    schemaVersion: 'hands-on-dsa-index/v1',
    totals: { groups: 1, problemPlacements: 1, distinctProblems: 1 },
    groups: [
      {
        id: 'algorithmic-patterns:hashing-lookup',
        preparationOrder: 18,
        courseId: 'algorithmic-patterns',
        courseTitle: 'Algorithmic Patterns',
        title: groupTitle,
        description: 'Use direct lookup state.',
        unitId: 'hashing-lookup',
        practiceModuleId: 'practice-hashing',
        lessonId: 'algorithmic-hashing-lookup',
        lessonTitle: 'Hashing',
        tags: ['Hashing'],
        hasGuidedLesson: true,
        problems: [
          {
            id: testCase.problemId,
            title: testCase.title,
            description: `Practice ${testCase.title}.`,
            difficulty: 'Beginner',
            variation: 'Hashing variation',
            invariantAdaptation: 'Retain only state justified by earlier input.',
            version,
            questionId: testCase.problemId,
            route: ['/learn', testCase.courseId, testCase.problemId],
          },
        ],
      },
    ],
  };
}

function emptyIndex(): HandsOnDsaIndex {
  return {
    schemaVersion: 'hands-on-dsa-index/v1',
    totals: { groups: 0, problemPlacements: 0, distinctProblems: 0 },
    groups: [],
  };
}

function linkWithText(root: HTMLElement, text: string): HTMLAnchorElement | undefined {
  return [...root.querySelectorAll<HTMLAnchorElement>('a')].find((link) =>
    link.textContent?.includes(text),
  );
}

async function revealPattern(harness: RouterTestingHarness): Promise<void> {
  harness.routeNativeElement!.querySelector<HTMLButtonElement>('.pattern-reveal-toggle')!.click();
  harness.detectChanges();
  await harness.fixture.whenStable();
}

describe('Question canonical DSA navigation', () => {
  const content = {
    getCatalog: vi.fn(() => of(routeCases.map(({ courseId, title }) => ({ id: courseId, title })))),
    getCourseOutline: vi.fn((_: string, courseId: string) => of(outlineFor(courseFor(courseId)))),
    getContentItem: vi.fn((summary: ContentItemSummary) => {
      for (const { courseId } of routeCases) {
        const question = courseFor(courseId).questions.find(({ id }) => id === summary.id);
        if (question) return of(question);
      }
      return throwError(() => new Error('404'));
    }),
    getHandsOnDsaIndex: vi.fn<() => Observable<HandsOnDsaIndex>>(() => of(emptyIndex())),
    getDsaProblem: vi.fn((problemId: string) =>
      of(canonicalProblem(routeCases.find((testCase) => testCase.problemId === problemId)!)),
    ),
  };

  beforeEach(async () => {
    content.getCatalog.mockClear();
    content.getCourseOutline.mockClear();
    content.getContentItem.mockClear();
    content.getHandsOnDsaIndex.mockReset().mockReturnValue(of(emptyIndex()));
    content.getDsaProblem.mockClear();
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ContentService, useValue: content }],
    }).compileComponents();
  });

  it('retains a filtered discovery return link after a direct load', async () => {
    const harness = await RouterTestingHarness.create();
    const returnUrl = '/interview-questions?q=lookup&language=python&format=solve&sort=title';
    await harness.navigateByUrl(
      '/learn/algorithmic-patterns/algorithmic-two-sum?returnTo=' + encodeURIComponent(returnUrl),
      Question,
    );
    expect(
      linkWithText(harness.routeNativeElement!, 'Return to interview practice')?.getAttribute(
        'href',
      ),
    ).toBe(returnUrl);
  });

  it('retains the exact DSA page, filters, and ordering in a safe return link', async () => {
    const harness = await RouterTestingHarness.create();
    const returnUrl =
      '/learn/hands-on-dsa?sort=study-order&scope=365&difficulty=Beginner&q=array&page=7';
    await harness.navigateByUrl(
      '/learn/algorithmic-patterns/algorithmic-two-sum?returnTo=' + encodeURIComponent(returnUrl),
      Question,
    );
    expect(
      linkWithText(harness.routeNativeElement!, 'Return to DSA problems')?.getAttribute('href'),
    ).toBe(returnUrl);
  });

  it.each([
    ['interview-rank', 'Interview priority', true],
    ['study-order', 'Learning order', false],
    ['pattern-order', 'Pattern order', false],
  ])(
    'uses complete %s order with labeled navigation across page boundaries',
    async (sort, label, hasNext) => {
      const selected = routeCases[2];
      const index = indexFor(selected);
      index.totals = { groups: 1, problemPlacements: 3, distinctProblems: 3 };
      index.groups[0].problems = [
        {
          ...index.groups[0].problems[0],
          id: containsDuplicate.problemId,
          title: containsDuplicate.title,
          questionId: containsDuplicate.questionId,
          route: ['/learn', containsDuplicate.courseId, containsDuplicate.questionId],
          interviewRank: 30,
          studyOrder: 1,
        },
        {
          ...index.groups[0].problems[0],
          id: twoSum.problemId,
          title: twoSum.title,
          questionId: twoSum.questionId,
          route: ['/learn', twoSum.courseId, twoSum.questionId],
          interviewRank: 10,
          studyOrder: 2,
        },
        {
          ...index.groups[0].problems[0],
          id: selected.problemId,
          title: selected.title,
          questionId: selected.problemId,
          route: ['/learn', selected.courseId, selected.problemId],
          interviewRank: 20,
          studyOrder: 3,
        },
      ];
      content.getHandsOnDsaIndex.mockReturnValueOnce(of(index));
      content.getDsaProblem.mockReturnValueOnce(of(canonicalProblem(selected)));
      const harness = await RouterTestingHarness.create();
      const returnUrl = `/learn/hands-on-dsa?sort=${sort}&scope=782&difficulty=All&page=4`;

      await harness.navigateByUrl(
        `/learn/${selected.courseId}/${selected.problemId}?pattern=algorithmic-patterns:hashing-lookup&returnTo=` +
          encodeURIComponent(returnUrl),
        Question,
      );

      const previous = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
        '.problem-navigation-link.previous',
      );
      const next = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
        '.problem-navigation-link.next',
      );
      expect(previous?.textContent).toContain(twoSum.title);
      const expectedNumber = sort === 'interview-rank' ? 10 : 2;
      expect(previous?.textContent).toContain(`${expectedNumber}.`);
      expect(previous?.getAttribute('aria-label')).toContain(`${label} ${expectedNumber}`);
      if (hasNext) expect(next?.textContent).toContain(containsDuplicate.title);
      else
        expect(
          harness.routeNativeElement!.querySelector('.source-navigation-rows nav a.next'),
        ).toBeNull();
      expect(previous?.href).toContain('returnTo=%2Flearn%2Fhands-on-dsa');
      expect(previous?.getAttribute('href')).toContain(encodeURIComponent(returnUrl));
      const rows = [...harness.routeNativeElement!.querySelectorAll('.source-navigation-rows nav')];
      expect(rows[0].getAttribute('aria-label')).toBe(label + ' problem navigation');
      expect(
        rows.filter(
          (row) => row.getAttribute('aria-label') === 'Learning order problem navigation',
        ),
      ).toHaveLength(sort === 'pattern-order' ? 0 : 1);
      expect(rows).toHaveLength(sort === 'interview-rank' ? 2 : 1);
      // Query-only changes must recompute the primary row without loading a different problem.
      await harness.navigateByUrl(
        `/learn/${selected.courseId}/${selected.problemId}?returnTo=` +
          encodeURIComponent('/learn/hands-on-dsa?sort=study-order&page=8'),
        Question,
      );
      expect(
        harness.routeNativeElement!.querySelectorAll('.source-navigation-rows nav'),
      ).toHaveLength(1);
      expect(harness.routeNativeElement!.querySelector('.source-order-label')).toBeNull();
      expect(harness.routeNativeElement!.querySelector('.source-navigation-rows nav')?.getAttribute('aria-label')).toBe('Learning order problem navigation');
      const currentPrevious = harness.routeNativeElement!.querySelector('.source-navigation-rows .previous');
      const currentNext = harness.routeNativeElement!.querySelector('.source-navigation-rows .next');
      if (currentPrevious) expect(getComputedStyle(currentPrevious).justifyContent).toBe('flex-start');
      if (currentNext) expect(getComputedStyle(currentNext).justifyContent).toBe('flex-end');
    },
  );

  it('uses exact release values in the shared header and associates the full concept title', async () => {
    const selected: CanonicalRouteCase = {
      problemId: 'dsa-catalog-meeting-rooms',
      title: 'Meeting Rooms',
      courseId: 'algorithmic-patterns',
    };
    const index = indexFor(selected);
    index.totals.distinctProblems = 782;
    index.groups[0].problems[0].studyOrder = 616;
    index.groups[0].problems[0].interviewRank = 30;
    index.groups[0].problems[0].difficulty = 'Intermediate';
    content.getHandsOnDsaIndex.mockReturnValueOnce(of(index));
    const headerProblem = canonicalProblem(selected);
    headerProblem.navigation!.lesson.title = 'Hashing: Retain the useful lookup state';
    content.getDsaProblem.mockReturnValueOnce(
      of({ ...headerProblem, difficulty: 'Intermediate' }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/learn/${selected.courseId}/${selected.problemId}`, Question);
    const root = harness.routeNativeElement!;
    expect(root.querySelector('h1')?.textContent).toContain('616.');
    expect(root.querySelector('h1')?.getAttribute('aria-label')).toContain(
      'Learning order 616 of 782',
    );
    expect(
      root.querySelector('.problem-title-metadata [aria-label="Difficulty: Intermediate"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('.problem-title-metadata [aria-label="Rank: 30 of 782 in interview priority"]')
        ?.textContent,
    ).toBe('Rank: 30');
    expect(root.querySelector('.problem-release-order')).toBeNull();
    const titleCluster = root.querySelector('.article-title-row')!;
    expect([...titleCluster.children].map((element) => element.tagName)).toEqual(['H1', 'P']);
    expect([...titleCluster.querySelectorAll('.problem-title-metadata > span:not(.problem-pattern)')].map(element => element.textContent)).toEqual(['Difficulty: Intermediate', 'Rank: 30']);
    expect(getComputedStyle(titleCluster.querySelector('.problem-title-metadata')!).columnGap).toBe('16px');
    expect(getComputedStyle(titleCluster.querySelector('.problem-rank')!).borderInlineStart).toBe('1px solid var(--muted)');
    expect(getComputedStyle(titleCluster).flexDirection).toBe('column');
    expect(getComputedStyle(titleCluster).alignItems).toBe('flex-start');
    expect(getComputedStyle(titleCluster).textAlign).toBe('start');
    expect(
      [...root.querySelectorAll('.reader-question-panel p')].filter(
        (element) => element.textContent?.trim() === 'Learning order',
      ),
    ).toHaveLength(0);
    expect(root.querySelector('.source-order-label')).toBeNull();
    const navigation = root.querySelector('.source-navigation-rows nav')!;
    expect(navigation.getAttribute('aria-label')).toBe('Learning order problem navigation');
    expect(navigation.getAttribute('title')).toBe('Learning order problem navigation');
    expect(navigation.children).toHaveLength(2);
    expect(getComputedStyle(navigation.querySelector('.boundary')!).justifySelf).toBe('start');
    expect(getComputedStyle(navigation.querySelector('.boundary-end')!).justifySelf).toBe('end');
    expect(getComputedStyle(navigation).marginTop).toBe('0px');
    expect(getComputedStyle(navigation).paddingBlock).toBe('0px');
    expect(root.querySelector('.problem-concept-review')).toBeNull();
    expect(root.querySelector('.problem-pattern-link')).toBeNull();
    expect(root.querySelector('.breadcrumbs')?.textContent).not.toContain('Hashing');
    const revealButton = root.querySelector<HTMLButtonElement>('.pattern-reveal-toggle')!;
    expect(revealButton.textContent).toBe('Show Pattern');
    expect(revealButton.getAttribute('aria-expanded')).toBe('false');
    expect(revealButton.getAttribute('aria-controls')).toBe('problem-pattern-review');
    await revealPattern(harness);
    expect(revealButton.textContent).toBe('Hide Pattern');
    expect(revealButton.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.problem-pattern-link')?.textContent).toBe('Review the Hashing pattern');
    expect(root.querySelector('.problem-pattern-link')?.getAttribute('href')).toBe('/learn/algorithmic-patterns/algorithmic-hashing-lookup');
    expect(root.querySelector('.breadcrumbs')?.textContent).toContain('Hashing');
    await revealPattern(harness);
    expect(root.querySelector('.problem-pattern-link')).toBeNull();
    expect(root.querySelector('.breadcrumbs')?.textContent).not.toContain('Hashing');
    expect(root.querySelector('.question-context-panel')).toBeNull();
    await revealPattern(harness);
    await harness.navigateByUrl('/learn/algorithmic-patterns/algorithmic-two-sum', Question);
    expect(harness.routeNativeElement!.querySelector('.pattern-reveal-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(harness.routeNativeElement!.querySelector('.problem-pattern-link')).toBeNull();
  });

  it('navigates from the last result on one page to the first on the next', async () => {
    const selected = routeCases[2];
    const index = indexFor(selected);
    const seed = index.groups[0].problems[0];
    index.groups[0].problems = Array.from({ length: 51 }, (_, position) => ({
      ...seed,
      id: position === 24 ? selected.problemId : `fixture-${position}`,
      title: `Problem ${position + 1}`,
      questionId: position === 24 ? selected.problemId : `fixture-${position}`,
      route: [
        '/learn',
        selected.courseId,
        position === 24 ? selected.problemId : `fixture-${position}`,
      ],
      interviewRank: position + 1,
      studyOrder: position + 1,
    }));
    content.getHandsOnDsaIndex.mockReturnValueOnce(of(index));
    content.getDsaProblem.mockReturnValueOnce(of(canonicalProblem(selected)));
    const harness = await RouterTestingHarness.create();
    const returnUrl = '/learn/hands-on-dsa?sort=interview-rank&scope=782&page=1';
    await harness.navigateByUrl(
      `/learn/${selected.courseId}/${selected.problemId}?returnTo=` + encodeURIComponent(returnUrl),
      Question,
    );
    const row = harness.routeNativeElement!.querySelector('.source-navigation-rows nav')!;
    expect(row.querySelector('a.previous')?.textContent).toContain('Problem 24');
    expect(row.querySelector('a.next')?.textContent).toContain('Problem 26');
    expect(row.querySelector('a.next')?.getAttribute('href')).toContain(
      encodeURIComponent(returnUrl),
    );
  });

  it.each([
    'https://example.com',
    '//example.com',
    '/delivery-plan',
    '/search/other',
    '/learn/hands-on-dsa/other',
    '/learn/hands-on-dsa;extra=true',
    '/learn/hands-on-dsa(aux:other)',
    '/learn/other',
    '/search(aux:other)',
  ])('ignores unsupported discovery return targets: %s', async (returnUrl) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/algorithmic-patterns/algorithmic-two-sum?returnTo=' + encodeURIComponent(returnUrl),
      Question,
    );
    expect(harness.routeNativeElement!.querySelector('.practice-return')).toBeNull();
  });

  it.each(['design', 'debug', 'rehearse', 'solve'] as const)(
    'keeps %s practice instructions visible and its canonical reference collapsed',
    async (practiceFormat) => {
      const question: InterviewQuestion = {
        id: 'scenario',
        moduleId: 'practice',
        order: 1,
        title: 'A concrete practice prompt',
        difficulty: 'Intermediate',
        tags: ['Practice'],
        contentType: 'q-and-a',
        practiceFormat,
        interviewAnswer: 'Canonical reference',
        explanation: ['Detailed reasoning'],
        versionNotes: [],
        followUps: [{ question: 'What changes under load?', answer: 'Measure the bottleneck.' }],
      };
      const course: CourseContent = {
        id: 'sample',
        path: 'grow',
        title: 'Sample',
        description: '',
        version: '1',
        modules: [{ id: 'practice', title: 'Practice', description: '', order: 1 }],
        questions: [question],
      };
      const outline = outlineFor(course);
      outline.questions[0].practiceFormat = practiceFormat;
      content.getCourseOutline.mockReturnValueOnce(of(outline));
      content.getContentItem.mockReturnValueOnce(of(question));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/grow/sample/scenario', Question);
      const root = harness.routeNativeElement!;
      expect(root.querySelector('.practice-instructions')?.textContent).toContain('Try it before');
      const reference = root.querySelector<HTMLDetailsElement>('.practice-reference')!;
      expect(reference.open).toBe(false);
      expect(reference.textContent).toContain('Canonical reference');
      expect(reference.textContent).toContain('What changes under load?');
      reference.querySelector('summary')!.click();
      expect(reference.open).toBe(true);
    },
  );

  it.each(routeCases)(
    'renders the complete framework and Hashing sequence for $title',
    async (testCase) => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/learn/${testCase.courseId}/${testCase.problemId}`, Question);
      const root = harness.routeNativeElement!;

      expect(root.textContent).toContain('Input');
      expect(root.textContent).toContain('Expected:');
      expect(root.textContent).toContain('Try it yourself');
      expect(root.textContent).toContain('Visual walkthrough');
      expect(root.querySelector('app-focus-studio')).not.toBeNull();
      expect(root.querySelector('.reference-panel')).toBeNull();
      expect(root.querySelector('.problem-rail')?.textContent).toContain('Constraints');
      expect(root.textContent).not.toContain('Legacy practice module');

      expect(linkWithText(root, 'Hands-On DSA')?.getAttribute('href')).toBe('/learn/hands-on-dsa');
      expect(root.querySelector('.problem-pattern-link')).toBeNull();
      await revealPattern(harness);
      const patternBreadcrumb = [
        ...root.querySelectorAll<HTMLAnchorElement>('.breadcrumbs a'),
      ].find((link) => link.textContent.trim() === 'Hashing');
      expect(patternBreadcrumb?.getAttribute('href')).toBe(
        '/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing-lookup',
      );
      expect(root.querySelector('.problem-pattern-link')?.getAttribute('href')).toBe(
        '/learn/algorithmic-patterns/algorithmic-hashing-lookup',
      );

      const previous = root.querySelector<HTMLAnchorElement>(
        '.question-inner-navigation .previous',
      );
      const next = root.querySelector<HTMLAnchorElement>('.question-inner-navigation .next');
      if (testCase.previous) {
        expect(previous?.classList.contains('problem-navigation-link')).toBe(true);
        expect(previous?.textContent).toContain(testCase.previous.title);
        expect(previous?.getAttribute('href')).toBe(
          `/learn/${testCase.previous.courseId}/${testCase.previous.questionId}?pattern=algorithmic-patterns:hashing-lookup`,
        );
      } else {
        expect(previous).toBeNull();
      }
      if (testCase.next) {
        expect(next?.classList.contains('problem-navigation-link')).toBe(true);
        expect(next?.textContent).toContain(testCase.next.title);
        expect(next?.getAttribute('href')).toBe(
          `/learn/${testCase.next.courseId}/${testCase.next.questionId}?pattern=algorithmic-patterns:hashing-lookup`,
        );
      } else {
        expect(next).toBeNull();
      }
      expect(linkWithText(root, 'All Hashing problems')).toBeUndefined();
      expect(root.querySelector('.canonical-problem-navigation .module-catalog-link')).toBeNull();
    },
  );

  it('loads only the selected canonical continuation detail', async () => {
    const selected = routeCases[1];
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl(`/learn/${selected.courseId}/${selected.problemId}`, Question);

    expect(content.getDsaProblem).toHaveBeenCalledOnce();
    expect(content.getDsaProblem).toHaveBeenCalledWith(selected.problemId, 'fixture-version');
    expect(harness.routeNativeElement?.textContent).toContain('Try it yourself');
  });

  it('loads a canonical route from the compact index without hydrating its course', async () => {
    const selected = routeCases[1];
    content.getHandsOnDsaIndex.mockReturnValueOnce(of(indexFor(selected)));
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl(`/learn/${selected.courseId}/${selected.problemId}`, Question);

    expect(content.getDsaProblem).toHaveBeenCalledOnce();
    expect(content.getDsaProblem).toHaveBeenCalledWith(selected.problemId, 'fixture-version');
    expect(content.getCourseOutline).not.toHaveBeenCalled();
    expect(content.getCatalog).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.textContent).toContain('Try it yourself');
  });

  it('uses the compact catalog pattern title in the canonical breadcrumb', async () => {
    const selected = routeCases[1];
    content.getHandsOnDsaIndex.mockReturnValueOnce(
      of(indexFor(selected, 'fixture-version', 'Graphs')),
    );
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl(`/learn/${selected.courseId}/${selected.problemId}`, Question);

    await revealPattern(harness);
    const breadcrumbs = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.breadcrumbs a'),
    ];
    expect(breadcrumbs.find((link) => link.textContent.trim() === 'Hands-On DSA')?.href).toContain(
      '/learn/hands-on-dsa',
    );
    expect(
      breadcrumbs.find((link) => link.textContent.trim() === 'Graphs')?.getAttribute('href'),
    ).toBe('/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing-lookup');
  });

  it('does not fetch unrelated course modules when indexed problem detail loading fails', async () => {
    const selected = routeCases[1];
    content.getHandsOnDsaIndex.mockReturnValueOnce(of(indexFor(selected)));
    content.getDsaProblem.mockReturnValueOnce(throwError(() => new Error('404')));
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl(`/learn/${selected.courseId}/${selected.problemId}`, Question);

    expect(content.getCourseOutline).not.toHaveBeenCalled();
    expect(content.getCatalog).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.textContent).toContain(
      'The question content could not be loaded.',
    );
  });

  it('uses the requested navigation context for a cross-pattern problem', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl(
      '/learn/algorithmic-patterns/algorithmic-two-sum?pattern=algorithmic-patterns:prefix-state',
      Question,
    );
    const root = harness.routeNativeElement!;

    expect(linkWithText(root, 'Hands-On DSA')?.getAttribute('href')).toBe('/learn/hands-on-dsa');
    await revealPattern(harness);
    const patternBreadcrumb = [...root.querySelectorAll<HTMLAnchorElement>('.breadcrumbs a')].find(
      (link) => link.textContent.trim() === 'Prefix State',
    );
    expect(patternBreadcrumb?.getAttribute('href')).toBe(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:prefix-state',
    );
    expect(root.querySelector('.problem-pattern-link')?.getAttribute('href')).toBe(
      '/learn/algorithmic-patterns/algorithmic-prefix-state',
    );
    expect(linkWithText(root, 'All Prefix State problems')).toBeUndefined();
    expect(root.querySelector('.question-inner-navigation .previous')).toBeNull();
    expect(root.querySelector('.question-inner-navigation .next')).toBeNull();
  });

  it('preserves authored Arrays context, discovery and adjacent links in the selected V12 pilot', async () => {
    const selected = routeCases[1];
    const problem = canonicalProblem(selected);
    const arrays = {
      ...problem.navigation,
      handsOnPatternId: 'core-data-structures:arrays',
      lesson: {
        path: 'learn' as const,
        courseId: 'core-data-structures',
        questionId: 'arrays-lesson',
        title: 'Arrays',
      },
    };
    problem.navigation.alternates = [arrays];
    const index = indexFor(selected);
    index.groups[0].id = 'core-data-structures:arrays';
    index.groups[0].problems[0].studyOrder = 1;
    index.groups[0].problems[0].interviewRank = 1;
    index.groups[0].problems.push({
      ...index.groups[0].problems[0],
      id: firstUnique.problemId,
      title: firstUnique.title,
      questionId: firstUnique.questionId,
      route: ['/learn', firstUnique.courseId, firstUnique.questionId],
      interviewRank: 2,
      studyOrder: 2,
    });
    content.getHandsOnDsaIndex.mockReturnValue(of(index));
    content.getDsaProblem.mockReturnValueOnce(of(problem));
    const harness = await RouterTestingHarness.create();
    const returnTo = '/learn/hands-on-dsa?pattern=core-data-structures%3Aarrays&page=2';
    await harness.navigateByUrl(
      '/learn/algorithmic-patterns/algorithmic-two-sum?pattern=core-data-structures:arrays&returnTo=' +
        encodeURIComponent(returnTo),
      Question,
    );
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.focus-studio-page')).not.toBeNull();
    expect(root.querySelector('.problem-toggle')?.textContent).toContain('Problem');
    expect(root.querySelector('.problem-toggle')?.getAttribute('aria-expanded')).toBe('true');
    const returnLink = new URL(
      linkWithText(root, 'Return to DSA problems')!.getAttribute('href')!,
      'http://localhost',
    );
    expect(returnLink.pathname).toBe('/learn/hands-on-dsa');
    expect(returnLink.searchParams.get('pattern')).toBe('core-data-structures:arrays');
    expect(returnLink.searchParams.get('page')).toBe('2');
    expect(root.querySelector<HTMLAnchorElement>('.problem-navigation-link.next')?.href).toContain(
      'pattern=core-data-structures:arrays',
    );
    expect(root.querySelectorAll('.mode-tabs [role="tab"]')).toHaveLength(4);
    await harness.navigateByUrl(
      '/learn/algorithmic-patterns/algorithmic-two-sum?pattern=algorithmic-patterns:hashing-lookup',
      Question,
    );
    expect(harness.routeNativeElement!.querySelector('.studio-pilot-page')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('.problem-toggle')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('.problem-pattern-link')).toBeNull();
    await revealPattern(harness);
    expect(harness.routeNativeElement!.querySelector('.problem-pattern-link')?.getAttribute('href')).toBe(
      '/learn/algorithmic-patterns/algorithmic-hashing-lookup',
    );
  });

  it('derives Arrays neighbors from the catalog when a canonical record only names its lesson', async () => {
    const selected = routeCases[1];
    const problem = canonicalProblem(selected);
    problem.navigation = {
      lesson: problem.navigation.lesson,
      handsOnPatternId: 'core-data-structures:arrays',
    };
    const index = indexFor(selected);
    index.groups[0].id = 'core-data-structures:arrays';
    index.groups[0].problems = routeCases
      .map((item, position) => ({
        ...indexFor(item).groups[0].problems[0],
        studyOrder: position + 1,
      }))
      .reverse();
    content.getHandsOnDsaIndex.mockReturnValue(of(index));
    content.getDsaProblem.mockReturnValue(of(problem));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/algorithmic-patterns/algorithmic-two-sum?pattern=core-data-structures:arrays',
      Question,
    );
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.problem-navigation-link.previous')?.textContent).toContain(
      containsDuplicate.title,
    );
    expect(root.querySelector('.problem-navigation-link.next')?.textContent).toContain(
      firstUnique.title,
    );
    expect(root.querySelector<HTMLAnchorElement>('.problem-navigation-link.next')?.href).toContain(
      'pattern=core-data-structures:arrays',
    );
  });

  it('renders an authentic debugger for a code-answer question without solution tabs', async () => {
    const streamQuestion: InterviewQuestion = {
      id: 'stream-student-merit-names',
      moduleId: 'streams',
      order: 1,
      title: 'Return merit student names',
      difficulty: 'Beginner',
      tags: ['Java Streams'],
      interviewAnswer: 'Filter, sort, map, and collect.',
      explanation: ['Trace the element shape after each stage.'],
      code: {
        language: 'java',
        title: 'Merit students',
        source: 'students.stream().filter(student -> student.merit() > 80).toList();',
      },
      visual: {
        type: 'interactive',
        assetPath: '/content/learn/modern-java/visuals/stream-practice-debugger.html#merit',
        alt: 'Interactive merit student stream trace',
        caption: 'Trace the practical pipeline.',
      },
      versionNotes: [],
      followUps: [],
      reviewStatus: 'reviewed',
    };
    const streamCourse: CourseContent = {
      id: 'modern-java',
      path: 'learn',
      title: 'Modern Java',
      description: 'Modern Java APIs.',
      version: 'Java 21+',
      modules: [
        {
          id: 'streams',
          order: 1,
          title: 'Streams: Filter, Map, Collect, and Reduce',
          description: 'Build practical pipelines.',
        },
      ],
      questions: [streamQuestion],
    };
    content.getCatalog.mockReturnValueOnce(of([{ id: 'modern-java', title: 'Modern Java' }]));
    content.getCourseOutline.mockReturnValueOnce(of(outlineFor(streamCourse)));
    content.getContentItem.mockReturnValueOnce(of(streamQuestion));
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/learn/modern-java/stream-student-merit-names', Question);

    const visual = harness.routeNativeElement?.querySelector<HTMLIFrameElement>(
      'iframe.interactive-theory-frame',
    );
    expect(visual?.title).toBe('Interactive merit student stream trace');
    expect(visual?.getAttribute('src')).toContain('stream-practice-debugger.html#merit');
    expect(harness.routeNativeElement?.textContent).toContain('Trace the practical pipeline.');
  });
});
