import { TestBed } from '@angular/core/testing';
import { ACCOUNT_FETCH, AccountPlan, StudyPlanAccount } from '../study-plan/study-plan-account';
import { AccountSettingsError } from './account-settings-client';

const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
const failure = (status: number, code: string) =>
  new Response(JSON.stringify({ status, code, message: 'Server detail must not be rendered' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Account settings identity boundary', () => {
  let store: StudyPlanAccount;
  let fetcher: ReturnType<typeof vi.fn>;
  let profile: { accountId: string; username: string; displayName: string };
  let passwordReply: () => Response;
  const passwordChange = {
    currentPassword: 'legacy',
    newPassword: 'A unique test passphrase \\ 😀',
    confirmPassword: 'A unique test passphrase \\ 😀',
  };

  beforeEach(() => {
    profile = {
      accountId: 'owner-a',
      username: 'sample@example.test',
      displayName: 'Sample learner',
    };
    passwordReply = () => json({ reauthenticationRequired: true });
    fetcher = vi.fn(async (path: string, options: RequestInit) => {
      expect(options.credentials).toBe('same-origin');
      expect(options.cache).toBe('no-store');
      if (path === '/api/v1/auth/csrf')
        return json({ token: 'identity-csrf', headerName: 'X-CSRF-TOKEN' });
      if (path === '/api/v1/account/profile') {
        if (options.method === 'POST')
          profile.displayName = JSON.parse(options.body as string).displayName;
        return json(profile);
      }
      if (path === '/bff/api/v1/auth/me')
        return json({
          ...profile,
          displayName: 'Cached old name',
          topicGrants: ['learn:refreshed'],
          authorPreview: true,
        });
      if (path === '/api/v1/account/password') return passwordReply();
      throw new Error('Unexpected path: ' + path);
    });
    TestBed.configureTestingModule({ providers: [{ provide: ACCOUNT_FETCH, useValue: fetcher }] });
    store = TestBed.inject(StudyPlanAccount);
    store.account.set({ ...profile, topicGrants: ['learn:old'] });
    store.authOptions.set({ registration: true, google: false, oauth: true });
  });

  it('reads Identity profile and exposes no internal identifiers or guessed sign-in metadata', async () => {
    expect(await store.loadProfile()).toEqual({
      displayName: profile.displayName,
      username: profile.username,
    });
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/account/profile');
  });

  it('posts only the display name with Identity CSRF, then refreshes Domain-composed grants', async () => {
    const result = await store.updateDisplayName('Updated learner');
    expect(result.displayName).toBe('Updated learner');
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/account/profile',
      '/bff/api/v1/auth/me',
    ]);
    const options = fetcher.mock.calls[1][1];
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      'X-CSRF-TOKEN': 'identity-csrf',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options.body)).toEqual({ displayName: 'Updated learner' });
    expect(store.account()).toMatchObject({
      displayName: 'Updated learner',
      username: profile.username,
      topicGrants: ['learn:refreshed'],
      authorPreview: true,
    });
  });

  it('applies the authoritative display name before a subsequent grants-refresh failure', async () => {
    const transport = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation((path, options) =>
      path === '/bff/api/v1/auth/me'
        ? Promise.resolve(failure(503, 'SERVICE_UNAVAILABLE'))
        : transport(path, options),
    );
    await expect(store.updateDisplayName('Saved name')).rejects.toMatchObject({
      kind: 'storage-unavailable',
    });
    expect(store.account()?.displayName).toBe('Saved name');
    expect(store.account()?.topicGrants).toEqual(['learn:old']);
  });

  it('rejects an Identity profile belonging to another account and clears stale account data', async () => {
    profile.accountId = 'owner-b';
    await expect(store.loadProfile()).rejects.toMatchObject({ kind: 'session-expired' });
    expect(store.account()).toBeNull();
    expect(store.error()).toContain('session changed');
  });

  it('does not overwrite a newly selected account when an old request completes', async () => {
    let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const request = store.loadProfile();
    store.account.set({
      accountId: 'owner-b',
      displayName: 'Other learner',
      username: 'other@example.test',
      topicGrants: [],
    });
    finish(json(profile));
    await expect(request).rejects.toMatchObject({ kind: 'session-expired' });
    expect(store.account()?.accountId).toBe('owner-b');
  });

  it('changes password through Identity and clears all account-owned state after acknowledgement', async () => {
    store.plans.set([
      { planId: 'private-plan', goal: 'Private goal', revision: 1, updatedAt: '2026-09-19' },
    ]);
    store.active.set({ planId: 'private-plan' } as AccountPlan);
    store.catalog.set({
      catalogVersion: 'v1',
      algorithmVersions: [],
      rankingVersions: [],
      topicIds: ['learn:old'],
    });
    store.error.set('Old error');
    store.errorStatus.set(503);
    await store.changePassword(passwordChange);
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/account/password',
    ]);
    expect(fetcher.mock.calls[1][1].headers).toEqual({
      'X-CSRF-TOKEN': 'identity-csrf',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(passwordChange);
    expect(store.account()).toBeNull();
    expect(store.plans()).toEqual([]);
    expect(store.active()).toBeNull();
    expect(store.catalog()).toBeNull();
    expect(store.pending()).toBe(false);
    expect(store.busy()).toBe(false);
    expect(store.error()).toBe('');
    expect(store.errorStatus()).toBeNull();
  });

  it('requires explicit reauthentication acknowledgement rather than trusting any 200 response', async () => {
    passwordReply = () => json({});
    await expect(store.changePassword(passwordChange)).rejects.toMatchObject({
      kind: 'unconfirmed',
    });
    expect(store.account()?.accountId).toBe('owner-a');
  });

  it('keeps the session after a rejected current password without retaining a retry body', async () => {
    passwordReply = () => failure(401, 'INVALID_CURRENT_PASSWORD');
    await expect(store.changePassword(passwordChange)).rejects.toMatchObject({
      kind: 'change-rejected',
    });
    expect(store.account()?.accountId).toBe('owner-a');
    expect(store.sessionExpired()).toBe(false);
    expect(store.pending()).toBe(false);
  });

  it.each([
    [401, 'AUTHENTICATION_REQUIRED'],
    [403, 'CSRF_INVALID'],
  ] as const)(
    'clears account state for expired authentication or CSRF (%s %s)',
    async (status, code) => {
      passwordReply = () => failure(status, code);
      await expect(store.changePassword(passwordChange)).rejects.toMatchObject({
        kind: 'session-expired',
      });
      expect(store.account()).toBeNull();
      expect(store.error()).toContain('Sign in again');
    },
  );

  it.each([
    [422, 'INVALID_PASSWORD', 'password-policy'],
    [422, 'PASSWORD_TOO_COMMON', 'password-common'],
    [422, 'PASSWORD_UNCHANGED', 'password-unchanged'],
    [429, 'PASSWORD_CHANGE_RATE_LIMITED', 'rate-limited'],
    [503, 'ACCOUNT_STORAGE_UNAVAILABLE', 'storage-unavailable'],
    [503, 'SERVICE_UNAVAILABLE', 'storage-unavailable'],
    [400, 'MALFORMED_JSON', 'unconfirmed'],
  ] as const)('maps only safe password error categories (%s %s)', async (status, code, kind) => {
    passwordReply = () => failure(status, code);
    await expect(store.changePassword(passwordChange)).rejects.toEqual(
      new AccountSettingsError(kind),
    );
    expect(store.account()?.accountId).toBe('owner-a');
  });
});
