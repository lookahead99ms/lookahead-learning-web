import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthorReviewApi } from './author-review-api';
import { AuthorReviewSubmission } from './author-review-client';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';

const root = '/bff/api/v1/author/review-artifacts';
const eventId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const owner = '00000000-0000-4000-8000-000000000003';
const submission: AuthorReviewSubmission = {
  artifactId: 'study-plan-review',
  artifactVersion: 'review/test.1',
  owningTicket: 'DLV-704',
  sourceSha256: 'a'.repeat(64),
  decision: 'need-more',
  comment: 'Please add an example.',
  idempotencyKey: requestId,
  supersedesEventId: null,
};
function registry() {
  return {
    artifactId: submission.artifactId,
    artifactVersion: submission.artifactVersion,
    ticketId: submission.owningTicket,
    contentHash: submission.sourceSha256,
  };
}
function event() {
  return {
    ...registry(),
    eventId,
    decision: 'NEED_MORE',
    comment: submission.comment,
    actorId: owner,
    recordedAt: '2026-09-19T12:00:00Z',
    idempotencyKey: requestId,
    supersedesEventId: null,
  };
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, timestamp: '2026-09-19T12:00:00Z' }), { status });
describe('Domain author-review API boundary', () => {
  const account = signal<any>({ accountId: owner, authorPreview: true });
  const sessionExpired = signal(false);
  let fetcher: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    account.set({ accountId: owner, authorPreview: true });
    sessionExpired.set(false);
    fetcher = vi.fn().mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === root) return json([registry()]);
      if (path === '/bff/api/v1/auth/csrf')
        return json({ token: 'bff-token', headerName: 'X-CSRF-TOKEN' });
      if (options.method === 'POST')
        return json(
          { event: event(), replayed: false, reconciliationStatus: 'PENDING_MAIN_RECONCILIATION' },
          201,
        );
      return json({ entries: [event()], nextCursor: null });
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: ACCOUNT_FETCH, useValue: fetcher },
        { provide: StudyPlanAccount, useValue: { enabled: true, account, sessionExpired } },
      ],
    });
  });
  it('validates registry binding before loading actor-scoped paginated history', async () => {
    const result = await TestBed.inject(AuthorReviewApi).load(submission, eventId);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      root,
      `${root}/study-plan-review/events?limit=50&cursor=${eventId}`,
    ]);
    expect(result.entries[0]).toMatchObject({
      artifactVersion: submission.artifactVersion,
      sourceSha256: submission.sourceSha256,
      recordedBy: 'Your account',
    });
    for (const [, options] of fetcher.mock.calls)
      expect(options).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
  });
  it('uses BFF CSRF and header-only idempotency with the exact Domain body', async () => {
    const receipt = await TestBed.inject(AuthorReviewApi).record(submission);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      '/bff/api/v1/auth/csrf',
      `${root}/study-plan-review/events`,
    ]);
    const options = fetcher.mock.calls[1][1];
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': 'bff-token',
      'Idempotency-Key': requestId,
    });
    expect(JSON.parse(options.body)).toEqual({
      artifactVersion: submission.artifactVersion,
      contentHash: submission.sourceSha256,
      ticketId: submission.owningTicket,
      decision: 'NEED_MORE',
      comment: submission.comment,
      supersedesEventId: null,
    });
    expect(receipt.recordId).toBe(eventId);
  });
  it('preserves server event order when recorded timestamps disagree with sequence order', async () => {
    const newest = { ...event(), recordedAt: '2026-09-19T11:00:00Z' };
    const earlier = {
      ...event(),
      eventId: '00000000-0000-4000-8000-000000000004',
      recordedAt: '2026-09-19T12:00:00Z',
    };
    fetcher
      .mockResolvedValueOnce(json([registry()]))
      .mockResolvedValueOnce(json({ entries: [newest, earlier], nextCursor: null }));
    const result = await TestBed.inject(AuthorReviewApi).load(submission);
    expect(result.entries.map((entry) => entry.recordId)).toEqual([
      newest.eventId,
      earlier.eventId,
    ]);
  });
  it('accepts an exact acknowledged retry without inventing another event', async () => {
    fetcher
      .mockResolvedValueOnce(json({ token: 'bff-token', headerName: 'X-CSRF-TOKEN' }))
      .mockResolvedValueOnce(
        json({
          event: event(),
          replayed: true,
          reconciliationStatus: 'PENDING_MAIN_RECONCILIATION',
        }),
      );
    expect((await TestBed.inject(AuthorReviewApi).record(submission)).recordId).toBe(eventId);
  });
  it.each(['artifactVersion', 'contentHash', 'ticketId', 'artifactId'])(
    'rejects mismatched registry %s before history is loaded',
    async (key) => {
      fetcher.mockResolvedValueOnce(json([{ ...registry(), [key]: 'different' }]));
      await expect(TestBed.inject(AuthorReviewApi).load(submission)).rejects.toMatchObject({
        kind: 'version-changed',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects an event attributed to another account', async () => {
    fetcher
      .mockResolvedValueOnce(json([registry()]))
      .mockResolvedValueOnce(
        json({ entries: [{ ...event(), actorId: 'other' }], nextCursor: null }),
      );
    await expect(TestBed.inject(AuthorReviewApi).load(submission)).rejects.toMatchObject({
      kind: 'unconfirmed',
    });
  });
  it('rejects a response acknowledging a different request key', async () => {
    fetcher
      .mockResolvedValueOnce(json({ token: 'bff-token', headerName: 'X-CSRF-TOKEN' }))
      .mockResolvedValueOnce(
        json({
          event: { ...event(), idempotencyKey: eventId },
          replayed: true,
          reconciliationStatus: 'PENDING_MAIN_RECONCILIATION',
        }),
      );
    await expect(TestBed.inject(AuthorReviewApi).record(submission)).rejects.toMatchObject({
      kind: 'unconfirmed',
    });
  });
  it.each([
    ['REVIEW_ARTIFACT_STALE', 'version-changed'],
    ['REVIEW_IDEMPOTENCY_CONFLICT', 'idempotency-conflict'],
    ['REVIEW_SUPERSESSION_CONFLICT', 'supersession-conflict'],
  ])('preserves the conflict type %s', async (code, kind) => {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code }), { status: 409 }));
    await expect(TestBed.inject(AuthorReviewApi).load(submission)).rejects.toMatchObject({ kind });
  });
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
  ])('recognizes status %s even when the response is not JSON', async (status, kind) => {
    fetcher.mockResolvedValueOnce(new Response('Not available', { status: status as number }));
    await expect(TestBed.inject(AuthorReviewApi).load(submission)).rejects.toMatchObject({ kind });
  });
  it('makes no request without the server-provided author capability', async () => {
    account.set({ accountId: owner, authorPreview: false });
    await expect(TestBed.inject(AuthorReviewApi).record(submission)).rejects.toMatchObject({
      kind: 'forbidden',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('counts Unicode codepoints for comments, rejecting only above 2000', async () => {
    const comment = '🙂'.repeat(2000);
    fetcher
      .mockResolvedValueOnce(json({ token: 'bff-token', headerName: 'X-CSRF-TOKEN' }))
      .mockResolvedValueOnce(
        json({
          event: { ...event(), comment },
          replayed: false,
          reconciliationStatus: 'PENDING_MAIN_RECONCILIATION',
        }),
      );
    expect((await TestBed.inject(AuthorReviewApi).record({ ...submission, comment })).comment).toBe(
      comment,
    );
    const before = fetcher.mock.calls.length;
    await expect(
      TestBed.inject(AuthorReviewApi).record({ ...submission, comment: comment + '🙂' }),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(fetcher).toHaveBeenCalledTimes(before);
  });
  it('discards a pending response after the signed-in account changes', async () => {
    fetcher.mockImplementation(async () => {
      account.set({ accountId: 'different', authorPreview: true });
      return json([registry()]);
    });
    await expect(TestBed.inject(AuthorReviewApi).load(submission)).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
