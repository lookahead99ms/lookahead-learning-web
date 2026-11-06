import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MembershipApi, MembershipRequestError } from '../../content/membership-api';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { TestSessions, UsableTestAccount } from '../../core/test-session/test-sessions';
import { sameSitePath } from '../../core/test-session/same-site-path';
import {
  PendingPurchase,
  PurchaseDecision,
  RequestReview,
  decidePurchase,
  pendingPurchaseOf,
  requestPrice,
  requestTerm,
  requestWords,
  requestedText,
  submittedBy,
} from '../../content/purchase-requests';
import type { TestAccountRow } from './test-accounts';

/** DLV-969 (owner wording, 2026-11-04): what Approve or Decline did, with the way into the test account. */
export interface DecisionResult {
  decision: PurchaseDecision;
  accountId: string;
  /** The test account's display name ("Learner06"), or its username when the switcher list does not have it. */
  name: string;
  plan: string;
  /** Where Switch lands: the page the purchase started from when this review came from the DEV checkout screen, else "/". */
  next: string;
}

/** One waiting purchase request with the test account that sent it. */
export interface PurchaseRequestItem {
  row: TestAccountRow;
  request: PendingPurchase;
  /** "Upgrade: Learn → Advance". */
  words: string;
  /** "4 Nov 2026 – 4 Nov 2027", or null. */
  term: string | null;
  price: string;
  /** "difference $45.00" for an upgrade, when sent. */
  difference: string | null;
  /** "You", the role label, or (owner only) the name with its label. */
  by: string;
  requested: string;
}

/**
 * DLV-971 (owner, 2026-11-06): who approves or declines purchase requests, by the permission flags the Domain checks
 * (manage access, or triage feedback, which admins have), not the one role label: a co-author who is also an admin is
 * labelled co-author and would otherwise lose it. Without permissions, author preview counts as the owner, as elsewhere.
 */
export function canDecidePurchases(
  account: { authorPreview?: boolean; permissions?: { manageAccess?: boolean; triageFeedback?: boolean } } | null | undefined,
): boolean {
  const permissions = account?.permissions;
  if (permissions) return !!(permissions.manageAccess || permissions.triageFeedback);
  return account?.authorPreview === true;
}

/** The role this viewer has on People and access; authorPreview without a role counts as the owner, as elsewhere. */
export function viewerRole(account: { authorPreview?: boolean; permissions?: { feedbackRole?: string } } | null | undefined): string {
  return account?.permissions?.feedbackRole ?? (account?.authorPreview ? 'owner' : 'user');
}

/**
 * DLV-969 (owner, 2026-11-04, after testing DEV): the DEV test accounts' purchase requests, on People and access →
 * Waiting for access → Purchase requests. The owner and admins approve or decline them; co-authors and everyone else see
 * nothing (the Domain sends `pendingPurchase` to the owner and admins only and refuses anyone else with 403
 * PURCHASE_APPROVAL_FORBIDDEN). The page loads the test-account rows (it needs the count for its tab label) and passes
 * them in; `reload` asks it for fresh rows after a decision or on Refresh.
 */
@Component({
  selector: 'app-purchase-requests',
  templateUrl: './purchase-requests-panel.html',
  styleUrl: './purchase-requests-panel.css',
})
export class PurchaseRequestsPanel {
  private readonly api = inject(MembershipApi);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly sessions = inject(TestSessions);
  private readonly devSession = inject(DevSession);
  private readonly injector = inject(Injector);
  private readonly host = inject(ElementRef, { optional: true });
  /** `GET /admin/test-accounts` as the page loaded it. */
  readonly rows = input<readonly TestAccountRow[]>([]);
  /** True once the page has an answer (or a failure), so a review knows whether its request is still waiting. */
  readonly loaded = input(false);
  /** The page could not load the rows: said in place of the list. */
  readonly loadError = input('');
  /** The request a test account's DEV checkout screen opened the page on. */
  readonly review = input<RequestReview | null>(null);
  /** The review was read; the page drops its copy. */
  readonly reviewOpened = output<void>();
  /** The rows are out of date (a decision was made): the page loads them again. */
  readonly reload = output<void>();

  readonly dev = computed(() => this.devSession.status() !== null || this.devSession.gated());
  readonly isOwner = computed(() => viewerRole(this.accounts.account()) === 'owner');
  readonly canDecide = computed(() => canDecidePurchases(this.accounts.account()));
  /** Requests decided here: their cards go at once, before the page's fresh rows arrive. */
  private readonly decided = signal<ReadonlySet<string>>(new Set());
  /** Waiting purchase requests, oldest first, for the owner and admins; empty for anyone else. */
  readonly purchaseRequests = computed<PurchaseRequestItem[]>(() => {
    if (!this.canDecide()) return [];
    const owner = this.isOwner();
    const decided = this.decided();
    return this.rows()
      .map((row) => ({ row, request: pendingPurchaseOf(row) }))
      .filter((item): item is { row: TestAccountRow; request: PendingPurchase } => item.request !== null && !decided.has(item.request.purchaseId))
      .sort((a, b) => a.request.requestedAt.localeCompare(b.request.requestedAt))
      .map(({ row, request }) => ({
        row,
        request,
        words: requestWords(request),
        term: requestTerm(request),
        price: requestPrice(request.priceCents),
        difference:
          request.kind === 'upgrade' && request.differenceCents !== null ? `difference ${requestPrice(request.differenceCents)}` : null,
        by: submittedBy(request, owner),
        requested: requestedText(request.requestedAt),
      }));
  });
  /** The request whose Decline is waiting for its one-click confirmation. */
  readonly declining = signal<PurchaseRequestItem | null>(null);
  /** Why the last Approve or Decline failed, shown in that request's own card (its confirmation stays open). */
  readonly failure = signal<{ purchaseId: string; message: string } | null>(null);
  readonly notice = signal('');
  readonly busy = signal(false);
  /** The panel after Approve or Decline; Close dismisses it. */
  readonly result = signal<DecisionResult | null>(null);
  /** The request card highlighted for the review. */
  readonly highlighted = signal<string | null>(null);
  /** The review this panel opened, kept for Switch after the decision (the page clears its own copy). */
  private opened: RequestReview | null = null;
  private readonly opening = effect(() => {
    const review = this.review();
    if (!review || review === this.opened || !this.loaded()) return;
    untracked(() => {
      this.opened = review;
      this.reviewOpened.emit();
      const item = this.purchaseRequests().find((entry) => entry.request.purchaseId === review.purchaseId);
      if (!item) {
        this.notice.set('That purchase request is no longer waiting. It may already be approved or declined.');
        return;
      }
      this.highlighted.set(review.purchaseId);
      afterNextRender(() => this.reveal(review.purchaseId), { injector: this.injector });
    });
  });

