import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import {
  CourseContent,
  DsaProblemNavigationLink,
  DsaProblemV2,
  InterviewQuestion,
} from '../../content/content.models';
import { ContentService } from '../../content/content.service';
import { Question } from './question';

type CanonicalRouteCase = {
  problemId: string;
  title: string;
  courseId: string;
  previous?: DsaProblemNavigationLink;
  next?: DsaProblemNavigationLink;
};

const containsDuplicate: DsaProblemNavigationLink = {
  problemId: 'core-ds-contains-duplicate',
  title: 'Contains Duplicate',
  path: 'learn',
  courseId: 'core-data-structures',
  questionId: 'core-ds-contains-duplicate',
};
const twoSum: DsaProblemNavigationLink = {
  problemId: 'algorithmic-two-sum',
  title: 'Two Sum',
  path: 'learn',
  courseId: 'algorithmic-patterns',
  questionId: 'algorithmic-two-sum',
};
const firstUnique: DsaProblemNavigationLink = {
  problemId: 'algorithmic-first-unique-character',
  title: 'First Unique Character',
  path: 'learn',
  courseId: 'algorithmic-patterns',
  questionId: 'algorithmic-first-unique-character',
};

const routeCases: CanonicalRouteCase[] = [
  { ...containsDuplicate, previous: undefined, next: twoSum },
  { ...twoSum, previous: containsDuplicate, next: firstUnique },
  { ...firstUnique, previous: twoSum, next: undefined },
];

function canonicalProblem(testCase: CanonicalRouteCase): DsaProblemV2 {
  const lineId = `${testCase.problemId}-line`;
  const fixtureId = `${testCase.problemId}-fixture`;
  return {
    schemaVersion: 'dsa-problem/v2',
    contentType: 'dsa-problem',
    id: testCase.problemId,
    aliases: [],
    title: testCase.title,
    description: `Practice ${testCase.title}.`,
    difficulty: 'Beginner',
    tags: ['Hashing'],
    languages: ['java', 'python', 'go'],
    variation: 'Hashing variation',
    invariantAdaptation: 'Retain only state justified by earlier input.',
    complexity: { time: 'O(n)', space: 'O(n)', why: 'Each input is visited once.' },
    contract: {
      entryPoints: { java: 'solve', python: 'solve', go: 'solve' },
      parameters: [{ name: 'values', type: 'integer[]', description: 'Input values.' }],
      returns: { type: 'integer', description: 'The computed result.' },
    },
    placements: [
      {
        path: 'learn',
        courseId: 'algorithmic-patterns',
        role: 'essential',
        lessonId: 'algorithmic-hashing-lookup',
      },
      {
        path: 'learn',
        courseId: testCase.courseId,
        role: 'practice',
        moduleId: 'practice-hashing',
        questionId: testCase.problemId,
      },
    ],
    navigation: {
      lesson: {
        path: 'learn',
        courseId: 'algorithmic-patterns',
        questionId: 'algorithmic-hashing-lookup',
        title: 'Hashing',
      },
      handsOnPatternId: 'algorithmic-patterns:hashing-lookup',
      previous: testCase.previous,
      next: testCase.next,
    },
    fixtures: [
      {
        id: fixtureId,
        label: 'Representative case',
        input: 'values = [1]',
        expectedOutput: '1',
        category: 'representative',
        explanation: 'A compact route-test fixture.',
        arguments: { values: [1] },
        expected: 1,
      },
    ],
    implementations: (['java', 'python', 'go'] as const).map((language) => ({
      language,
      title: `${language} solution`,
      lines: [{ id: lineId, text: 'return 1' }],
    })),
    trace: {
      schemaVersion: 'guided-trace/v1',
      id: `${testCase.problemId}-trace`,
      fixtureId,
      invariant: 'The result follows the current input.',
      legend: [{ state: 'resolved', label: 'Resolved' }],
      events: [
        {
          id: `${testCase.problemId}-return`,
          label: 'Return the result',
          phase: 'Resolve',
          timing: 'after',
          sourceAnchor: { java: lineId, python: lineId, go: lineId },
          what: 'Return the result.',
          why: 'The fixture is complete.',
          variables: [{ name: 'result', type: 'int', value: '1', changed: true }],
          rows: [{ id: 'values', label: 'Values', cells: [{ value: '1', states: ['resolved'] }] }],
          result: '1',
        },
      ],
    },
    practice: {
      statement: {
        prompt: `Solve ${testCase.title}.`,
        inputs: ['One integer array.'],
        output: 'One computed result.',
        constraints: ['At least one value is present.'],
        edgeCases: ['A one-value input is valid.'],
      },
      starters: { java: 'return 0;', python: 'return 0', go: 'return 0' },
      hints: ['Track the required state.'],
      approaches: [
        { title: 'Hashing', explanation: 'Retain useful prior state.', complexity: 'O(n)' },
      ],
      commonMistakes: ['Using state from a later input.'],
      checks: [{ kind: 'explain', prompt: 'What is retained?', expected: 'Earlier state.' }],
    },
  };
}

