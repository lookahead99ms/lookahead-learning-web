import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { ContentService } from '../../content/content.service';
import { ACCOUNT_FETCH, PlanSummary, StudyPlanAccount } from '../study-plan/study-plan-account';

const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
const error = (status: number, code: string) =>
  new Response(JSON.stringify({ status, code, message: 'Server detail must not be rendered' }), {
    status,
  });

/** Real AccountPage + AccountSettings production provider + account transport, mocked HTTP only. */
describe('Account page management integration', () => {
  let harness: RouterTestingHarness;
  let savedPlans: PlanSummary[];
  let signedIn: boolean;
  let oauth: boolean;
  let passwordRejected: boolean;
  let signInLimit: boolean;
  let requests: { path: string; body?: unknown }[];
  let profile: { accountId: string; username: string; displayName: string };

  beforeEach(() => {
    savedPlans = [];
    signedIn = true;
    oauth = true;
    passwordRejected = false;
    signInLimit = false;
    requests = [];
    profile = {
      accountId: 'synthetic-account',
      username: 'sample@example.test',
      displayName: 'Sample Learner',
    };
    const transport = vi.fn(async (path: string, options: RequestInit) => {
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;
      requests.push({ path, body });
      if (path.endsWith('/auth/login') && signInLimit) return error(409, 'SIGN_IN_LIMIT');
      if (path.endsWith('/auth/options')) return json({ registration: true, google: false, oauth });
      if (path.endsWith('/auth/csrf'))
        return json({ token: 'synthetic-csrf', headerName: 'X-CSRF-TOKEN' });
      if (path.endsWith('/auth/me'))
        return signedIn
          ? json({ ...profile, topicGrants: [], authorPreview: true })
          : error(401, 'AUTHENTICATION_REQUIRED');
      if (path.endsWith('/account-catalog'))
        return json({
          catalogVersion: 'test',
          algorithmVersions: [],
          rankingVersions: [],
          topicIds: [],
        });
      if (path.includes('/plans?')) return json({ plans: savedPlans, nextCursor: null });
      if (path === '/api/v1/account/profile') {
        if (options.method === 'POST') profile.displayName = body.displayName;
        return json(profile);
      }
      if (path === '/api/v1/account/password') {
        if (passwordRejected) return error(401, 'INVALID_CURRENT_PASSWORD');
        signedIn = false;
        return json({ reauthenticationRequired: true });
      }
      if (path === '/api/v1/auth/register') {
        signedIn = true;
        return json({ ...profile, topicGrants: [] });
      }
      throw new Error('Unexpected mock HTTP path: ' + path);
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        { provide: ACCOUNT_FETCH, useValue: transport },
        { provide: ContentService, useValue: { getSearchIndex: () => of([]) } },
      ],
    });
  });

  async function mount(url = '/account'): Promise<void> {
    harness = await RouterTestingHarness.create(url);
    await TestBed.inject(StudyPlanAccount).initialize();
    await settle();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).not.toContain('Loading your account details');
    });
  }
  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  function button(text: string): HTMLButtonElement {
    const result = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button'),
    ].find((b) => b.textContent?.trim() === text);
    expect(result, text).toBeDefined();
    return result!;
  }
  function fill(name: string, value: string): HTMLInputElement {
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(
      `input[name="${name}"]`,
    )!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
    return input;
  }

  it('uses the restored account plan list without additional requests or plan selection', async () => {
    savedPlans = [
      { planId: 'owned-plan', goal: 'Study Java', revision: 2, updatedAt: '2026-09-18T12:00:00Z' },
    ];
    await mount('/account?returnTo=%2Flearn%23courses');
    const element = harness.routeNativeElement!;
    expect(element.querySelector('app-account-study-plans h3')?.textContent).toBe('Study Java');
    expect(element.querySelector('app-account-study-plans a')?.getAttribute('href')).toBe(
      '/study-plan?plan=owned-plan',
    );
    expect(element.textContent).toContain('Session progress is not available yet.');
    expect(
      [...element.querySelectorAll('.account-footer a')].map((a) => a.getAttribute('href')),
    ).toEqual(['/learn#courses', '/study-plan', '/search']);
    expect(requests.filter((request) => request.path.includes('/plans'))).toEqual([
      { path: '/bff/api/v1/plans?limit=100', body: undefined },
    ]);
    expect(TestBed.inject(StudyPlanAccount).active()).toBeNull();
    expect(requests.every((request) => request.body === undefined)).toBe(true);
  });

  it('shows a confirmed empty account without manufacturing progress', async () => {
    await mount();
    const summary = harness.routeNativeElement!.querySelector('app-account-study-plans')!;
    expect(summary.textContent).toContain('No saved study plans yet');
    expect(summary.querySelectorAll('li')).toHaveLength(0);
    expect(summary.textContent).not.toContain('completed');
  });

  it('routes a third login to the restricted chooser and clears the entered password', async () => {
    signedIn = false;
    signInLimit = true;
    await mount('/sign-in?returnTo=%2Flearn%23courses');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill('email', 'sample@example.test');
    fill('password', 'synthetic password');
    harness
      .routeNativeElement!.querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/sign-in/choose'], {
      queryParams: { returnTo: '/learn#courses', oauth: null },
    });
    expect(
      harness.routeNativeElement!.querySelector<HTMLInputElement>('input[name="password"]')!.value,
    ).toBe('');
    expect(harness.routeNativeElement!.querySelector('app-account-study-plans')).toBeNull();
    expect(TestBed.inject(StudyPlanAccount).account()).toBeNull();
  });

  it('loads the production settings provider, edits the name and updates the shared account/header', async () => {
    await mount();
    expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toContain(
      'Manage account',
    );
    expect(requests.some((r) => r.path === '/api/v1/account/profile')).toBe(true);
    button('Edit name').click();
    harness.detectChanges();
    await settle();
    const name = fill('displayName', 'Updated Learner');
    expect(document.activeElement).toBe(name);
    button('Save name').click();
    await settle();
    expect(TestBed.inject(StudyPlanAccount).account()?.displayName).toBe('Updated Learner');
    expect(harness.routeNativeElement!.textContent).toContain('Your name has been updated.');
    expect(document.activeElement).toBe(button('Edit name'));
    const post = requests.find((r) => r.path === '/api/v1/account/profile' && r.body);
    expect(post?.body).toEqual({ displayName: 'Updated Learner' });
  });

  it('clears account state and shows password success only through the acknowledged navigation', async () => {
    await mount();
    button('Change password').click();
    harness.detectChanges();
    await settle();
    expect(document.activeElement).toBe(
      harness.routeNativeElement!.querySelector('input[name="currentPassword"]'),
    );
    fill('currentPassword', 'legacy');
    fill('newPassword', 'a unique synthetic passphrase');
    fill('confirmPassword', 'a unique synthetic passphrase');
    button('Save new password').click();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/sign-in');
    expect(TestBed.inject(StudyPlanAccount).account()).toBeNull();
    expect(harness.routeNativeElement!.textContent).toContain(
      'Password changed. All sign-ins have ended, including this one.',
    );
    expect(
      harness.routeNativeElement!.querySelector<HTMLInputElement>('input[name="password"]')?.value,
    ).toBe('');
    expect(requests.find((r) => r.path === '/api/v1/account/password')?.body).toEqual({
      currentPassword: 'legacy',
      newPassword: 'a unique synthetic passphrase',
      confirmPassword: 'a unique synthetic passphrase',
    });
  });

  it('does not accept a query parameter as evidence of password change or global sign-out', async () => {
    signedIn = false;
    await mount('/sign-in?status=password-changed');
    expect(harness.routeNativeElement!.textContent).not.toContain('Password changed.');
    expect(harness.routeNativeElement!.querySelector('.success-status')).toBeNull();
  });

  it('keeps Manage account after a rejected current password and clears all entered secrets', async () => {
    passwordRejected = true;
    await mount();
    button('Change password').click();
    harness.detectChanges();
    fill('currentPassword', 'not the password');
    fill('newPassword', 'a unique synthetic passphrase');
    fill('confirmPassword', 'a unique synthetic passphrase');
    button('Save new password').click();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/account');
    expect(TestBed.inject(StudyPlanAccount).account()).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')?.textContent).toContain(
      'We could not confirm this change',
    );
    for (const input of harness.routeNativeElement!.querySelectorAll<HTMLInputElement>(
      '.password-input input',
    ))
      expect(input.value).toBe('');
    expect(document.activeElement).toBe(
      harness.routeNativeElement!.querySelector('[role="alert"]'),
    );
  });

  it.each([14, 128])(
    'registration applies Unicode limits to a %s-codepoint password',
    async (count) => {
      signedIn = false;
      oauth = false;
      await mount('/sign-up');
      fill('firstName', 'Sample');
      fill('lastName', 'Learner');
      fill('email', 'sample@example.test');
      fill('password', '😀'.repeat(count));
      fill('confirmPassword', '😀'.repeat(count));
      fill('country', 'United States');
      if (count === 128) vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      harness
        .routeNativeElement!.querySelector('form')!
        .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await settle();
      const registration = requests.find((r) => r.path === '/api/v1/auth/register');
      if (count === 14) {
        expect(registration).toBeUndefined();
        expect(harness.routeNativeElement!.textContent).toContain('Use 15 to 128 characters');
        expect(
          harness.routeNativeElement!.querySelector<HTMLInputElement>('input[name="password"]')
            ?.value,
        ).toBe('');
      } else {
        expect(registration?.body).toMatchObject({
          password: '😀'.repeat(128),
          confirmPassword: '😀'.repeat(128),
        });
      }
    },
  );
});
