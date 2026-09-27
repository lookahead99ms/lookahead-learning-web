import { Component, input } from '@angular/core';
import { PatternProblemWorkbench } from '../pattern-problem-workbench/pattern-problem-workbench';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PatternLessonV1 } from '../../content/content.models';
import { PatternLessonShell } from './pattern-lesson-shell';

@Component({ selector: 'app-pattern-problem-workbench', template: '' })
class WorkbenchStub { readonly problems = input<unknown[]>([]); }

function sampleLesson(): PatternLessonV1 {
  return {
    id: 'sample-pattern', moduleId: 'sample', order: 1, title: 'Sample pattern',
    difficulty: 'Beginner', tags: [], contentType: 'theory', schemaVersion: 'pattern-lesson/v1',
    summary: 'A sample definition.', interviewAnswer: 'Sample answer.', explanation: [], versionNotes: [], followUps: [],
    learningOutcomes: ['Trace a small input.'],
    memoryAnchor: { phrase: 'Keep the rule.', mentalModel: 'Remember earlier work.', retrievalCue: 'What stays true?' },
    interviewRecall: { prompt: 'Explain the rule.', answerFramework: ['Name the stored state.'] },
    definition: { heading: 'Definition', body: ['A detailed definition.'], maintainedState: 'Earlier values.' },
    motivation: { heading: 'Motivation', body: ['Avoid repeated work.'], avoidedWork: 'Repeated scans.' },
    recognition: { heading: 'Recognize', body: [], signals: [], falseFriends: [] },
    model: { heading: 'Model', state: 'Earlier values.', invariant: 'No values are lost.', decisionRule: 'Remember.', proof: 'Each is visited.' },
    variations: [], template: { heading: 'Implementation', introduction: [], pseudocode: { language: 'pseudocode', title: 'Template', lines: [] }, implementations: [] },
    conceptVisual: { heading: 'Visual', body: [], visual: { type: 'diagram', assetPath: '/sample.svg', alt: 'Sample diagram' }, transcript: [] },
    complexity: { time: 'O(n)', space: 'O(n)', note: 'One scan.', why: [], tradeoffs: [] },
    pitfalls: [], guidance: { useWhen: [], avoidWhen: [] }, workedExamples: [], essentialProblems: [], checks: [], practice: [],
    keyTakeaways: ['Keep the rule.'], languageNotes: [],
    reviewEvidence: { technical: true, editorial: true, ux: true, accessibility: true, note: 'Synthetic test fixture.' },
    beginnerGuide: { prerequisite: 'Know loops.', exampleTitle: 'One small input', language: 'python', code: 'print(2)', walkthrough: ['Start.', 'Compute.', 'Observe 2.'], try: 'Change the input.', answer: 'Observe the new result.', takeaways: ['Keep the rule.'], later: 'Read the details.' },
    learningFlow: { whyItMatters: 'Avoid doing the same work twice.', practice: { prompt: 'Try a new input.', hint: 'Start with the first value.', answer: 'Explain each update.' } },
  };
}

async function render(lesson: PatternLessonV1) {
  await TestBed.configureTestingModule({ imports: [PatternLessonShell], providers: [provideRouter([])] })
    .overrideComponent(PatternLessonShell, { remove: { imports: [PatternProblemWorkbench] }, add: { imports: [WorkbenchStub] } })
    .compileComponents();
  const fixture = TestBed.createComponent(PatternLessonShell);
  for (const [name, value] of Object.entries({ lesson, checks: [], practiceItems: [], pathId: 'learn', courseId: 'sample', practicePatternId: 'sample' })) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture;
}

describe('pattern beginner teaching flow', () => {
  it('keeps the course return unit separate from the review question module', async () => {
    const fixture = await render(sampleLesson());
    fixture.componentRef.setInput('questionModuleId', 'sample-checks');
    fixture.componentRef.setInput('returnUnit', 'sample-unit');
    fixture.componentRef.setInput('questionCount', 3);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('a[href*="interview-questions"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('module=sample-checks');
    expect(link.getAttribute('href')).toContain('unit=sample-unit');
  });

  it('places definition and outcomes before the example, with one reminder before checks', async () => {
    const fixture = await render(sampleLesson());
    const root: HTMLElement = fixture.nativeElement;
    const sections = Array.from(root.querySelectorAll('section[id]')).map(node => node.id);
    expect(sections.indexOf('pattern-start')).toBeLessThan(sections.indexOf('pattern-purpose'));
    expect(sections.indexOf('pattern-purpose')).toBeLessThan(sections.indexOf('pattern-first-example'));
    expect(sections.indexOf('pattern-first-example')).toBeLessThan(sections.indexOf('pattern-template'));
    expect(sections.indexOf('pattern-remember')).toBeLessThan(sections.indexOf('pattern-pitfalls'));
    expect(sections.indexOf('pattern-understand')).toBeLessThan(sections.indexOf('pattern-independent-practice'));
    expect(root.querySelectorAll('#pattern-takeaways-heading').length).toBe(1);
    expect(root.querySelector('.memory-anchor')).toBeNull();
    expect(root.querySelector('#pattern-what')?.textContent).toContain('A detailed definition.');
  });

  it('keeps practice hints and answers concealed until the native disclosure is opened', async () => {
    const fixture = await render(sampleLesson());
    const root: HTMLElement = fixture.nativeElement;
    const details = Array.from(root.querySelectorAll<HTMLDetailsElement>('#pattern-independent-practice details'));
    expect(details.length).toBe(3);
    expect(details.every(detail => !detail.open)).toBe(true);
    details[1].open = true;
    expect(details[1].textContent).toContain('Explain each update.');
    expect(root.querySelector('button')?.textContent).not.toBe('Run');
  });

  it('preserves the existing introduction for lessons without the optional flow', async () => {
    const lesson = sampleLesson();
    delete lesson.learningFlow;
    delete lesson.beginnerGuide;
    const fixture = await render(lesson);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.memory-anchor')).not.toBeNull();
    expect(root.querySelector('#pattern-start')).toBeNull();
    expect(root.querySelector('#pattern-independent-practice')).toBeNull();
    expect(root.querySelector('#pattern-template')).not.toBeNull();
  });
});