function courseFor(courseId: string): CourseContent {
  const questions: InterviewQuestion[] = routeCases
    .filter((testCase) => testCase.courseId === courseId)
    .map((testCase, index) => ({
      id: testCase.problemId,
      moduleId: 'practice-hashing',
      order: index + 1,
      title: testCase.title,
      difficulty: 'Beginner',
      tags: ['Hashing', 'Common Problem'],
      interviewAnswer: 'Use the canonical problem detail.',
      explanation: [],
      versionNotes: [],
      followUps: [],
      contentType: 'dsa-problem',
      canonicalProblemRef: { problemId: testCase.problemId },
      canonicalProblem: canonicalProblem(testCase),
    }));
  return {
    id: courseId,
    path: 'learn',
    title: 'Legacy host course',
    description: 'Canonical route test.',
    version: '1',
    modules: [
      { id: 'practice-hashing', order: 1, title: 'Legacy practice module', description: '' },
    ],
    questions,
  };
}

function linkWithText(root: HTMLElement, text: string): HTMLAnchorElement | undefined {
  return [...root.querySelectorAll<HTMLAnchorElement>('a')].find((link) =>
    link.textContent?.includes(text),
  );
}

describe('Question canonical DSA navigation', () => {
  const content = {
    getCatalog: vi.fn(() => of(routeCases.map(({ courseId, title }) => ({ id: courseId, title })))),
    getCourse: vi.fn((_: string, courseId: string) => of(courseFor(courseId))),
  };

  beforeEach(async () => {
    content.getCourse.mockClear();
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ContentService, useValue: content }],
    }).compileComponents();
  });

  it.each(routeCases)(
    'renders the complete framework and Hashing sequence for $title',
    async (testCase) => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/learn/${testCase.courseId}/${testCase.problemId}`, Question);
      const root = harness.routeNativeElement!;

      expect(root.textContent).toContain('Inputs');
      expect(root.textContent).toContain('Examples and expected outputs');
      expect(root.textContent).toContain('Practice independently');
      expect(root.textContent).toContain('Guided explanation');
      expect(root.textContent).not.toContain('Legacy practice module');

      expect(linkWithText(root, 'Hands-On DSA')?.getAttribute('href')).toBe(
        '/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing-lookup',
      );
      expect(linkWithText(root, 'Review Hashing concept')?.getAttribute('href')).toBe(
        '/learn/algorithmic-patterns/algorithmic-hashing-lookup',
      );

      const previous = root.querySelector<HTMLAnchorElement>(
        '.question-inner-navigation .previous',
      );
      const next = root.querySelector<HTMLAnchorElement>('.question-inner-navigation .next');
      if (testCase.previous) {
        expect(previous?.textContent).toContain(testCase.previous.title);
        expect(previous?.getAttribute('href')).toBe(
          `/learn/${testCase.previous.courseId}/${testCase.previous.questionId}`,
        );
      } else {
        expect(previous).toBeNull();
      }
      if (testCase.next) {
        expect(next?.textContent).toContain(testCase.next.title);
        expect(next?.getAttribute('href')).toBe(
          `/learn/${testCase.next.courseId}/${testCase.next.questionId}`,
        );
      } else {
        expect(next).toBeNull();
      }
      expect(linkWithText(root, 'All Hashing problems')?.getAttribute('href')).toBe(
        '/learn/hands-on-dsa?pattern=algorithmic-patterns:hashing-lookup',
      );
    },
  );
});
