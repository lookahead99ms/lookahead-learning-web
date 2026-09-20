import { TestBed } from '@angular/core/testing';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';
import { SignInManagementApi } from './sign-in-management-api';

const first = {
  signInId: 'current-id',
  current: true,
  label: null,
  clientDescription: 'Chrome on macOS',
  createdAt: '2026-09-19T10:00:00Z',
  lastActiveAt: '2026-09-19T12:00:00Z',
};
const second = { ...first, signInId: 'other-id', current: false };
const json = (data: unknown) =>
  new Response(JSON.stringify({ data, timestamp: '2026-09-19T12:00:00Z' }), { status: 200 });
const failure = (status: number, code: string) =>
  new Response(JSON.stringify({ code, message: 'private details' }), { status });

describe('Identity sign-in management contract', () => {
  let api: SignInManagementApi;
  let accounts: StudyPlanAccount;
  let transport: ReturnType<typeof vi.fn>;
  let entries: (typeof first)[];
  let postFailure: Response | null;
  let malformedAck: boolean;
  beforeEach(() => {
    entries = [{ ...first }, { ...second }];
    postFailure = null;
    malformedAck = false;
    transport = vi.fn(async (path: string, options: RequestInit) => {
      expect(path).toMatch(/^\/api\/v1\//);
      expect(options.credentials).toBe('same-origin');
      expect(options.cache).toBe('no-store');
      expect(options.signal).toBeInstanceOf(AbortSignal);
      if (path.endsWith('/auth/csrf'))
        return json({ token: 'test-token', headerName: 'X-CSRF-TOKEN' });
      if (path.endsWith('/auth/options'))
        return json({ oauth: true, registration: true, google: false });
      if (options.method === 'POST') {
        expect(options.headers).toMatchObject({ 'X-CSRF-TOKEN': 'test-token' });
        if (postFailure) return postFailure;
        if (malformedAck) return json({});
        const body =
          options.body instanceof URLSearchParams
            ? options.body
            : JSON.parse(options.body as string);
        if (path.endsWith('/revoke')) {
          entries = entries.filter((value) => value.signInId !== body.signInId);
          return json({ reauthenticationRequired: body.signInId === first.signInId });
        }
        if (path.endsWith('/revoke-others')) {
          entries = [first];
          return json({ reauthenticationRequired: false });
        }
        if (path.endsWith('/label')) {
          entries[0] = { ...first, label: body.label };
          return json(entries[0]);
        }
        if (path.endsWith('/replace') || path.endsWith('/login'))
          return json({ accountId: 'owner' });
        if (path.endsWith('/cancel')) return json({ cancelled: true });
      }
      if (path.endsWith('/sign-in-challenge'))
        return json({ limit: 2, entries, expiresAt: '2026-09-19T12:05:00Z' });
      if (path.endsWith('/sign-ins')) return json({ limit: 2, entries });
      throw new Error('Unexpected synthetic request');
    });
    TestBed.configureTestingModule({
      providers: [{ provide: ACCOUNT_FETCH, useValue: transport }],
    });
    accounts = TestBed.inject(StudyPlanAccount);
    accounts.account.set({
      accountId: 'owner',
      username: 'sample',
      displayName: 'Sample',
      topicGrants: [],
    });
    accounts.authOptions.set({ oauth: true, registration: true, google: false });
    api = TestBed.inject(SignInManagementApi);
  });
  it('reads only the Identity inventory and maps supplied safe fields', async () => {
    const result = await api.load();
    expect(result).toMatchObject({
      limit: 2,
      signIns: [
        { id: 'current-id', current: true },
        { id: 'other-id', current: false },
      ],
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(accounts.account()?.accountId).toBe('owner');
  });
  it('labels only the current sign-in and reloads the authoritative inventory', async () => {
    expect((await api.rename('current-id', 'Work')).signIns[0].label).toBe('Work');
    const request = transport.mock.calls.find(([path]) => path.endsWith('/label'))!;
    expect(JSON.parse(request[1].body as string)).toEqual({ label: 'Work' });
    expect(transport.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/account/sign-ins/label',
      '/api/v1/account/sign-ins',
    ]);
  });
  it('revokes another sign-in without clearing the caller', async () => {
    const result = await api.revoke('other-id');
    expect(result.signedOut).toBe(false);
    expect(result.inventory?.signIns).toHaveLength(1);
    expect(accounts.account()?.accountId).toBe('owner');
  });
  it('clears account and pending data only after current-session acknowledgement', async () => {
    accounts.pending.set(true);
    expect(await api.revoke('current-id')).toEqual({ signedOut: true });
    expect(accounts.account()).toBeNull();
    expect(accounts.plans()).toEqual([]);
    expect(accounts.active()).toBeNull();
    expect(accounts.pending()).toBe(false);
  });
  it('preserves the caller on recent-auth rejection and reauthenticates through the existing login contract', async () => {
    postFailure = failure(403, 'RECENT_AUTHENTICATION_REQUIRED');
    await expect(api.revokeOthers()).rejects.toMatchObject({ kind: 'reauthentication-required' });
    expect(accounts.account()?.accountId).toBe('owner');
    postFailure = null;
    await api.reauthenticate('test password');
    const request = transport.mock.calls.find(([path]) => path.endsWith('/login'))!;
    expect((request[1].body as URLSearchParams).get('username')).toBe('sample');
    expect((request[1].body as URLSearchParams).get('password')).toBe('test password');
    expect(accounts.account()?.accountId).toBe('owner');
  });
  it('does not call a wrong password an expired admitted session', async () => {
    postFailure = failure(401, 'AUTHENTICATION_REQUIRED');
    await expect(api.reauthenticate('wrong')).rejects.toMatchObject({
      kind: 'reauthentication-rejected',
    });
    expect(accounts.account()?.accountId).toBe('owner');
  });
  it('does not clear the account on an unacknowledged revoke', async () => {
    malformedAck = true;
    await expect(api.revoke('current-id')).rejects.toMatchObject({ kind: 'unconfirmed' });
    expect(accounts.account()?.accountId).toBe('owner');
  });
  it('reads the restricted challenge while signed out without initializing learner account data', async () => {
    accounts.account.set(null);
    const initialize = vi.spyOn(accounts, 'initialize');
    expect(await api.loadChallenge()).toMatchObject({
      limit: 2,
      expiresAt: '2026-09-19T12:05:00Z',
    });
    expect(initialize).not.toHaveBeenCalled();
    expect(transport.mock.calls.map(([path]) => path)).toEqual(['/api/v1/auth/sign-in-challenge']);
  });
  it('acknowledges replacement and refreshes CSRF without constructing a protected account', async () => {
    accounts.account.set(null);
    expect(await api.replace('other-id')).toEqual({ oauth: true });
    expect(accounts.account()).toBeNull();
    expect(transport.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/auth/sign-in-challenge/replace',
      '/api/v1/auth/csrf',
      '/api/v1/auth/options',
    ]);
  });
  it('requires cancellation acknowledgement without changing admitted account data', async () => {
    await api.cancelChallenge();
    expect(accounts.account()?.accountId).toBe('owner');
    malformedAck = true;
    await expect(api.cancelChallenge()).rejects.toMatchObject({ kind: 'unconfirmed' });
  });
  it.each([
    [400, 'SIGN_IN_CHALLENGE_INVALID', 'expired'],
    [429, 'SIGN_IN_RATE_LIMITED', 'rate-limited'],
    [503, 'ACCOUNT_STORAGE_UNAVAILABLE', 'unavailable'],
  ])('maps %s %s safely', async (status, code, kind) => {
    postFailure = failure(status as number, code as string);
    await expect(api.replace('other-id')).rejects.toMatchObject({ kind });
    expect(accounts.account()?.accountId).toBe('owner');
  });
});
