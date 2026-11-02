import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HeaderHint } from './header-hint';

@Component({
  imports: [HeaderHint],
  template: `
    <p id="help">Existing help</p>
    <button type="button" aria-describedby="help" [appHeaderHint]="text()">Item</button>
  `,
})
class Host {
  readonly text = signal('First hint.');
}

describe('HeaderHint', () => {
  it('keeps an existing aria-describedby, follows its text and falls back when :focus-visible is unsupported', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const button = element.querySelector('button') as HTMLButtonElement;
    const ids = button.getAttribute('aria-describedby')!.split(' ');
    expect(ids[0]).toBe('help');
    expect(ids.length).toBe(2);
    const hint = element.querySelector(`#${ids[1]}`) as HTMLElement;
    expect(hint.textContent).toBe('First hint.');

    fixture.componentInstance.text.set('Second hint.');
    fixture.detectChanges();
    expect(hint.textContent).toBe('Second hint.');

    vi.spyOn(button, 'matches').mockImplementation(() => {
      throw new SyntaxError('unsupported selector');
    });
    button.dispatchEvent(new Event('focusin'));
    expect(hint.classList.contains('is-visible')).toBe(true);
    button.dispatchEvent(new Event('focusout'));
    expect(hint.classList.contains('is-visible')).toBe(false);
  });
});
