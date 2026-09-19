import { beforeEach, expect, it } from 'vitest';
import { safeAccountReturn } from './account';
it('keeps account navigation inside recognized learner routes', () => {
  expect(safeAccountReturn('/learn/core-java?day=2')).toBe('/learn/core-java?day=2');
  expect(safeAccountReturn('/support')).toBe('/support');
  expect(safeAccountReturn('/author')).toBe('/author');
  expect(safeAccountReturn('/account')).toBe('/account');
  expect(safeAccountReturn('/')).toBe('/');
  expect(safeAccountReturn('/#paths')).toBe('/#paths');
  expect(safeAccountReturn('/?source=welcome#paths')).toBe('/?source=welcome#paths');
  expect(safeAccountReturn('/study-plan?plan=example')).toBe('/study-plan?plan=example');
  expect(safeAccountReturn('/study-plan/saved?id=example#details')).toBe(
    '/study-plan/saved?id=example#details',
  );
  expect(safeAccountReturn('/grow#courses')).toBe('/grow#courses');
  expect(safeAccountReturn('/search?q=java%20spring')).toBe('/search?q=java%20spring');
  expect(safeAccountReturn(null)).toBe('/');
  for (const bad of [
    '//evil.example',
    '///evil.example',
    'https://evil.example',
    '/account/unknown',
    '/learn\\evil',
    '/learn\nwrong',
    '/?next=\twrong',
    '/#\u0000wrong',
    '/\\evil.example',
    '/sign-in',
    '/sign-up',
    '/login',
    '/oauth2/authorization/lookahead',
    '/learn/%5coutside',
    '/?next=%0d%0aoutside',
    '/#%00',
    '/%2foutside.example',
    '/learn/%',
    '/learn bad',
    '/learn/../sign-in',
    '/author/%2e%2e/sign-in',
    '/learn/./java',
    '%2Flearn',
    '%2F',
    '',
  ])
    expect(safeAccountReturn(bad)).toBe('/');
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
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AccountPage } from './account';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { ContentService } from '../../content/content.service';

beforeEach(() => {
  vi.spyOn(StudyPlanAccount.prototype, 'loadProfile').mockImplementation(async function (
    this: StudyPlanAccount,
  ) {
    return {
      displayName: this.account()?.displayName ?? '',
      username: this.account()?.username ?? '',
    };
  });
});

it.each([
  '/#paths',
  '/?source=login#paths',
  '/study-plan?plan=example#details',
  '/study-plan',
  '/search',
])('preserves query and fragment in account-page links to %s', (returnTo) => {
  const queryParamMap = convertToParamMap({ returnTo });
  TestBed.configureTestingModule({
    imports: [AccountPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(queryParamMap),
          data: of({}),
          snapshot: { queryParamMap, data: {} },
        },
      },
      { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
    ],
  });
  const store = TestBed.inject(StudyPlanAccount);
  vi.spyOn(store, 'initialize').mockResolvedValue();
  vi.spyOn(store, 'loadAuthOptions').mockResolvedValue();
  const fixture = TestBed.createComponent(AccountPage);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.account-footer a').getAttribute('href')).toBe(
    returnTo,
  );
  expect(fixture.nativeElement.querySelector('.account-footer a').textContent.trim()).toBe(
    'Return to learning',
  );
  store.account.set({
    accountId: 'sample',
    username: 'sample@example.test',
    displayName: 'Sample learner',
    topicGrants: [],
  });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.account-footer a').getAttribute('href')).toBe(
    returnTo,
  );
  const links = [
    ...fixture.nativeElement.querySelectorAll('.account-footer a'),
  ] as HTMLAnchorElement[];
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    returnTo,
    ...['/study-plan', '/search'].filter((route) => route !== returnTo),
  ]);
  expect(fixture.nativeElement.querySelector('nav.account-footer').getAttribute('aria-label')).toBe(
    'Learning actions',
  );
  expect(fixture.nativeElement.querySelector('.account-footer .primary-action')).not.toBeNull();
  expect(fixture.nativeElement.querySelector('.account-footer a').textContent.trim()).toBe(
    'Continue learning',
  );
  expect(fixture.nativeElement.textContent).not.toContain('Return to learning');
});

it.each([
  [null, '/'],
  ['/', '/'],
  ['/#paths', '/#paths'],
  ['/study-plan?plan=example', '/study-plan?plan=example'],
  ['/author/architecture', '/author/architecture'],
  ['/account', '/account'],
  ['https://outside.example', '/'],
])('completes sign-in with returnTo=%s at %s', async (requested, expected) => {
  const queryParamMap = convertToParamMap(requested === null ? {} : { returnTo: requested });
  TestBed.configureTestingModule({
    imports: [AccountPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(queryParamMap),
          data: of({}),
          snapshot: { queryParamMap, data: {} },
        },
      },
      { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
    ],
  });
  const store = TestBed.inject(StudyPlanAccount);
  vi.spyOn(store, 'initialize').mockResolvedValue();
  vi.spyOn(store, 'loadAuthOptions').mockResolvedValue();
  vi.spyOn(store, 'login').mockResolvedValue(true);
  store.authOptions.set({ registration: false, google: false, oauth: false });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AccountPage);
  fixture.detectChanges();
  const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
  const username = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  const password = form.querySelector<HTMLInputElement>('input[name="password"]')!;
  username.value = 'sample@example.test';
  username.dispatchEvent(new Event('input'));
  password.value = 'Synthetic example @ 123';
  password.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  form.requestSubmit();
  await fixture.whenStable();
  expect(navigate).toHaveBeenCalledExactlyOnceWith(expected);
});

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
        queryParams: { returnTo: '/' },
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
  expect(password.hasAttribute('maxlength')).toBe(false);
  expect(password.hasAttribute('minlength')).toBe(false);
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
