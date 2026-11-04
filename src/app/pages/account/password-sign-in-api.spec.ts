import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_FETCH } from '../study-plan/study-plan-account';
import {
  maskEmail,
  meetsPasswordRules,
  mergeNext,
  PasswordSignInApi,
  PasswordSignInError,
  problemMessage,
  safeNext,
} from './password-sign-in-api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function api(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url === '/bff/api/v1/auth/csrf') return json(200, { data: { token: 'csrf-1', headerName: 'X-CSRF-TOKEN' } });
    return respond(url, init);
  });
  TestBed.configureTestingModule({ providers: [{ provide: ACCOUNT_FETCH, useValue: transport }] });
  return { client: TestBed.inject(PasswordSignInApi), calls };
}

describe('PasswordSignInApi', () => {
  it('posts each step to its Gateway route with the session CSRF token and keeps the email in memory', async () => {
    const { client, calls } = api(() => json(200, { data: { step: 'SIGNED_IN', next: '/learn' } }));
    expect(await client.signIn(' priya@example.com ', 'Secret-Passw0rd!', '/learn')).toEqual({ kind: 'signed-in', next: '/learn' });
    const post = calls[1];
    expect(post.url).toBe('/bff/api/v1/auth/password/sign-in');
    expect(post.init.method).toBe('POST');
    expect((post.init.headers as Record<string, string>)['X-CSRF-TOKEN']).toBe('csrf-1');
    expect(JSON.parse(post.init.body as string)).toEqual({ email: 'priya@example.com', password: 'Secret-Passw0rd!', returnTo: '/learn' });
    expect(client.email()).toBe('priya@example.com');

    await client.confirm(' 123456 ', '/');
    await client.resend();
    await client.reset('654321', 'New-Passw0rd!xyz', '/');
    await client.respond({ newPassword: 'New-Passw0rd!xyz' });
    await client.forgot('arjun@example.com');
    await client.signUp({ firstName: 'Arjun', lastName: 'Rao', email: 'arjun@example.com ', password: 'x', returnTo: '/' });
    expect(calls.filter((c) => c.url !== '/bff/api/v1/auth/csrf').map((c) => c.url.replace('/bff/api/v1/auth/password', ''))).toEqual([
      '/sign-in', '/sign-up/confirm', '/sign-up/resend', '/password/reset', '/challenge', '/password/forgot', '/sign-up',
    ]);
    expect(JSON.parse(calls[3].init.body as string)).toEqual({ email: 'priya@example.com', code: '123456', returnTo: '/' });
    expect(client.email()).toBe('arjun@example.com');
  });

  it('maps every Gateway step', async () => {
    const steps = [
      [{ step: 'NEW_PASSWORD' }, { kind: 'new-password' }],
      [{ step: 'APP_CODE' }, { kind: 'code', method: 'app' }],
      [{ step: 'EMAIL_CODE' }, { kind: 'code', method: 'email' }],
      [{ step: 'CODE_SENT', destination: 'p***@e***' }, { kind: 'code-sent', destination: 'p***@e***' }],
      [{ step: 'CODE_SENT' }, { kind: 'code-sent', destination: '' }],
      [{ step: 'SIGN_IN' }, { kind: 'sign-in' }],
      [{ step: 'SIGNED_IN', next: 'https://elsewhere.example' }, { kind: 'signed-in', next: '/' }],
      // DLV-969 S36.8: only a literal true offers the merge; anything else changes nothing.
      [{ step: 'SIGNED_IN', next: '/learn', mergeAvailable: true }, { kind: 'signed-in', next: '/learn', mergeAvailable: true }],
      [{ step: 'SIGNED_IN', next: '/learn', mergeAvailable: 'true' }, { kind: 'signed-in', next: '/learn' }],
      [{ step: 'SIGNED_IN', next: '/learn', mergeAvailable: false }, { kind: 'signed-in', next: '/learn' }],
    ] as const;
    let index = 0;
    const { client } = api(() => json(200, { data: steps[index][0] }));
    for (; index < steps.length; index++) expect(await client.signIn('a@b.c', 'p', '/')).toEqual(steps[index][1]);
  });

  it('turns Gateway codes and failures into plain problems', async () => {
    const cases: [Response | Error, string][] = [
      [json(401, { code: 'INVALID_CREDENTIALS' }), 'credentials'],
      [json(400, { code: 'USER_NOT_CONFIRMED' }), 'not-confirmed'],
      [json(400, { code: 'CODE_MISMATCH' }), 'code'],
      [json(400, { code: 'CODE_EXPIRED' }), 'code-expired'],
      [json(400, { code: 'INVALID_PASSWORD' }), 'password-rules'],
      [json(409, { code: 'USERNAME_EXISTS' }), 'exists'],
      [json(429, {}), 'too-many'],
      [json(400, { code: 'STEP_EXPIRED' }), 'expired'],
      [json(503, { code: 'SERVICE_UNAVAILABLE' }), 'unavailable'],
      [new Response('not json', { status: 502 }), 'unavailable'],
      [json(200, { data: { step: 'SOMETHING_NEW' } }), 'unavailable'],
      [new TypeError('offline'), 'unavailable'],
    ];
    let current = 0;
    const { client } = api(() => {
      const answer = cases[current][0];
      if (answer instanceof Error) throw answer;
      return answer;
    });
    for (; current < cases.length; current++) {
      const failure = await client.signIn('a@b.c', 'p', '/').catch((error) => error);
      expect(failure).toBeInstanceOf(PasswordSignInError);
      expect(failure.problem).toBe(cases[current][1]);
    }
  });

  it('fails closed when the CSRF token cannot be read', async () => {
    const transport = vi.fn(async () => json(500, {}));
    TestBed.configureTestingModule({ providers: [{ provide: ACCOUNT_FETCH, useValue: transport }] });
    const failure = await TestBed.inject(PasswordSignInApi).forgot('a@b.c').catch((error) => error);
    expect(failure.problem).toBe('unavailable');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ACCOUNT_FETCH, useValue: vi.fn(async () => json(200, { data: {} })) }] });
    expect((await TestBed.inject(PasswordSignInApi).forgot('a@b.c').catch((error) => error)).problem).toBe('unavailable');
  });

  it('checks the pool password rules, masks addresses and keeps next paths on this site', () => {
    expect(meetsPasswordRules('Short1!')).toBe(false);
    expect(meetsPasswordRules('alllowercase-1234')).toBe(false);
    expect(meetsPasswordRules('NoSymbolsHere1234')).toBe(false);
    expect(meetsPasswordRules('Good-Passw0rd-123')).toBe(true);
    expect(maskEmail('priya@gmail.com')).toBe('p•••@gmail.com');
    expect(maskEmail('not-an-email')).toBe('not-an-email');
    expect(safeNext('/dev/access?access=pending')).toBe('/dev/access?access=pending');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil')).toBe('/');
    expect(safeNext(42)).toBe('/');
    expect(problemMessage('credentials')).toBe("That email and password don't match.");
    for (const problem of ['not-confirmed', 'code', 'code-expired', 'password-rules', 'exists', 'too-many', 'expired', 'unavailable'] as const)
      expect(problemMessage(problem).length).toBeGreaterThan(10);
  });
});

describe('mergeNext', () => {
  it('returns the next path only for a signed-in step that offers the merge', () => {
    expect(mergeNext({ kind: 'signed-in', next: '/learn', mergeAvailable: true })).toBe('/learn');
    expect(mergeNext({ kind: 'signed-in', next: '/learn' })).toBeNull();
    expect(mergeNext({ kind: 'sign-in' })).toBeNull();
  });
});
