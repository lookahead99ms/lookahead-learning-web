import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  ACCOUNT_FETCH,
  AccountPlan,
  SavedPlan,
  StudyPlanAccount,
  savedAccountPlan,
} from './study-plan-account';

const local: SavedPlan = {
  schemaVersion: 'study-plan-local/v1',
  revision: 3,
  goal: 'Prepare Java',
  rankingVersion: null,
  snapshot: {
    config: {
      days: 7,
      dailyHours: 1,
      topicIds: ['learn:core-java'],
      accessTopicIds: ['learn:core-java'],
    },
    days: [],
    weeks: [],
    focusedDailyHours: 1,
    bufferHours: 0,
    includedTopics: [],
    excludedTopics: [],
    uniqueNewItems: 0,
    reviewAssignments: 0,
    schedulingVersion: 'study-schedule/v2',
  },
  completedIds: ['legacy-item'],
  shiftedDays: 0,
  attemptedContentIds: ['legacy-attempt'],
  reviewNotes: { 'legacy-attempt': 'Read constraints again' },
  history: [],
};
const result: AccountPlan = {
  planId: 'plan-a',
  versionId: 'version-a',
  revision: 1,
  goal: local.goal,
  snapshot: local.snapshot,
  provenance: { algorithmVersion: 'study-schedule/v2', catalogVersion: null, rankingVersion: null },
  progress: {
    completedContentIds: [],
    completedSessionIds: [],
    attemptedContentIds: [],
    needsReviewContentIds: [],
    notes: {},
    sessionOutcomes: {},
    legacySource: { completedIds: ['legacy-item'] },
  },
  recovery: { strategy: 'none', elapsedDays: 0, deadlineDays: 7, deferredContentIds: [] },
  createdAt: '2026-09-10T00:00:00Z',
  updatedAt: '2026-09-10T00:00:00Z',
};
const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('StudyPlanAccount transport and isolation', () => {
  let store: StudyPlanAccount;
  let mutations: { path: string; options: RequestInit }[];
  let failMutation: number;
  let me: boolean;
  let nextPlan: AccountPlan;
  let fetcher: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mutations = [];
    failMutation = 0;
    me = false;
    nextPlan = structuredClone(result);
    fetcher = vi.fn(async (path: string, options: RequestInit) => {
      expect(options.credentials).toBe('same-origin');
      if (path.endsWith('/auth/csrf'))
        return json({ token: 'test-csrf', headerName: 'X-CSRF-TOKEN' });
      if (path.endsWith('/auth/login')) {
        me = true;
        return json({
          accountId: 'account-a',
          username: 'demo-a',
          displayName: 'Demo A',
          topicGrants: ['learn:core-java'],
        });
      }
      if (path.endsWith('/auth/logout')) {
        me = false;
        return new Response(null, { status: 204 });
      }
      if (path.endsWith('/auth/me'))
        return me
          ? json({ accountId: 'account-a', topicGrants: [] })
          : new Response(null, { status: 401 });
      if (path.endsWith('/account-catalog'))
        return json({
          catalogVersion: 'current-catalog',
          algorithmVersions: ['study-schedule/v2'],
          rankingVersions: [],
          topicIds: ['learn:core-java'],
        });
      if (path.includes('/plans?')) return json({ plans: [], nextCursor: null });
      if (options.method === 'POST') {
        mutations.push({ path, options });
        if (failMutation) return new Response(null, { status: failMutation });
        return json(nextPlan);
      }
      return json(nextPlan);
    });
    TestBed.configureTestingModule({ providers: [{ provide: ACCOUNT_FETCH, useValue: fetcher }] });
    store = TestBed.inject(StudyPlanAccount);
  });

  it('creates an account with explicit profile data and CSRF without importing browser plans', async () => {
    const originalTransport = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation(async (path: string, options: RequestInit) =>
      path.endsWith('/auth/register')
        ? json({
            accountId: 'registered',
            username: 'new@example.test',
            displayName: 'New Learner',
            topicGrants: [],
          })
        : originalTransport(path, options),
    );
    const details = {
      firstName: 'New',
      lastName: 'Learner',
      email: 'new@example.test',
      password: 'long test passphrase',
      confirmPassword: 'long test passphrase',
      countryCode: 'US',
    };
    expect(await store.register(details)).toBe(true);
    const call = fetcher.mock.calls.find(([path]) => path.endsWith('/auth/register'))!;
    expect(JSON.parse(call[1].body as string)).toEqual(details);
    expect(call[1].headers).toEqual({
      'X-CSRF-TOKEN': 'test-csrf',
      'Content-Type': 'application/json',
    });
    expect(store.account()?.accountId).toBe('registered');
    expect(store.active()).toBeNull();
    expect(fetcher.mock.calls.some(([path]) => path.includes('/plans/imports'))).toBe(false);
  });

  it('does not authenticate or report a plan conflict when registration is rejected', async () => {
    const originalTransport = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation(async (path: string, options: RequestInit) =>
      path.endsWith('/auth/register')
        ? new Response(null, { status: 409 })
        : originalTransport(path, options),
    );
    expect(
      await store.register({
        firstName: 'New',
        lastName: 'Learner',
        email: 'new@example.test',
        password: 'long test passphrase',
        confirmPassword: 'long test passphrase',
        countryCode: 'US',
      }),
    ).toBe(false);
    expect(store.account()).toBeNull();
    expect(store.error()).toContain('already have an account');
    expect(store.error()).not.toContain('plan changed');
  });

  it('uses session login and refreshes CSRF without storing credentials or copying a browser plan', async () => {
    await store.initialize();
    expect(store.account()).toBeNull();
    expect(await store.login('demo-a', 'synthetic-test-password')).toBe(true);
    const call = fetcher.mock.calls.find(([path]) => path.endsWith('/auth/login'))!;
    expect(call[1].body).toBeInstanceOf(URLSearchParams);
    expect(call[1].headers).toEqual({ 'X-CSRF-TOKEN': 'test-csrf' });
    expect(fetcher.mock.calls.filter(([path]) => path.endsWith('/auth/csrf'))).toHaveLength(2);
    expect(mutations).toEqual([]);
    expect(store.active()).toBeNull();
  });

  it('uses the gateway after OAuth discovery and keeps identity login separate until the redirect completes', async () => {
    const transport = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation((path: string, options: RequestInit) =>
      path === '/api/v1/auth/options'
        ? Promise.resolve(json({ registration: true, google: false, oauth: true }))
        : transport(path, options),
    );
    await store.initialize();
    expect(fetcher.mock.calls.some(([path]) => path === '/bff/api/v1/auth/me')).toBe(true);
    expect(await store.login('demo-a', 'synthetic-test-password')).toBe(true);
    expect(store.account()).toBeNull();
    expect(fetcher.mock.calls.some(([path]) => path === '/api/v1/auth/csrf')).toBe(true);
    expect(fetcher.mock.calls.some(([path]) => path === '/api/v1/auth/login')).toBe(true);
    expect(fetcher.mock.calls.some(([path]) => path.includes('account-catalog'))).toBe(false);
    expect(store.apiPath('/plans')).toBe('/bff/api/v1/plans');
  });

  it('restores an OAuth gateway session without placing bearer credentials on browser requests', async () => {
    const transport = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    me = true;
    fetcher.mockImplementation((path: string, options: RequestInit) =>
      path === '/api/v1/auth/options'
        ? Promise.resolve(json({ registration: true, google: false, oauth: true }))
        : transport(path, options),
    );
    await store.initialize();
    expect(store.account()?.accountId).toBe('account-a');
    const protectedCalls = fetcher.mock.calls.filter(([path]) => !path.endsWith('/auth/options'));
    expect(protectedCalls.length).toBeGreaterThan(2);
    for (const [path, options] of protectedCalls) {
      expect(path.startsWith('/bff/')).toBe(true);
      expect(new Headers(options.headers).has('Authorization')).toBe(false);
    }
  });

  it('imports the original snapshot explicitly without inventing historical catalog provenance', async () => {
    await store.login('demo-a', 'test');
    const before = JSON.stringify(local);
    await store.importLocal(local);
    const sent = JSON.parse(mutations[0].options.body as string);
    expect(sent.localSnapshot).toEqual(local);
    expect(sent.provenance.catalogVersion).toBeNull();
    expect(sent.provenance.rankingVersion).toBeNull();
    expect(JSON.stringify(local)).toBe(before);
    expect(store.active()?.planId).toBe('plan-a');
    // Legacy import evidence alone must not be silently promoted into canonical completion.
    expect(savedAccountPlan(store.active()!).completedIds).toEqual([]);
  });

  it('retries an uncertain mutation with the same immutable body and idempotency key', async () => {
    await store.login('demo-a', 'test');
    failMutation = 503;
    const draft = structuredClone(local);
    await store.importLocal(draft);
    draft.goal = 'Changed after request';
    expect(store.pending()).toBe(true);
    expect(await store.login('demo-b', 'test')).toBe(false);
    expect(await store.logout()).toBe(false);
    failMutation = 0;
    await store.retry();
    expect(mutations).toHaveLength(2);
    expect(mutations[0].options.body).toBe(mutations[1].options.body);
    expect(mutations[0].options.headers).toEqual(mutations[1].options.headers);
    expect(store.pending()).toBe(false);
  });

  it('treats SIGN_IN_LIMIT as a restricted challenge without loading learner data', async () => {
    const originalFetch = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation(async (path: string, options: RequestInit) =>
      path.endsWith('/auth/login')
        ? new Response(
            JSON.stringify({ code: 'SIGN_IN_LIMIT', expiresAt: '2026-09-19T12:00:00Z' }),
            { status: 409 },
          )
        : originalFetch(path, options),
    );
    expect(await store.login('sample', 'synthetic')).toBe(false);
    expect(store.signInLimit()).toBe(true);
    expect(store.account()).toBeNull();
    expect(store.active()).toBeNull();
    expect(store.plans()).toEqual([]);
    expect(store.error()).toBe('');
    expect(fetcher.mock.calls.some(([path]) => /account-catalog|plans\?/.test(path))).toBe(false);
  });

  it('reports a failed account-data restore after identity succeeds instead of implying no saved plans', async () => {
    me = true;
    const originalFetch = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation(async (path: string, options: RequestInit) =>
      path.endsWith('/account-catalog')
        ? new Response(null, { status: 401 })
        : originalFetch(path, options),
    );
    await store.initialize();
    expect(store.account()).not.toBeNull();
    expect(store.sessionExpired()).toBe(true);
    expect(store.errorStatus()).toBe(401);
    expect(store.error()).toContain('session expired');
    expect(store.active()).toBeNull();
    expect(store.planSummariesState()).toBe('error');
  });

  it('marks the plan summary ready only after all pages load', async () => {
    me = true;
    const originalFetch = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    let finishSecondPage!: (response: Response) => void;
    const secondPage = new Promise<Response>((resolve) => {
      finishSecondPage = resolve;
    });
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (path.includes('/plans?')) {
        return path.includes('after=')
          ? secondPage
          : json({ plans: [{ planId: 'first' }], nextCursor: 'next cursor' });
      }
      return originalFetch(path, options);
    });
    const loading = store.initialize();
    await vi.waitFor(() =>
      expect(fetcher.mock.calls.some(([path]) => path.includes('after=next%20cursor'))).toBe(true),
    );
    expect(store.planSummariesState()).toBe('loading');
    expect(store.plans()).toEqual([]);
    finishSecondPage(json({ plans: [{ planId: 'second' }], nextCursor: null }));
    await loading;
    expect(store.planSummariesState()).toBe('ready');
    expect(store.plans().map((plan) => plan.planId)).toEqual(['first', 'second']);
  });

  it('does not treat a failed plan-list request as an empty account', async () => {
    me = true;
    const originalFetch = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation(async (path: string, options: RequestInit) =>
      path.includes('/plans?') ? new Response(null, { status: 503 }) : originalFetch(path, options),
    );
    await store.initialize();
    expect(store.account()).not.toBeNull();
    expect(store.plans()).toEqual([]);
    expect(store.planSummariesState()).toBe('error');
  });

  it('uses the latest server revision for activity and does not overwrite a conflict', async () => {
    await store.login('demo-a', 'test');
    await store.open('plan-a');
    nextPlan = { ...nextPlan, revision: 2 };
    await store.activity([
      { type: 'setNote', canonicalContentId: 'item', text: 'Check assumptions' },
    ]);
    expect(JSON.parse(mutations[0].options.body as string).expectedRevision).toBe(1);
    failMutation = 409;
    await store.activity([
      { type: 'setContentCompletion', canonicalContentId: 'item', completed: true },
    ]);
    expect(JSON.parse(mutations[1].options.body as string).expectedRevision).toBe(2);
    expect(store.active()?.revision).toBe(2);
    expect(store.error()).toContain('changed elsewhere');
    expect(store.pending()).toBe(true);
    store.discardPending();
    expect(store.pending()).toBe(false);
  });

  it('clears account data on logout and starts a new plan without copying another plan’s progress', async () => {
    await store.login('demo-a', 'test');
    await store.open('plan-a');
    store.newPlan();
    expect(store.active()).toBeNull();
    await store.save(local);
    expect(mutations[0].path).toBe('/api/v1/plans');
    expect(JSON.parse(mutations[0].options.body as string).progress).toBeUndefined();
    await store.logout();
    expect(store.account()).toBeNull();
    expect(store.active()).toBeNull();
    expect(store.catalog()).toBeNull();
    expect(store.plans()).toEqual([]);
    expect(store.planSummariesState()).toBe('idle');
  });

  it('signs out through the unchanged CSRF-protected gateway contract', async () => {
    await store.login('demo-a', 'test');
    store.authOptions.set({ registration: true, google: false, oauth: true });
    expect(await store.logout()).toBe(true);
    const request = fetcher.mock.calls.find(([path]) => path === '/bff/api/v1/auth/logout');
    expect(store.logoutRedirectPending()).toBe(false);
    expect(request?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-TOKEN': 'test-csrf' },
    });
    expect(store.account()).toBeNull();
    expect(store.plans()).toEqual([]);
  });

  it('preserves the validated server-directed OAuth logout and rejects an external redirect', async () => {
    await store.login('demo-a', 'test');
    store.authOptions.set({ registration: false, google: false, oauth: true });
    const transport = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    let destination = new URL('/connect/logout?request=synthetic', window.location.origin).href;
    fetcher.mockImplementation((path: string, options: RequestInit) =>
      path.endsWith('/auth/logout')
        ? Promise.resolve(json({ logoutUrl: destination }))
        : transport(path, options),
    );
    expect(await store.logout()).toBe(true);
    expect(store.logoutRedirectPending()).toBe(true);
    destination = 'https://external.example/connect/logout';
    expect(await store.logout()).toBe(false);
    expect(store.logoutRedirectPending()).toBe(false);
  });

  it('treats an already-expired logout session as signed out', async () => {
    await store.login('demo-a', 'test');
    const transport = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    fetcher.mockImplementation((path: string, options: RequestInit) =>
      path.endsWith('/auth/logout')
        ? Promise.resolve(new Response(null, { status: 401 }))
        : transport(path, options),
    );
    expect(await store.logout()).toBe(true);
    expect(store.account()).toBeNull();
    expect(store.sessionExpired()).toBe(false);
  });

  it('does not attribute a session-expired save to another account', async () => {
    await store.login('demo-a', 'test');
    await store.open('plan-a');
    failMutation = 401;
    await store.activity([{ type: 'setNote', canonicalContentId: 'item', text: 'Private note' }]);
    expect(store.sessionExpired()).toBe(true);
    expect(store.pending()).toBe(true);
    store.discardPending();
    await store.login('demo-b', 'test');
    expect(store.active()).toBeNull();
    expect(store.sessionExpired()).toBe(false);
    expect(await store.retry()).toBeNull();
    expect(mutations).toHaveLength(1);
  });
  it('preserves server provenance for recovery and resets update strategy without losing elapsed days', async () => {
    await store.login('demo-a', 'test');
    nextPlan.provenance.origin = 'generated';
    nextPlan.recovery = {
      strategy: 'fixed-window',
      elapsedDays: 4,
      deadlineDays: 7,
      deferredContentIds: [],
    };
    await store.open('plan-a');
    await store.save(local, 'recovery', nextPlan.recovery);
    expect(JSON.parse(mutations[0].options.body as string).provenance.origin).toBe('generated');
    expect((mutations[0].options.headers as Record<string, string>)['X-LookAhead-Account']).toBe(
      'account-a',
    );
    await store.save(local);
    expect(JSON.parse(mutations[1].options.body as string).recovery).toEqual({
      strategy: 'none',
      elapsedDays: 4,
      deadlineDays: 7,
      deferredContentIds: [],
    });
  });

  it('completes the identity transition even if post-login CSRF refresh fails', async () => {
    await store.login('demo-a', 'test');
    await store.open('plan-a');
    const originalTransport = fetcher.getMockImplementation() as (
      path: string,
      options: RequestInit,
    ) => Promise<Response>;
    let csrfCalls = 0;
    fetcher.mockImplementation(async (path: string, options: RequestInit) => {
      if (path.endsWith('/auth/csrf') && ++csrfCalls === 2)
        return new Response(null, { status: 503 });
      return originalTransport(path, options);
    });
    expect(await store.login('demo-b', 'test')).toBe(true);
    expect(store.active()).toBeNull();
    expect(store.error()).toContain('could not confirm');
  });
});
