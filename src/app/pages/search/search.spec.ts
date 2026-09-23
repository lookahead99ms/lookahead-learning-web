import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';
import { ContentService } from '../../content/content.service';
import { PROTECTED_CONTENT } from '../../content/content-delivery';
import { ContentPath, InterviewQuestion, SearchDocument } from '../../content/content.models';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { Search } from './search';

describe('Unified Search topic workbench', () => {
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
    getSearchIndex: vi.fn((_path?: ContentPath) => of([document])),
    getInterviewQuestion: vi.fn(() => of(question)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    content.getSearchIndex.mockReset().mockReturnValue(of([document]));
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'search', component: Search }]),
        provideLocationMocks(),
        { provide: ContentService, useValue: content },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function openFirstResult(harness: RouterTestingHarness): HTMLButtonElement {
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.summary-toggle')!;
    button.click();
    harness.detectChanges();
    return button;
  }

  it('renders only the selected question’s short answer in the compact split', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?path=learn', Search);
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Search topics and questions.',
    );
    expect(
      harness.routeNativeElement?.querySelector<HTMLInputElement>('.search-input')?.ariaLabel,
    ).toBe('Search across the platform');
    expect(harness.routeNativeElement?.querySelector('.eyebrow')?.textContent?.trim()).toBe(
      'Across Learn, Grow, and Look Ahead',
    );
    expect(harness.routeNativeElement?.querySelector('.search-intro')?.textContent?.trim()).toBe(
      'Find courses, lessons, interview questions, and practice in one place.',
    );
    expect(content.getSearchIndex).toHaveBeenCalledOnce();
    expect(content.getSearchIndex).toHaveBeenCalledWith('learn');
    expect(harness.routeNativeElement?.querySelector('.summary-pane')).toBeNull();
    openFirstResult(harness);
    expect(content.getInterviewQuestion).toHaveBeenCalledOnce();
    expect(
      [...harness.routeNativeElement!.querySelectorAll<HTMLOptionElement>('option')].some(
        (option) => option.value === 'dsa-problem' && option.textContent.includes('Coding and DSA'),
      ),
    ).toBe(true);

    expect(harness.routeNativeElement?.querySelector('.detail-link')?.textContent?.trim()).toBe(
      'Read full answer',
    );
    expect(harness.routeNativeElement?.querySelector('.summary-pane .detail-link')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('.preview-dialog')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('.summary-pane')).not.toBeNull();
    expect(
      harness.routeNativeElement?.querySelector('.summary-pane .summary-copy')?.textContent?.trim(),
    ).toBe(question.interviewAnswer);
    expect(harness.routeNativeElement?.textContent).not.toContain(question.explanation[0]);
    expect(harness.routeNativeElement?.textContent).not.toContain(question.followUps[0].answer);
    expect(harness.routeNativeElement?.textContent).not.toContain(question.code?.source);
    expect(harness.routeNativeElement?.querySelector('.summary-boundary')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('.answer-toggle')).toBeNull();
    expect(content.getInterviewQuestion).toHaveBeenCalledOnce();
  });

  it('uses the canonical short answer instead of an authored index preview for Q&A', async () => {
    content.getSearchIndex.mockReturnValueOnce(
      of([{ ...document, preview: '<p>Compare atomicity, visibility, and coordination.</p>' }]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    openFirstResult(harness);

    expect(harness.routeNativeElement!.querySelector('.result-title a')).toBeNull();
    const trigger =
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.summary-toggle')!;
    expect(trigger.textContent).toContain('Interview question');
    expect(trigger.textContent).toContain(question.title);
    expect(trigger.textContent).not.toContain('Preview summary');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      harness.routeNativeElement!.querySelector('.summary-pane .summary-copy')?.textContent,
    ).toContain(question.interviewAnswer);
    expect(harness.routeNativeElement!.querySelector('.summary-pane')?.textContent).not.toContain(
      'Compare atomicity, visibility, and coordination.',
    );
    expect(harness.routeNativeElement!.querySelector('.summary-pane')?.textContent).toContain(
      document.courseTitle,
    );
    expect(content.getInterviewQuestion).toHaveBeenCalledOnce();
  });

  it('uses result types that match the learning activity tabs', async () => {
    content.getSearchIndex.mockReturnValueOnce(
      of([
        document,
        {
          ...document,
          id: 'lesson-result',
          discoveryKind: 'lesson',
          contentType: 'theory',
          practiceFormat: undefined,
          title: 'Understand object state',
        },
        {
          ...document,
          id: 'solve-result',
          discoveryKind: 'practice',
          practiceFormat: 'solve',
          contentType: 'dsa-problem',
          title: 'Solve a coding problem',
        },
        {
          ...document,
          id: 'design-result',
          discoveryKind: 'practice',
          practiceFormat: 'design',
          contentType: 'system-design',
          title: 'Design a service',
        },
      ]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();

    const kinds = [...harness.routeNativeElement!.querySelectorAll('.result-kind')].map((element) =>
      element.textContent?.trim(),
    );
    expect(kinds).toEqual(expect.arrayContaining(['Lesson', 'Interview question', 'Coding practice', 'Design practice']));
    expect(kinds).not.toContain('Solve practice');
  });

  it('opens the preview from the title or card whitespace while metadata stays a separate action', async () => {
    content.getSearchIndex.mockReturnValueOnce(
      of([
        document,
        {
          ...document,
          id: 'another-result',
          contentId: 'another-result',
          title: 'Another question',
        },
      ]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();

    const cards = harness.routeNativeElement!.querySelectorAll<HTMLElement>('.result-card');
    const otherCard = [...cards].find((card) => card.textContent?.includes('Another question'))!;
    const firstCard = [...cards].find((card) => card.textContent?.includes(question.title))!;
    const secondAction = otherCard.querySelector<HTMLButtonElement>('.summary-toggle')!;
    expect(secondAction.tagName).toBe('BUTTON');
    expect(secondAction.querySelector('a')).toBeNull();
    expect(otherCard.querySelector('.result-title a')).toBeNull();
    expect(otherCard.querySelectorAll('.result-context a').length).toBeGreaterThanOrEqual(3);
    expect(harness.routeNativeElement?.textContent).not.toContain('Selected result');

    secondAction.querySelector<HTMLElement>('.result-title-text')!.click();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.summary-pane h2')?.textContent).toContain(
      'Another question',
    );

    firstCard.querySelector<HTMLButtonElement>('.summary-toggle')!.click();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.summary-pane h2')?.textContent).toContain(
      question.title,
    );
    expect(otherCard.querySelector('.result-context a')?.closest('button')).toBeNull();
  });

  it('shows DSA problem statements on result cards without mistaking numeric titles for rank labels', async () => {
    const matrixPrompt =
      'Given a binary matrix, find the nearest zero for each cell. Do not mutate the input.';
    const patternPrompt =
      'Given an integer array, find a subsequence whose values follow the pattern.';
    content.getSearchIndex.mockReturnValueOnce(
      of([
        {
          ...document,
          id: 'dsa-matrix',
          contentId: 'dsa-matrix',
          title: '01 Matrix',
          preview: matrixPrompt,
          contentType: 'dsa-problem',
          practiceFormat: 'solve',
          subjects: ['Graphs', 'Breadth-first search', 'Matrix'],
          tags: ['Graphs', 'Breadth-first search', 'Matrix'],
        },
        {
          ...document,
          id: 'dsa-pattern',
          contentId: 'dsa-pattern',
          title: '132 Pattern',
          preview: patternPrompt,
          contentType: 'dsa-problem',
          practiceFormat: 'solve',
        },
      ]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    openFirstResult(harness);

    const cards = [...harness.routeNativeElement!.querySelectorAll<HTMLElement>('.result-card')];
    expect(cards).toHaveLength(2);
    expect(
      cards.map((card) => card.querySelector('.result-title-text')?.textContent?.trim()),
    ).toEqual([matrixPrompt, patternPrompt]);
    expect(cards[0].textContent).not.toContain('01 Matrix');
    expect(cards[1].textContent).not.toContain('132 Pattern');
    expect(cards[0].querySelectorAll('.result-context a').length).toBeGreaterThanOrEqual(3);
    expect(harness.routeNativeElement?.querySelector('.summary-pane h2')?.textContent).toBe(matrixPrompt);
    expect(harness.routeNativeElement?.querySelector('.preview-dialog')).toBeNull();
  });

  it('renders reviewed inline answer formatting without copying full-answer fields', async () => {
    content.getInterviewQuestion.mockReturnValueOnce(
      of({ ...question, interviewAnswer: 'Keep <strong>one</strong> clear contract.' }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    openFirstResult(harness);

    const copy = harness.routeNativeElement!.querySelector('.summary-pane .summary-copy')!;
    expect(copy.textContent?.trim()).toBe('Keep one clear contract.');
    expect(copy.querySelector('strong')?.textContent).toBe('one');
    expect(copy.textContent).not.toContain(question.explanation[0]);
    expect(harness.routeNativeElement?.textContent).not.toContain(question.followUps[0].answer);
  });

  it('keeps a valid selection through sorting and clears it for a new query', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.summary-toggle')!.click();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.summary-pane')).not.toBeNull();

    const sort = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('select'),
    ].find((select) => [...select.options].some((option) => option.value === 'title'))!;
    sort.value = 'title';
    sort.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.summary-pane')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('.pinned-selection .summary-toggle')?.getAttribute('aria-expanded')).toBe('true');

    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!;
    input.value = 'no matching record';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.summary-pane')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.empty-state')?.textContent).toContain(
      'No results match',
    );
  });

  it('keeps the selected result while loading more without duplicate cards', async () => {
    content.getSearchIndex.mockReturnValueOnce(
      of(
        Array.from({ length: 41 }, (_, index) => ({
          ...document,
          id: `${document.id}-${index}`,
          contentId: `${document.contentId}-${index}`,
          title: `${document.title} ${index}`,
          route: [...(document.route ?? []), String(index)],
        })),
      ),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.summary-toggle')!.click();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.summary-pane')).not.toBeNull();

    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.show-more-results')!.click();
    harness.detectChanges();

    expect(harness.routeNativeElement!.querySelector('.summary-pane')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelectorAll('.pinned-selection .result-card')).toHaveLength(1);
    expect(harness.routeNativeElement!.querySelectorAll('.result-card')).toHaveLength(41);
  });

  it('pins the selected item without changing relevance order or result count', async () => {
    content.getSearchIndex.mockReturnValueOnce(of(
      ['A', 'B', 'C', 'D', 'E'].map((letter) => ({
        ...document,
        id: letter,
        title: letter,
        contentType: 'theory' as const,
        discoveryKind: 'lesson' as const,
        preview: `${letter} preview`,
      })),
    ));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    const ids = (selector: string) => [...harness.routeNativeElement!.querySelectorAll<HTMLElement>(selector)]
      .map((item) => item.dataset['resultId']);
    expect(ids('.result-group .summary-toggle')).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(harness.routeNativeElement!.querySelector('.summary-pane')).toBeNull();

    harness.routeNativeElement!.querySelector<HTMLButtonElement>('[data-result-id="D"]')!.click();
    harness.detectChanges();
    expect(ids('.pinned-selection .summary-toggle')).toEqual(['D']);
    expect(ids('.result-group .summary-toggle')).toEqual(['A', 'B', 'C', 'E']);
    expect(harness.routeNativeElement!.querySelectorAll('.result-card')).toHaveLength(5);

    harness.routeNativeElement!.querySelector<HTMLButtonElement>('[data-result-id="B"]')!.click();
    harness.detectChanges();
    expect(ids('.pinned-selection .summary-toggle')).toEqual(['B']);
    expect(ids('.result-group .summary-toggle')).toEqual(['A', 'C', 'D', 'E']);

    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.pinned-close')!.click();
    harness.detectChanges();
    expect(ids('.result-group .summary-toggle')).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(harness.routeNativeElement!.querySelector('.pinned-selection')).toBeNull();
  });

  it('omits a row description when it only repeats the displayed title', async () => {
    content.getSearchIndex.mockReturnValueOnce(of([
      { ...document, id: 'same', title: 'Trace an invariant', preview: 'Trace an invariant', contentType: 'theory', discoveryKind: 'lesson' },
      { ...document, id: 'different', title: 'Review an invariant', preview: 'Try a concrete input.', contentType: 'theory', discoveryKind: 'lesson' },
    ]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    const same = harness.routeNativeElement!.querySelector('[data-result-id="same"]')!;
    const different = harness.routeNativeElement!.querySelector('[data-result-id="different"]')!;
    expect(same.querySelector('.result-row-summary')).toBeNull();
    expect(different.querySelector('.result-row-summary')?.textContent).toBe('Try a concrete input.');
  });

  it('uses one inline mobile preview and restores the exact row trigger on close', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    let frameCallback: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    const trigger =
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.summary-toggle')!;

    expect(harness.routeNativeElement!.querySelector('.inline-preview')).toBeNull();
    trigger.click();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('.inline-preview')).toHaveLength(1);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.inline-preview .summary-copy')?.textContent?.trim()).toBe(
      question.interviewAnswer,
    );
    expect(harness.routeNativeElement!.querySelector('.preview-dialog')).toBeNull();

    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('.inline-preview .summary-close')!
      .click();
    harness.detectChanges();
    frameCallback?.(0);
    expect(harness.routeNativeElement!.querySelector('.inline-preview')).toBeNull();
    expect(window.document.activeElement).toBe(trigger);
    expect(scrollTo).toHaveBeenCalled();
  });

  it('restores a selected result from the URL and removes an invalid selection', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/search?previewItem=${encodeURIComponent(document.id)}`, Search);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.summary-pane .preview-title')?.textContent).toContain(question.title);
    expect(harness.routeNativeElement?.querySelector('.summary-toggle')?.getAttribute('aria-expanded')).toBe('true');

    await harness.navigateByUrl('/search?previewItem=missing-result', Search);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.summary-pane')).toBeNull();
    expect(TestBed.inject(Router).url).not.toContain('previewItem');
  });

  it('closes Filters on outside pointer and Escape while preserving inside controls', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    const details = harness.routeNativeElement!.querySelector<HTMLDetailsElement>('.filter-details')!;
    const summary = details.querySelector<HTMLElement>('summary')!;
    summary.click();
    expect(details.open).toBe(true);

    details.querySelector('select')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(details.open).toBe(true);
    harness.routeNativeElement!.querySelector('.result-card')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(details.open).toBe(false);

    summary.click();
    details.querySelector('select')!.focus();
    window.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(details.open).toBe(false);
    expect(window.document.activeElement).toBe(summary);
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
    content.getSearchIndex.mockImplementation((path?: ContentPath) =>
      of(path === 'grow' ? [growDocument] : [document]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?path=learn', Search);
    const pathSelect = [...harness.routeNativeElement!.querySelectorAll('select')].find((select) =>
      [...select.options].some((option) => option.value === 'grow'),
    )!;

    pathSelect.value = 'grow';
    pathSelect.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(content.getSearchIndex).toHaveBeenCalledWith('grow');
    expect(TestBed.inject(Router).url).toBe('/search?path=grow');
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

    expect(harness.routeNativeElement?.querySelectorAll('.result-title button')).toHaveLength(4);
    expect(harness.routeNativeElement?.querySelectorAll('.summary-toggle')).toHaveLength(4);
    const actions: string[] = [];
    for (const trigger of harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>(
      '.summary-toggle',
    )) {
      trigger.click();
      harness.detectChanges();
      actions.push(
        harness
          .routeNativeElement!.querySelector<HTMLAnchorElement>('.summary-pane .detail-link')!
          .textContent.trim(),
      );
    }
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
    content.getSearchIndex.mockReturnValueOnce(of([document, debugDocument]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?format=debug&tags=Java', Search);
    harness.detectChanges();
    openFirstResult(harness);

    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
    expect(harness.routeNativeElement?.querySelector('.result-title')?.textContent).toContain(
      debugDocument.title,
    );
    expect(harness.routeNativeElement?.querySelector('.detail-link')?.textContent).toContain(
      'Debug scenario',
    );
    expect(TestBed.inject(Router).url).toBe('/search?format=debug&tags=Java');
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
    content.getSearchIndex.mockReturnValueOnce(of(documents));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();

    const actions: string[] = [];
    for (const trigger of harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>(
      '.summary-toggle',
    )) {
      trigger.click();
      harness.detectChanges();
      actions.push(
        harness
          .routeNativeElement!.querySelector<HTMLAnchorElement>('.summary-pane .detail-link')!
          .textContent.trim(),
      );
    }
    expect(actions.sort()).toEqual(
      [
        'Debug scenario',
        'Practise design',
        'Read full answer',
        'Practise problem',
        'Rehearse response',
      ].sort(),
    );
    expect(harness.routeNativeElement?.querySelector('.answer-toggle')).toBeNull();
  });

  it('changes learning activity within Search while preserving topic and URL filters', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/search?q=counter&path=learn&difficulty=Intermediate&tags=Java',
      Search,
    );
    const buttons = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>(
        '.activity-filters button',
      ),
    ];
    buttons.find((button) => button.textContent?.trim() === 'Interview questions')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const url = TestBed.inject(Router).url;
    expect(url).toContain('kind=practice');
    expect(url).toContain('format=explain');
    expect(url).toContain('q=counter');
    expect(url).toContain('tags=Java');
    expect(url).toContain('difficulty=Intermediate');
    expect(harness.routeNativeElement!.querySelector('.search-mode-switch')).toBeNull();
    expect(
      buttons
        .find((button) => button.textContent?.trim() === 'Interview questions')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(content.getSearchIndex).toHaveBeenCalledOnce();
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
    content.getSearchIndex.mockReturnValueOnce(of([document, dsaDocument]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?type=dsa-problem', Search);
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
    content.getSearchIndex.mockReturnValueOnce(of(documents));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(40);
    const showMore = harness.routeNativeElement?.querySelector(
      '.show-more-results',
    ) as HTMLButtonElement;
    expect(showMore.textContent).toContain('Show 5 more results');

    showMore.click();
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(45);
    expect(harness.routeNativeElement?.querySelector('.show-more-results')).toBeNull();
  });

  it('applies a search and resets only the results scroller on submission', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    const router = TestBed.inject(Router);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const input = harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement;
    input.value = 'counter';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    expect(router.url).toBe('/search?q=counter');
    const resultList = harness.routeNativeElement?.querySelector(
      '.result-list-area',
    ) as HTMLElement;
    resultList.scrollTop = 123;
    harness.routeNativeElement
      ?.querySelector('.search-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();

    expect(router.url).toBe('/search?q=counter');
    expect(resultList.scrollTop).toBe(0);
  });

  it('removes the committed query from the URL when the search field is cleared', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?q=counter', Search);
    const input = harness.routeNativeElement?.querySelector('.search-input') as HTMLInputElement;
    expect(input.value).toBe('counter');

    input.value = 'counte';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/search');
    expect(harness.routeNativeElement?.querySelector('.result-summary')?.textContent).toContain(
      'Showing 1 of 1 matching result',
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

  it.each(['search'])('restores visible URL state on a reused /%s component', async (path) => {
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
  });

  it.each(['search'])('restores /%s query state on browser back and forward', async (path) => {
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
  });

  it('restores course and module selectors when URL options arrive after the index request', async () => {
    const index = new Subject<SearchDocument[]>();
    content.getSearchIndex.mockReturnValueOnce(index);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/search?course=solid-design-patterns&module=java-concurrency&language=java',
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
    await harness.navigateByUrl('/search?tags=Java', Search);
    const tag = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.tag-pill'),
    ].find((button) => button.textContent.trim() === 'Java')!;
    expect(tag.classList.contains('active')).toBe(true);
    tag.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/search');
    expect(tag.classList.contains('active')).toBe(false);
  });

  it('keeps an unsupported legacy subject visible instead of silently showing all results', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?tags=URL%20Shortener', Search);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const activeSubjects = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>(
        '.tag-pill[aria-pressed="true"]',
      ),
    ].map((button) => button.textContent.trim());
    expect(activeSubjects).toContain('URL Shortener');
    expect(harness.routeNativeElement?.querySelector('.tag-panel-title')?.textContent).toContain(
      '1 active',
    );
    expect(harness.routeNativeElement?.querySelector('.result-summary')?.textContent).toContain(
      'Showing 0 of 0 matching results',
    );
    expect(TestBed.inject(Router).url).toBe('/search?tags=URL%20Shortener');
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
    content.getSearchIndex.mockReturnValue(of([canonical]));
    const harness = await RouterTestingHarness.create();
    const returnUrl =
      '/search?path=learn&course=python-fundamentals&module=python-dsa-mechanics&format=solve';
    await harness.navigateByUrl(returnUrl, Search);
    expect(harness.routeNativeElement?.querySelectorAll('.result-card')).toHaveLength(1);
    openFirstResult(harness);
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.detail-link')!;
    const url = new URL(link.href);
    expect(url.pathname).toBe('/learn/python-fundamentals/python-shared-problem');
    expect(url.searchParams.get('returnTo')).toContain(returnUrl);
    await harness.navigateByUrl('/search', Search);
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
    content.getSearchIndex.mockImplementation((path?: ContentPath) =>
      of(path === 'grow' ? [growDocument] : [growDocument, pythonDocument]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/search?path=grow&course=spring-framework&module=spring-core&difficulty=Intermediate&language=java&type=q-and-a&format=explain&tags=Spring&sort=title&group=course',
      Search,
    );
    const subjectInput =
      harness.routeNativeElement!.querySelector<HTMLInputElement>('.subject-search input')!;
    subjectInput.value = 'spring';
    subjectInput.dispatchEvent(new Event('input'));
    harness.detectChanges();
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!;
    input.value = 'binary search';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(content.getSearchIndex).toHaveBeenLastCalledWith(undefined);
    expect(TestBed.inject(Router).url).toBe('/search?q=binary%20search');
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
    await harness.navigateByUrl('/search?path=learn&difficulty=Intermediate', Search);
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
    expect(TestBed.inject(Router).url).toBe('/search?q=counter&tags=Java');

    input.value = 'thread';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/search?q=thread');
  });

  it.each(['search'])(
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
      await harness.navigateByUrl(path === 'search' ? '/search' : '/search', Search);
      await harness.navigateByUrl(savedUrl, Search);
      expect(
        harness.routeNativeElement!.querySelector<HTMLInputElement>('.search-input')!.value,
      ).toBe('');
      expect(harness.routeNativeElement!.querySelector('select')!.value).toBe('all');
    },
  );
  it('keeps subject context when changing activity and can clear only subjects', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?tags=Java&kind=practice&format=explain', Search);
    const theory = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>(
        '.activity-filters button',
      ),
    ].find((button) => button.textContent?.trim() === 'Theory & lessons')!;
    theory.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('tags=Java');
    expect(TestBed.inject(Router).url).toContain('kind=lesson');
    harness.detectChanges();
    expect(
      harness
        .routeNativeElement!.querySelector('.tag-pill[aria-pressed="true"]')
        ?.textContent?.trim(),
    ).toBe('Java');
    const allSubjects = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.tag-pill'),
    ].find((button) => button.textContent?.trim() === 'All subjects')!;
    allSubjects.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/search?kind=lesson');
  });

  it('routes every meaningful selected-result value with native links', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?path=learn', Search);
    harness.detectChanges();
    openFirstResult(harness);
    await harness.fixture.whenStable();

    const pane = harness.routeNativeElement!.querySelector('.summary-pane')!;
    const link = (kind: string, index = 0) =>
      pane.querySelectorAll<HTMLAnchorElement>(`a[data-metadata="${kind}"]`)[index];
    expect(link('result-title')).toBeUndefined();
    expect(link('path').getAttribute('href')).toBe('/learn');
    expect(pane.querySelector('.summary-kind')?.textContent).toContain('Interview question');
    expect(link('course').tagName).toBe('A');
    expect(link('course').getAttribute('href')).toBe('/learn/solid-design-patterns');
    expect(link('module').getAttribute('href')).toBe(
      '/learn/solid-design-patterns/module/java-concurrency',
    );

    const difficulty = new URL(link('difficulty').href);
    expect(difficulty.pathname).toBe('/search');
    expect(difficulty.searchParams.get('path')).toBe('learn');
    expect(difficulty.searchParams.get('difficulty')).toBe('Intermediate');
    const language = new URL(link('language').href);
    expect(language.pathname).toBe('/search');
    expect(language.searchParams.get('language')).toBe('java');
    const subjects = pane.querySelectorAll<HTMLAnchorElement>('a[data-metadata="subject"]');
    expect([...subjects].map((subject) => subject.textContent?.trim())).toEqual([
      'Java',
      'Concurrency',
    ]);
    expect(new URL(subjects[0].href).searchParams.get('tags')).toBe('Java');
    expect(subjects[0].tabIndex).toBe(0);

    const primary = pane.querySelector<HTMLAnchorElement>('.detail-link')!;
    const primaryUrl = new URL(primary.href);
    expect(primaryUrl.pathname).toBe('/learn/solid-design-patterns/safe-counter');
    expect(primaryUrl.searchParams.get('returnTo')).toContain('/search?path=learn');
  });

  it('restores the shareable language-neutral filter while hiding an empty Languages row', async () => {
    content.getSearchIndex.mockReturnValueOnce(of([{ ...document, languages: [] }]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search?language=unspecified', Search);
    harness.detectChanges();
    openFirstResult(harness);

    expect(harness.routeNativeElement!.querySelectorAll('.result-card')).toHaveLength(1);
    const select = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('select'),
    ].find((candidate) => [...candidate.options].some((option) => option.value === 'unspecified'))!;
    expect(select.value).toBe('unspecified');
    const metadata = harness.routeNativeElement!.querySelector('.summary-pane .summary-metadata')!;
    expect(metadata.textContent).not.toContain('Languages');
    expect(metadata.querySelector('a[data-metadata="language"]')).toBeNull();
  });

  it('keeps premium interview answers behind the current account and server read', async () => {
    content.getSearchIndex.mockReturnValueOnce(of([{ ...document, access: { tier: 'premium' } }]));
    TestBed.overrideProvider(PROTECTED_CONTENT, { useValue: true });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    openFirstResult(harness);

    const copy = () =>
      harness.routeNativeElement?.querySelector('.summary-pane .summary-copy')?.textContent?.trim();
    expect(copy()).toBe('Sign in to view the interview answer.');
    expect(content.getInterviewQuestion).not.toHaveBeenCalled();

    const accounts = TestBed.inject(StudyPlanAccount);
    accounts.account.set({ accountId: 'author-account' } as never);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(content.getInterviewQuestion).toHaveBeenCalledOnce();
    expect(copy()).toBe(question.interviewAnswer);

    accounts.account.set(null);
    harness.detectChanges();
    expect(copy()).toBe('Sign in to view the interview answer.');
    expect(harness.routeNativeElement?.textContent).not.toContain(question.interviewAnswer);
  });

  it('shows an unavailable state when the selected detail request is denied', async () => {
    content.getInterviewQuestion.mockReturnValueOnce(throwError(() => ({ status: 403 })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    openFirstResult(harness);

    expect(
      harness.routeNativeElement?.querySelector('.summary-pane .summary-copy')?.textContent?.trim(),
    ).toBe('Interview answer unavailable here. Open the full question to check access.');
    expect(harness.routeNativeElement?.textContent).not.toContain(question.interviewAnswer);
    expect(harness.routeNativeElement?.querySelector('.summary-pane .detail-link')).not.toBeNull();
  });

  it('distinguishes a protected sign-in requirement from unavailable detail', async () => {
    content.getInterviewQuestion.mockReturnValueOnce(throwError(() => ({ status: 401 })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    openFirstResult(harness);

    expect(
      harness.routeNativeElement?.querySelector('.summary-pane .summary-copy')?.textContent?.trim(),
    ).toBe('Sign in to view the interview answer.');
    expect(harness.routeNativeElement?.textContent).not.toContain(question.interviewAnswer);
  });

  it('uses the authored indexed description for non-Q&A without fetching a question', async () => {
    content.getSearchIndex.mockReturnValueOnce(
      of([
        {
          ...document,
          contentType: 'theory',
          discoveryKind: 'lesson',
          practiceFormat: undefined,
          preview: '<p>A concise lesson overview.</p>',
        },
      ]),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    openFirstResult(harness);

    expect(
      harness.routeNativeElement?.querySelector('.summary-pane .summary-copy')?.textContent?.trim(),
    ).toBe('A concise lesson overview.');
    expect(content.getInterviewQuestion).not.toHaveBeenCalled();
  });

  it('keeps absent difficulty non-interactive because Search has no unknown-difficulty filter', async () => {
    content.getSearchIndex.mockReturnValueOnce(of([{ ...document, difficulty: undefined }]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/search', Search);
    harness.detectChanges();
    openFirstResult(harness);

    const pane = harness.routeNativeElement!.querySelector('.summary-pane')!;
    expect(pane.querySelector('a[data-metadata="difficulty"]')).toBeNull();
    expect(pane.querySelector('.summary-metadata')?.textContent).toContain('Not specified');
  });
});
