import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CodeCopyButton } from './code-copy-button';

describe('CodeCopyButton', () => {
  let fixture: ComponentFixture<CodeCopyButton>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await TestBed.configureTestingModule({ imports: [CodeCopyButton] }).compileComponents();
    fixture = TestBed.createComponent(CodeCopyButton);
    fixture.componentRef.setInput('code', 'return answer;');
    fixture.detectChanges();
  });

  it('copies raw source and announces success', async () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('return answer;');
    expect(button.textContent).toContain('Copied');
    expect(button.getAttribute('aria-label')).toBe('Code copied to clipboard');
    expect(fixture.nativeElement.querySelector('.copy-status').textContent).toContain(
      'Code copied to clipboard.',
    );
  });
});
