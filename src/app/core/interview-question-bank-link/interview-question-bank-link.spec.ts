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
    fixture.detectChanges();
  });

  it('links to the complete module question bank with its recoverable count', () => {
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;

    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toContain(
      'Review all 13 interview questions',
    );
    expect(link.getAttribute('href')).toBe(
      '/interview-questions?path=learn&course=solid-design-patterns&module=creational-behavioral-patterns',
    );
    expect(link.getAttribute('aria-label')).toBe('Open all 13 interview questions for this topic');
  });
});
