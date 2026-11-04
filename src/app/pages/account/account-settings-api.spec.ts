import { TestBed } from '@angular/core/testing';
import { ACCOUNT_FETCH, AccountPlan, StudyPlanAccount } from '../study-plan/study-plan-account';
import { AccountSettingsError, accountSignInMethods, readSignInMethods } from './account-settings-client';

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
  let profile: { accountId: string; username: string; displayName: string; signInMethod?: string; email?: string | null; signInMethods?: unknown };
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

  it('keeps Google as the sign-in method and the verified Gmail, and nothing else the service guessed (DLV-969)', async () => {
    Object.assign(profile, { username: 'Google_109384756', signInMethod: 'google', email: 'learner@gmail.example' });
    expect(await store.loadProfile()).toEqual({
      displayName: profile.displayName, username: 'Google_109384756', signInMethod: 'google', email: 'learner@gmail.example',
    });
    // The Domain's method wins: a "Google_…" name signed in with the password stays a password session.
    Object.assign(profile, { signInMethod: 'cognito', email: '' });
    expect(await store.loadProfile()).toEqual({ displayName: profile.displayName, username: 'Google_109384756', signInMethod: 'cognito' });
    // Only when the Domain reports no method does Cognito's own name stand in for Google.
    Object.assign(profile, { signInMethod: undefined });
    expect(await store.loadProfile()).toEqual({ displayName: profile.displayName, username: 'Google_109384756', signInMethod: 'google' });
    Object.assign(profile, { signInMethod: 'something-else' });
    expect(await store.loadProfile()).toEqual({ displayName: profile.displayName, username: 'Google_109384756' });
    Object.assign(profile, { username: 'learner@example.test', signInMethod: undefined });
    expect(await store.loadProfile()).toEqual({ displayName: profile.displayName, username: 'learner@example.test' });
  });

  it('keeps every reported sign-in method, Google first, and drops unknown or repeated ones (DLV-969 account linking)', async () => {
    Object.assign(profile, {
      signInMethod: 'cognito', email: 'learner@gmail.com',
      signInMethods: [
        { provider: 'cognito', email: 'learner@gmail.com' },
        { provider: 'google', email: 'learner@gmail.com' },
        { provider: 'google', email: 'learner@gmail.com' },
        { provider: 'saml', email: 'learner@gmail.com' },
        { provider: 'cognito', email: 42 },
        null,
        'google',
      ],
    });
    expect(await store.loadProfile()).toEqual({
      // The Domain reported this session's method, so it is kept (DLV-969 review: the Domain's method wins).
      displayName: profile.displayName, username: profile.username, signInMethod: 'cognito', email: 'learner@gmail.com',
      signInMethods: [
        { provider: 'google', email: 'learner@gmail.com' },
        { provider: 'cognito', email: 'learner@gmail.com' },
        { provider: 'cognito' },
      ],
    });
    // One method, or a list that is not a list: only well-formed entries reach the page.
    Object.assign(profile, { signInMethods: [{ provider: 'cognito', email: 'learner@gmail.com' }] });
    expect((await store.loadProfile()).signInMethods).toEqual([{ provider: 'cognito', email: 'learner@gmail.com' }]);
    Object.assign(profile, { signInMethods: 'google' });
    expect((await store.loadProfile()).signInMethods).toBeUndefined();
    Object.assign(profile, { signInMethods: [{ provider: 'unknown' }] });
    expect((await store.loadProfile()).signInMethods).toBeUndefined();
  });

  it('falls back to the method of this session when the service sends no list, and guesses nothing without one', () => {
    const base = { displayName: 'Sample', username: 'sample@example.test' };
    expect(accountSignInMethods({ ...base, signInMethod: 'google', email: 'learner@gmail.com' }))
      .toEqual([{ provider: 'google', email: 'learner@gmail.com' }]);
    expect(accountSignInMethods({ ...base, signInMethod: 'google' })).toEqual([{ provider: 'google' }]);
    expect(accountSignInMethods({ ...base, signInMethod: 'cognito', email: 'sample@example.test' }))
      .toEqual([{ provider: 'cognito', email: 'sample@example.test' }]);
    expect(accountSignInMethods(base)).toEqual([]);
    expect(accountSignInMethods({ ...base, signInMethods: [], signInMethod: 'google' })).toEqual([{ provider: 'google' }]);
    expect(accountSignInMethods({ ...base, signInMethod: 'google', signInMethods: [{ provider: 'cognito' }, { provider: 'google' }] }))
      .toEqual([{ provider: 'google' }, { provider: 'cognito' }]);
    expect(readSignInMethods(undefined)).toEqual([]);
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
