import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { GithubPrompt } from './github-account';
import { GithubAccessDialog } from './github-access-dialog';

/** The dialog opens and closes with the prompt; the browser's dialog methods are stubbed (jsdom has none). */
describe('GithubAccessDialog (DLV-969, owner 2026-11-06)', () => {
  function render() {
    const open = signal<string | null>(null);
    const close = vi.fn((outcome: 'saved' | 'later') => open.set(null));
    const update = vi.fn(async () => ({ displayName: 'S', username: 's' }));
    TestBed.configureTestingModule({
      imports: [GithubAccessDialog],
      providers: [
        provideRouter([]),
        { provide: GithubPrompt, useValue: { open, close } },
        { provide: StudyPlanAccount, useValue: { loadProfile: async () => ({ displayName: 'S', username: 's', links: null }), updateProfileLinks: update } },
      ],
    });
    const shown: string[] = [];
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); shown.push('showModal'); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); shown.push('close'); this.dispatchEvent(new Event('close')); };
    const fixture = TestBed.createComponent(GithubAccessDialog);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, open, close, update, shown };
  }

  it('is absent until the prompt opens it, then shows the card as a modal dialog', () => {
    const { fixture, root, open, shown } = render();
    expect(root.querySelector('dialog')).toBeNull();
    open.set('staff-1');
    fixture.detectChanges();
    const dialog = root.querySelector('dialog');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('github-card-title');
    expect(dialog?.querySelector('app-github-access-card h2')?.textContent).toBe('Your GitHub account');
    expect(shown).toEqual(['showModal']);
  });

  it('Not now and Escape close it for this sign-in; Save closes it as saved', async () => {
    const { fixture, root, open, close } = render();
    open.set('staff-1');
    fixture.detectChanges();
    ([...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Not now') as HTMLButtonElement).click();
    expect(close).toHaveBeenCalledWith('later');
    close.mockClear();
    fixture.detectChanges();
    open.set('staff-1');
    fixture.detectChanges();
    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(close).toHaveBeenCalledWith('later');
    close.mockClear();
    fixture.detectChanges();
    open.set('staff-1');
    fixture.detectChanges();
    // The card's own spec covers typing and saving; here the card reports saved and the dialog closes as saved.
    const card = fixture.debugElement.query((node) => node.name === 'app-github-access-card').componentInstance;
    card.finished.emit('saved');
    fixture.detectChanges();
    expect(close).toHaveBeenCalledWith('saved');
  });
});
