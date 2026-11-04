import { DOCUMENT } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PasswordSignInApi, PasswordSignInError, PasswordStep } from './password-sign-in-api';
import { PasswordStepKind, PasswordStepPage } from './password-step';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

function fakeApi(email: string, result: () => Promise<PasswordStep>) {
  return {
    email: signal(email),
    destination: signal(''),
    codeMethod: signal<'app' | 'email'>('email'),
    confirm: vi.fn(result),
    forgot: vi.fn(result),
    reset: vi.fn(result),
    respond: vi.fn(result),
    resend: vi.fn(async (): Promise<PasswordStep> => ({ kind: 'code-sent', destination: 'p***@g***' })),
  };
}

function mount(kind: PasswordStepKind, api: ReturnType<typeof fakeApi>, google = true) {
  const assign = vi.fn();
  const accounts = { authOptions: signal(google ? { managedLogin: true, password: true, google: true } : null), loadAuthOptions: vi.fn(async () => undefined) };
  const queryParamMap = convertToParamMap({ returnTo: '/learn' });
  TestBed.configureTestingModule({
    imports: [PasswordStepPage],
    providers: [
      provideRouter([]),
      { provide: PasswordSignInApi, useValue: api },
      { provide: StudyPlanAccount, useValue: accounts },
      { provide: ActivatedRoute, useValue: { snapshot: { data: { passwordStep: kind }, queryParamMap }, queryParamMap: of(queryParamMap) } },
    ],
  });
  TestBed.overrideComponent(PasswordStepPage, {
    set: {
      imports: [RouterLink],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [{ provide: DOCUMENT, useValue: { defaultView: { location: { assign } } } }],
    },
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PasswordStepPage);
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
  const text = () => element.textContent!.replace(/\s+/g, ' ');
  return { fixture, element, type, submit, navigate, text, assign, accounts };
}

describe('PasswordStepPage', () => {
  it('confirms a new account with the emailed code and can send a new code', async () => {
    const api = fakeApi('priya@gmail.com', async () => ({ kind: 'sign-in' }));
    const view = mount('confirm', api);
    expect(view.element.querySelector('h1')!.textContent).toBe('Check your email');
    expect(view.text()).toContain('We sent a 6-digit code to p•••@gmail.com. It expires in 24 hours.');
    expect(view.element.querySelector('#step-email')).toBeNull();
    view.type('#step-code', '123456');
    await view.submit();
    expect(api.confirm).toHaveBeenCalledWith('123456', '/learn');
    expect(view.navigate).toHaveBeenCalledWith(['/sign-in'], { queryParams: { returnTo: '/learn' }, state: { passwordNotice: 'sign-up' } });
    (view.element.querySelector('button.link-action') as HTMLButtonElement).click();
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(api.resend).toHaveBeenCalled();
    expect(view.element.querySelector('.success-status')!.textContent!.trim()).toBe('We sent a new code.');
    expect(view.text()).toContain('p***@g***');
    expect(view.element.querySelector('.step-links a')!.textContent).toBe('Use a different email');
  });

  it('asks for the email again after a reload and shows a wrong code plainly', async () => {
    const api = fakeApi('', async () => { throw new PasswordSignInError('code'); });
    const view = mount('confirm', api);
    expect(view.text()).toContain('Enter the email you signed up with');
    expect((view.element.querySelector('button.link-action') as HTMLButtonElement).disabled).toBe(true);
    view.type('#step-email', ' arjun@example.com ');
    view.type('#step-code', '000000');
    await view.submit();
    expect(api.email()).toBe('arjun@example.com');
    expect(view.element.querySelector('.form-error')!.textContent).toContain("That code isn't right");
  });

  it('sends a reset code without saying whether the account exists', async () => {
    const api = fakeApi('', async () => ({ kind: 'code-sent', destination: 'p***@g***' }));
    const view = mount('forgot', api);
    expect(view.element.querySelector('h1')!.textContent).toBe('Reset your password');
    expect(view.text()).toContain("Enter your email. If it has an account, we'll send a code.");
    // DLV-969 account linking: Google sign-in has no password to reset.
    expect(view.element.querySelector('.google-reset-hint')!.textContent!.trim())
      .toBe('If you joined with Google, there is no password to reset. Use Continue with Google.');
    view.type('#step-email', 'priya@example.com');
    await view.submit();
    expect(api.forgot).toHaveBeenCalledWith('priya@example.com');
    expect(view.navigate).toHaveBeenCalledWith(['/sign-in/reset'], { queryParams: { returnTo: '/learn' } });
    expect(view.element.querySelector('button[type=submit]')!.textContent!.trim()).toBe('Send code');
  });

  it('resets the password with a code and a password that meets the rules', async () => {
    const api = fakeApi('priya@example.com', async () => ({ kind: 'sign-in' }));
    api.destination.set('p***@e***');
    const view = mount('reset', api);
    expect(view.element.querySelector('.google-reset-hint')).toBeNull();
    expect(view.text()).toContain('Enter the code we sent to p***@e*** and choose a new password.');
    view.type('#step-code', '654321');
    view.type('#step-new-password', 'weak');
    await view.submit();
    expect(api.reset).not.toHaveBeenCalled();
    expect(view.element.querySelector('.form-error')!.textContent).toContain('At least 14 characters');
    view.type('#step-new-password', 'Good-Passw0rd-123');
    await view.submit();
    expect(api.reset).toHaveBeenCalledWith('654321', 'Good-Passw0rd-123', '/learn');
    expect(view.navigate).toHaveBeenCalledWith(['/sign-in'], { queryParams: { returnTo: '/learn' }, state: { passwordNotice: 'reset' } });
    expect(view.element.querySelector('button[type=submit]')!.textContent!.trim()).toBe('Save and sign in');
  });

  it('sets a new password for an account the owner created', async () => {
    const api = fakeApi('', async () => ({ kind: 'code', method: 'app' }));
    const view = mount('new-password', api);
    expect(view.element.querySelector('h1')!.textContent).toBe('Set a new password');
    expect(view.text()).toContain('Your account was created with a temporary password.');
    expect(view.element.querySelector('#step-email')).toBeNull();
    view.type('#step-new-password', 'Good-Passw0rd-123');
    await view.submit();
    expect(api.respond).toHaveBeenCalledWith({ newPassword: 'Good-Passw0rd-123' });
    expect(view.navigate).toHaveBeenCalledWith(['/sign-in/code'], { queryParams: { returnTo: '/learn' } });
  });

  it('asks for an authenticator or email code', async () => {
    const api = fakeApi('', async () => { throw new Error('offline'); });
    api.codeMethod.set('app');
    const view = mount('code', api);
    expect(view.text()).toContain('Enter the 6-digit code from your authenticator app.');
    view.type('#step-code', '111111');
    await view.submit();
    expect(api.respond).toHaveBeenCalledWith({ code: '111111' });
    expect(view.element.querySelector('.form-error')!.textContent).toContain("isn't available right now");
    api.codeMethod.set('email');
    view.fixture.detectChanges();
    expect(view.text()).toContain('Enter the 6-digit code we emailed you.');
  });

  it('shows Check your inbox when the finished sign-in reports another account (DLV-969 S36.8)', async () => {
    const api = fakeApi('priya@gmail.com', async () => ({ kind: 'signed-in', next: '/learn', mergeAvailable: true }));
    const view = mount('code', api);
    view.type('#step-code', '111111');
    await view.submit();
    expect(api.respond).toHaveBeenCalledWith({ code: '111111' });
    expect(view.element.querySelector('app-merge-inbox-panel')).not.toBeNull();
    expect(view.element.querySelector('form')).toBeNull();
    expect(view.navigate).not.toHaveBeenCalled();
  });

  it('never shows Check your inbox on the way to the merge page, and keeps the link (code, new password, reset)', async () => {
    const next = '/account/merge?token=' + 'T'.repeat(43);
    const answers: Record<string, [string, string][]> = {
      code: [['#step-code', '111111']],
      'new-password': [['#step-new-password', 'Good-Passw0rd-123']],
      reset: [['#step-code', '654321'], ['#step-new-password', 'Good-Passw0rd-123']],
    };
    for (const [kind, fields] of Object.entries(answers)) {
      TestBed.resetTestingModule();
      const api = fakeApi('priya@gmail.com', async () => ({ kind: 'signed-in', next, mergeAvailable: true }));
      const view = mount(kind as PasswordStepKind, api);
      for (const [selector, value] of fields) view.type(selector, value);
      await view.submit();
      expect(view.element.querySelector('app-merge-inbox-panel')).toBeNull();
      expect(view.assign).toHaveBeenCalledWith(next);
    }
  });

  it('shows the Google reset hint only where Continue with Google is offered', async () => {
    const view = mount('forgot', fakeApi('', async () => ({ kind: 'sign-in' })), false);
    expect(view.element.querySelector('.google-reset-hint')).toBeNull();
    expect(view.accounts.loadAuthOptions).toHaveBeenCalled();
  });

  it('reports a failed resend', async () => {
    const api = fakeApi('priya@example.com', async () => ({ kind: 'sign-in' }));
    api.resend.mockRejectedValue(new PasswordSignInError('too-many'));
    const view = mount('confirm', api);
    (view.element.querySelector('button.link-action') as HTMLButtonElement).click();
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(view.element.querySelector('.form-error')!.textContent).toContain('Too many attempts');
  });
});
