import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CourseContent, InterviewQuestion } from '../../content/content.models';
import { CourseLearningMap } from './course-learning-map';

function question(id: string, order: number): InterviewQuestion {
  return {
    id,
    moduleId: 'question-module',
    order,
    title: `Question ${order}`,
    difficulty: 'Intermediate',
    tags: ['Testing'],
    interviewAnswer: 'Answer.',
    explanation: ['Explanation.'],
    versionNotes: [],
    followUps: [],
    contentType: 'q-and-a',
    practiceFormat: 'explain',
  };
}

const course: CourseContent = {
  id: 'course',
  path: 'learn',
  title: 'Course',
  description: 'Course description.',
  version: '1',
  layout: 'learning-map',
  modules: [
    { id: 'theory-module', order: 1, title: 'Theory', description: 'Theory.' },
    { id: 'question-module', order: 2, title: 'Questions', description: 'Questions.' },
  ],
  questions: [
    {
      ...question('lesson', 1),
      moduleId: 'theory-module',
      title: 'Lesson',
      contentType: 'theory',
      schemaVersion: 'foundation-lesson/v1',
      sections: [{ id: 'model', heading: 'Model', body: ['Body.'] }],
    },
    question('one', 1),
    question('two', 2),
    question('three', 3),
  ],
};

describe('CourseLearningMap', () => {
  let fixture: ComponentFixture<CourseLearningMap>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseLearningMap],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CourseLearningMap);
    fixture.componentRef.setInput('course', course);
    fixture.componentRef.setInput('pathId', 'learn');
    fixture.componentRef.setInput('courseId', 'course');
    fixture.componentRef.setInput('units', [
      {
        id: 'unit',
        title: 'Unit',
        description: 'Unit description.',
        theoryModuleId: 'theory-module',
        questionModuleId: 'question-module',
      },
    ]);
    fixture.detectChanges();
  });

  it('keeps a visible, counted route to every mapped question bank', () => {
    const link = fixture.nativeElement.querySelector(
      'app-interview-question-bank-link a',
    ) as HTMLAnchorElement;

    expect(link.querySelector('strong')?.textContent).toBe('Review questions');
    expect(link.querySelector('span')?.textContent).toBe('3');
    expect(link.getAttribute('aria-label')).toBe('Review questions for this topic: 3 questions');
    expect(link.getAttribute('href')).toBe(
      '/interview-questions?path=learn&course=course&module=question-module',
    );
  });

  it('uses a family-specific label for non-pattern subunits', () => {
    fixture.componentRef.setInput('units', [
      {
        id: 'practice-family',
        title: 'Practice family',
        description: 'Practice progressively.',
        theoryModuleId: 'theory-module',
        subUnitLabel: 'Practice track',
        subUnits: [
          {
            id: 'track',
            title: 'Track',
            description: 'Track description.',
            theoryModuleId: 'theory-module',
          },
        ],
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.learning-subunit-label').textContent.trim()).toBe(
      'Practice track 1',
    );
    expect(fixture.nativeElement.querySelector('[role="list"]').getAttribute('aria-label')).toBe(
      'Practice family practice tracks',
    );
  });

  it('routes Learn practice to the canonical filtered Hands-On DSA library', () => {
    fixture.componentRef.setInput('units', [
      {
        id: 'hashing-lookup',
        title: 'Hashing',
        description: 'Remember relationships.',
        theoryModuleId: 'theory-module',
        practiceModuleId: 'practice-hashing',
      },
    ]);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      '.learning-action.practice',
    ) as HTMLAnchorElement;
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Practice Hashing →');
    expect(link.getAttribute('href')).toBe('/learn/hands-on-dsa?pattern=course:hashing-lookup');
  });

  it('uses each nested learning-unit id for its canonical Hands-On DSA filter', () => {
    fixture.componentRef.setInput('courseId', 'algorithmic-patterns');
    fixture.componentRef.setInput('units', [
      {
        id: 'linked-lists',
        title: 'Linked Lists',
        description: 'Choose the list shape before selecting a traversal.',
        theoryModuleId: 'theory-module',
        subUnits: [
          {
            id: 'fast-slow-pointers',
            title: 'Fast/Slow Pointers',
            description: 'Use relative speed for cycles and midpoints.',
            theoryModuleId: 'theory-module',
            practiceModuleId: 'practice-fast-slow-pointers',
          },
          {
            id: 'list-reversal',
            title: 'List Reversal',
            description: 'Rewire edges while preserving reachability.',
            theoryModuleId: 'theory-module',
            practiceModuleId: 'practice-list-reversal',
          },
        ],
      },
    ]);
    fixture.detectChanges();

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.learning-subunit .learning-action.practice'),
    ) as HTMLAnchorElement[];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:fast-slow-pointers',
      '/learn/hands-on-dsa?pattern=algorithmic-patterns:list-reversal',
    ]);
  });

  it('routes question-bank practice to its dedicated module with a visible count', () => {
    const practiceQuestions = Array.from({ length: 4 }, (_, index) => ({
      ...question(`practice-${index + 1}`, index + 1),
      moduleId: 'practice-module',
      practiceFormat: 'solve' as const,
    }));
    fixture.componentRef.setInput('course', {
      ...course,
      modules: [
        ...course.modules,
        { id: 'practice-module', order: 3, title: 'Practice', description: 'Practice.' },
      ],
      questions: [...course.questions, ...practiceQuestions],
    });
    fixture.componentRef.setInput('units', [
      {
        id: 'streams',
        title: 'Streams',
        description: 'Build pipelines.',
        theoryModuleId: 'theory-module',
        questionModuleId: 'question-module',
        practiceModuleId: 'practice-module',
        practiceExperience: 'questionBank',
      },
    ]);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      '.learning-action.practice',
    ) as HTMLAnchorElement;
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Solve problems 4→');
    expect(link.getAttribute('href')).toBe('/learn/course/module/practice-module');
  });

  it('omits an empty question-bank practice action', () => {
    fixture.componentRef.setInput('course', {
      ...course,
      modules: [
        ...course.modules,
        { id: 'empty-practice', order: 3, title: 'Practice', description: 'Practice.' },
      ],
    });
    fixture.componentRef.setInput('units', [
      {
        id: 'empty',
        title: 'Empty practice',
        description: 'No published practice yet.',
        theoryModuleId: 'theory-module',
        practiceModuleId: 'empty-practice',
        practiceExperience: 'questionBank',
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.learning-action.practice')).toBeNull();
  });
});