  /** Scrolls the request card into view and focuses it, so a keyboard user starts on it. */
  private reveal(purchaseId: string) {
    const root = this.host?.nativeElement as HTMLElement | undefined;
    const card = [...(root?.querySelectorAll<HTMLElement>('.request-item') ?? [])].find((item) => item.dataset['purchase'] === purchaseId);
    card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    card?.focus({ preventScroll: true });
  }

  startDecline(item: PurchaseRequestItem) {
    if (this.busy()) return;
    this.failure.set(null);
    this.declining.set(item);
  }

  cancelDecline() {
    this.declining.set(null);
    this.failure.set(null);
  }

  /** The failure message for this card, or ''. */
  failureOf(item: PurchaseRequestItem): string {
    const failure = this.failure();
    return failure?.purchaseId === item.request.purchaseId ? failure.message : '';
  }

  /**
   * Approve is one click (the owner or admin chose to); Decline comes here after its confirmation. On success the card
   * and its confirmation go and the result shows; on failure both stay, with the reason inside the card.
   */
  async decide(item: PurchaseRequestItem, decision: PurchaseDecision) {
    if (!this.canDecide() || this.busy()) return;
    if (decision === 'decline' && this.declining()?.request.purchaseId !== item.request.purchaseId) return;
    if (decision === 'approve') this.declining.set(null);
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set('');
    this.result.set(null);
    try {
      await decidePurchase(this.api, item.request.purchaseId, decision);
      this.declining.set(null);
      this.highlighted.set(null);
      this.decided.update((ids) => new Set([...ids, item.request.purchaseId]));
      this.reload.emit();
      // DLV-969 (owner wording, 2026-11-04): the result says how to verify it, with Switch to the test account. Switch
      // goes back to the page the purchase started from only when this is the request the DEV checkout screen opened.
      const reviewed = this.opened?.purchaseId === item.request.purchaseId ? sameSitePath(this.opened.returnTo) : null;
      const usable = await this.usable(item.row.accountId);
      this.result.set({
        decision,
        accountId: item.row.accountId,
        name: usable?.displayName || item.row.username,
        plan: item.request.toPlan.name,
        next: reviewed ?? '/',
      });
      afterNextRender(() => (this.host?.nativeElement as HTMLElement | undefined)?.querySelector<HTMLElement>('.decision-result')?.focus(), {
        injector: this.injector,
      });
    } catch (failure) {
      // 403 PURCHASE_APPROVAL_FORBIDDEN ("Only the owner or an admin can approve purchase requests.") in the server's words.
      this.failure.set({
        purchaseId: item.request.purchaseId,
        message:
          failure instanceof MembershipRequestError && failure.status === 403
            ? failure.message
            : reason(failure) + (decision === 'approve' ? 'Approval' : 'Decline') + ' was not confirmed. Refresh and retry.',
      });
    } finally {
      this.busy.set(false);
    }
  }

  /** The switcher's own entry for this test account (its display name), loading the list once; null when it is not there. */
  private async usable(accountId: string): Promise<UsableTestAccount | null> {
    if (!this.dev()) return null;
    if (this.sessions.accounts() === null) await this.sessions.load();
    return this.sessions.accounts()?.find((account) => account.accountId === accountId) ?? null;
  }

  /** Switch to Learner06: starts the test session, landing on the page the purchase started from or Learner06's home. */
  async switchToResult() {
    const result = this.result();
    if (!result) return;
    const account: UsableTestAccount = (await this.usable(result.accountId)) ?? {
      accountId: result.accountId,
      username: result.name,
      displayName: result.name,
      roles: [],
      scenario: null,
    };
    await this.sessions.use(account, result.next);
  }

  /** Switch to another test account: the account menu's own dialog. */
  switchToAnother() {
    void this.sessions.open();
  }

  /** Busy or failed state of the switch, from the shared test sessions. */
  readonly switching = computed(() => !!this.sessions.starting() || this.sessions.returning());
  readonly switchError = this.sessions.error;
}

/** The server's own reason leads the message, so a refusal says why. */
function reason(failure: unknown): string {
  return failure instanceof Error && failure.message ? failure.message + ' ' : '';
}
