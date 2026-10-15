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
    // DLV-209: premium content also offers the sample pricing page.
    const plans = root.querySelector<HTMLAnchorElement>('dialog a.plans-action')!;
    expect(plans.textContent?.trim()).toBe('See plans and pricing');
    expect(plans.getAttribute('href')).toBe('/pricing');
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
    expect(f.nativeElement.querySelector('a[href="/pricing"]')).toBeNull();
  });
  it('offers a signed-out visitor the home page plans next to Sign in (DLV-209)', async () => {
    const f = TestBed.createComponent(ContentRecovery);
    f.componentRef.setInput('kind', 'sign-in');
    f.detectChanges();
    await f.whenStable();
    const root = f.nativeElement as HTMLElement;
    const actions = [...root.querySelectorAll<HTMLAnchorElement>('dialog .recovery-actions a')];
    expect(actions.map((link) => link.textContent?.trim())).toEqual(['Sign in', 'See pricing']);
    // See pricing opens the home page and scrolls to its plans section.
    expect(actions[1].getAttribute('href')).toBe('/#pricing');
    const note = [...root.querySelectorAll<HTMLElement>('.locked-note .recovery-actions > *')];
    expect(note.map((action) => action.textContent?.trim())).toEqual([
      'Sign-in options',
      'See pricing',
    ]);
    expect(note[1].getAttribute('href')).toBe('/#pricing');
    // Not premium: no plans line.
    expect(root.querySelector('.plans-line')).toBeNull();
  });
  it('centres the main actions and puts Go back left and Home right (DLV-209)', async () => {
    const f = TestBed.createComponent(ContentRecovery);
    f.componentRef.setInput('kind', 'locked');
    f.componentRef.setInput('preview', { premium: true });
    f.componentRef.setInput('destination', '/grow/kafka-production/kafka-consumer-groups');
    f.detectChanges();
    await f.whenStable();
    const root = f.nativeElement as HTMLElement;
    for (const scope of ['.locked-note', 'dialog']) {
      const actions = root.querySelector(`${scope} .recovery-actions`)!;
      expect(actions.firstElementChild?.classList).toContain('primary-action');
      expect(actions.lastElementChild?.getAttribute('href')).toBe('/pricing');
    }
    const navs = [...root.querySelectorAll('nav.recovery-links')];
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      expect(nav.children).toHaveLength(2);
      expect(nav.firstElementChild?.textContent?.trim()).toBe('Go back');
      expect(nav.lastElementChild?.textContent?.trim()).toBe('Home');
      expect(nav.lastElementChild?.getAttribute('href')).toBe('/');
    }
    expect(navs[0].closest('dialog')).toBeNull();
    expect(navs[1].closest('dialog')).not.toBeNull();
  });
  it('tells a signed-in learner without access which plans include the lesson (DLV-209)', async () => {
    const f = TestBed.createComponent(ContentRecovery);
    f.componentRef.setInput('kind', 'locked');
    f.componentRef.setInput('preview', { premium: true, title: 'Streams' });
    f.componentRef.setInput('destination', '/grow/kafka-production/kafka-consumer-groups');
    f.detectChanges();
    await f.whenStable();
    const note = f.nativeElement.querySelector('.locked-note') as HTMLElement;
    expect(note.querySelector('.plans-line')?.textContent?.trim()).toBe(
      'Included in Grow, Advance and Complete, from $99.99/year.',
    );
    const seePlans = note.querySelector('a.plans-action') as HTMLAnchorElement;
    expect(seePlans.textContent?.trim()).toBe('See plans');
    expect(seePlans.getAttribute('href')).toBe('/pricing');
    expect(f.nativeElement.querySelector('dialog .plans-line')?.textContent?.trim()).toBe(
      'Included in Grow, Advance and Complete, from $99.99/year.',
    );
  });
  it('lets a signed-out visitor see prices, but offers no checkout before sign-in', async () => {
    const f = TestBed.createComponent(ContentRecovery);
    f.componentRef.setInput('kind', 'sign-in');
    f.componentRef.setInput('preview', { premium: true });
    f.componentRef.setInput('destination', '/learn/core-java/generics-basics');
    f.detectChanges();
    await f.whenStable();
    const root = f.nativeElement as HTMLElement;
    const plansLine = root.querySelector('.locked-note .plans-line')?.textContent?.trim();
    expect(plansLine).toMatch(/^Included in .+, from \$[\d.]+\/year\.$/);
    expect(root.querySelector('dialog .plans-line')?.textContent?.trim()).toBe(plansLine);
    const pricing = [...root.querySelectorAll<HTMLAnchorElement>('a[href="/#pricing"]')];
    expect(pricing.map((link) => link.textContent?.trim())).toEqual(['See pricing', 'See pricing']);
    expect(root.textContent).not.toMatch(/checkout|buy now|payment|purchase/i);
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
