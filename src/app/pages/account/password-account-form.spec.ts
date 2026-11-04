import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { followStep, PasswordAccountForm } from './password-account-form';
import { PasswordSignInApi, PasswordSignInError, PasswordStep, mergeNext } from './password-sign-in-api';
import { AccountMergeClient } from './account-merge-client';

function fakeApi(result: () => Promise<PasswordStep>) {
  return {
    email: signal(''),
    destination: signal(''),
    codeMethod: signal<'app' | 'email'>('email'),
    signIn: vi.fn(result),
    signUp: vi.fn(result),
  };
}

function mount(mode: 'signin' | 'signup', api: ReturnType<typeof fakeApi>, inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    imports: [PasswordAccountForm],
    providers: [provideRouter([]), { provide: PasswordSignInApi, useValue: api }],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PasswordAccountForm);
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('returnTo', '/learn');
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const type = (selector: string, value: string) => {
    const input = element.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = async () => {
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, element, type, submit, navigate };
}

describe('PasswordAccountForm', () => {
  it('signs in with our own form and opens the next step', async () => {
    const api = fakeApi(async () => ({ kind: 'new-password' }));
    const view = mount('signin', api, { google: true, googleUrl: '/bff/login?provider=google&returnTo=%2Flearn' });
    const google = view.element.querySelector('a.google-action')!;
    expect(google.textContent!.trim()).toBe('Continue with Google');
    expect(google.getAttribute('href')).toBe('/bff/login?provider=google&returnTo=%2Flearn');
    expect(view.element.querySelector('#signup-first-name')).toBeNull();
    expect([...view.element.querySelectorAll('.password-links a')].map((a) => a.textContent!.trim())).toEqual([
      'Forgot password?',
      'Create an account',
    ]);
    view.type('#account-email', 'priya@example.com');
    view.type('#account-password', 'Secret-Passw0rd!');
    (view.element.querySelector('.password-visibility') as HTMLButtonElement).click();
    view.fixture.detectChanges();
    expect((view.element.querySelector('#account-password') as HTMLInputElement).type).toBe('text');
    await view.submit();
    expect(api.signIn).toHaveBeenCalledWith('priya@example.com', 'Secret-Passw0rd!', '/learn');
    expect(view.navigate).toHaveBeenCalledWith(['/sign-in/new-password'], { queryParams: { returnTo: '/learn' } });
    expect((view.element.querySelector('#account-password') as HTMLInputElement).type).toBe('password');
  });

  it('shows the plain error for a wrong password and sends an unconfirmed account to the code screen', async () => {
    let problem: 'credentials' | 'not-confirmed' = 'credentials';
    const api = fakeApi(async () => { throw new PasswordSignInError(problem); });
    const view = mount('signin', api);
    expect(view.element.querySelector('a.google-action')).toBeNull();
    view.type('#account-email', 'priya@example.com');
    view.type('#account-password', 'wrong');
    await view.submit();
    expect(view.element.querySelector('.form-error')!.textContent!.trim()).toBe("That email and password don't match.");
    expect((view.element.querySelector('#account-password') as HTMLInputElement).value).toBe('');
    problem = 'not-confirmed';
    await view.submit();
    expect(view.navigate).toHaveBeenCalledWith(['/sign-up/confirm'], { queryParams: { returnTo: '/learn' } });
  });

  it('reminds people who joined with Google only after a wrong email or password (DLV-969 account linking)', async () => {
    const hint = 'Joined with Google? Use Continue with Google.';
    let problem: 'credentials' | 'too-many' = 'credentials';
    const api = fakeApi(async () => { throw new PasswordSignInError(problem); });
    const view = mount('signin', api, { google: true, googleUrl: '/bff/login?provider=google' });
    const hintText = () => view.element.querySelector('.error-hint')?.textContent?.trim() ?? null;
    expect(hintText()).toBeNull();
    view.type('#account-email', 'priya@gmail.com');
    view.type('#account-password', 'wrong');
    await view.submit();
    expect(view.element.querySelector('.form-error')!.textContent!.trim()).toBe("That email and password don't match.");
    expect(hintText()).toBe(hint);
    // Another failure replaces the error, and the hint goes with it.
    problem = 'too-many';
    await view.submit();
    expect(view.element.querySelector('.form-error')!.textContent).toContain('Too many attempts');
    expect(hintText()).toBeNull();
  });

  it('gives no Google hint where Google is not offered, or for a message passed in by the page', async () => {
    const api = fakeApi(async () => { throw new PasswordSignInError('credentials'); });
    const view = mount('signin', api);
    view.type('#account-email', 'priya@example.com');
    view.type('#account-password', 'wrong');
    await view.submit();
    expect(view.element.querySelector('.form-error')).not.toBeNull();
    expect(view.element.querySelector('.error-hint')).toBeNull();
    TestBed.resetTestingModule();
    const passed = mount('signin', fakeApi(async () => ({ kind: 'sign-in' })), { google: true, initialError: 'Your session expired. Sign in again to continue.' });
    expect(passed.element.querySelector('.form-error')).not.toBeNull();
    expect(passed.element.querySelector('.error-hint')).toBeNull();
  });

  it('creates an account with name, email and a password that meets the pool rules', async () => {
    const api = fakeApi(async () => ({ kind: 'code-sent', destination: 'a***@e***' }));
    const view = mount('signup', api);
    expect(view.element.querySelector('#password-hint')!.textContent).toContain('At least 14 characters');
    expect(view.element.querySelector('.auth-switch')!.textContent).toContain('Already have an account?');
    view.type('#signup-first-name', ' Arjun ');
    view.type('#signup-last-name', 'Rao');
    view.type('#account-email', 'arjun@example.com');
    view.type('#account-password', 'too-short');
    await view.submit();
    expect(api.signUp).not.toHaveBeenCalled();
    expect(view.element.querySelector('.form-error')!.textContent).toContain('At least 14 characters');
    view.type('#account-password', 'Good-Passw0rd-123');
    await view.submit();
    expect(api.signUp).toHaveBeenCalledWith({ firstName: 'Arjun', lastName: 'Rao', email: 'arjun@example.com', password: 'Good-Passw0rd-123', returnTo: '/learn' });
    expect(api.destination()).toBe('a***@e***');
    expect(view.navigate).toHaveBeenCalledWith(['/sign-up/confirm'], { queryParams: { returnTo: '/learn' } });
  });

  it('shows the message passed in by the page and a generic message for unknown failures', async () => {
    const api = fakeApi(async () => { throw new Error('boom'); });
    const view = mount('signin', api, { initialError: 'Your session expired. Sign in again to continue.' });
    expect(view.element.querySelector('.form-error')!.textContent!.trim()).toBe('Your session expired. Sign in again to continue.');
    view.type('#account-email', 'a@b.c');
    view.type('#account-password', 'x');
    await view.submit();
    expect(view.element.querySelector('.form-error')!.textContent).toContain("isn't available right now");
  });
});

