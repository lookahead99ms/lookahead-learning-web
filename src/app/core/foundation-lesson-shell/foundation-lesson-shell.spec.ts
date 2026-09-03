import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  FoundationLessonV1,
  InterviewQuestion,
  ResolvedPatternCheck,
} from '../../content/content.models';
import { FoundationLessonShell } from './foundation-lesson-shell';

const lesson: FoundationLessonV1 = {
  id: 'foundation-heaps',
  moduleId: 'theory-heaps',
  order: 1,
  title: 'Heaps: Partial Order',
  difficulty: 'Intermediate',
  tags: ['Heaps'],
  contentType: 'theory',
  schemaVersion: 'foundation-lesson/v1',
  summary: 'A heap preserves the next useful priority without fully sorting every value.',
  estimatedReadMinutes: 12,
  interviewAnswer: 'A heap maintains a parent-child priority invariant.',
  explanation: ['Only the root is globally promised.'],
  versionNotes: [],
  followUps: [],
  learningOutcomes: ['Explain the heap invariant.', 'Trace a sift operation.'],
  memoryAnchor: {
    phrase: 'Only the root is globally promised.',
    mentalModel: 'Parents outrank children while siblings remain unordered.',
    retrievalCue: 'Think heap when the next best item matters repeatedly.',
  },
  foundationModel: {
    heading: 'A heap keeps partial order',
    representation: 'A complete tree stored in an array.',
    invariant: 'Every parent has priority over both children.',
    operationLens: 'Repair one root-to-leaf path after mutation.',
    selectionRule: 'Use a heap for repeated extrema, not complete order.',
  },
  sections: [
    {
      id: 'heap-trace',
      navLabel: 'Trace',
      heading: 'Trace the repair path',
      body: ['Append first, then compare with the parent.'],
      visual: {
        type: 'diagram',
        assetPath: '/content/example.svg',
        alt: 'A heap repair path.',
      },
      visualTranscript: [
        'Append 2 at the next open leaf.',
        'Swap 2 upward until its parent is smaller.',
      ],
    },
  ],
  pitfalls: [
    {
      failedAssumption: 'The backing array is fully sorted',
      symptom: 'Iteration appears out of order.',
      correction: 'Rely only on the root and parent-child invariant.',
    },
  ],
  checks: [{ questionId: 'heap-check', category: 'invariant' }],
  practice: [
    {
      questionId: 'heap-practice',
      variation: 'Bounded top-k',
      reason: 'Apply the invariant to a stream.',
    },
  ],
  keyTakeaways: ['A heap is partially ordered.'],
  languageNotes: [{ language: 'java', note: 'PriorityQueue is a min-heap by default.' }],
  interviewRecall: {
    prompt: 'Why is a heap useful if it is not sorted?',
    answerFramework: ['State the invariant.', 'Connect the invariant to logarithmic repair.'],
  },
  reviewEvidence: {
    technical: true,
    editorial: true,
    ux: true,
    accessibility: false,
    note: 'Automated contract fixture.',
  },
};

const checks: ResolvedPatternCheck[] = [
  {
    id: 'heap-check',
    category: 'invariant',
    prompt: 'What does a min-heap guarantee?',
    answer: 'Every parent is no greater than either child.',
    explanation: ['The root is globally smallest.'],
  },
];

const practiceItems: InterviewQuestion[] = [
  {
    id: 'heap-practice',
    moduleId: 'practice-heaps',
    order: 1,
    title: 'Kth Largest in a Stream',
    difficulty: 'Intermediate',
    tags: ['Heaps'],
    interviewAnswer: 'Keep a bounded min-heap.',
    explanation: [],
    versionNotes: [],
    followUps: [],
  },
];

function normalizedText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('FoundationLessonShell golden lesson contract', () => {
  let fixture: ComponentFixture<FoundationLessonShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FoundationLessonShell],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FoundationLessonShell);
    fixture.componentRef.setInput('lesson', lesson);
    fixture.componentRef.setInput('checks', checks);
    fixture.componentRef.setInput('practiceItems', practiceItems);
    fixture.componentRef.setInput('pathId', 'learn');
    fixture.componentRef.setInput('courseId', 'core-data-structures');
    fixture.componentRef.setInput('questionModuleId', 'heap-questions');
    fixture.componentRef.setInput('questionCount', 7);
    fixture.detectChanges();
  });

  it('renders the mental model, invariant, recall cue, and complete visual transcript', () => {
    const text = normalizedText(fixture.nativeElement);

    expect(text).toContain('Only the root is globally promised.');
    expect(text).toContain('Every parent has priority over both children.');
    expect(text).toContain('Why is a heap useful if it is not sorted?');

    const transcript = fixture.nativeElement.querySelector('.visual-transcript') as HTMLElement;
    expect(normalizedText(transcript)).toContain('Append 2 at the next open leaf.');
    expect(normalizedText(transcript)).toContain('Swap 2 upward until its parent is smaller.');
  });

  it('renders retrieval practice and a curriculum-aware transfer link', () => {
    const check = fixture.nativeElement.querySelector(
      'app-pattern-understanding-checks',
    ) as HTMLElement;
    expect(normalizedText(check)).toContain('What does a min-heap guarantee?');

    const practiceLink = fixture.nativeElement.querySelector(
      '.practice-grid a',
    ) as HTMLAnchorElement;
    expect(normalizedText(practiceLink)).toContain('Kth Largest in a Stream');
    expect(practiceLink.getAttribute('href')).toBe('/learn/core-data-structures/heap-practice');

    const questionBankLink = fixture.nativeElement.querySelector(
      '.question-bank-link',
    ) as HTMLAnchorElement;
    expect(normalizedText(questionBankLink)).toContain('Review all 7 interview questions');
    expect(questionBankLink.getAttribute('href')).toBe(
      '/learn/core-data-structures/module/heap-questions',
    );
  });
});
