import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CodingSolutionTabs } from './coding-solution-tabs';

describe('CodingSolutionTabs practice drafts', () => {
  it('submits the active draft to the Two Sum preview without editing code or revealing references', async () => {
    await TestBed.configureTestingModule({ imports: [CodingSolutionTabs] }).compileComponents();
    const fixture = TestBed.createComponent(CodingSolutionTabs);
    fixture.componentRef.setInput('solutions', [
      { language: 'python', title: 'Reference', source: 'SECRET_REFERENCE' },
    ]);
    fixture.componentRef.setInput('initialLanguage', 'python');
    fixture.componentRef.setInput('showReferences', false);
    fixture.componentRef.setInput('tutorProblem', {
      id: 'algorithmic-two-sum',
      title: 'Two Sum',
      prompt: 'Find distinct indices.',
    });
    fixture.detectChanges();
    const editor = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = 'my own Python draft';
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const question = fixture.nativeElement.querySelector(
      'app-editor-tutor textarea',
    ) as HTMLTextAreaElement;
    question.value = 'Can you help explain my approach?';
    question.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('app-editor-tutor form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(editor.value).toBe('my own Python draft');
    expect(fixture.nativeElement.querySelector('app-editor-tutor code').textContent).toBe(
      editor.value,
    );
    expect(fixture.nativeElement.textContent).not.toContain('SECRET_REFERENCE');
    expect(fixture.nativeElement.textContent).not.toContain('Run examples');
    fixture.componentRef.setInput('tutorProblem', {
      id: 'other-problem',
      title: 'Other',
      prompt: 'Other contract.',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-editor-tutor')).toBeNull();
  });

  it('opens the requested language and keeps learner language changes and drafts', async () => {
    await TestBed.configureTestingModule({ imports: [CodingSolutionTabs] }).compileComponents();
    const fixture = TestBed.createComponent(CodingSolutionTabs);
    fixture.componentRef.setInput('solutions', [
      { language: 'python', title: 'Python', source: 'pass' },
    ]);
    fixture.componentRef.setInput('initialLanguage', 'python');
    fixture.componentRef.setInput('practiceStarters', {
      python: 'python starter',
      java: 'java starter',
    });
    fixture.detectChanges();
    const editor = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const language = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(language.value).toBe('python');
    expect(editor.value).toBe('python starter');
    editor.value = 'my Python solution';
    editor.dispatchEvent(new Event('input'));
    language.value = 'java';
    language.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(language.value).toBe('java');
    language.value = 'python';
    language.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(editor.value).toBe('my Python solution');
  });
  it('uses problem starters and preserves edits when languages change', async () => {
    await TestBed.configureTestingModule({ imports: [CodingSolutionTabs] }).compileComponents();
    const fixture = TestBed.createComponent(CodingSolutionTabs);
    fixture.componentRef.setInput('solutions', [
      { language: 'java', title: 'Java', source: 'return;' },
      { language: 'python', title: 'Python', source: 'return' },
      { language: 'go', title: 'Go', source: 'return' },
    ]);
    fixture.componentRef.setInput('practiceStarters', {
      java: 'java starter',
      python: 'python starter',
      go: 'go starter',
    });
    fixture.detectChanges();

    const editor = () => fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const language = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(editor().value).toBe('java starter');

    editor().value = 'my java draft';
    editor().dispatchEvent(new Event('input'));
    language.value = 'python';
    language.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(editor().value).toBe('python starter');

    editor().value = 'my python draft';
    editor().dispatchEvent(new Event('input'));
    language.value = 'java';
    language.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(editor().value).toBe('my java draft');

    language.value = 'python';
    language.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(editor().value).toBe('my python draft');
  });

  it('keeps reference languages out of an independent editor until explicitly revealed', async () => {
    await TestBed.configureTestingModule({ imports: [CodingSolutionTabs] }).compileComponents();
    const fixture = TestBed.createComponent(CodingSolutionTabs);
    fixture.componentRef.setInput('solutions', [
      { language: 'java', title: 'Java', source: 'return;' },
      { language: 'python', title: 'Python', source: 'return' },
      { language: 'go', title: 'Go', source: 'return' },
    ]);
    fixture.componentRef.setInput('showReferences', false);
    fixture.detectChanges();

    const tabLabels = [...fixture.nativeElement.querySelectorAll('[role="tab"]')].map((tab) =>
      tab.textContent.trim(),
    );
    expect(tabLabels).toEqual([]);
    expect(fixture.nativeElement.querySelector('textarea')).toBeTruthy();
  });

  it('sizes editable and reference code to content within readable bounds', async () => {
    await TestBed.configureTestingModule({ imports: [CodingSolutionTabs] }).compileComponents();
    const fixture = TestBed.createComponent(CodingSolutionTabs);
    fixture.componentRef.setInput('solutions', [
      { language: 'python', title: 'Short example', source: 'one\ntwo\nthree' },
    ]);
    fixture.componentRef.setInput('practiceStarters', { java: 'one\ntwo' });
    fixture.detectChanges();

    const editor = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(editor.rows).toBe(6);

    editor.value = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n');
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(editor.rows).toBe(20);

    fixture.componentRef.setInput('showPractice', false);
    fixture.detectChanges();
    const reference = fixture.nativeElement.querySelector('pre') as HTMLPreElement;
    expect(reference.style.getPropertyValue('--visible-code-rows')).toBe('3');

    fixture.componentRef.setInput('solutions', [
      {
        language: 'python',
        title: 'Long example',
        source: Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n'),
      },
    ]);
    fixture.detectChanges();
    expect(reference.style.getPropertyValue('--visible-code-rows')).toBe('18');
  });
});
