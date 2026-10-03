import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoundationLessonV1, LESSON_PATTERNS, ResolvedPatternCheck } from '../../content/content.models';
import { FoundationLessonShell } from './foundation-lesson-shell';
import { ReferenceLanguageService } from '../reference-language';

/** concept-v1: Core Data Structures, Big O, Sorting and Searching explain a concept (pilot: Hash Tables). */
describe('FoundationLessonShell concept-v1 (concept courses)', () => {
  const run = (command: string, text: string, exitCode = 0) => ({ tool: 'Run', title: `Run: ${command}`, command, text, exitCode });
  /** One program per language; exitCodes are the real runs' (a Python traceback exits 1). */
  const languageTabs = (stem: string, snake: string, outputs: [string, string, string], exitCodes: [number, number, number] = [0, 0, 0]) => [
    { id: 'java', title: `${stem}.java`, language: 'java', source: `public class ${stem} {}`, body: [], output: run(`java ${stem}.java`, outputs[0], exitCodes[0]) },
    { id: 'python', title: `${snake}.py`, language: 'python', source: 'processed = {}', body: [], output: run(`python3 ${snake}.py`, outputs[1], exitCodes[1]) },
    { id: 'go', title: `${snake}.go`, language: 'go', source: 'package main', body: [], output: run(`go run ${snake}.go`, outputs[2], exitCodes[2]) },
  ];
  const story = { type: 'storyboard' as const, assetPath: '/content/story.svg', alt: 'Four webhooks, three charges.',
    storyboard: { frames: [{ ms: 0 }, { ms: 900 }], narrowAssetPath: '/content/story-narrow.svg', narrowBelow: 420 } };

  const concept = (): FoundationLessonV1 => ({
    id: 'core-ds-hash-tables',
    moduleId: 'theory-hash-tables',
    order: 1,
    title: 'Hash Tables',
    difficulty: 'Intermediate',
    tags: ['Hash tables'],
    contentType: 'theory',
    schemaVersion: 'foundation-lesson/v1',
    lessonPattern: 'concept-v1',
    summary: 'A hash table turns a key into a bucket number.',
    estimatedReadMinutes: 18,
    interviewAnswer: 'Hash, pick a bucket, compare.',
    explanation: ['Hash the key.'],
    versionNotes: [],
    followUps: [],
    learningOutcomes: ['Explain a lookup.'],
    memoryAnchor: { phrase: 'Hash picks the bucket.', mentalModel: 'One bucket, then equals.', retrievalCue: 'Exact key?' },
    foundationModel: { heading: 'Buckets', representation: 'An array of chains.', invariant: 'Equal keys, equal hashes.', operationLens: 'One bucket per lookup.', selectionRule: 'Exact-match lookups.' },
    learningFlow: {
      whyItMatters: 'A retry must not charge twice.',
      practice: { prompt: '16 buckets, load factor 0.75: when does it double?', hint: 'Multiply.', answer: 'After the 13th entry.' },
    },
    interviewRecall: { prompt: 'Why is lookup O(1) on average?', answerFramework: ['Hash.', 'One bucket.', 'Compare.'] },
    pitfalls: [{ failedAssumption: 'equals is enough', symptom: 'Charged twice.', correction: 'Override hashCode too.' }],
    checks: [{ questionId: 'core-ds-hash-collisions', category: 'complexity' }],
    practice: [{ questionId: 'core-ds-contains-duplicate', variation: 'Membership', reason: 'Seen before?' }],
    keyTakeaways: ['Hash picks one bucket.'],
    languageNotes: [{ language: 'java', note: 'HashMap.' }, { language: 'python', note: 'dict.' }, { language: 'go', note: 'map.' }],
    reviewEvidence: { technical: true, editorial: true, ux: true, accessibility: true, note: 'Fixture.' },
    sections: [
      { id: 'c', stage: 'concept', navLabel: 'Concept', heading: 'Charge once, even when the webhook comes twice',
        body: ['A payment provider retries a webhook when your reply is lost.', 'The ID tells you which bucket to check.'],
        visualBeside: true, visual: story, visualTranscript: ['evt_41 goes to bucket 1.', 'evt_86 goes to bucket 2.', 'The retry finds evt_86.'] },
      { id: 'h', stage: 'how', navLabel: 'How it works', heading: 'Hash, pick a bucket, compare', visualBeside: true,
        body: ['Hash the key.', 'Bucket = hash mod 4.', 'A collision shares a bucket.', 'Compare with equals.', 'Equal keys, equal hashes.'],
        visual: { type: 'storyboard', assetPath: '/content/put-get.svg', alt: 'Put and get.', storyboard: { frames: [{ ms: 0 }, { ms: 1000 }], legend: [{ mark: 'walker', text: 'the entry being compared' }] } },
        visualTranscript: ['a', 'b', 'c'] },
      { id: 'r', stage: 'how', navLabel: 'Resizing', heading: 'When it gets full, it doubles', body: ['Past 3/4 full, every key moves.'],
        callout: { type: 'key-idea', title: 'The rule', text: 'Equal keys must give equal hashes.' },
        visual: { type: 'storyboard', assetPath: '/content/resize.svg', alt: 'Resize.', storyboard: { frames: [{ ms: 0 }, { ms: 1100 }] } },
        visualTranscript: ['x', 'y', 'z'] },
      { id: 'cost', stage: 'cost', navLabel: 'Operations and cost', heading: 'What each operation costs', body: ['Average and worst case.'],
        table: { columns: ['Operation', 'Average', 'Worst case', 'Why'], rows: [['Get', 'O(1)', 'O(n)', 'One bucket; all keys in one bucket at worst.']] } },
      { id: 'code', stage: 'code', navLabel: 'Code', heading: 'The dedupe step', body: ['Same test in each language.'],
        codeTabs: languageTabs('WebhookDedupe', 'webhook_dedupe', ['PASSED: java\n', 'PASSED: python\n', 'PASSED: go\n']) },
      { id: 'use', stage: 'use', navLabel: 'When to use', heading: 'Exact matches, yes', body: ['Read the signal.'],
        table: { columns: ['Kind', 'Signal', 'Reach for', 'Example'], rows: [['<span class="kind kind-use">Use this</span>', 'Seen this ID?', 'Hash set', 'Webhook dedupe.']] } },
      { id: 'm', stage: 'debug', navLabel: 'Common mistakes', heading: 'Bugs that pass a quick test', body: ['Real runs.'], pairLabels: { broken: 'Broken', fixed: 'Fixed' },
        pairs: [{ n: 1, title: 'equals without hashCode', problem: ['<strong>The check:</strong> the retry must be found.'],
          broken: { body: ['Two buckets.'], codeTabs: languageTabs('SameEventTwoKeys', 'same_event_two_keys', [
            'retry found: false\nFAILED: the retry would be charged again\n',
            "Traceback (most recent call last):\n  File \"/lab/same_event_two_keys.py\", line 14, in <module>\nTypeError: cannot use 'EventKey' as a dict key (unhashable type: 'EventKey')\n",
            'retry found: false\nFAILED: the retry would be charged again\n',
          ], [0, 1, 0]) },
          fixed: { title: 'Hash the same fields', body: ['One bucket.'], codeTabs: languageTabs('SameEventOneKey', 'same_event_one_key', [
            'retry found: true\nPASSED\n', 'retry found: True\nPASSED\n', 'retry found: true\nPASSED\n']) } }] },
      { id: 'ladder', stage: 'practice', navLabel: 'Practice', heading: 'Practice ladder', body: ['Easy to hard.'],
        ladder: [
          { questionId: 'core-ds-contains-duplicate', problemId: 'core-ds-contains-duplicate', title: 'Contains Duplicate', difficulty: 'Beginner', newIdea: 'New: a set answers <em>seen before?</em>' },
          { questionId: 'core-ds-longest-consecutive', problemId: 'algorithmic-longest-consecutive-sequence', title: 'Longest Consecutive Sequence', difficulty: 'Intermediate', newIdea: 'New: look up neighbors.' },
        ] },
      { id: 'cheat', stage: 'keep', navLabel: 'Cheat sheet', heading: 'Hash Tables', sidebar: true, body: ['<strong>In 30 seconds:</strong> hash, bucket, compare.'],
        cheatSheet: {
          codeTabs: [
            { id: 'java', title: 'From WebhookDedupe.java', language: 'java', source: 'String earlier = processed.get(eventId);' },
            { id: 'python', title: 'From webhook_dedupe.py', language: 'python', source: 'earlier = self.processed.get(event_id)' },
            { id: 'go', title: 'From webhook_dedupe.go', language: 'go', source: 'if earlier, ok := d.processed[eventID]; ok {' },
          ],
          tiles: [{ title: 'What does one lookup do?', points: ['Hash', 'Compare'] }, { title: 'Traps to avoid', points: ['a', 'b'] }], facts: ['16 buckets, load factor 0.75'] } },
      { id: 'refs', stage: 'references', navLabel: 'References', heading: 'References', body: ['Checked.'] },
    ],
  });

  const checks: ResolvedPatternCheck[] = [
    { id: 'core-ds-hash-collisions', category: 'complexity', prompt: 'How do chaining and open addressing handle collisions?', answer: 'Chains or probing.', explanation: ['Both compare with equality.'] },
  ];

  let fixture: ComponentFixture<FoundationLessonShell>;
  let storageDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    });
    await TestBed.configureTestingModule({ imports: [FoundationLessonShell], providers: [provideRouter([])] }).compileComponents();
    TestBed.inject(ReferenceLanguageService).selected.set('java');
    fixture = TestBed.createComponent(FoundationLessonShell);
    fixture.componentRef.setInput('lesson', concept());
    fixture.componentRef.setInput('checks', checks);
    fixture.componentRef.setInput('practiceItems', []);
    fixture.componentRef.setInput('pathId', 'learn');
    fixture.componentRef.setInput('courseId', 'core-data-structures');
    fixture.detectChanges();
  });

  afterEach(() => {
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(window, 'localStorage');
  });

  it('defines the ten concept stages, with the checks fixed in Check yourself', () => {
    expect(LESSON_PATTERNS['concept-v1'].stages.map((stage) => stage.id)).toEqual([
      'concept', 'how', 'cost', 'code', 'use', 'debug', 'practice', 'check', 'keep', 'references',
    ]);
    expect(LESSON_PATTERNS['concept-v1'].slots).toEqual({ scenario: null, mistakes: null, interview: null, prove: 'check', keep: null });
  });

  it('renders the stages in order, Check yourself without an authored section, and no scenario, pitfall or interview blocks', () => {
    const root: HTMLElement = fixture.nativeElement;
    expect(Array.from(root.querySelectorAll('.lesson-stage')).map((stage) => (stage as HTMLElement).dataset['sidebarLabel'])).toEqual([
      'Concept', 'How it works', 'Operations and cost', 'Code', 'When to use', 'Common mistakes', 'Practice',
      'Check yourself', 'Cheat sheet', 'References',
    ]);
    expect(root.querySelector('.system')?.classList).toContain('algo-lesson');
    expect(root.querySelector('#lesson-scenario')).toBeNull();
    expect(root.querySelector('#foundation-pitfalls')).toBeNull();
    expect(root.querySelector('#lesson-interview-answer')).toBeNull();
    expect(root.querySelector('#lesson-takeaways')).toBeNull();
    expect(root.querySelector('#stage-check #foundation-understand app-pattern-understanding-checks')).not.toBeNull();
    expect(root.querySelector('#stage-check #foundation-try')).not.toBeNull();
    // The authored ladder replaces the generic More practice grid.
    expect(root.querySelector('#foundation-practice')).toBeNull();
  });

  it('tells the Concept as a story: the drawing with paragraphs beside it and a sticky Pause bar, no code or table', () => {
    const section = fixture.nativeElement.querySelector('#c') as HTMLElement;
    // The stage title already says Concept, so there is no repeated label line; the heading stays visible.
    expect(section.querySelector('.section-label')).toBeNull();
    expect(section.querySelector('h2')?.textContent).toBe('Charge once, even when the webhook comes twice');
    expect(section.querySelector('h2')?.classList).not.toContain('visually-hidden');
    const board = section.querySelector('app-lesson-storyboard') as HTMLElement;
    expect(board.classList).toContain('storyboard-story');
    expect(board.classList).toContain('storyboard-has-beside');
    expect(board.querySelector('.storyboard-canvas img')?.getAttribute('src')).toBe('/content/story.svg');
    expect(Array.from(board.querySelectorAll('.storyboard-beside .prose')).map((p) => p.textContent)).toEqual([
      'A payment provider retries a webhook when your reply is lost.', 'The ID tells you which bucket to check.',
    ]);
    expect(board.querySelector('.storyboard-beside .beside-points')).toBeNull();
    expect(board.querySelector('.storyboard-bar .storyboard-toggle')?.textContent).toContain('Pause');
    expect(section.querySelector('.foundation-code, .run-console, .lesson-table')).toBeNull();
    expect(section.querySelectorAll('.visual-transcript li').length).toBe(3);
  });

  it('animates How it works beside its points, then the resize with its rule under the drawing', () => {
    const how = fixture.nativeElement.querySelector('#h') as HTMLElement;
    const board = how.querySelector('app-lesson-storyboard') as HTMLElement;
    expect(board.classList).not.toContain('storyboard-story');
    expect(Array.from(board.querySelectorAll('.storyboard-beside .beside-points li')).map((li) => li.textContent)).toEqual([
      'Hash the key.', 'Bucket = hash mod 4.', 'A collision shares a bucket.', 'Compare with equals.', 'Equal keys, equal hashes.',
    ]);
    expect(board.querySelector('.storyboard-legend')?.textContent?.trim()).toBe('the entry being compared');
    const resize = fixture.nativeElement.querySelector('#r') as HTMLElement;
    expect(resize.querySelector('.section-label')?.textContent).toBe('How it worksResizing');
    expect(resize.querySelector('app-lesson-storyboard')?.nextElementSibling?.classList).toContain('storyboard-callout');
  });

  it('shows the cost table, then every code block as Java | Python | Go tabs with consoles that switch together', () => {
    const root: HTMLElement = fixture.nativeElement;
    const headers = Array.from(root.querySelectorAll('#cost .lesson-table th[scope="col"]')).map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Operation', 'Average', 'Worst case', 'Why']);
    expect(root.querySelector('#code .run-console .run-command')?.textContent).toBe('java WebhookDedupe.java');
    (root.querySelector('#code-lang-go') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('#code .foundation-code header span')?.textContent).toBe('webhook_dedupe.go');
    expect(root.querySelector('#m-1-lang-panel .d-file.d-l > span')?.textContent).toBe('same_event_two_keys.go');
    expect(root.querySelector('#cheat-template-lang-panel .foundation-code header span')?.textContent).toBe('From webhook_dedupe.go');
    TestBed.inject(ReferenceLanguageService).select('python');
    fixture.detectChanges();
    const broken = Array.from(root.querySelectorAll('#m-1-lang-panel .d-out.d-l .run-line')) as HTMLElement[];
    expect(broken.at(-1)?.textContent).toBe("TypeError: cannot use 'EventKey' as a dict key (unhashable type: 'EventKey')");
    expect(broken.every((line) => line.classList.contains('run-line-error'))).toBe(true);
  });

  it('links each practice rung to its problem page in this course, easy to hard', () => {
    const links = Array.from(fixture.nativeElement.querySelectorAll('#ladder .problem-ladder a')) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/learn/core-data-structures/core-ds-contains-duplicate',
      '/learn/core-data-structures/core-ds-longest-consecutive',
    ]);
    expect(fixture.nativeElement.querySelector('#ladder .problem-ladder li p em')?.textContent).toBe('seen before?');
  });
});
