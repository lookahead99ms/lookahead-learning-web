import { expect, it } from 'vitest';
import { safeAccountReturn } from './account';
it('keeps account navigation inside recognized learner routes', () => {
  expect(safeAccountReturn('/learn/core-java?day=2')).toBe('/learn/core-java?day=2');
  expect(safeAccountReturn('/support')).toBe('/support');
  expect(safeAccountReturn('/author')).toBe('/author');
  for (const bad of [
    '//evil.example',
    'https://evil.example',
    '/account',
    '/learn\\evil',
    '/learn\nwrong',
  ])
    expect(safeAccountReturn(bad)).toBe('/study-plan');
});

import { registrationCountries, registrationCountryCode } from './countries';
it('requires explicit selection of a known country and preserves ISO codes', () => {
  expect(registrationCountryCode('')).toBeNull();
  expect(registrationCountryCode('somewhere')).toBeNull();
  expect(registrationCountryCode('United States')).toBe('US');
  expect(registrationCountryCode('india')).toBe('IN');
  expect(new Set(registrationCountries.map((country) => country.code)).size).toBe(
    registrationCountries.length,
  );
});

import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AccountPage } from './account';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { ContentService } from '../../content/content.service';

it.each([false, true])(
  'account-page logout follows the actual redirect state (%s)',
  async (redirectPending) => {
    TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      ],
    });
    const store = TestBed.inject(StudyPlanAccount);
    vi.spyOn(store, 'initialize').mockResolvedValue();
    vi.spyOn(store, 'loadAuthOptions').mockResolvedValue();
    vi.spyOn(store, 'logout').mockResolvedValue(true);
    store.account.set({
      accountId: 'test',
      displayName: 'Test Learner',
      username: 'test@example.test',
      topicGrants: [],
    });
    store.authOptions.set({ registration: false, google: false, oauth: true });
    store.logoutRedirectPending.set(redirectPending);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.account-actions button').click();
    await fixture.whenStable();
    if (redirectPending) expect(navigate).not.toHaveBeenCalled();
    else
      expect(navigate).toHaveBeenCalledWith(['/sign-in'], {
        queryParams: { returnTo: '/study-plan' },
      });
  },
);

it('accepts an existing local username when signing in', () => {
  TestBed.configureTestingModule({
    imports: [AccountPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
    ],
  });
  const store = TestBed.inject(StudyPlanAccount);
  vi.spyOn(store, 'initialize').mockResolvedValue();
  vi.spyOn(store, 'loadAuthOptions').mockResolvedValue();
  const fixture = TestBed.createComponent(AccountPage);
  fixture.detectChanges();
  const field = fixture.nativeElement.querySelector('input[name="email"]') as HTMLInputElement;
  expect(field.type).toBe('text');
  field.value = 'learner01';
  expect(field.validity.valid).toBe(true);
  expect(field.labels?.[0].textContent).toContain('Email or username');
});

it('reveals and masks the entered password without submitting, then masks on sign-in', async () => {
  TestBed.configureTestingModule({
    imports: [AccountPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
    ],
  });
  const store = TestBed.inject(StudyPlanAccount);
  vi.spyOn(store, 'initialize').mockResolvedValue();
  vi.spyOn(store, 'loadAuthOptions').mockResolvedValue();
  const login = vi.spyOn(store, 'login').mockResolvedValue(false);
  const fixture = TestBed.createComponent(AccountPage);
  fixture.detectChanges();
  const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
  const username = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  const password = form.querySelector<HTMLInputElement>('input[name="password"]')!;
  const toggle = form.querySelector<HTMLButtonElement>('.password-visibility')!;
  username.value = 'learner01';
  username.dispatchEvent(new Event('input'));
  password.value = 'Synthetic example @ 123';
  password.dispatchEvent(new Event('input'));
  fixture.detectChanges();

  expect(password.type).toBe('password');
  expect(password.autocomplete).toBe('current-password');
  expect(toggle.getAttribute('aria-label')).toBe('Show password');
  expect(toggle.getAttribute('aria-controls')).toBe(password.id);
  toggle.click();
  fixture.detectChanges();
  expect(password.type).toBe('text');
  expect(password.value).toBe('Synthetic example @ 123');
  expect(toggle.getAttribute('aria-label')).toBe('Hide password');
  expect(login).not.toHaveBeenCalled();

  toggle.click();
  fixture.detectChanges();
  expect(password.type).toBe('password');
  expect(password.value).toBe('Synthetic example @ 123');
  toggle.click();
  fixture.detectChanges();
  form.requestSubmit();
  await fixture.whenStable();
  fixture.detectChanges();
  expect(login).toHaveBeenCalledExactlyOnceWith('learner01', 'Synthetic example @ 123');
  expect(password.type).toBe('password');
  expect(password.value).toBe('');
  expect(toggle.getAttribute('aria-label')).toBe('Show password');
});