describe('PasswordAccountForm merge offer (DLV-969 S36.8)', () => {
  it('shows Check your inbox instead of leaving when the sign-in reports another account', async () => {
    const api = fakeApi(async () => ({ kind: 'signed-in', next: '/learn', mergeAvailable: true }));
    const client = { requestMergeEmail: vi.fn(async () => ({ kind: 'sent' as const })) };
    TestBed.configureTestingModule({ providers: [{ provide: AccountMergeClient, useValue: client }] });
    const view = mount('signin', api);
    view.type('#account-email', 'priya@gmail.com');
    view.type('#account-password', 'Secret-Passw0rd!');
    api.email.set('priya@gmail.com');
    await view.submit();
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(view.element.querySelector('form')).toBeNull();
    expect(view.element.textContent).toContain("Check your inbox to confirm it's you. We sent an email to p•••a@gmail.com.");
    expect(client.requestMergeEmail).toHaveBeenCalledTimes(1);
    expect(view.element.querySelector('a.merge-continue')!.getAttribute('href')).toBe('/learn');
    expect(view.navigate).not.toHaveBeenCalled();
  });

  it('never offers the email on the way to the merge page, and keeps the link', async () => {
    const assign = vi.fn();
    const client = { requestMergeEmail: vi.fn(async () => ({ kind: 'sent' as const })) };
    for (const next of ['/account/merge?token=' + 'T'.repeat(43), '/account/merge', '/account/merge?offer=1']) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: AccountMergeClient, useValue: client }] });
      TestBed.overrideComponent(PasswordAccountForm, {
        add: { providers: [{ provide: DOCUMENT, useValue: { defaultView: { location: { assign } } } }] },
      });
      const api = fakeApi(async () => ({ kind: 'signed-in', next, mergeAvailable: true }));
      const page = mount('signin', api);
      page.type('#account-email', 'priya@gmail.com');
      page.type('#account-password', 'Secret-Passw0rd!');
      await page.submit();
      expect(page.element.querySelector('app-merge-inbox-panel')).toBeNull();
      expect(assign).toHaveBeenLastCalledWith(next);
    }
    expect(client.requestMergeEmail).not.toHaveBeenCalled();
    expect(mergeNext({ kind: 'signed-in', next: '/learn' })).toBeNull();
    // Only the merge page itself: a lookalike path still gets the offer.
    expect(mergeNext({ kind: 'signed-in', next: '/account/merger', mergeAvailable: true })).toBe('/account/merger');
  });
});

