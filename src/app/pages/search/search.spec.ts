import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of } from 'rxjs';
import { routes } from '../../app.routes';
import { ContentService } from '../../content/content.service';
import { ContentPath, InterviewQuestion, SearchDocument } from '../../content/content.models';
import { Search } from './search';

describe('Search interview-question library', () => {
  const question: InterviewQuestion = {
    id: 'safe-counter',
    moduleId: 'java-concurrency',
    order: 1,
    title: 'Why is counter++ not thread-safe?',
    difficulty: 'Intermediate',
    tags: ['Java', 'Concurrency'],
    interviewAnswer: 'The increment is a read-modify-write operation, not one atomic action.',
    explanation: ['Another thread can interleave between the read and write and lose an update.'],
    code: {
      language: 'java',
      title: 'Protect the transition',
      source: 'synchronized void increment() { counter++; }',
    },
    complexity: { time: 'O(1)', space: 'O(1)', note: 'The lock serializes this transition.' },
    versionNotes: [],
    followUps: [
      {
        question: 'Would volatile fix it?',
        answer: 'No. Volatile does not make the compound update atomic.',
      },
    ],
    relatedArticleId: 'java-thread-safety-and-coordination',
  };

  const document: SearchDocument = {
    id: 'learn:solid-design-patterns:safe-counter',
    contentId: question.id,
    path: 'learn',
    courseId: 'solid-design-patterns',
    courseTitle: 'Design Patterns and Concurrency Foundations',
    moduleId: question.moduleId,
    moduleTitle: 'Java Concurrency',
    title: question.title,
    contentType: 'q-and-a',
    discoveryKind: 'practice',
    practiceFormat: 'explain',
    subjects: question.tags,
    tags: question.tags,
    filterTags: ['Learn', 'Q&A', 'Java', 'Concurrency', 'Intermediate'],
    languages: ['java'],
    difficulty: question.difficulty,
    preview: '',
    access: { tier: 'free' },
    searchableText: `${question.title} ${question.interviewAnswer}`.toLowerCase(),
    route: ['/', 'learn', 'solid-design-patterns', question.id],
    detailRef: {
      kind: 'content-item',
      href: '/content/details/learn/solid-design-patterns/java-concurrency/safe-counter.json',
      version: 'question-v1',
    },
  };

  const content = {
    getSearchIndex: vi.fn((_path?: ContentPath) => of([] as SearchDocument[])),
    getInterviewQuestionIndex: vi.fn((_path?: ContentPath) => of([document])),
    getInterviewQuestion: vi.fn(() => of(question)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        { provide: ContentService, useValue: content },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads interview practice and hydrates an explanatory answer only on request', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?path=learn', Search);
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Interview Practice Library',
    );
    expect(content.getInterviewQuestionIndex).toHaveBeenCalledOnce();
    expect(content.getInterviewQuestionIndex).toHaveBeenCalledWith('learn');
    expect(content.getInterviewQuestion).not.toHaveBeenCalled();
    expect(
      [...harness.routeNativeElement!.querySelectorAll<HTMLOptionElement>('option')].some(
        (option) => option.value === 'dsa-problem' && option.textContent.includes('Coding and DSA'),
      ),
    ).toBe(true);

    expect(harness.routeNativeElement?.querySelector('.detail-link')?.textContent?.trim()).toBe(
      'Read full answer',
    );
    expect(harness.routeNativeElement?.querySelector('.result-preview')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain(question.interviewAnswer);
    const answerToggle = harness.routeNativeElement?.querySelector(
      '.answer-toggle',
    ) as HTMLButtonElement;
    expect(answerToggle.getAttribute('aria-expanded')).toBe('false');
    expect(answerToggle.textContent?.trim()).toBe('Preview answer');
    expect(answerToggle.querySelector('.answer-toggle-chevron')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    answerToggle.click();
    harness.detectChanges();

    expect(answerToggle.getAttribute('aria-expanded')).toBe('true');
    expect(answerToggle.textContent?.trim()).toBe('Hide preview');
    expect(content.getInterviewQuestion).toHaveBeenCalledWith(document);
    expect(harness.routeNativeElement?.querySelector('.reference-answer')?.textContent).toContain(
      'read-modify-write',
    );
    expect(harness.routeNativeElement?.textContent?.split(question.interviewAnswer)).toHaveLength(
      2,
    );
    expect(harness.routeNativeElement?.querySelector('app-coding-solution-tabs')).not.toBeNull();
  });

  it('loads the selected path shard when the path filter changes', async () => {
    const growDocument: SearchDocument = {
      ...document,
      id: 'grow:spring-framework:dependency-injection',
      contentId: 'dependency-injection',
      path: 'grow',
      courseId: 'spring-framework',
      courseTitle: 'Spring Framework',
      title: 'How does dependency injection improve testability?',
      filterTags: ['Grow', 'Q&A', 'Spring', 'Intermediate'],
      route: ['/', 'grow', 'spring-framework', 'dependency-injection'],
    };
    content.getInterviewQuestionIndex.mockImplementation((path?: ContentPath) =>
      of(path === 'grow' ? [growDocument] : [document]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?path=learn', Search);
    const pathSelect = [...harness.routeNativeElement!.querySelectorAll('select')].find((select) =>
      [...select.options].some((option) => option.value === 'grow'),
    )!;

    pathSelect.value = 'grow';
    pathSelect.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(content.getInterviewQuestionIndex).toHaveBeenCalledWith('grow');
    expect(TestBed.inject(Router).url).toBe('/interview-questions?path=grow');
    expect(harness.routeNativeElement?.querySelector('.result-title')?.textContent).toContain(
      growDocument.title,
    );
  });

  it('renders first-class discovery results with type-appropriate actions', async () => {
    const courseDocument: SearchDocument = {
      ...document,
      id: 'course:learn:solid-design-patterns',
      contentId: 'solid-design-patterns',
      moduleId: 'solid-design-patterns',
      moduleTitle: document.courseTitle,
      title: document.courseTitle,
      contentType: 'guide',
      discoveryKind: 'course',
      practiceFormat: undefined,
      detailRef: undefined,
      route: ['/', 'learn', 'solid-design-patterns'],
    };
    const lessonDocument: SearchDocument = {
      ...document,
      id: 'learn:solid-design-patterns:thread-safety',
      contentId: 'thread-safety',
      title: 'Thread safety foundations',
      contentType: 'theory',
      discoveryKind: 'lesson',
      practiceFormat: undefined,
      route: ['/', 'learn', 'solid-design-patterns', 'thread-safety'],
    };
    const topicDocument: SearchDocument = {
      ...courseDocument,
      id: 'topic:learn:solid-design-patterns:java-concurrency',
      contentId: 'java-concurrency',
      moduleId: 'java-concurrency',
      moduleTitle: 'Java Concurrency',
      title: 'Java Concurrency',
      discoveryKind: 'topic',
      route: ['/', 'learn', 'solid-design-patterns', 'module', 'java-concurrency'],
    };
    const toolDocument: SearchDocument = {
      ...courseDocument,
      id: 'tool:learn:hands-on-dsa',
      contentId: 'hands-on-dsa',
      courseId: 'hands-on-dsa',
      courseTitle: 'Hands-on DSA Practice',
      moduleId: 'hands-on-dsa',
      moduleTitle: 'Hands-on DSA Practice',
      title: 'Hands-on DSA Practice',
      discoveryKind: 'tool',
      route: ['/', 'learn', 'hands-on-dsa'],
    };
    content.getSearchIndex.mockReturnValueOnce(
      of([courseDocument, topicDocument, lessonDocument, toolDocument]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();

    const actions = [...harness.routeNativeElement!.querySelectorAll('.detail-link')].map((link) =>
      link.textContent.trim(),
    );
    expect(actions.sort()).toEqual(['Explore course', 'Explore topic', 'Open tool', 'Read lesson']);
    expect(harness.routeNativeElement?.querySelector('.answer-toggle')).toBeNull();
  });

  it('filters practice format independently from subject and content family', async () => {
    const debugDocument: SearchDocument = {
      ...document,
      id: 'grow:technical-scenarios:failed-release',
      path: 'grow',
      courseId: 'technical-scenarios',
      courseTitle: 'Production Scenario Practice',
      moduleId: 'failure-practice',
      moduleTitle: 'Production Failure Practice',
      title: 'Diagnose a failed release',
      practiceFormat: 'debug',
      tags: ['Java', 'Production'],
      subjects: ['Java', 'Production'],
      filterTags: ['Grow', 'Q&A', 'Java', 'Production', 'Intermediate'],
      route: ['/', 'grow', 'technical-scenarios', 'failed-release'],
    };
    content.getInterviewQuestionIndex.mockReturnValueOnce(of([document, debugDocument]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?format=debug&tags=Java', Search);
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
    expect(harness.routeNativeElement?.querySelector('.result-title')?.textContent).toContain(
      debugDocument.title,
    );
    expect(harness.routeNativeElement?.querySelector('.detail-link')?.textContent).toContain(
      'Debug scenario',
    );
    expect(TestBed.inject(Router).url).toBe('/interview-questions?format=debug&tags=Java');
  });

  it('uses a distinct action for every supported practice format', async () => {
    const documents: SearchDocument[] = [
      ['explain', 'Explain concurrency', 'q-and-a'],
      ['solve', 'Implement a bounded queue', 'dsa-problem'],
      ['design', 'Design a notification service', 'system-design'],
      ['debug', 'Diagnose a failed release', 'q-and-a'],
      ['rehearse', 'Rehearse an ownership story', 'q-and-a'],
    ].map(([practiceFormat, title, contentType], index) => ({
      ...document,
      id: `practice-${practiceFormat}`,
      contentId: `practice-${index}`,
      title,
      contentType: contentType as SearchDocument['contentType'],
      practiceFormat: practiceFormat as SearchDocument['practiceFormat'],
      detailRef:
        contentType === 'dsa-problem'
          ? {
              kind: 'canonical-dsa',
              href: `/content/learn/dsa-problems/practice-${index}.json`,
              version: 'practice-v1',
            }
          : document.detailRef,
    }));
    content.getInterviewQuestionIndex.mockReturnValueOnce(of(documents));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions', Search);
    harness.detectChanges();

    const actions = [...harness.routeNativeElement!.querySelectorAll('.detail-link')].map((link) =>
      link.textContent.trim(),
    );
    expect(actions.sort()).toEqual(
      [
        'Debug scenario',
        'Practise design',
        'Read full answer',
        'Practise problem',
        'Rehearse response',
      ].sort(),
    );
    expect(harness.routeNativeElement?.querySelectorAll('.answer-toggle')).toHaveLength(1);
  });

  it('preserves compatible URL filters when switching between Search and Practice', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/interview-questions?q=counter&path=learn&difficulty=Intermediate&tags=Java',
      Search,
    );
    const switchLink = harness.routeNativeElement?.querySelector(
      '.search-mode-switch',
    ) as HTMLAnchorElement;
    expect(switchLink.textContent?.trim()).toBe('Search all learning content');
    switchLink.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(
      '/search?q=counter&path=learn&difficulty=Intermediate&tags=Java',
    );
  });

  it('restores the canonical DSA problem filter from the URL', async () => {
    const dsaDocument = {
      ...document,
      id: 'dsa:two-sum',
      contentId: 'algorithmic-two-sum',
      canonicalContentId: 'two-sum',
      contentType: 'dsa-problem' as const,
      detailRef: {
        kind: 'canonical-dsa' as const,
        href: '/content/learn/dsa-problems/two-sum.json',
        version: 'dsa-v1',
      },
    };
    content.getInterviewQuestionIndex.mockReturnValueOnce(of([document, dsaDocument]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?type=dsa-problem', Search);
    harness.detectChanges();

    const contentTypeSelect = [...harness.routeNativeElement!.querySelectorAll('select')].find(
      (select) => [...select.options].some((option) => option.value === 'dsa-problem'),
    );
    expect(contentTypeSelect?.value).toBe('dsa-problem');
    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
    expect(harness.routeNativeElement?.querySelector('.result-title')?.textContent).toContain(
      dsaDocument.title,
    );
  });

  it('renders a bounded first page and progressively reveals more results', async () => {
    const documents = Array.from({ length: 45 }, (_, index) => ({
      ...document,
      id: `${document.id}-${index}`,
      contentId: `${document.contentId}-${index}`,
      title: `${document.title} ${index + 1}`,
    }));
    content.getInterviewQuestionIndex.mockReturnValueOnce(of(documents));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions', Search);
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(40);
    const showMore = harness.routeNativeElement?.querySelector(
      '.show-more-results',
    ) as HTMLButtonElement;
    expect(showMore.textContent).toContain('Show 5 more practice items');

    showMore.click();
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(45);
    expect(harness.routeNativeElement?.querySelector('.show-more-results')).toBeNull();
  });

  it('applies a search as text changes and scrolls to its results on submission', async () => {
    const eventOrder: string[] = [];
    const scrollIntoView = vi.fn(() => {
      eventOrder.push('scroll');
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions', Search);
    const router = TestBed.inject(Router);
    const navigate = router.navigate.bind(router);
    vi.spyOn(router, 'navigate').mockImplementation((commands, extras) =>
      navigate(commands, extras).then((navigated) => {
        eventOrder.push('navigation');
        return navigated;
      }),
    );
    vi.spyOn(window.document, 'getElementById').mockReturnValue({
      scrollIntoView,
    } as unknown as HTMLElement);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const input = harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement;
    input.value = 'counter';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    expect(router.url).toBe('/interview-questions?q=counter');
    harness.routeNativeElement
      ?.querySelector('.search-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();

    expect(router.url).toBe('/interview-questions?q=counter');
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(eventOrder).toEqual(['navigation', 'scroll']);
  });

  it('removes the committed query from the URL when the search field is cleared', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?q=counter', Search);
    const input = harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement;
    expect(input.value).toBe('counter');

    input.value = 'counte';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/interview-questions');
    expect(harness.routeNativeElement?.querySelector('.result-summary')?.textContent).toContain(
      'Showing 1 of 1 matching practice item',
    );
  });

  it('uses the same clear-query contract for platform-wide search', async () => {
    content.getSearchIndex.mockReturnValueOnce(of([document]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?q=counter', Search);
    const input = harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement;

    input.value = '';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/search');
    expect(input.value).toBe('');
  });

  it.each(['search', 'interview-questions'])(
    'restores visible URL state on a reused /%s component',
    async (path) => {
      content.getSearchIndex.mockReturnValueOnce(of([document]));
      const harness = await RouterTestingHarness.create();
      const first = await harness.navigateByUrl(`/${path}?q=absent`, Search);
      expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(0);
      const reused = await harness.navigateByUrl(
        `/${path}?q=counter&tags=Java&difficulty=Intermediate`,
        Search,
      );
      expect(reused).toBe(first);
      expect(
        (harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement).value,
      ).toBe('counter');
      expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
      await harness.navigateByUrl(`/${path}`, Search);
      expect(
        (harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement).value,
      ).toBe('');
      expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
    },
  );

  it.each(['search', 'interview-questions'])(
    'restores /%s query state on browser back and forward',
    async (path) => {
      const harness = await RouterTestingHarness.create();
      TestBed.inject(Router).setUpLocationChangeListener();
      await harness.navigateByUrl(`/${path}?q=first`, Search);
      await harness.navigateByUrl(`/${path}?q=second`, Search);
      const location = TestBed.inject(Location);
      location.back();
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(TestBed.inject(Router).url).toBe(`/${path}?q=first`);
        expect(
          (harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement).value,
        ).toBe('first');
      });
      location.forward();
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(TestBed.inject(Router).url).toBe(`/${path}?q=second`);
        expect(
          (harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement).value,
        ).toBe('second');
      });
    },
  );

  it('restores course and module selectors when URL options arrive after the index request', async () => {
    const index = new Subject<SearchDocument[]>();
    content.getInterviewQuestionIndex.mockReturnValueOnce(index);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/interview-questions?course=solid-design-patterns&module=java-concurrency&language=java',
      Search,
    );
    index.next([document]);
    index.complete();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const values = [...harness.routeNativeElement!.querySelectorAll('select')].map(
      (select) => select.value,
    );
    expect(values).toContain('solid-design-patterns');
    expect(values).toContain('java-concurrency');
    expect(values).toContain('java');
    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
  });

  it('deselects a repeated topic and removes the tag from the URL', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?tags=Java', Search);
    const tag = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.tag-pill'),
    ].find((button) => button.textContent.trim() === 'Java')!;
    expect(tag.classList.contains('active')).toBe(true);
    tag.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/interview-questions');
    expect(tag.classList.contains('active')).toBe(false);
  });

  it('finds a canonical problem through a secondary course placement without duplicating it', async () => {
    const canonical: SearchDocument = {
      ...document,
      id: 'dsa:shared-problem',
      canonicalContentId: 'shared-problem',
      contentType: 'dsa-problem',
      practiceFormat: 'solve',
      practicePlacements: [
        {
          path: 'learn',
          courseId: document.courseId,
          courseTitle: document.courseTitle,
          moduleId: document.moduleId,
          moduleTitle: document.moduleTitle,
          contentId: document.contentId,
          route: document.route,
        },
        {
          path: 'learn',
          courseId: 'python-fundamentals',
          courseTitle: 'Python Foundations',
          moduleId: 'python-dsa-mechanics',
          moduleTitle: 'Python for Coding Interviews',
          contentId: 'python-shared-problem',
          route: ['/', 'learn', 'python-fundamentals', 'python-shared-problem'],
        },
      ],
    };
    content.getInterviewQuestionIndex.mockReturnValue(of([canonical]));
    const harness = await RouterTestingHarness.create();
    const returnUrl =
      '/interview-questions?path=learn&course=python-fundamentals&module=python-dsa-mechanics&format=solve';
    await harness.navigateByUrl(returnUrl, Search);
    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.detail-link')!;
    const url = new URL(link.href);
    expect(url.pathname).toBe('/learn/python-fundamentals/python-shared-problem');
    expect(url.searchParams.get('returnTo')).toBe(returnUrl);
    await harness.navigateByUrl('/interview-questions', Search);
    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
  });

  it('clears inherited scope when a new text search starts', async () => {
    const growDocument: SearchDocument = {
      ...document,
      id: 'grow:spring-framework:dependency-injection',
      contentId: 'dependency-injection',
      path: 'grow',
      courseId: 'spring-framework',
      courseTitle: 'Spring Framework',
      moduleId: 'spring-core',
      moduleTitle: 'Spring Core and IoC Container',
      title: 'How does dependency injection improve testability?',
      subjects: ['Spring', 'Dependency injection'],
      tags: ['Spring', 'Dependency injection'],
      filterTags: ['Grow', 'Q&A', 'Spring', 'Intermediate'],
      searchableText: 'dependency injection spring testability',
      route: ['/', 'grow', 'spring-framework', 'dependency-injection'],
    };
    const pythonDocument: SearchDocument = {
      ...document,
      id: 'learn:python-foundations:bisect',
      contentId: 'bisect',
      courseId: 'python-foundations',
      courseTitle: 'Python Foundations',
      moduleId: 'python-coding-interviews',
      moduleTitle: 'Python for Coding Interviews',
      title: 'How does binary search find an insertion point?',
      subjects: ['Python', 'Binary search'],
      tags: ['Python', 'Binary search'],
      filterTags: ['Learn', 'Q&A', 'Python', 'Intermediate'],
      languages: ['python'],
      searchableText: 'binary search insertion point python',
      route: ['/', 'learn', 'python-foundations', 'bisect'],
    };
    content.getInterviewQuestionIndex.mockImplementation((path?: ContentPath) =>
      of(path === 'grow' ? [growDocument] : [growDocument, pythonDocument]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/interview-questions?path=grow&course=spring-framework&module=spring-core&difficulty=Intermediate&language=java&type=q-and-a&format=explain&tags=Spring&sort=title&group=course',
      Search,
    );
    const subjectInput =
      harness.routeNativeElement!.querySelector<HTMLInputElement>('.tag-tools input')!;
    subjectInput.value = 'spring';
    subjectInput.dispatchEvent(new Event('input'));
    harness.detectChanges();
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!;
    input.value = 'binary search';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(content.getInterviewQuestionIndex).toHaveBeenLastCalledWith(undefined);
    expect(TestBed.inject(Router).url).toBe('/interview-questions?q=binary%20search');
    expect(subjectInput.value).toBe('');
    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
    expect(harness.routeNativeElement?.querySelector('.result-title')?.textContent).toContain(
      pythonDocument.title,
    );
    expect(
      [...harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('select')].every(
        (select) =>
          select.value === 'all' || select.value === 'relevance' || select.value === 'none',
      ),
    ).toBe(true);
  });

  it('applies the same text-search precedence to platform-wide Search', async () => {
    content.getSearchIndex.mockImplementation((_path?: ContentPath) => of([document]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/search?path=learn&type=q-and-a&kind=practice&tags=Java&sort=title&group=course',
      Search,
    );
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!;

    input.value = 'thread safety';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(content.getSearchIndex).toHaveBeenLastCalledWith(undefined);
    expect(TestBed.inject(Router).url).toBe('/search?q=thread%20safety');
    expect(
      [...harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('select')].every(
        (select) =>
          select.value === 'all' || select.value === 'relevance' || select.value === 'none',
      ),
    ).toBe(true);
  });

  it('uses a subject selected after text search as an explicit refinement', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?path=learn&difficulty=Intermediate', Search);
    vi.spyOn(window.document, 'getElementById').mockReturnValue({
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!;
    input.value = 'counter';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const tag = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.tag-pill'),
    ].find((button) => button.textContent.trim() === 'Java')!;
    tag.click();
    await harness.fixture.whenStable();

    expect(input.value).toBe('counter');
    expect(TestBed.inject(Router).url).toBe('/interview-questions?q=counter&tags=Java');

    input.value = 'thread';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/interview-questions?q=thread');
  });

  it.each(['search', 'interview-questions'])(
    'keeps a cleared query cleared when /%s is recreated from its URL',
    async (path) => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/${path}?q=counter&path=learn`, Search);
      const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!;
      input.value = '';
      input.dispatchEvent(new Event('input'));
      await harness.fixture.whenStable();
      const savedUrl = TestBed.inject(Router).url;
      expect(savedUrl).toBe(`/${path}`);
      await harness.navigateByUrl(path === 'search' ? '/interview-questions' : '/search', Search);
      await harness.navigateByUrl(savedUrl, Search);
      expect(
        harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!.value,
      ).toBe('');
      expect(harness.routeNativeElement!.querySelector('select')!.value).toBe('all');
    },
  );
});
