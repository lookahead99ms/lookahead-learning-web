import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ContentRecovery, recoveryKind } from './content-recovery';

describe('Content recovery', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ContentRecovery], providers: [provideRouter([])] });
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  });
  it('preserves query and fragment on the previous in-app destination', () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'currentNavigation').mockReturnValue({previousNavigation: {finalUrl: router.parseUrl('/search?q=queues#results')}} as never);
    const fixture = TestBed.createComponent(ContentRecovery);
    fixture.detectChanges();
    const back = Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).find(link => link.textContent === 'Go back');
    expect(back?.getAttribute('href')).toBe('/search?q=queues#results');
  });
  it('uses status and announced metadata without guessing commercial or publication reasons', () => {
    expect(recoveryKind({ status: 401 })).toBe('sign-in');
    expect(recoveryKind({ status: 403 })).toBe('locked');
    expect(recoveryKind({ status: 404 })).toBe('missing');
    expect(recoveryKind({ status: 404 }, { planned: true })).toBe('planned');
    for (const error of [{ status: 0 }, { status: 500 }, new Error('Pro required')])
      expect(recoveryKind(error)).toBe('temporary');
  });
  it('renders only metadata and decorative placeholders, with safe account return and dismiss/reopen', async () => {
    const f = TestBed.createComponent(ContentRecovery);
    f.componentRef.setInput('kind', 'locked');
    f.componentRef.setInput('preview', { title: 'Public lesson title', premium: true });
    f.componentRef.setInput('destination', '/grow/sample/lesson?mode=review#example');
    f.detectChanges();
    await f.whenStable();
    const root = f.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Unlock this premium content');
    expect(root.textContent).not.toContain('Pro access');
    expect(root.querySelector('.locked-preview')?.textContent?.trim()).toBe('');
    expect(root.querySelector('.locked-preview')?.getAttribute('aria-hidden')).toBe('true');
    const link = root.querySelector<HTMLAnchorElement>('dialog a.primary-action')!;
    expect(link.getAttribute('href')).toBe(
      '/account?returnTo=%2Fgrow%2Fsample%2Flesson%3Fmode%3Dreview%23example',
    );
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    root.querySelector<HTMLButtonElement>('.close-action')!.click();
    f.detectChanges();
    expect(dialog.open).toBe(false);
    root.querySelector<HTMLButtonElement>('.locked-note button')!.click();
    f.detectChanges();
    expect(dialog.open).toBe(true);
    const escape = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(escape);
    f.detectChanges();
    expect(dialog.open).toBe(false);
    expect(escape.defaultPrevented).toBe(true);
  });
  it('keeps generic denials neutral and prevents external return destinations', async () => {
    const f = TestBed.createComponent(ContentRecovery);
    f.componentRef.setInput('kind', 'locked');
    f.componentRef.setInput('destination', '//evil.test/lesson');
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('Your account can’t open this content');
    expect(f.nativeElement.textContent).not.toContain('premium');
    expect(f.nativeElement.querySelector('dialog a.primary-action').getAttribute('href')).toBe(
      '/account?returnTo=%2F',
    );
  });
  it('retries a temporary failure and never offers payment to resolve it', () => {
    const f = TestBed.createComponent(ContentRecovery);
    const retry = vi.fn();
    f.componentInstance.retry.subscribe(retry);
    f.detectChanges();
    f.nativeElement.querySelector('button.primary-action').click();
    expect(retry).toHaveBeenCalledOnce();
    expect(f.nativeElement.querySelector('dialog')).toBeNull();
    expect(f.nativeElement.textContent).not.toMatch(/purchase|premium|Pro/);
  });
  it('offers exploration without promising unimplemented email notifications', () => {
    const f = TestBed.createComponent(ContentRecovery);
    f.componentRef.setInput('kind', 'planned');
    f.detectChanges();
    expect(f.nativeElement.querySelector('a.primary-action').getAttribute('href')).toBe('/search');
    expect(f.nativeElement.textContent).not.toMatch(/email|notify/);
  });
});
