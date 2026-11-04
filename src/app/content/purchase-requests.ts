import { formatUsd } from './membership-plans';
import { sameSitePath } from '../core/test-session/same-site-path';

/**
 * DLV-969 (owner, 2026-11-04): in DEV only staff-created test accounts may buy, and each purchase waits for the owner or
 * an admin (admins may decide too, owner update the same day).
 * Every name this contract uses with the Domain lives here, so a rename on the Domain side is a one-line change.
 *
 * - `POST /account/purchases` answers `{ status: 'pending', providerStatus: 'awaiting_owner_approval' }` for a test
 *   account in DEV; a second request while one waits is 409 PURCHASE_REQUEST_PENDING; a real account in DEV is 403
 *   PURCHASES_TEST_ACCOUNTS_ONLY.
 * - Each row of `GET /admin/test-accounts` the owner or an admin reads may carry `pendingPurchase`.
 * - The owner or an admin decides with `POST /admin/test-accounts` and `{ purchaseDecision: { purchaseId, decision } }`;
 *   anyone else gets 403 PURCHASE_APPROVAL_FORBIDDEN.
 */
export const PURCHASE_REQUESTS = {
  pendingStatus: 'pending',
  awaitingOwner: 'awaiting_owner_approval',
  alreadyWaitingCode: 'PURCHASE_REQUEST_PENDING',
  testAccountsOnlyCode: 'PURCHASES_TEST_ACCOUNTS_ONLY',
  approvalForbiddenCode: 'PURCHASE_APPROVAL_FORBIDDEN',
  rowField: 'pendingPurchase',
  decisionPath: '/admin/test-accounts',
  decisionField: 'purchaseDecision',
} as const;

export type PurchaseRequestKind = 'new' | 'upgrade' | 'change' | 'renewal' | 'course-pass';
export type PurchaseDecision = 'approve' | 'decline';

/** A plan as a request names it. */
export interface RequestPlan {
  code: string;
  name: string;
}

/**
 * Who sent the request. `self` is the viewer; `label` is the permanent role label everyone may see ("Admin 2");
 * `name` is the person's name, which only the owner sees (owner-only identities).
 */
export interface RequestedBy {
  self: boolean;
  label: string;
  name?: string | null;
}

/** One test account's purchase waiting for the owner or an admin, as a row of `GET /admin/test-accounts` carries it. */
export interface PendingPurchase {
  purchaseId: string;
  kind: PurchaseRequestKind;
  /** The plan it replaces (upgrade, change); null for a new plan. */
  fromPlan: RequestPlan | null;
  toPlan: RequestPlan;
  priceCents: number;
  /** An upgrade's price difference, when the Domain sends it. */
  differenceCents: number | null;
  /** ISO 8601 instants; empty when not sent. */
  startsAt: string;
  endsAt: string;
  /** A Course Pass's chosen courses. */
  courses: { id: string; title: string }[];
  requestedAt: string;
  requestedBy: RequestedBy | null;
}

/** What the request asks for, in words. */
export const PURCHASE_KIND_LABELS: Record<PurchaseRequestKind, string> = {
  new: 'New plan',
  upgrade: 'Upgrade',
  change: 'Change',
  renewal: 'Renewal',
  'course-pass': 'Course pass',
};

/** Shown while this account already has a request waiting (after a pending answer or the 409). */
export const REQUEST_WAITING_MESSAGE =
  'A request is already waiting for the owner or an admin. Your plan changes once it is approved.';

/** True when the purchase answer is a request waiting for approval rather than a completed purchase. */
export function awaitingOwner(result: { status?: string; providerStatus?: string } | null | undefined): boolean {
  return result?.status === PURCHASE_REQUESTS.pendingStatus && result.providerStatus === PURCHASE_REQUESTS.awaitingOwner;
}

/** True for the Domain's "A request is already waiting for the owner or an admin." refusal (409 PURCHASE_REQUEST_PENDING). */
export function requestAlreadyWaiting(failure: unknown): boolean {
  const refusal = failure as { status?: unknown; code?: unknown } | null;
  return refusal?.status === 409 && refusal.code === PURCHASE_REQUESTS.alreadyWaitingCode;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const cents = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function plan(value: unknown): RequestPlan | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const code = text(v['code']);
  const name = text(v['name']) || code;
  return name ? { code, name } : null;
}

/**
 * The row's waiting request, or null when it has none or the shape is not the one agreed. Every Domain field name is
 * read here and nowhere else; the earlier flat `planCode` / `planName` are still accepted for `toPlan`.
 */
