import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { routes } from '../../app.routes';
import { CourseContent, InterviewQuestion } from '../../content/content.models';
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

function practiceIndex(): HandsOnDsaIndex {
  const groups = ['hashing', 'two-pointers'].map((id) => ({
    id: `algorithmic-patterns:${id}`,
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
      },
    ],
  }));
  return {
    schemaVersion: 'hands-on-dsa-index/v1',
    totals: { groups: groups.length, problemPlacements: groups.length, distinctProblems: 2 },
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

describe('Hands-On DSA route contracts', () => {
  let course: CourseContent;
  let catalog: HandsOnDsaIndex;
  const content = {
    getCourse: vi.fn(),
    getHandsOnDsaIndex: vi.fn(),
    getCatalog: vi.fn(() => of([{ id: 'algorithmic-patterns', title: 'Pattern tests' }])),
  };

  beforeEach(async () => {
    course = practiceCourse();
    catalog = practiceIndex();
    content.getCourse
      .mockReset()
      .mockImplementation((_path, id) =>
        of(
          id === course.id
            ? course
            : { ...course, id, modules: [], questions: [], learningUnits: [] },
        ),
      );
    content.getHandsOnDsaIndex.mockReset().mockImplementation(() => of(catalog));
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ContentService, useValue: content }],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('presents informational hero labels without interactive pill affordances', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/learn/hands-on-dsa', HandsOnDsa);

    const status = harness.routeNativeElement!.querySelector<HTMLElement>('.practice-status')!;
    const sequence =
      harness.routeNativeElement!.querySelector<HTMLOListElement>('ol.practice-proof')!;

    expect(status.textContent).toContain('Curriculum status: Evolving');
    expect(sequence.querySelectorAll('li')).toHaveLength(4);
    expect([...sequence.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'Recognize',
      'Trace',
      'Implement',
      'Transfer',
    ]);
    expect(sequence.querySelector('a, button')).toBeNull();
    expect(harness.routeNativeElement!.querySelectorAll('.pattern-filter a')).toHaveLength(3);
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
    const details =
      harness.routeNativeElement!.querySelector<HTMLDetailsElement>('details.pattern-group')!;
    expect(details.open).toBe(false);
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    harness.detectChanges();
    // This test covers the legacy question shell after proving the indexed
    // catalog route. Canonical fast-path behavior has focused tests below.
    content.getHandsOnDsaIndex.mockReturnValueOnce(of(emptyPracticeIndex()));
    harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a.problem-card')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(
      '/learn/algorithmic-patterns/hashing-complete?pattern=algorithmic-patterns:hashing',
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

  it('exposes a clear-filter action and restores all collapsed groups', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:two-pointers',
      HandsOnDsa,
    );
    expect(harness.routeNativeElement!.querySelectorAll('details.pattern-group')).toHaveLength(1);
    const clearFilter =
      harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.clear-pattern-filter')!;
    expect(clearFilter.textContent).toContain('Clear filter');
    expect(clearFilter.getAttribute('aria-label')).toBe('Clear two-pointers pattern filter');
    clearFilter.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/learn/hands-on-dsa');
    expect(harness.routeNativeElement!.querySelectorAll('details.pattern-group')).toHaveLength(2);
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
    expect(
      harness.routeNativeElement!.querySelector('.pattern-filter [aria-current="page"]')!
        .textContent,
    ).toBe('two-pointers');
    expect(harness.routeNativeElement!.querySelectorAll('details.pattern-group')).toHaveLength(1);
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