describe('followStep', () => {
  it('leaves for the signed-in page, opens code and reset screens, and returns to sign-in with a notice', async () => {
    const assign = vi.fn();
    const router = { navigate: vi.fn().mockResolvedValue(true) } as unknown as Router;
    const document = { defaultView: { location: { assign } } } as unknown as Document;
    const api = { codeMethod: signal<'app' | 'email'>('email'), destination: signal('') } as unknown as PasswordSignInApi;
    const context = { router, document, returnTo: '/learn' };
    await followStep({ kind: 'signed-in', next: '/dev/access?access=pending' }, { ...context, after: 'sign-in' }, api);
    expect(assign).toHaveBeenCalledWith('/dev/access?access=pending');
    await followStep({ kind: 'code', method: 'app' }, { ...context, after: 'sign-in' }, api);
    expect(api.codeMethod()).toBe('app');
    expect(router.navigate).toHaveBeenLastCalledWith(['/sign-in/code'], { queryParams: { returnTo: '/learn' } });
    await followStep({ kind: 'code-sent', destination: 'p***@e***' }, { ...context, after: 'reset' }, api);
    expect(router.navigate).toHaveBeenLastCalledWith(['/sign-in/reset'], { queryParams: { returnTo: '/learn' } });
    expect(api.destination()).toBe('p***@e***');
    await followStep({ kind: 'sign-in' }, { ...context, after: 'sign-up' }, api);
    expect(router.navigate).toHaveBeenLastCalledWith(['/sign-in'], { queryParams: { returnTo: '/learn' }, state: { passwordNotice: 'sign-up' } });
  });
});

describe('PasswordAccountForm notices', () => {
  for (const [state, text] of [
    ['sign-up', 'Your email is confirmed. Sign in to continue.'],
    ['reset', 'Your password is changed. Sign in with the new one.'],
  ] as const)
    it('shows "' + text + '" after ' + state, () => {
      TestBed.configureTestingModule({
        imports: [PasswordAccountForm],
        providers: [provideRouter([]), { provide: PasswordSignInApi, useValue: fakeApi(async () => ({ kind: 'sign-in' })) }],
      });
      vi.spyOn(TestBed.inject(Router), 'currentNavigation').mockReturnValue({ extras: { state: { passwordNotice: state } } } as never);
      const fixture = TestBed.createComponent(PasswordAccountForm);
      fixture.componentRef.setInput('mode', 'signin');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.success-status').textContent.trim()).toBe(text);
    });
});
