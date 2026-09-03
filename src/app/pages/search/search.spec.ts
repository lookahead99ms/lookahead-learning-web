import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    getSearchIndex: vi.fn(() => of([])),
    getInterviewQuestionIndex: vi.fn(() => of([document])),
    getInterviewQuestion: vi.fn(() => of(question)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
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
});
