import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CodingSolutionTabs } from './coding-solution-tabs';

describe('CodingSolutionTabs practice drafts', () => {
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
});
