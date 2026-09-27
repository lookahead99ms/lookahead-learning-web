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
    fixture.componentRef.setInput(
      'questionItems',
      Array.from({ length: 7 }, (_, index) => ({
        id: `question-${index + 1}`,
        practiceFormat: 'explain' as const,
      })),
    );
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
    expect(normalizedText(questionBankLink)).toContain('Review all 7 questions');
    expect(questionBankLink.getAttribute('href')).toBe(
      '/interview-questions?path=learn&course=core-data-structures&module=heap-questions',
    );
  });

  it('preserves the originating unit when lessons share a question module', () => {
    fixture.componentRef.setInput('returnUnit', 'calculate-complexity');
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.question-bank-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      '/interview-questions?path=learn&course=core-data-structures&module=heap-questions&unit=calculate-complexity',
    );
  });

  it('allocates failure modes to the full-width lesson grid', () => {
    const pitfalls = fixture.nativeElement.querySelector('#foundation-pitfalls') as HTMLElement;

    expect(pitfalls.classList.contains('wide-section')).toBe(true);
    expect(pitfalls.querySelector('.pitfall-list')).not.toBeNull();
  });

  it('shows the full lesson after the introduction while keeping the exercise answer concealed', () => {
    fixture.componentRef.setInput('lesson', {
      ...lesson,
      beginnerGuide: {
        prerequisite: 'Know how to read a short list of numbers.',
        exampleTitle: 'Find the smallest number',
        language: 'text',
        code: '4, 2, 7',
        walkthrough: ['Compare 4 with 2.', 'Keep 2.', 'Compare 2 with 7.'],
        try: 'Add 1 to the list. Which value is smallest?',
        answer: 'The smallest value is 1.',
        takeaways: ['Compare values.', 'Keep the best so far.', 'Check every entry.'],
        later: 'Explore the heap model when you need repeated minimum lookups.',
      },
    } satisfies FoundationLessonV1);
    fixture.detectChanges();

    const guide = fixture.nativeElement.querySelector('.beginner-guide') as HTMLElement;
    const reference = fixture.nativeElement.querySelector('.foundation-reference') as HTMLElement;
    const answer = guide.querySelector('.guide-answer') as HTMLDetailsElement;
    expect(normalizedText(guide)).toContain('Find the smallest number');
    expect(guide.querySelector('code')?.textContent).toBe('4, 2, 7');
    expect(guide.querySelector('app-code-copy-button')).not.toBeNull();
    expect(reference.tagName).toBe('DIV');
    expect(reference.closest('details')).toBeNull();
    expect(answer.open).toBe(false);
    expect(reference.querySelector('#foundation-model')).not.toBeNull();
    expect(reference.querySelector('.question-bank-link')).not.toBeNull();

    answer.querySelector('summary')!.click();
    expect(answer.open).toBe(true);
    expect(normalizedText(answer)).toContain('The smallest value is 1.');
  });
  for (const hasGuide of [false, true]) {
    it(`keeps the approved reading flow complete with guide=${hasGuide}`, () => {
      fixture.componentRef.setInput('lesson', {
        ...lesson,
        learningFlow: {
          whyItMatters: 'Choose the next waiting task without sorting every arrival.',
          practice: { prompt: 'Add priority 1 after removing 2. What comes next?', hint: 'Compare the current priorities.', answer: '1 is now the minimum.' },
        },
        ...(hasGuide ? { beginnerGuide: {
          prerequisite: 'Read a short list.', exampleTitle: 'Choose the next priority', language: 'text', code: '4, 2, 7',
          walkthrough: ['Compare 4 and 2.', 'Keep 2.', 'Compare 2 and 7.'],
          try: 'Add 0.', answer: '0 comes first.', takeaways: ['The root is smallest.', 'Other items are not fully sorted.', 'Check an empty heap.'], later: 'Use a bounded heap for top-k.',
        } } : {}),
      } satisfies FoundationLessonV1);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const ids = [...root.querySelectorAll('[id]')].map(node => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      const order = ['foundation-start', 'foundation-outcomes-heading', 'heap-trace', 'foundation-model', 'foundation-remember', 'foundation-pitfalls', 'foundation-understand', 'foundation-try'];
      expect(order.every(id => ids.includes(id))).toBe(true);
      expect(order.map(id => ids.indexOf(id))).toEqual(order.map(id => ids.indexOf(id)).sort((a,b) => a-b));
      expect(root.querySelector('#foundation-recall')).toBeNull();
      expect(root.querySelector('#foundation-start')?.textContent).toContain(lesson.summary);
      expect(root.querySelector('.question-bank-link')).not.toBeNull();
      const disclosures = [...root.querySelectorAll<HTMLDetailsElement>('#foundation-try details')];
      expect(disclosures.every(node => !node.open)).toBe(true);
      disclosures[0].querySelector('summary')!.click();
      expect(disclosures[0].open).toBe(true);
      expect(disclosures[1].open).toBe(false);
      disclosures[1].querySelector('summary')!.click();
      expect(disclosures[1].open).toBe(true);
      expect(disclosures[1].textContent).toContain('1 is now the minimum.');
    });
  }

  it('introduces the concrete lesson sections before the abstract model', () => {
    const sections = [
      ...fixture.nativeElement.querySelectorAll('.foundation-lesson > section'),
    ].map((section: any) => section.id);
    expect(sections.indexOf('heap-trace')).toBeLessThan(sections.indexOf('foundation-model'));
  });

  for (const [pathId, exercise, accessibleName] of [
    ['grow', 'Try it and verify', 'Guided implementation'],
    ['look-ahead', 'Make the decision', 'Guided decision'],
  ]) {
    it(`keeps ${pathId} teaching and detailed review available`, () => {
      fixture.componentRef.setInput('pathId', pathId);
      fixture.componentRef.setInput('lesson', {
        ...lesson,
        teachingGuide: {
          prerequisite: 'Understand the existing service contract.',
          exampleTitle: 'Handle a lost response',
          language: 'Scenario',
          code: 'Send → commit → response lost',
          walkthrough: [
            'Keep the operation ID.',
            'Look up its status.',
            'Reconcile unresolved work.',
          ],
          try: 'Would a new operation ID be safe?',
          answer: 'It could duplicate the effect.',
          takeaways: ['Keep identity.', 'Bound retries.', 'Recover unknown outcomes.'],
          later: 'Continue into the implementation and trade-offs.',
        },
      } satisfies FoundationLessonV1);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('article')?.getAttribute('aria-label')).toBe(accessibleName);
      expect(root.querySelector('.guide-scenario')?.textContent).toContain('response lost');
      expect(root.querySelector('.beginner-guide app-code-copy-button')).toBeNull();
      expect(root.querySelector('#foundation-try-heading')?.textContent).toBe(exercise);
      const reference = root.querySelector('.foundation-reference') as HTMLElement;
      expect(reference.tagName).toBe('DIV');
      expect(reference.closest('details')).toBeNull();
      expect(reference.querySelector(':scope > summary')).toBeNull();
      expect(reference.querySelector('.question-bank-link')).not.toBeNull();
      expect(root.querySelector('.guide-answer p')?.textContent).toContain('duplicate');
    });
  }
  it('groups reference links into one semantic list and preserves their destinations', () => {
    const links = ['one', 'two', 'three'].map((name) =>
      `<a href="https://example.com/${name}" target="_blank" rel="noopener noreferrer">${name}</a>`);
    fixture.componentRef.setInput('lesson', {
      ...lesson,
      sections: [{ id: 'sample-references', navLabel: 'References',
        heading: 'References', body: ['Check the runtime version.', ...links] }],
    });
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('#sample-references') as HTMLElement;
    expect(section.querySelectorAll('.reference-links-card').length).toBe(1);
    expect(section.querySelectorAll('.reference-links-card li').length).toBe(3);
    expect(section.querySelector('.section-explanation > .explanation-content')?.textContent).toContain('Check the runtime version.');
    expect(Array.from(section.querySelectorAll('.reference-links-card a')).map((link) => link.getAttribute('href')))
      .toEqual(['https://example.com/one', 'https://example.com/two', 'https://example.com/three']);
  });

  it('omits the example boundary while preserving code and explanation', () => {
    fixture.componentRef.setInput('lesson', {
      ...lesson,
      sections: [{ id: 'bounded-example', navLabel: 'Apply', heading: 'Example',
        body: ['Explain the result.'], code: {title: 'Example code', language: 'java', source: 'int value = 1;'},
        callout: {title: 'Example boundary', text: 'Supply the collaborators.', type: 'note'} }],
    });
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('#bounded-example') as HTMLElement;
    expect(section.querySelectorAll('.lesson-callout').length).toBe(0);
    expect(section.querySelector('.foundation-code code')?.textContent).toContain('int value = 1;');
    expect(section.querySelector('.section-explanation .lesson-callout')).toBeNull();
    expect(section.querySelector('.section-explanation')?.textContent).toContain('Explain the result.');
  });

  it('turns explicit card points into bullets while retaining the heading and inline emphasis', () => {
    fixture.componentRef.setInput('lesson', {
      ...lesson, sections: [{id: 'point-card', navLabel: 'Mechanics', heading: 'Mechanics',
        body: ['<strong>How does this work?</strong><br>First <strong>point</strong>.<br>Second point.', 'A single explanation.']}],
    });
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('#point-card .explanation-content') as HTMLElement;
    expect(card.querySelectorAll('ul > li').length).toBe(2);
    expect(card.firstElementChild?.textContent).toBe('How does this work?');
    expect(card.querySelector('li strong')?.textContent).toBe('point');
    expect(fixture.nativeElement.querySelectorAll('#point-card ul').length).toBe(1);
  });

});
