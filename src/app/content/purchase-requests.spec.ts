import {
  REVIEW_PARAMS,
  requestReviewOf,
  reviewRequestUrl,
  PURCHASE_KIND_LABELS,
  PURCHASE_REQUESTS,
  REQUEST_WAITING_MESSAGE,
  awaitingOwner,
  decidePurchase,
  pendingPurchaseOf,
  requestAlreadyWaiting,
  requestPrice,
  requestTerm,
  requestWords,
  requestedText,
  submittedBy,
  PendingPurchase,
} from './purchase-requests';

describe('DEV purchase requests contract (DLV-969, owner 2026-11-04)', () => {
  it('keeps every Domain name in one place', () => {
    expect(PURCHASE_REQUESTS).toEqual({
      pendingStatus: 'pending',
      awaitingOwner: 'awaiting_owner_approval',
      alreadyWaitingCode: 'PURCHASE_REQUEST_PENDING',
      testAccountsOnlyCode: 'PURCHASES_TEST_ACCOUNTS_ONLY',
      approvalForbiddenCode: 'PURCHASE_APPROVAL_FORBIDDEN',
      rowField: 'pendingPurchase',
      decisionPath: '/admin/test-accounts',
      decisionField: 'purchaseDecision',
    });
    expect(REQUEST_WAITING_MESSAGE).toBe(
      'A request is already waiting for the owner or an admin. Your plan changes once it is approved.',
    );
  });

  it('reads the Domain\'s priceDifferenceCents as the upgrade difference', () => {
    const row = { pendingPurchase: { purchaseId: 'p9', kind: 'upgrade', fromPlan: { code: 'learn', name: 'Learn' },
      toPlan: { code: 'advance', name: 'Advance' }, priceCents: 3000, priceDifferenceCents: 7500, currency: 'USD',
      startsAt: '2026-11-04T00:00:00Z', endsAt: '2027-11-04T00:00:00Z', requestedAt: '2026-11-04T09:15:00Z',
      requestedBy: { self: true } } };
    expect(pendingPurchaseOf(row)?.differenceCents).toBe(7500);
  });

  it('tells a waiting request from a completed or other pending purchase', () => {
    expect(awaitingOwner({ status: 'pending', providerStatus: 'awaiting_owner_approval' })).toBe(true);
    expect(awaitingOwner({ status: 'pending', providerStatus: 'requires_action' })).toBe(false);
    expect(awaitingOwner({ status: 'succeeded', providerStatus: 'awaiting_owner_approval' })).toBe(false);
    expect(awaitingOwner(null)).toBe(false);
  });

  it('recognises only the 409 PURCHASE_REQUEST_PENDING refusal as already waiting', () => {
    expect(requestAlreadyWaiting({ status: 409, code: 'PURCHASE_REQUEST_PENDING' })).toBe(true);
    expect(requestAlreadyWaiting({ status: 409, code: 'CONFLICT' })).toBe(false);
    expect(requestAlreadyWaiting({ status: 403, code: 'PURCHASE_REQUEST_PENDING' })).toBe(false);
    expect(requestAlreadyWaiting(null)).toBe(false);
  });

  const full = {
    purchaseId: 'p1',
    kind: 'upgrade',
    fromPlan: { code: 'learn', name: 'Learn' },
    toPlan: { code: 'advance', name: 'Advance' },
    priceCents: 14499,
    differenceCents: 4500,
    startsAt: '2026-11-04T00:00:00Z',
    endsAt: '2027-11-04T00:00:00Z',
    courses: [],
    requestedAt: '2026-11-04T09:15:00Z',
    requestedBy: { self: false, label: 'Admin 2', name: 'Priya Rao' },
  };
  const with_ = (change: Record<string, unknown>): PendingPurchase => pendingPurchaseOf({ pendingPurchase: { ...full, ...change } })!;

  it('reads a row’s pending purchase, with safe fallbacks, and ignores anything else', () => {
    expect(pendingPurchaseOf({ pendingPurchase: full })).toEqual({ ...full, requestedBy: { self: false, label: 'Admin 2', name: 'Priya Rao' } });
    expect(pendingPurchaseOf({ pendingPurchase: { purchaseId: 'p2', kind: 'gift', priceCents: 0, planCode: 'learn' } })).toEqual({
      purchaseId: 'p2', kind: 'new', fromPlan: null, toPlan: { code: 'learn', name: 'learn' }, priceCents: 0, differenceCents: null,
      startsAt: '', endsAt: '', courses: [], requestedAt: '', requestedBy: null,
    });
    expect(with_({ toPlan: null, courses: [{ id: 'grow:redis' }, null, { id: '', title: '' }] })).toMatchObject({
      toPlan: { code: '', name: 'Plan' }, courses: [{ id: 'grow:redis', title: 'grow:redis' }],
    });
    expect(with_({ requestedBy: { self: true } }).requestedBy).toEqual({ self: true, label: '', name: null });
    expect(pendingPurchaseOf({})).toBeNull();
    expect(pendingPurchaseOf({ pendingPurchase: null })).toBeNull();
    expect(pendingPurchaseOf({ pendingPurchase: { purchaseId: '', priceCents: 1 } })).toBeNull();
    expect(pendingPurchaseOf({ pendingPurchase: { purchaseId: 'p4', priceCents: 'free' } })).toBeNull();
    expect(Object.keys(PURCHASE_KIND_LABELS)).toEqual(['new', 'upgrade', 'change', 'renewal', 'course-pass']);
  });

  it('says each kind of request in words', () => {
    expect(requestWords(with_({ kind: 'new', fromPlan: null, toPlan: { code: 'grow', name: 'Grow' } }))).toBe('New plan: Grow');
    expect(requestWords(with_({}))).toBe('Upgrade: Learn → Advance');
    expect(requestWords(with_({ fromPlan: null }))).toBe('Upgrade: Advance');
    expect(requestWords(with_({ kind: 'change', fromPlan: { code: 'grow', name: 'Grow' }, toPlan: { code: 'learn', name: 'Learn' }, startsAt: '2026-11-12T00:00:00Z' })))
      .toBe('Change: Grow → Learn (from 12 Nov 2026)');
    expect(requestWords(with_({ kind: 'change', fromPlan: null, startsAt: '' }))).toBe('Change: Advance');
    expect(requestWords(with_({ kind: 'renewal', fromPlan: { code: 'grow', name: 'Grow' }, toPlan: { code: 'grow', name: 'Grow' } }))).toBe('Renewal: Grow');
    expect(requestWords(with_({ kind: 'course-pass', toPlan: { code: 'course-pass', name: 'Course Pass' }, courses: [{ id: 'grow:redis', title: 'Redis' }, { id: 'grow:kafka', title: 'Kafka' }] })))
      .toBe('Course pass: Redis, Kafka');
    expect(requestWords(with_({ kind: 'course-pass', toPlan: { code: 'course-pass', name: 'Course Pass' }, courses: [] }))).toBe('Course pass: Course Pass');
  });

  it('gives the term from the start and end dates', () => {
    expect(requestTerm(with_({}))).toBe('4 Nov 2026 – 4 Nov 2027');
    expect(requestTerm(with_({ endsAt: '' }))).toBe('From 4 Nov 2026');
    expect(requestTerm(with_({ startsAt: 'later' }))).toBe('Until 4 Nov 2027');
    expect(requestTerm(with_({ startsAt: '', endsAt: '' }))).toBeNull();
  });

  it('names who submitted it: You, the name with its label for the owner, the label for everyone else', () => {
    expect(submittedBy(with_({ requestedBy: { self: true, label: 'Owner', name: 'Me' } }), true)).toBe('You');
    expect(submittedBy(with_({}), true)).toBe('Priya Rao (Admin 2)');
    expect(submittedBy(with_({}), false)).toBe('Admin 2');
    expect(submittedBy(with_({ requestedBy: { self: false, label: '', name: 'Priya Rao' } }), true)).toBe('Priya Rao');
    expect(submittedBy(with_({ requestedBy: { self: false, label: '', name: 'Priya Rao' } }), false)).toBe('—');
    expect(submittedBy(with_({ requestedBy: { self: false, label: 'Learner 7' } }), true)).toBe('Learner 7');
    expect(submittedBy(with_({ requestedBy: null }), true)).toBe('—');
  });

  it('formats price and time for the owner’s list', () => {
    expect(requestPrice(7500)).toBe('$75.00');
    expect(requestPrice(6999)).toBe('$69.99');
    expect(requestedText('2026-11-04T09:15:00Z')).toBe('4 Nov 2026, 09:15 UTC');
    expect(requestedText('soon')).toBe('soon');
    expect(requestedText('')).toBe('—');
  });

  it('sends the decision with the exact body', async () => {
    const request = vi.fn(async () => ({}));
    await decidePurchase({ request } as never, 'p1', 'approve');
    await decidePurchase({ request } as never, 'p2', 'decline');
    expect(request.mock.calls).toEqual([
      ['/admin/test-accounts', { purchaseDecision: { purchaseId: 'p1', decision: 'approve' } }],
      ['/admin/test-accounts', { purchaseDecision: { purchaseId: 'p2', decision: 'decline' } }],
    ]);
  });

  it('builds the Review request address with the purchase, a same-site return path and the account', () => {
    expect(REVIEW_PARAMS).toEqual({ request: 'request', returnTo: 'return', account: 'account' });
    expect(reviewRequestUrl({ purchaseId: 'pur-9', returnTo: '/grow/java/streams?unit=2', accountId: 'acc-06' })).toBe(
      '/admin/access?tab=waiting&view=purchases&request=pur-9&return=%2Fgrow%2Fjava%2Fstreams%3Funit%3D2&account=acc-06',
    );
    for (const returnTo of ['//elsewhere.example', 'https://elsewhere.example/', '/\\elsewhere.example', 'grow', null]) {
      expect(reviewRequestUrl({ purchaseId: 'pur-9', returnTo, accountId: 'acc-06' })).toBe('/admin/access?tab=waiting&view=purchases&request=pur-9&account=acc-06');
    }
    expect(reviewRequestUrl({})).toBe('/admin/access?tab=waiting&view=purchases');
  });

  it('reads the review back from the address, dropping an unsafe return path', () => {
    const address = (url: string) => new URL(url, 'https://dev.example').searchParams;
    expect(requestReviewOf(address(reviewRequestUrl({ purchaseId: 'pur-9', returnTo: '/grow/java', accountId: 'acc-06' })))).toEqual({
      purchaseId: 'pur-9', returnTo: '/grow/java', accountId: 'acc-06',
    });
    expect(requestReviewOf(address('/admin/access?request=pur-9&return=%2F%2Felsewhere.example'))).toEqual({
      purchaseId: 'pur-9', returnTo: null, accountId: null,
    });
    expect(requestReviewOf(address('/admin/access?tab=test&return=%2Flearn&account=acc-06'))).toBeNull();
    // The older Test accounts form (before the owner moved purchase requests, 2026-11-04) still reads the same review.
    expect(requestReviewOf(address('/admin/access?tab=test&request=pur-9&return=%2Flearn&account=acc-06'))).toEqual({
      purchaseId: 'pur-9', returnTo: '/learn', accountId: 'acc-06',
    });
    expect(requestReviewOf(address('/admin/access?request=%20%20'))).toBeNull();
  });
});
