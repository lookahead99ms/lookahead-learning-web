import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
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
        provideRouter([
          {
            path: 'search',
            component: Search,
          },
          {
            path: 'interview-questions',
            data: { experience: 'interview-questions' },
            component: Search,
          },
        ]),
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
});
