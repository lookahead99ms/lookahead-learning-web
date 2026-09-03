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

    expect(link.querySelector('strong')?.textContent).toBe('Interview questions');
    expect(link.querySelector('span')?.textContent).toBe('3');
    expect(link.getAttribute('aria-label')).toBe('Open all 3 interview questions for this topic');
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
});
