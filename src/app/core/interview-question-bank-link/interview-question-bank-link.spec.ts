import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InterviewQuestionBankLink } from './interview-question-bank-link';

describe('InterviewQuestionBankLink', () => {
  let fixture: ComponentFixture<InterviewQuestionBankLink>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InterviewQuestionBankLink],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(InterviewQuestionBankLink);
    fixture.componentRef.setInput('pathId', 'learn');
    fixture.componentRef.setInput('courseId', 'solid-design-patterns');
    fixture.componentRef.setInput('moduleId', 'creational-behavioral-patterns');
    fixture.componentRef.setInput('questionCount', 13);
    fixture.componentRef.setInput(
      'practiceItems',
      Array.from({ length: 13 }, (_, index) => ({
        id: `question-${index + 1}`,
        practiceFormat: 'explain' as const,
      })),
    );
    fixture.detectChanges();
  });

  it('links to the complete module question bank with its recoverable count', () => {
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;

    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toContain('Review all 13 questions');
    expect(link.textContent).not.toContain('→');
    expect(link.getAttribute('href')).toBe(
      '/interview-questions?path=learn&course=solid-design-patterns&module=creational-behavioral-patterns',
    );
    expect(link.getAttribute('aria-label')).toBe('Review questions for this topic: 13 questions');
  });

  it('uses a neutral label when only a compatibility count is available', () => {
    fixture.componentRef.setInput('practiceItems', []);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toContain('Browse all 13 practice items');
    expect(link.textContent).not.toContain('→');
  });

  it('does not render an action for a resolved empty topic', () => {
    fixture.componentRef.setInput('questionCount', 0);
    fixture.componentRef.setInput('practiceItems', []);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });
});
