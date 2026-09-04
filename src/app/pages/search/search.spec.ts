import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of } from 'rxjs';
import { routes } from '../../app.routes';
import { ContentService } from '../../content/content.service';
import { InterviewQuestion, SearchDocument } from '../../content/content.models';
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
    tags: question.tags,
    filterTags: ['Learn', 'Q&A', 'Java', 'Concurrency', 'Intermediate'],
    languages: ['java'],
    difficulty: question.difficulty,
    preview: question.interviewAnswer,
    access: { tier: 'free' },
    searchableText: `${question.title} ${question.interviewAnswer}`.toLowerCase(),
    route: ['/', 'learn', 'solid-design-patterns', question.id],
  };

  const content = {
    getSearchIndex: vi.fn(() => of([] as SearchDocument[])),
    getInterviewQuestionIndex: vi.fn(() => of([document])),
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

  it('loads the interview index and hydrates the canonical answer only when expanded', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?path=learn', Search);
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Interview Question Library',
    );
    expect(content.getInterviewQuestionIndex).toHaveBeenCalledOnce();
    expect(content.getInterviewQuestion).not.toHaveBeenCalled();

    (harness.routeNativeElement?.querySelector('.result-toggle') as HTMLButtonElement).click();
    harness.detectChanges();

    expect(content.getInterviewQuestion).toHaveBeenCalledWith(
      'learn',
      'solid-design-patterns',
      'java-concurrency',
      'safe-counter',
    );
    expect(harness.routeNativeElement?.querySelector('.reference-answer')?.textContent).toContain(
      'read-modify-write',
    );
    expect(harness.routeNativeElement?.querySelector('app-coding-solution-tabs')).not.toBeNull();
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
    expect(showMore.textContent).toContain('Show 5 more questions');

    showMore.click();
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(45);
    expect(harness.routeNativeElement?.querySelector('.show-more-results')).toBeNull();
  });

  it('applies a search and scrolls to its results on the first submission', async () => {
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
      'Showing 1 of 1 matching interview question',
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

  it('does not erase an unsubmitted search draft when a topic changes', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interview-questions?q=counter', Search);
    vi.spyOn(window.document, 'getElementById').mockReturnValue({
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!;
    input.value = 'thread';
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
    const tag = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.tag-pill'),
    ].find((button) => button.textContent.trim() === 'Java')!;
    tag.click();
    await harness.fixture.whenStable();
    expect(input.value).toBe('thread');
    expect(TestBed.inject(Router).url).toBe('/interview-questions?tags=Java');
    harness
      .routeNativeElement!.querySelector('.search-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/interview-questions?q=thread&tags=Java');
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
      expect(savedUrl).toBe(`/${path}?path=learn`);
      await harness.navigateByUrl(path === 'search' ? '/interview-questions' : '/search', Search);
      await harness.navigateByUrl(savedUrl, Search);
      expect(
        harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!.value,
      ).toBe('');
      expect(harness.routeNativeElement!.querySelector('select')!.value).toBe('learn');
    },
  );
});