export function pendingPurchaseOf(row: object): PendingPurchase | null {
  const value = (row as Record<string, unknown>)[PURCHASE_REQUESTS.rowField];
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const purchaseId = text(p['purchaseId']);
  const priceCents = cents(p['priceCents']);
  if (!purchaseId || priceCents === null) return null;
  const kind = text(p['kind']);
  const by = p['requestedBy'] && typeof p['requestedBy'] === 'object' ? (p['requestedBy'] as Record<string, unknown>) : null;
  const courses = Array.isArray(p['courses'])
    ? (p['courses'] as unknown[])
        .filter((course): course is Record<string, unknown> => !!course && typeof course === 'object')
        .map((course) => ({ id: text(course['id']), title: text(course['title']) || text(course['id']) }))
        .filter((course) => course.title)
    : [];
  return {
    purchaseId,
    kind: kind in PURCHASE_KIND_LABELS ? (kind as PurchaseRequestKind) : 'new',
    fromPlan: plan(p['fromPlan']),
    toPlan: plan(p['toPlan']) ?? plan({ code: p['planCode'], name: p['planName'] }) ?? { code: '', name: 'Plan' },
    priceCents,
    // The Domain sends the full upgrade difference as priceDifferenceCents (priceCents is the prorated amount).
    differenceCents: cents(p['priceDifferenceCents'] ?? p['differenceCents']),
    startsAt: text(p['startsAt']),
    endsAt: text(p['endsAt']),
    courses,
    requestedAt: text(p['requestedAt']),
    requestedBy: by ? { self: by['self'] === true, label: text(by['label']), name: text(by['name']) || null } : null,
  };
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = (value: string): string | null => {
  const when = new Date(value);
  return value && !Number.isNaN(when.getTime()) ? dayFormat.format(when) : null;
};

/**
 * The request in words: "New plan: Grow", "Upgrade: Learn → Advance", "Change: Grow → Learn (from 12 Nov 2026)",
 * "Renewal: Grow", "Course pass: Redis, Kafka".
 */
export function requestWords(p: PendingPurchase): string {
  const label = PURCHASE_KIND_LABELS[p.kind];
  const to = p.toPlan.name;
  switch (p.kind) {
    case 'upgrade':
      return `${label}: ${p.fromPlan ? `${p.fromPlan.name} → ` : ''}${to}`;
    case 'change': {
      const from = day(p.startsAt);
      return `${label}: ${p.fromPlan ? `${p.fromPlan.name} → ` : ''}${to}${from ? ` (from ${from})` : ''}`;
    }
    case 'course-pass':
      return `${label}: ${p.courses.length ? p.courses.map((course) => course.title).join(', ') : to}`;
    default:
      return `${label}: ${to}`;
  }
}

/** "4 Nov 2026 – 4 Nov 2027"; "From 4 Nov 2026" without an end; null when no dates came. */
export function requestTerm(p: PendingPurchase): string | null {
  const starts = day(p.startsAt);
  const ends = day(p.endsAt);
  if (starts && ends) return `${starts} – ${ends}`;
  if (starts) return `From ${starts}`;
  return ends ? `Until ${ends}` : null;
}

/** "You" for the viewer's own request; the owner sees the name with its label, everyone else the label alone. */
export function submittedBy(p: PendingPurchase, viewerIsOwner: boolean): string {
  const by = p.requestedBy;
  if (!by) return '—';
  if (by.self) return 'You';
  if (viewerIsOwner && by.name) return by.label ? `${by.name} (${by.label})` : by.name;
  return by.label || '—';
}

const requestedFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "4 Nov 2026, 09:15 UTC"; the raw value when it is not a date. */
export function requestedText(value: string): string {
  const when = new Date(value);
  return value && !Number.isNaN(when.getTime()) ? `${requestedFormat.format(when)} UTC` : value || '—';
}

/** "$69.99" from cents. */
export function requestPrice(cents: number): string {
  return formatUsd(cents);
}

/** The owner or an admin approves or declines one waiting request; anyone else gets 403 PURCHASE_APPROVAL_FORBIDDEN. */
export function decidePurchase(
  api: { request<T>(path: string, body?: unknown): Promise<T> },
  purchaseId: string,
  decision: PurchaseDecision,
): Promise<unknown> {
  return api.request(PURCHASE_REQUESTS.decisionPath, { [PURCHASE_REQUESTS.decisionField]: { purchaseId, decision } });
}

/**
 * DLV-969 (owner, 2026-11-04): Review request on the request-sent notice ends the test session and lands here, on the
 * request in People and access → Test accounts. The address is the only place these values travel; the page reads them
 * once and removes them.
 */
export const REVIEW_PARAMS = { request: 'request', returnTo: 'return', account: 'account' } as const;
export const REVIEW_PATH = '/admin/access';

/** Which request to open, and where Switch to the test account should land afterwards. */
export interface RequestReview {
  purchaseId: string;
  /** The same-site page the purchase started from; null when unknown or not a same-site path. */
  returnTo: string | null;
  accountId: string | null;
}

/**
 * "/admin/access?tab=test&request=<purchaseId>&return=<path>&account=<testAccountId>". A `returnTo` that is not a
 * same-site path is left out; a missing purchase id or account is left out too.
 */
export function reviewRequestUrl(review: { purchaseId?: string | null; returnTo?: string | null; accountId?: string | null }): string {
  const params = new URLSearchParams({ tab: 'test' });
  if (review.purchaseId) params.set(REVIEW_PARAMS.request, review.purchaseId);
  const returnTo = sameSitePath(review.returnTo);
  if (returnTo) params.set(REVIEW_PARAMS.returnTo, returnTo);
  if (review.accountId) params.set(REVIEW_PARAMS.account, review.accountId);
  return `${REVIEW_PATH}?${params.toString()}`;
}

/** The review the address asks for, or null without a request id; an unsafe return path is dropped. */
export function requestReviewOf(params: { get(name: string): string | null }): RequestReview | null {
  const purchaseId = params.get(REVIEW_PARAMS.request)?.trim();
  if (!purchaseId) return null;
  return {
    purchaseId,
    returnTo: sameSitePath(params.get(REVIEW_PARAMS.returnTo)),
    accountId: params.get(REVIEW_PARAMS.account)?.trim() || null,
  };
}
