import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  FoundationLessonV1,
  InterviewQuestion,
  ResolvedPatternCheck,
  systemLessonStages,
  LESSON_PATTERNS,
} from '../../content/content.models';
import { FoundationLessonShell } from './foundation-lesson-shell';
import { ReferenceLanguageService } from '../reference-language';

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

  it('extracts prompt text with an inert parser and decodes entities once', () => {
    const component = fixture.componentInstance as unknown as { promptText(value: string): string | null };
    expect(component.promptText('<strong>Prompt:</strong> “Use <em>plain</em> &amp; &lt;b&gt;text&lt;/b&gt;”'))
      .toBe('Use plain & <b>text</b>');
    expect(component.promptText('<strong>Prompt:</strong> &amp;lt;script&amp;gt;'))
      .toBe('&lt;script&gt;');
  });

  it('requires success markers at the start of console lines', () => {
    const component = fixture.componentInstance as unknown as { isPassLine(value: string): boolean };
    expect(component.isPassLine('BUILD SUCCESS')).toBe(true);
    expect(component.isPassLine('Failures: 0, Errors: 0')).toBe(true);
    expect(component.isPassLine('PASSED: result matches')).toBe(true);
    expect(component.isPassLine('FAILED: expected BUILD SUCCESS')).toBe(false);
    expect(component.isPassLine('error before Failures: 0, Errors: 0')).toBe(false);
  });

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

  it('renders authored practice emphasis without displaying HTML or allowing event handlers', () => {
    fixture.componentRef.setInput('lesson', {
      ...lesson,
      practice: [{ questionId: 'heap-practice', variation: 'Try a stream',
        reason: '<strong>Scenario</strong><br>Keep three values.<img src="x" onerror="alert(1)">' }],
    });
    fixture.detectChanges();
    const description = fixture.nativeElement.querySelector('.practice-grid p') as HTMLElement;
    expect(description.querySelector('strong')?.textContent).toBe('Scenario');
    expect(description.querySelector('br')).not.toBeNull();
    expect(description.textContent).not.toContain('<strong>');
    expect(description.querySelector('[onerror]')).toBeNull();
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

  it('turns numbered card points into an ordered list without repeating the numbers', () => {
    fixture.componentRef.setInput('lesson', {
      ...lesson, sections: [{id: 'steps-card', navLabel: 'Steps', heading: 'Steps',
        body: ['<strong>Follow one request:</strong><br>1. Map the path.<br>2. Convert the body.<br>3. Validate it.']}],
    });
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('#steps-card .explanation-content') as HTMLElement;
    expect(card.querySelectorAll('ol > li').length).toBe(3);
    expect(card.querySelector('ul')).toBeNull();
    expect(card.querySelector('ol > li')?.textContent).toBe('Map the path.');
  });

  it('renders an authored comparison table after the chosen paragraph with row headers', () => {
    fixture.componentRef.setInput('lesson', {
      ...lesson, sections: [{id: 'table-card', navLabel: 'Shapes', heading: 'Shapes',
        body: ['Before the table.', 'After the table.'],
        table: {caption: 'Four shapes', columns: ['Interface', 'Returns'],
          rows: [['<code>Predicate&lt;T&gt;</code>', '<code>boolean</code>'], ['<code>Supplier&lt;T&gt;</code>', 'a <code>T</code>']],
          afterParagraph: 0}}],
    });
    fixture.detectChanges();
    const explanation = fixture.nativeElement.querySelector('#table-card .section-explanation') as HTMLElement;
    const children = [...explanation.children].map((child) => child.className);
    expect(children).toEqual(['explanation-content', 'lesson-table-wrap', 'explanation-content']);
    const table = explanation.querySelector('table') as HTMLTableElement;
    expect(table.caption?.textContent).toBe('Four shapes');
    expect([...table.querySelectorAll('thead th')].map((th) => th.getAttribute('scope'))).toEqual(['col', 'col']);
    expect(table.querySelector('tbody th[scope="row"] code')?.textContent).toBe('Predicate<T>');
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
  });

});

