import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_FETCH } from '../study-plan/study-plan-account';
import { AccountMergeClient, isMergeToken, maskMergeEmail } from './account-merge-client';

const TOKEN = 'a'.repeat(20) + '_-' + 'B9'.repeat(10) + 'z';
const candidate = (id: string, extra: Record<string, unknown> = {}) => ({
  accountId: id,
  displayName: 'Priya ' + id,
  signInMethods: [{ provider: 'cognito', email: 'priya@gmail.com' }, { provider: 'google', email: 'priya@gmail.com' }],
  admitted: true,
  createdAt: '2026-10-01T10:00:00Z',
  lastSignInAt: '2026-11-02T09:00:00Z',
  studyPlans: [{ id: 'p1', title: 'Java basics', progressPercent: 42.4 }],
  ...extra,
});
const merge = { email: 'priya@gmail.com', expiresAt: '2026-11-04T10:30:00Z', candidates: [candidate('k1'), candidate('k2')] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function setup(answer: (path: string, options: RequestInit) => Response | Promise<Response>) {
  const transport = vi.fn(async (path: string, options: RequestInit) => {
    expect(options.credentials).toBe('same-origin');
    expect(options.cache).toBe('no-store');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    if (path === '/api/v1/auth/csrf') return json(200, { data: { token: 'csrf-token', headerName: 'X-CSRF-TOKEN' } });
    return answer(path, options);
  });
  TestBed.configureTestingModule({ providers: [{ provide: ACCOUNT_FETCH, useValue: transport }] });
  return { client: TestBed.inject(AccountMergeClient), transport };
}

describe('AccountMergeClient', () => {
  it('asks for the merge email with CSRF and reads every 2xx and 429 the same way', async () => {
    let status = 202;
    const { client, transport } = setup((path, options) => {
      expect(path).toBe('/api/v1/account/merge/request');
      expect(options.method).toBe('POST');
      expect(options.headers).toMatchObject({ 'X-CSRF-TOKEN': 'csrf-token', 'Content-Type': 'application/json' });
      expect(options.body).toBe('{}');
      return new Response(status === 202 ? '{}' : JSON.stringify({ code: 'X' }), { status });
    });
    expect(await client.requestMergeEmail()).toEqual({ kind: 'sent' });
    status = 429;
    expect(await client.requestMergeEmail()).toEqual({ kind: 'sent' });
    status = 401;
    expect(await client.requestMergeEmail()).toEqual({ kind: 'signed-out' });
    status = 503;
    expect(await client.requestMergeEmail()).toEqual({ kind: 'unavailable' });
    expect(transport).toHaveBeenCalledWith('/api/v1/auth/csrf', expect.anything());
  });

  it('reports a failed CSRF step or network as unavailable, never throws', async () => {
    const transport = vi.fn(async (path: string) =>
      path.endsWith('/csrf') ? json(200, { data: { token: 'x', headerName: 'bad header' } }) : json(202, {}),
    );
    TestBed.configureTestingModule({ providers: [{ provide: ACCOUNT_FETCH, useValue: transport }] });
    const client = TestBed.inject(AccountMergeClient);
    expect(await client.requestMergeEmail()).toEqual({ kind: 'unavailable' });
    transport.mockImplementation(async (path: string) => (path.endsWith('/csrf') ? new Response('', { status: 500 }) : json(202, {})));
    expect(await client.requestMergeEmail()).toEqual({ kind: 'unavailable' });
    transport.mockRejectedValue(new TypeError('offline'));
    expect(await client.requestMergeEmail()).toEqual({ kind: 'unavailable' });
    expect(await client.loadMerge(TOKEN)).toEqual({ kind: 'unavailable' });
    expect(await client.merge(TOKEN, 'k1')).toEqual({ kind: 'unavailable' });
  });

  it('loads the candidates and keeps only well-formed answers', async () => {
    let body: unknown = { data: merge };
    let status = 200;
    const { client } = setup((path, options) => {
      expect(path).toBe('/api/v1/account/merge/' + TOKEN);
      expect(options.method).toBeUndefined();
      return json(status, body);
    });
    const result = await client.loadMerge(TOKEN);
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.merge.email).toBe('priya@gmail.com');
    expect(result.merge.candidates).toHaveLength(2);
    expect(result.merge.candidates[0].signInMethods.map((m) => m.provider)).toEqual(['google', 'cognito']);
    expect(result.merge.candidates[0].studyPlans[0].progressPercent).toBe(42);
    // paidMembership is optional: absent reads as none.
    expect(result.merge.candidates.map((c) => c.paidMembership)).toEqual([false, false]);

    body = { data: { ...merge, candidates: [candidate('k1', { lastSignInAt: null, studyPlans: [{ id: 'p', title: 'T', progressPercent: 140 }] }), candidate('k2')] } };
    const capped = await client.loadMerge(TOKEN);
    expect(capped.kind === 'ready' && capped.merge.candidates[0]).toMatchObject({ lastSignInAt: null, studyPlans: [{ progressPercent: 100 }] });

    body = { data: { ...merge, candidates: [candidate('k1', { paidMembership: true }), candidate('k2', { paidMembership: 'yes' })] } };
    const paid = await client.loadMerge(TOKEN);
    expect(paid.kind === 'ready' && paid.merge.candidates.map((c) => c.paidMembership)).toEqual([true, false]);

    for (const bad of [
      { data: { ...merge, candidates: [candidate('k1')] } },
      { data: { ...merge, candidates: [candidate('k1'), candidate('k1')] } },
      { data: { ...merge, candidates: [candidate('k1'), candidate('k2', { createdAt: 'yesterday' })] } },
      { data: { ...merge, candidates: [candidate('k1'), candidate('k2', { studyPlans: [{ id: 'p' }] })] } },
      { data: { ...merge, candidates: [candidate('k1'), null] } },
      { data: { email: 5, candidates: [] } },
      {},
    ]) {
      body = bad;
      expect(await client.loadMerge(TOKEN)).toEqual({ kind: 'unavailable' });
    }
    status = 404;
    body = { code: 'MERGE_TOKEN_INVALID' };
    expect(await client.loadMerge(TOKEN)).toEqual({ kind: 'invalid' });
    // A disabled account in the group, or fewer than two left: 409 already on the GET.
    status = 409;
    body = { code: 'MERGE_CONFLICT' };
    expect(await client.loadMerge(TOKEN)).toEqual({ kind: 'conflict' });
    status = 401;
    expect(await client.loadMerge(TOKEN)).toEqual({ kind: 'signed-out' });
    status = 500;
    body = 'not json';
    expect(await client.loadMerge(TOKEN)).toEqual({ kind: 'unavailable' });
  });

  it('never sends a malformed token', async () => {
    const { client, transport } = setup(() => json(200, {}));
    expect(await client.loadMerge('short')).toEqual({ kind: 'invalid' });
    expect(await client.merge('../../admin' + 'x'.repeat(32), 'k1')).toEqual({ kind: 'invalid' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('merges and maps 404, 409, 422 and a signed-out session to typed results', async () => {
    let status = 200;
    let body: unknown = { data: { keptAccountId: 'k1' } };
    const { client } = setup((path, options) => {
      expect(path).toBe('/api/v1/account/merge/' + TOKEN);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body as string)).toEqual({ keepAccountId: 'k1' });
      return json(status, body);
    });
    expect(await client.merge(TOKEN, 'k1')).toEqual({ kind: 'merged', keptAccountId: 'k1' });
    body = { data: {} };
    expect(await client.merge(TOKEN, 'k1')).toEqual({ kind: 'unavailable' });
    const cases: [number, string, string][] = [
      [404, 'MERGE_TOKEN_INVALID', 'invalid'],
      [409, 'MERGE_CONFLICT', 'conflict'],
      [422, 'INVALID_REQUEST', 'not-candidate'],
      [400, 'INVALID_MERGE_REQUEST', 'unavailable'],
      [401, '', 'signed-out'],
      [403, 'CSRF_INVALID', 'signed-out'],
      [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
    ];
    for (const [code, name, kind] of cases) {
      status = code;
      body = { code: name };
      expect(await client.merge(TOKEN, 'k1')).toEqual({ kind });
    }
  });
});

describe('merge helpers', () => {
  it('masks the email with the first and last letter of the name', () => {
    expect(maskMergeEmail('priya@gmail.com')).toBe('p•••a@gmail.com');
    expect(maskMergeEmail(' p@gmail.com ')).toBe('p•••@gmail.com');
    expect(maskMergeEmail('no-at-sign')).toBe('');
    expect(maskMergeEmail('@gmail.com')).toBe('');
    expect(maskMergeEmail('priya@')).toBe('');
  });

  it('accepts only the 43-character URL-safe token', () => {
    expect(isMergeToken(TOKEN)).toBe(true);
    expect(TOKEN).toHaveLength(43);
    expect(isMergeToken(TOKEN + 'a')).toBe(false);
    expect(isMergeToken(TOKEN.slice(1) + '/')).toBe(false);
    expect(isMergeToken(null)).toBe(false);
  });
});