describe('FoundationLessonShell system-v1 lessons (DLV-408)', () => {
  const systemLesson: FoundationLessonV1 = {
    ...lesson,
    id: 'url-shortener-lesson',
    title: 'Spring MVC: How a Web Request Becomes a Response',
    lessonPattern: 'system-v1',
    subtitle: 'Trace every step a request takes through Spring.',
    beforeYouStart: 'Java records and HTTP status codes.',
    learningScenario: { systemId: 'url-shortener', system: 'A URL shortener', brands: ['bit.ly', 'TinyURL', 'Rebrandly'], why: 'It is small but has everything.' },
    interviewAnswer: 'Every request goes through the DispatcherServlet.',
    followUps: [{ question: 'Why 302?', answer: 'Browsers cache <strong>301</strong>.' }],
    languageNotes: [],
    learningFlow: {
      whyItMatters: 'Bad data gets saved when this is wrong.',
      practice: { prompt: 'Reserve api.', hint: 'Business rule?', answer: 'In the service.' },
      morePractice: [{ prompt: 'Remove @Valid.', hint: '', answer: 'It is saved.' }],
    },
    sections: [
      { id: 'system', stage: 'brief', navLabel: 'The system', heading: 'Your team owns a URL shortener', body: ['Two endpoints.'] },
      { ...lesson.sections[0], stage: 'understand', navLabel: 'Step by step' },
      { id: 'code', stage: 'build', navLabel: 'The code', heading: 'Build it', body: ['Send requests.', '<strong>Prompt:</strong> "Write a &lt;Driver&gt; filter."'],
        code: { language: 'java', title: 'Matcher.java', source: 'public class Matcher {}' },
        output: { title: 'Run: Matcher', command: 'java Matcher.java', text: 'Eligible: D1\n' },
        table: { columns: ['Request', 'Answer'], rows: [['<code>GET /x</code>', '404']] } },
      { id: 'obstacles', stage: 'debug', navLabel: 'Problems and fixes', heading: 'What broke',
        body: ['An <strong>invariant</strong> is a rule.', 'A new rule is one line:<br><code>Predicate&lt;Driver&gt; ev = d -&gt; d.ev();</code><br>No rule changes.'],
        pairs: [{ n: 1, title: 'App crashed when no driver was found', problem: ['Returns null.'],
          broken: { body: ['<strong>The tester\'s check:</strong> no SUV nearby.'],
            codeTabs: [
              { id: 'NullMatch', title: 'NullMatch.java', language: 'java', source: 'public class NullMatch {\n    Driver find() {\n        return null;\n    }\n}' },
              { id: 'test', title: 'NullMatchTest.java', language: 'java', source: 'class NullMatchTest {}' },
            ],
            output: { tool: 'Run', title: 'Run: NullMatch', command: 'java NullMatch.java', exitCode: 1,
              text: 'Exception in thread "main" java.lang.NullPointerException\n\tat NullMatch.main(NullMatch.java:21)\n' } },
          fixed: { title: 'Return Optional', body: ['Handle nobody on purpose.'],
            codeTabs: [{ id: 'OptionalMatch', title: 'OptionalMatch.java', language: 'java', source: 'public class OptionalMatch {\n    Optional<Driver> find() {\n        return Optional.empty();\n    }\n}' }],
            output: { tool: 'Run', title: 'Run: OptionalMatch', command: 'java OptionalMatch.java', exitCode: 0, text: 'No SUVs nearby.\n' } } }] },
      { id: 'fix', stage: 'debug', navLabel: 'The fix', heading: 'One fix each', body: ['Two files.'],
        codeTabs: [
          { id: 'request', title: 'Request.java', language: 'java', source: 'record Request() {}', body: ['The request record.'] },
          { id: 'errors', title: 'Errors.java', language: 'java', source: 'class Errors {}', body: ['The error advice.'] },
        ] },
      { id: 'go-live', stage: 'ship', navLabel: 'Go live', heading: 'Checks', body: ['Timeouts.'] },
      { id: 'other', stage: 'own', navLabel: 'Other systems', heading: 'Elsewhere', body: ['Payments.'] },
      { id: 'revision', stage: 'own', navLabel: 'Quick revision', sidebar: true, heading: 'Quick revision', body: ['30 seconds.'],
        cheatSheet: {
          tiles: [
            { title: 'Is a controller thread-safe?', points: ['One shared instance.', 'No per-request <code>fields</code>.'] },
            { title: 'Traps to avoid', points: ['301 is cached.', 'Filters run first.'] },
          ],
          facts: ['201 + <code>Location</code>', '409 alias taken'],
        } },
      { id: 'live', stage: 'prove', navLabel: 'Live check', heading: 'Signals', body: ['Status mix.'] },
      { id: 'refs', stage: 'keep', navLabel: 'References', heading: 'References', body: ['Checked.'] },
    ],
  };
  let fixture: ComponentFixture<FoundationLessonShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FoundationLessonShell], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(FoundationLessonShell);
    fixture.componentRef.setInput('lesson', systemLesson);
    fixture.componentRef.setInput('checks', checks);
    fixture.componentRef.setInput('practiceItems', practiceItems);
    fixture.componentRef.setInput('pathId', 'grow');
    fixture.componentRef.setInput('courseId', 'spring-framework');
    fixture.detectChanges();
  });

  it('renders the eight team stages in order, each holding its own blocks', () => {
    const root: HTMLElement = fixture.nativeElement;
    const stageIds = Array.from(root.querySelectorAll('.lesson-stage')).map((stage) => stage.id);
    expect(stageIds).toEqual(['stage-brief', 'stage-understand', 'stage-build', 'stage-debug', 'stage-ship', 'stage-own', 'stage-prove', 'stage-keep']);
    const idsIn = (stage: string) => Array.from(root.querySelectorAll(`#stage-${stage} > section`)).map((section) => section.id);
    expect(idsIn('brief')).toEqual(['lesson-scenario', 'foundation-start', 'system']);
    expect(idsIn('debug')).toEqual(['obstacles', 'fix', 'foundation-pitfalls']);
    expect(idsIn('own')).toEqual(['other', 'lesson-interview-answer', 'revision']);
    expect(idsIn('prove')).toEqual(['live', 'foundation-understand', 'foundation-try', 'foundation-practice']);
    expect(idsIn('keep')).toEqual(['lesson-takeaways', 'refs']);
    expect(root.querySelector('#foundation-model')).toBeNull();
    expect(root.querySelector('#foundation-why')).toBeNull();
  });

  it('puts code and its run console beside the explanation, with the table below', () => {
    const section = fixture.nativeElement.querySelector('#code') as HTMLElement;
    expect(section.classList).toContain('system-code-section');
    const pair = section.querySelector('.code-pair') as HTMLElement;
    expect(pair.querySelector('.code-pair-code .foundation-code')).not.toBeNull();
    const console = pair.querySelector('.code-pair-code .run-console') as HTMLElement;
    expect(console.querySelector('.run-console-tool')?.textContent).toBe('Run');
    expect(console.querySelector('.run-console-tab')?.textContent?.trim()).toBe('Matcher ×');
    expect(console.querySelector('.run-command')?.textContent).toBe('java Matcher.java');
    expect(Array.from(console.querySelectorAll('.run-line')).map((line) => line.textContent)).toEqual(['Eligible: D1']);
    expect(console.querySelector('.run-exit')?.textContent).toBe('Process finished with exit code 0');
    expect(pair.querySelector('.code-pair-text .explanation-content')?.textContent).toBe('Send requests.');
    expect(pair.classList).toContain('code-pair-centered');
    expect(pair.nextElementSibling?.classList).toContain('lesson-table-wrap');
  });

  it('shows one file tab at a time with its own explanation and arrow-key navigation', () => {
    const section = fixture.nativeElement.querySelector('#fix') as HTMLElement;
    const tabs = Array.from(section.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Request.java', 'Errors.java']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    const panel = () => section.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panel().querySelector('.code-pair-text')?.textContent).toContain('The request record.');
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(panel().getAttribute('aria-labelledby')).toBe('fix-tab-errors');
    expect(panel().querySelector('.code-pair-text')?.textContent).toContain('The error advice.');
    expect(panel().querySelector('.foundation-code header span')?.textContent).toBe('Errors.java');
  });

  it('keeps a sentence that starts with a bold word whole and gives a code statement its own line', () => {
    const [sentence, rule] = Array.from(fixture.nativeElement.querySelectorAll('#obstacles .explanation-content')) as HTMLElement[];
    expect(sentence.querySelector('.points-heading')).toBeNull();
    expect(sentence.innerHTML).toBe('An <strong>invariant</strong> is a rule.');
    expect(rule.querySelector('ul')).toBeNull();
    expect(rule.querySelector('code.code-line')?.textContent).toBe('Predicate<Driver> ev = d -> d.ev();');
    expect(Array.from(rule.querySelectorAll('.prose-line')).map((line) => line.textContent)).toEqual(['A new rule is one line:', 'No rule changes.']);
  });

  it('shows quick revision as numbered cheat-sheet tiles with traps last and fact chips', () => {
    const sheet = fixture.nativeElement.querySelector('#revision .cheat-sheet') as HTMLElement;
    const tiles = Array.from(sheet.querySelectorAll('ol.cheat-tiles > li')) as HTMLElement[];
    expect(tiles.map((tile) => tile.querySelector('h3')?.textContent?.trim())).toEqual(['1Is a controller thread-safe?', '2Traps to avoid']);
    expect(tiles[1].classList).toContain('cheat-traps');
    expect(tiles[0].querySelector('code')?.textContent).toBe('fields');
    expect(Array.from(sheet.querySelectorAll('.cheat-facts li')).map((li) => li.textContent)).toEqual(['201 + Location', '409 alias taken']);
  });

  it('shows each problem as a split diff: the renamed program aligned line by line, the check folded, a console under each side', () => {
    const card = fixture.nativeElement.querySelector('#obstacles .pair-card') as HTMLElement;
    expect(card.id).toBe('obstacles-1');
    expect(card.querySelector('.pair-head h3')?.textContent?.trim()).toBe('1App crashed when no driver was found');
    expect(card.querySelector('.pair-head')?.textContent).toContain('Returns null.');
    expect(card.querySelector('.pair-side')).toBeNull();
    const diff = card.querySelector('#obstacles-1-diff.split-diff') as HTMLElement;
    expect(diff.getAttribute('role')).toBe('group');
    expect(diff.querySelector('.d-head.d-l .pair-label')?.textContent).toBe('What broke');
    expect(diff.querySelector('.d-head.d-l')?.textContent).toContain('no SUV nearby.');
    expect(diff.querySelector('.d-head.d-r .pair-fix-title')?.textContent).toBe('Return Optional');
    // The program renamed by its fix is one file: the old name on the left, the new one on the right.
    expect(diff.querySelector('.d-file.d-l > span')?.textContent).toBe('NullMatch.java');
    const fixedFile = diff.querySelector('.d-file.d-r > span') as HTMLElement;
    expect(fixedFile.firstChild?.textContent).toBe('OptionalMatch.java');
    expect(fixedFile.querySelector('.d-count')?.getAttribute('aria-label')).toBe('2 lines added, 2 removed');
    expect([fixedFile.querySelector('.d-count-add')?.textContent, fixedFile.querySelector('.d-count-del')?.textContent]).toEqual(['+2', '−2']);
    const left = Array.from(diff.querySelectorAll('.d-row.d-l')) as HTMLElement[];
    const right = Array.from(diff.querySelectorAll('.d-row.d-r')) as HTMLElement[];
    expect(left.length).toBe(right.length);
    const kinds = (rows: HTMLElement[]) => rows.map((row) => ['same', 'del', 'add', 'fill'].find((kind) => row.classList.contains('d-' + kind)));
    // Rows start on the same line; the class line counts as unchanged because only the file name differs.
    expect(kinds(left)).toEqual(['same', 'del', 'del', 'same', 'same']);
    expect(kinds(right)).toEqual(['same', 'add', 'add', 'same', 'same']);
    expect(left.map((row) => row.querySelector('.d-num')?.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(left[1].querySelector('.d-mark')?.textContent).toBe('−');
    expect(right[2].querySelector('.d-mark')?.textContent).toBe('+');
    expect(right[2].querySelector('.d-code')?.textContent).toBe('        return Optional.empty();');
    expect(right[2].querySelector('.visually-hidden')?.textContent).toBe('Added line 3: ');
    expect(left[0].querySelector('.d-code')?.textContent).toBe('public class NullMatch {');
    // The check the fix leaves alone is folded, still readable.
    const shared = diff.querySelector('details.d-shared') as HTMLDetailsElement;
    expect(shared.querySelector('summary')?.textContent).toContain('NullMatchTest.java');
    expect(shared.querySelector('summary')?.textContent).toContain('Not changed by the fix');
    expect(shared.querySelector('.foundation-code code')?.textContent).toBe('class NullMatchTest {}');
    // Consoles under each side.
    const brokenOut = diff.querySelector('.d-out.d-l') as HTMLElement;
    expect(brokenOut.querySelector('.run-console')?.classList).toContain('run-console-failed');
    expect(Array.from(brokenOut.querySelectorAll('.run-line')).map((line) => line.classList.contains('run-line-error'))).toEqual([true, true]);
    expect(diff.querySelector('.d-out.d-r .run-exit')?.textContent).toBe('Process finished with exit code 0');
    // Reading order for the stacked (narrow) view: every broken-side part carries d-l, every fixed-side part d-r.
    expect(Array.from(diff.children).every((child) => child.classList.contains('d-l') || child.classList.contains('d-r'))).toBe(true);
  });

  it('omits the language notes block when a system lesson has none', () => {
    expect(fixture.nativeElement.querySelector('.language-notes')).toBeNull();
  });

  it('shows an authored AI prompt as its own copyable prompt block', () => {
    const prompt = fixture.nativeElement.querySelector('#code .ai-prompt') as HTMLElement;
    expect(prompt.querySelector('p')?.textContent).toBe('Write a <Driver> filter.');
    expect(prompt.querySelector('app-code-copy-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('#code .explanation-content').length).toBe(1);
  });

  it('labels each section with its stage and a short sidebar name', () => {
    const code = fixture.nativeElement.querySelector('#code') as HTMLElement;
    expect(normalizedText(code.querySelector('.stage-label')!)).toBe('BuildThe code');
    expect(code.querySelector('h2')?.getAttribute('data-sidebar-label')).toBe('The code');
    expect(fixture.nativeElement.querySelector('#stage-build')?.getAttribute('data-sidebar-level')).toBe('stage');
  });

  it('shows the scenario, the one-line summary and the brands as plain text', () => {
    const scenario = normalizedText(fixture.nativeElement.querySelector('#lesson-scenario'));
    expect(fixture.nativeElement.querySelector('#lesson-scenario .one-line-label')?.textContent).toBe('In one line');
    expect(scenario).toContain('A heap preserves');
    const why = Array.from(fixture.nativeElement.querySelectorAll('#lesson-scenario .scenario-why h3')).map((h) => (h as HTMLElement).textContent);
    expect(why).toEqual(['Why this scenario?', 'Why it matters']);
    expect(scenario).toContain('Learning scenario: A URL shortener');
    expect(scenario).toContain('Think of bit.ly, TinyURL or Rebrandly.');
    expect(fixture.nativeElement.querySelector('#lesson-scenario button, #lesson-scenario .pill')).toBeNull();
  });

  it('links the interview answer, quick revision and practice from the right sidebar', () => {
    const supported = Array.from(fixture.nativeElement.querySelectorAll('[data-sidebar-support]')).map((element) => (element as HTMLElement).id);
    expect(supported).toEqual(['lesson-interview-answer', 'revision', 'foundation-try']);
  });

  it('keeps every exercise answer concealed until opened', () => {
    const exercises = fixture.nativeElement.querySelectorAll('#foundation-try .try-exercise');
    expect(exercises.length).toBe(2);
    for (const details of Array.from(fixture.nativeElement.querySelectorAll('#foundation-try details')) as HTMLDetailsElement[]) {
      expect(details.open).toBe(false);
    }
  });

  it('omits stages with no authored sections except the fixed ones', () => {
    const trimmed = { ...systemLesson, sections: systemLesson.sections.filter((section) => section.stage !== 'ship') };
    expect(systemLessonStages(trimmed).map((stage) => stage.id)).toEqual(['brief', 'understand', 'build', 'debug', 'own', 'prove', 'keep']);
  });

  it('renders a Look Ahead story lesson with its own stages, text answer pairs and a speaking timer', () => {
    const story = {
      ...systemLesson,
      lessonPattern: 'story-v1',
      sections: [
        { id: 'q', stage: 'question', navLabel: 'The question', heading: 'Tell me about ownership', body: ['The question.'] },
        { id: 'pairs', stage: 'debug', navLabel: 'Weak and strong', heading: 'Weak and strong answers', body: ['Compare.'],
          pairLabels: { broken: 'Weak answer', fixed: 'Strong answer' },
          pairs: [{ n: 1, title: 'Blames the other team', problem: ['It sounds like blame.'],
            broken: { body: [], codeTabs: [{ id: 'weak', title: 'Answer', language: 'text', source: 'They missed it.' }] },
            fixed: { title: 'Fair attribution', body: [], codeTabs: [{ id: 'strong', title: 'Answer', language: 'text', source: 'Their launch was busy.' }] } }] },
        { id: 'practice', stage: 'practice', navLabel: 'Practice', heading: 'Say it out loud', body: ['Two minutes.'],
          practiceTimer: { seconds: 120, prompt: 'Say your answer out loud.' } },
        { id: 'refs', stage: 'keep', navLabel: 'References', heading: 'References', body: ['Checked.'] },
      ],
    } as FoundationLessonV1;
    fixture.componentRef.setInput('lesson', story);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(Array.from(root.querySelectorAll('.lesson-stage')).map((stage) => stage.id)).toEqual(
      ['stage-question', 'stage-debug', 'stage-practice', 'stage-keep']);
    expect(root.querySelector('#stage-question #lesson-scenario')).not.toBeNull();
    expect(root.querySelector('#stage-debug #foundation-pitfalls')).not.toBeNull();
    expect(root.querySelector('#stage-practice #lesson-interview-answer')).not.toBeNull();
    const [weak, strong] = Array.from(root.querySelectorAll('#pairs .pair-label')).map((label) => label.textContent);
    expect([weak, strong]).toEqual(['Weak answer', 'Strong answer']);
    expect(root.querySelector('#pairs .run-console')).toBeNull();
    const clock = root.querySelector('#practice .practice-timer-clock') as HTMLElement;
    expect(clock.textContent).toBe('2:00');
    const [start, reset] = Array.from(root.querySelectorAll('#practice .practice-timer-actions button')) as HTMLButtonElement[];
    start.click();
    fixture.detectChanges();
    expect(start.textContent).toBe('Pause');
    reset.click();
    fixture.detectChanges();
    expect(start.textContent).toBe('Start');
    expect(root.querySelector('#q .section-label span')?.textContent).toBe('The question');
  });

  it('shows a pair-side table where the console would be, even when a side has no code', () => {
    const design = {
      ...systemLesson,
      lessonPattern: 'story-v1',
      sections: [
        { id: 'q', stage: 'question', navLabel: 'The question', heading: 'Pick a store', body: ['The question.'] },
        { id: 'trade', stage: 'debug', navLabel: 'Trade-offs', heading: 'Wrong and right store', body: ['Compare.'],
          pairs: [{ n: 1, title: 'Counters on one row', problem: ['Hot row.'],
            broken: { body: ['One row takes every write.'],
              table: { caption: 'Write load', columns: ['Store', 'Writes/s'], rows: [['Single row', '<strong>5,000</strong>']] } },
            fixed: { title: 'Shard the counter', body: ['Spread writes.'],
              codeTabs: [{ id: 'plan', title: 'Plan', language: 'pseudo', source: "for each shard: add(n)\nread = sum(shards) // don't lock" }],
              table: { columns: ['Store', 'Writes/s'], rows: [['16 shards', '312 each']] } } }] },
        { id: 'refs', stage: 'keep', navLabel: 'References', heading: 'References', body: ['Checked.'] },
      ],
    } as FoundationLessonV1;
    fixture.componentRef.setInput('lesson', design);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const [broken, fixed] = Array.from(root.querySelectorAll('#trade .pair-side')) as HTMLElement[];
    expect(broken.querySelector('.pair-side-code')).toBeNull();
    expect(broken.querySelector('.foundation-code')).toBeNull();
    const brokenTable = broken.querySelector('.pair-side-output .lesson-table') as HTMLTableElement;
    expect(brokenTable.querySelector('caption')?.textContent).toBe('Write load');
    expect(Array.from(brokenTable.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Store', 'Writes/s']);
    expect(brokenTable.querySelector('tbody th[scope="row"]')?.textContent).toBe('Single row');
    expect(brokenTable.querySelector('tbody td strong')?.textContent).toBe('5,000');
    expect(fixed.querySelector('.pair-side-code .foundation-code')).not.toBeNull();
    expect(fixed.querySelector('.pair-side-output .lesson-table td')?.textContent).toBe('312 each');
    expect(root.querySelector('#trade .run-console')).toBeNull();
    // Slots keep their order (head, code, output) so the subgrid rows line up across sides.
    expect(Array.from(fixed.children).map((child) => child.className)).toEqual(['pair-side-head', 'pair-side-code', 'pair-side-output']);
    expect(Array.from(broken.children).map((child) => child.className)).toEqual(['pair-side-head', 'pair-side-output']);
  });

  it('labels pseudo and text code plainly, without syntax colouring or a run console', () => {
    const plain = {
      ...systemLesson,
      sections: [
        { id: 'system', stage: 'brief', navLabel: 'The system', heading: 'Flow', body: ['Steps.'] },
        { id: 'pseudo', stage: 'build', navLabel: 'Pseudo', heading: 'The idea', body: ['Read it.'],
          code: { language: 'pseudo', title: 'Rate limiter', source: "if tokens > 0: return 'ok' # don't block" } },
        { id: 'text-tabs', stage: 'build', navLabel: 'Text', heading: 'The request', body: ['Two views.'],
          codeTabs: [
            { id: 'req', title: 'Request', language: 'text', source: 'GET /users/42', body: ['The call.'] },
            { id: 'plan', title: 'Plan', language: 'pseudo', source: 'for each node: ping()', body: ['The plan.'] },
          ] },
        { id: 'refs', stage: 'keep', navLabel: 'References', heading: 'References', body: ['Checked.'] },
      ],
    } as FoundationLessonV1;
    fixture.componentRef.setInput('lesson', plain);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const pseudo = root.querySelector('#pseudo') as HTMLElement;
    expect(pseudo.querySelector('.foundation-code header small')?.textContent).toBe('Pseudo-code');
    const code = pseudo.querySelector('pre code') as HTMLElement;
    expect(code.textContent).toBe("if tokens > 0: return 'ok' # don't block");
    expect(code.querySelector('[class^="syntax-"]')).toBeNull();
    expect(pseudo.querySelector('.run-console')).toBeNull();
    const tabs = root.querySelector('#text-tabs') as HTMLElement;
    expect(tabs.querySelector('.foundation-code header small')?.textContent).toBe('Text');
    (tabs.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tabs.querySelector('.foundation-code header small')?.textContent).toBe('Pseudo-code');
    expect(tabs.querySelector('.run-console')).toBeNull();
  });

  it('renders a ladder lesson Overview stage first and section cards as a list inside the section', () => {
    const ladder = {
      ...systemLesson,
      lessonPattern: 'design-v1',
      sections: [
        { id: 'overview-what', stage: 'overview', navLabel: 'What you will build', heading: 'Build a reservation system', body: ['Seats, holds and payment.'] },
        { id: 'requirements', stage: 'brief', navLabel: 'Requirements', heading: 'What it must do', body: ['Two kinds.'],
          cards: [
            { title: 'Functional requirements', points: ['Hold up to <code>4</code> seats.', 'Pay or <strong>release</strong>.'] },
            { title: 'Non-functional requirements', points: ['Never sell a seat twice.'] },
          ] },
        { id: 'refs', stage: 'keep', navLabel: 'References', heading: 'References', body: ['Checked.'] },
      ],
    } as FoundationLessonV1;
    expect(systemLessonStages(ladder).map((stage) => stage.id)).toEqual(['overview', 'brief', 'debug', 'interview', 'keep']);
    for (const pattern of ['fundamental-v1', 'pattern-v1', 'design-v1']) {
      expect(LESSON_PATTERNS[pattern].stages[0]).toEqual({ id: 'overview', label: 'Overview' });
    }
    fixture.componentRef.setInput('lesson', ladder);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const overview = root.querySelector('.lesson-stage') as HTMLElement;
    expect(overview.id).toBe('stage-overview');
    expect(overview.dataset['sidebarLabel']).toBe('Overview');
    expect(overview.querySelector('#overview-what h2')?.textContent).toBe('Build a reservation system');
    expect(overview.querySelector('#overview-what .section-label span')?.textContent).toBe('Overview');
    const section = root.querySelector('#requirements') as HTMLElement;
    const grid = section.querySelector('.section-cards ul.section-card-grid') as HTMLElement;
    expect(grid.dataset['cardCount']).toBe('2');
    expect(section.querySelector('.section-explanation')!.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const cards = Array.from(grid.querySelectorAll(':scope > li.section-card'));
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual(['Functional requirements', 'Non-functional requirements']);
    expect(Array.from(cards[0].querySelectorAll('ul > li')).map((li) => li.textContent)).toEqual(['Hold up to 4 seats.', 'Pay or release.']);
    expect(cards[0].querySelector('li code')?.textContent).toBe('4');
    expect(cards[0].querySelector('li strong')?.textContent).toBe('release');
    expect(root.querySelector('#refs .section-cards')).toBeNull();
  });
  describe('algo-pattern-v1 (problem first)', () => {
    const run = (title: string, text: string, exitCode = 0) => ({ tool: 'Run', title: `Run: ${title}`, command: title, text, exitCode });
    const languageTabs = (stem: string, outputs: [string, string, string], exitCode = 0) => [
      { id: 'java', title: `${stem}.java`, language: 'java', source: `class ${stem} {}`, body: [], output: run(`java ${stem}.java`, outputs[0], exitCode) },
      { id: 'python', title: `${stem}.py`, language: 'python', source: 'def middle(head): pass', body: [], output: run(`python3 ${stem}.py`, outputs[1], exitCode) },
      { id: 'go', title: `${stem}.go`, language: 'go', source: 'package main', body: [], output: run(`go run ${stem}.go`, outputs[2], exitCode) },
    ];
    const algo = () => ({
      ...systemLesson,
      lessonPattern: 'algo-pattern-v1',
      sections: [
        { id: 'p', stage: 'problem', navLabel: 'Problem first', heading: 'Linked List Cycle',
          problem: { title: 'Linked List Cycle', difficulty: 'Easy', source: 'LeetCode 141', statement: 'Return true if the list loops.',
            example: '10 → … → 90 → 30 ⇒ true &nbsp;·&nbsp; 10 → 20 → null ⇒ false' },
          body: ['<strong>The first way most people try.</strong> Keep a box of visited nodes.'],
          cost: '<strong>Time O(n).</strong> <strong>Memory O(n).</strong>',
          visualBeside: true,
          visual: { type: 'storyboard', assetPath: '/content/visited.svg', alt: 'The walker fills the box.',
            storyboard: { frames: [{ ms: 0 }, { ms: 800 }], narrowAssetPath: '/content/visited-narrow.svg', narrowBelow: 420,
              playingStatus: 'Walking the list…', doneStatus: '30 was already in the box: true.' } },
          visualTranscript: ['I start on 10.', 'I walk to 90.', '30 is in the box.'] },
        { id: 'b', stage: 'brief', navLabel: 'Brief', heading: 'Two speeds', body: ['Slow 1, fast 2.'],
          callout: { type: 'key-idea', title: 'The invariant', text: 'The gap shrinks by one.' },
          visual: { type: 'storyboard', assetPath: '/content/brief.svg', alt: 'Brief.', storyboard: { frames: [{ ms: 0 }, { ms: 1500 }],
            legend: [{ mark: 'slow', text: 'slow: 1 node per step' }, { mark: 'fast', text: 'fast: 2 nodes per step' }] } },
          visualTranscript: ['a', 'b', 'c'] },
        { id: 'walk', stage: 'walkthrough', navLabel: 'Walkthrough', heading: 'Step by step', visualBeside: true,
          body: ['Both start at 10.', 'Slow 1, fast 2.', 'The gap shrinks.', 'They meet on 80.', 'O(1) memory.'],
          visual: { type: 'storyboard', assetPath: '/content/brief.svg', alt: 'Walk.', storyboard: { frames: [{ ms: 0 }, { ms: 1500 }] } },
          visualTranscript: ['x', 'y', 'z'] },
        { id: 'trace', stage: 'walkthrough', navLabel: 'Trace', heading: 'Round by round', body: ['Start on 10.', 'Stops on 40.'],
          table: { columns: ['Round', 'slow', 'fast'], rows: [['1', '20', '30']], afterParagraph: 0 },
          tableBesideVisual: true,
          visual: { type: 'diagram', assetPath: '/content/trace.svg', alt: 'Trace.' }, visualTranscript: ['x', 'y', 'z'] },
        { id: 'v', stage: 'variations', navLabel: 'Loop test', heading: 'Does it loop?', body: ['Same node.'],
          codeTabs: languageTabs('cycle_start', ['loop found: true\n', 'loop found: True\n', 'loop found: true\n']) },
        { id: 'u', stage: 'use', navLabel: 'When to use it', heading: 'Signals', body: ['Read for these.'] },
        { id: 'm', stage: 'debug', navLabel: 'Common mistakes', heading: 'Broken, then fixed', body: ['Real runs.'],
          pairs: [{ n: 1, title: 'Crashed on the last node', problem: ['Odd length.'],
            broken: { body: ['The check.'], codeTabs: languageTabs('no_next_check', [
              'Exception in thread "main" java.lang.NullPointerException\n\tat X.main(X.java:3)\n',
              'Traceback (most recent call last):\n  File "/lab/no_next_check.py", line 11, in has_cycle\n    fast = fast.next.next\nAttributeError: \'NoneType\' object has no attribute \'next\'\n',
              'panic: runtime error: invalid memory address or nil pointer dereference\n\ngoroutine 1 [running]:\nexit status 2\n',
            ], 1) },
            fixed: { title: 'Check both hops', body: ['Both.'], codeTabs: languageTabs('next_checked', ['PASSED: no loop\n', 'PASSED: no loop\n', 'PASSED: no loop\n']) } }] },
        { id: 'ladder', stage: 'problems', navLabel: 'Problems', heading: 'Ladder', body: ['Easy to hard.'],
          ladder: [
            { questionId: 'algorithmic-middle-linked-list', problemId: 'algorithmic-middle-linked-list', title: 'Middle of the Linked List', difficulty: 'Beginner', newIdea: 'The <code>template</code>.' },
            { questionId: 'algorithmic-linked-list-cycle', problemId: 'algorithmic-linked-list-cycle', title: 'Linked List Cycle', difficulty: 'Beginner', newIdea: 'The meeting test.' },
          ] },
        { id: 'spot', stage: 'spot', navLabel: 'Spot the pattern', heading: 'Which pattern?', body: ['Pick one.'],
          spot: { pattern: 'Fast and slow pointers', options: ['Fast and slow pointers', 'Sliding window'],
            items: [{ statement: 'Does the list loop?', answer: 'Fast and slow pointers', why: 'One next node each.' }] } },
        { id: 'cheat', stage: 'keep', navLabel: 'Cheat sheet', heading: 'Cheat sheet', sidebar: true, body: ['30 seconds.'],
          cheatSheet: {
            codeTabs: [
              { id: 'java', title: 'From MiddleFastSlow.java', language: 'java', source: 'static Node middle(Node head) {}' },
              { id: 'python', title: 'From middle_fast_slow.py', language: 'python', source: 'def middle(head):' },
              { id: 'go', title: 'From middle_fast_slow.go', language: 'go', source: 'func middle(head *ListNode) *ListNode {}' },
            ],
            tiles: [{ title: 'Skeleton?', points: ['a', 'b'] }, { title: 'Traps to avoid', points: ['c', 'd'] }], facts: ['O(n)'] } },
        { id: 'refs', stage: 'references', navLabel: 'References', heading: 'References', body: ['Checked.'] },
      ],
    } as FoundationLessonV1);

    let storageDescriptor: PropertyDescriptor | undefined;
    beforeEach(() => {
      storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
      const values = new Map<string, string>();
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
      });
      TestBed.inject(ReferenceLanguageService).selected.set('java');
      fixture.componentRef.setInput('lesson', algo());
      fixture.componentRef.setInput('pathId', 'learn');
      fixture.componentRef.setInput('courseId', 'algorithmic-patterns');
      fixture.detectChanges();
    });

    it('renders the problem-first stages in order with their own labels and no scenario, pitfall or interview blocks', () => {
      const root: HTMLElement = fixture.nativeElement;
      expect(Array.from(root.querySelectorAll('.lesson-stage')).map((stage) => (stage as HTMLElement).dataset['sidebarLabel'])).toEqual([
        'Problem first', 'Brief', 'Walkthrough', 'Variations', 'When to use', 'Common mistakes', 'Problems',
        'Spot the pattern', 'Cheat sheet', 'References',
      ]);
      expect(root.querySelector('.system-lesson')?.classList).toContain('algo-lesson');
      expect(root.querySelector('#lesson-scenario')).toBeNull();
      expect(root.querySelector('#foundation-pitfalls')).toBeNull();
      expect(root.querySelector('#lesson-interview-answer')).toBeNull();
      expect(root.querySelector('#lesson-takeaways')).toBeNull();
      // Checks and Try it yourself sit in Spot the pattern; the ladder replaces More practice.
      expect(root.querySelector('#stage-spot #foundation-understand')).not.toBeNull();
      expect(root.querySelector('#foundation-practice')).toBeNull();
    });

    it('opens with the problem card on its own, then the slow way as a story beside a short explanation and its cost, with no code', () => {
      const section = fixture.nativeElement.querySelector('#p') as HTMLElement;
      const label = section.querySelector('.problem-label') as HTMLElement;
      expect(label.querySelector('span')?.textContent).toBe('Problem first');
      expect(label.textContent).toContain('Linked List Cycle');
      expect(label.querySelector('.difficulty-pill')?.getAttribute('data-level')).toBe('easy');
      expect(label.querySelector('.problem-source')?.textContent).toBe('LeetCode 141');
      expect(section.querySelector('h2')?.classList).toContain('visually-hidden');
      expect(section.querySelector('h2')?.getAttribute('data-sidebar-label')).toBe('Problem first');
      const card = section.querySelector('.problem-card') as HTMLElement;
      expect(card.querySelector('p')?.textContent).toBe('The problem. Return true if the list loops.');
      expect(card.querySelector('.problem-example')?.textContent).toBe('10 → … → 90 → 30 ⇒ true \u00a0·\u00a0 10 → 20 → null ⇒ false');
      const story = section.querySelector('app-lesson-storyboard') as HTMLElement;
      expect(card.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(story.classList).toContain('storyboard-story');
      expect(story.classList).toContain('storyboard-has-beside');
      expect(story.querySelector('.storyboard-canvas img')?.getAttribute('src')).toBe('/content/visited.svg');
      expect(story.querySelector('.storyboard-beside .explanation-content')?.textContent).toBe('The first way most people try. Keep a box of visited nodes.');
      expect(story.querySelector('.storyboard-beside .storyboard-cost')?.textContent).toBe('Time O(n). Memory O(n).');
      expect(story.querySelector('.storyboard-bar .storyboard-toggle')?.textContent).toContain('Pause');
      expect(section.querySelector('.foundation-code, .run-console, .lesson-table')).toBeNull();
      expect(section.querySelectorAll('.visual-transcript li').length).toBe(3);
    });

    it('plays the Brief as a storyboard with its legend and the invariant under it, and walks through it beside five points', () => {
      const brief = fixture.nativeElement.querySelector('#b') as HTMLElement;
      const story = brief.querySelector('app-lesson-storyboard') as HTMLElement;
      expect(story.classList).not.toContain('storyboard-story');
      expect(Array.from(story.querySelectorAll('.storyboard-legend span')).map((span) => span.textContent?.trim())).toEqual(['slow: 1 node per step', 'fast: 2 nodes per step']);
      expect(story.nextElementSibling?.classList).toContain('storyboard-callout');
      expect(brief.querySelector('.section-explanation .lesson-callout')).toBeNull();
      const walk = fixture.nativeElement.querySelector('#walk') as HTMLElement;
      expect(walk.querySelector('app-lesson-storyboard')?.classList).toContain('storyboard-has-beside');
      expect(Array.from(walk.querySelectorAll('.storyboard-beside .beside-points li')).map((li) => li.textContent)).toEqual([
        'Both start at 10.', 'Slow 1, fast 2.', 'The gap shrinks.', 'They meet on 80.', 'O(1) memory.',
      ]);
      expect(walk.querySelector('.lesson-table')).toBeNull();
    });

    afterEach(() => {
      if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
      else Reflect.deleteProperty(window, 'localStorage');
    });

    it('shows every code block as Java | Python | Go tabs that switch together with their consoles', () => {
      const root: HTMLElement = fixture.nativeElement;
      const lists = Array.from(root.querySelectorAll('.language-tabs[role="tablist"]'));
      // The variation, the Debug pair (one choice for both sides of its diff) and the cheat-sheet template.
      expect(lists.length).toBe(3);
      for (const list of lists) {
        expect(Array.from(list.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim())).toEqual(['Java', 'Python', 'Go']);
      }
      const variation = root.querySelector('#v') as HTMLElement;
      const panel = variation.querySelector('[role="tabpanel"]') as HTMLElement;
      expect(panel.getAttribute('aria-labelledby')).toBe('v-lang-java');
      expect(panel.querySelector('.foundation-code header span')?.textContent).toBe('cycle_start.java');
      expect(panel.querySelector('.run-console .run-command')?.textContent).toBe('java cycle_start.java');

      (variation.querySelector('#v-lang-python') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(variation.querySelector('#v-lang-python')?.getAttribute('aria-selected')).toBe('true');
      expect(variation.querySelector('#v-lang-java')?.getAttribute('tabindex')).toBe('-1');
      expect(variation.querySelector('.foundation-code header span')?.textContent).toBe('cycle_start.py');
      expect(normalizedText(variation.querySelector('.run-console-body')!)).toContain('loop found: True');
      // One choice for the page: the Debug pair sides and the cheat sheet follow.
      expect(root.querySelector('#m-1-lang-panel .d-file.d-l > span')?.textContent).toBe('no_next_check.py');
      expect(root.querySelector('#m-1-lang-panel .d-file.d-r > span')?.firstChild?.textContent).toBe('next_checked.py');
      // Only the file name changed (the fixture's programs are one line): the header says it was renamed.
      expect(root.querySelector('#m-1-lang-panel .d-file.d-r .d-count')?.textContent).toBe('renamed');
      expect(root.querySelector('#m-1-lang-python')?.getAttribute('aria-selected')).toBe('true');
      expect(root.querySelector('#cheat-template-lang-panel .foundation-code header span')?.textContent).toBe('From middle_fast_slow.py');
      expect(root.querySelector('#cheat-template-lang-panel .run-console')).toBeNull();
      expect(window.localStorage.getItem('look-ahead-reference-language-v1')).toBe('python');
    });

    it('moves between language tabs with the arrow keys, Home and End', () => {
      const root: HTMLElement = fixture.nativeElement;
      const java = root.querySelector('#v-lang-java') as HTMLButtonElement;
      java.focus();
      java.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      fixture.detectChanges();
      expect(root.querySelector('#v-lang-go')?.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement?.id).toBe('v-lang-go');
      (root.querySelector('#v-lang-go') as HTMLButtonElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      fixture.detectChanges();
      expect(root.querySelector('#v-lang-java')?.getAttribute('aria-selected')).toBe('true');
    });

    it('opens on the reference language chosen on a Hands-On DSA problem page', () => {
      TestBed.inject(ReferenceLanguageService).select('go');
      fixture.detectChanges();
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('#v .foundation-code header span')?.textContent).toBe('cycle_start.go');
      expect(root.querySelector('#m-1-lang-panel .d-out.d-l .run-command')?.textContent).toBe('go run no_next_check.go');
      expect(root.querySelector('#m-1-lang-panel .d-out.d-r .run-command')?.textContent).toBe('go run next_checked.go');
    });

    it('marks a Python traceback and a Go panic red from their first line, under the broken side of the diff', () => {
      const root: HTMLElement = fixture.nativeElement;
      TestBed.inject(ReferenceLanguageService).select('python');
      fixture.detectChanges();
      const lines = () => Array.from(root.querySelectorAll('#m-1-lang-panel .d-out.d-l .run-line')) as HTMLElement[];
      expect(lines().every((line) => line.classList.contains('run-line-error'))).toBe(true);
      expect(lines().at(-1)?.textContent).toBe("AttributeError: 'NoneType' object has no attribute 'next'");
      TestBed.inject(ReferenceLanguageService).select('go');
      fixture.detectChanges();
      expect(lines()[0].textContent).toContain('panic: runtime error');
      expect(lines().every((line) => line.classList.contains('run-line-error'))).toBe(true);
      expect(root.querySelector('#m-1-lang-panel .d-out.d-r .run-line-error')).toBeNull();
      const panel = root.querySelector('#m-1-lang-panel') as HTMLElement;
      expect(panel.getAttribute('role')).toBe('tabpanel');
      expect(panel.getAttribute('aria-labelledby')).toBe('m-1-lang-go');
      expect(root.querySelector('#m-1 .pair-side')).toBeNull();
    });

    it('shows a trace table beside its animation, with the transcript below', () => {
      const section = fixture.nativeElement.querySelector('#trace') as HTMLElement;
      const beside = section.querySelector('.trace-beside') as HTMLElement;
      expect(beside.querySelector('.trace-beside-table .lesson-table')).not.toBeNull();
      expect(beside.querySelector('figure img')?.getAttribute('src')).toBe('/content/trace.svg');
      expect(section.querySelectorAll('.lesson-table').length).toBe(1);
      expect(beside.compareDocumentPosition(section.querySelector('.visual-transcript')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('links each ladder rung to its problem page in order', () => {
      const links = Array.from(fixture.nativeElement.querySelectorAll('#ladder .problem-ladder a')) as HTMLAnchorElement[];
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/learn/algorithmic-patterns/algorithmic-middle-linked-list',
        '/learn/algorithmic-patterns/algorithmic-linked-list-cycle',
      ]);
      expect(links[0].textContent).toBe('Middle of the Linked List');
      const first = fixture.nativeElement.querySelector('#ladder .problem-ladder li') as HTMLElement;
      expect(first.querySelector('.ladder-level')?.textContent).toBe('Beginner');
      expect(first.querySelector('p code')?.textContent).toBe('template');
    });

    it('reveals whether a picked pattern fits, and why, only after a pick', () => {
      const item = fixture.nativeElement.querySelector('#spot .spot-item') as HTMLElement;
      const [right, wrong] = Array.from(item.querySelectorAll('.spot-options button')) as HTMLButtonElement[];
      expect(item.querySelector('.spot-result')?.textContent?.trim()).toBe('');
      expect(right.getAttribute('aria-pressed')).toBe('false');
      wrong.click();
      fixture.detectChanges();
      expect(wrong.getAttribute('aria-pressed')).toBe('true');
      expect(item.querySelector('.spot-wrong')?.textContent).toBe('Not this one. It is Fast and slow pointers.');
      right.click();
      fixture.detectChanges();
      expect(right.getAttribute('aria-pressed')).toBe('true');
      expect(wrong.getAttribute('aria-pressed')).toBe('false');
      expect(item.querySelector('.spot-right')?.textContent).toBe('Right: Fast and slow pointers.');
      expect(item.querySelector('.spot-result')?.textContent).toContain('One next node each.');
    });
  });
});
