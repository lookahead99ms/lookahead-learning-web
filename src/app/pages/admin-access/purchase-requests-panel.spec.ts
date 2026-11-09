import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { MembershipApi, MembershipRequestError } from '../../content/membership-api';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { TestSessions } from '../../core/test-session/test-sessions';
import { RequestReview } from '../../content/purchase-requests';
import { PurchaseRequestsPanel, viewerRole } from './purchase-requests-panel';
import { TestAccountRow } from './test-accounts';

/** The page's part: it owns the rows, reloads them when asked and drops its review copy once it is read. */
@Component({
  imports: [PurchaseRequestsPanel],
  template: `<app-purchase-requests [rows]="rows()" [loaded]="loaded()" [loadError]="error()" [review]="review()" (reviewOpened)="opened = opened + 1; review.set(null)" (reload)="reload()" />`,
})
class Host {
  readonly rows = signal<TestAccountRow[]>([]);
  readonly loaded = signal(true);
  readonly error = signal('');
  readonly review = signal<RequestReview | null>(null);
  opened = 0;
  reloads = 0;
  source: () => TestAccountRow[] = () => [];
  reload() {
    this.reloads++;
    this.rows.set(this.source());
  }
}

const base: TestAccountRow = { accountId: 'x', username: 'x', roles: [], revision: 1, access: { label: 'Free' }, lastChangedBy: 'seed', lastChangedAt: '2026-10-16', legacyPresetAvailable: false };
const waiting = (id: string, username: string, pendingPurchase: Record<string, unknown> | null): TestAccountRow => ({ ...base, accountId: id, username, pendingPurchase: pendingPurchase as never });
const advance = { purchaseId: 'pur-2', kind: 'upgrade', fromPlan: { code: 'learn', name: 'Learn' }, toPlan: { code: 'advance', name: 'Advance' }, priceCents: 14499, differenceCents: 4500, startsAt: '2026-11-04T00:00:00Z', endsAt: '2027-11-04T00:00:00Z', requestedAt: '2026-11-04T10:30:00Z', requestedBy: { self: false, label: 'Admin 2', name: 'Priya Rao' } };
const learn = { purchaseId: 'pur-1', kind: 'new', fromPlan: null, toPlan: { code: 'learn', name: 'Learn' }, priceCents: 6999, startsAt: '2026-11-04T00:00:00Z', endsAt: '2027-11-04T00:00:00Z', requestedAt: '2026-11-04T09:15:00Z', requestedBy: { self: true, label: 'Owner' } };
const usable = [
  { accountId: 'acc-07', username: 'learner07@lookahead.dev', displayName: 'Learner07', roles: [], scenario: 'Free · no study plan' },
  { accountId: 'acc-12', username: 'learner12@lookahead.dev', displayName: 'Learner12', roles: [], scenario: 'Learn · active' },
];

/** DLV-969 (owner, DEV test 2026-11-04): purchase requests live on Review requests → Purchase requests. */
describe('Purchase requests on Review requests', () => {
  let rows: TestAccountRow[];
  let request: ReturnType<typeof vi.fn>;
  let decisionFailure: unknown;
  async function render(feedbackRole: 'owner' | 'admin' | 'co-author' | 'user', options: { dev?: boolean; review?: RequestReview } = {}) {
    decisionFailure = null;
    request = vi.fn(async (path: string, body?: unknown) => {
      if (path === '/auth/test-accounts') return usable;
      if (path === '/admin/test-accounts' && body && typeof body === 'object' && 'purchaseDecision' in body) {
        if (decisionFailure) throw decisionFailure;
        const { purchaseId } = (body as { purchaseDecision: { purchaseId: string } }).purchaseDecision;
        rows = rows.map((item) => (item.pendingPurchase?.purchaseId === purchaseId ? { ...item, pendingPurchase: null } : item));
        return {};
      }
      return [];
    });
    const account = signal<any>({ accountId: 'me', username: 'staff', displayName: 'Staff', topicGrants: [], permissions: { manageAccess: feedbackRole === 'owner', triageFeedback: feedbackRole === 'owner' || feedbackRole === 'admin', feedbackRole } });
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: MembershipApi, useValue: { request } }, { provide: StudyPlanAccount, useValue: { account } }] });
    if (options.dev ?? true) TestBed.inject(DevSession).status.set({ dev: true, deadline: '', warning: false, maintenance: false });
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    host.source = () => rows;
    host.rows.set(rows);
    if (options.review) host.review.set(options.review);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const panelOf = (fixture: ReturnType<typeof TestBed.createComponent<Host>>) =>
    fixture.debugElement.children[0].componentInstance as PurchaseRequestsPanel;
  const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const buttons = (root: Element, name: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].filter((button) => text(button) === name);
  async function settle(fixture: ReturnType<typeof TestBed.createComponent<Host>>) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const decisions = () => request.mock.calls.filter(([path, body]) => path === '/admin/test-accounts' && (body as any)?.purchaseDecision);
  beforeEach(() => {
    rows = [waiting('acc-12', 'learner12', advance), waiting('acc-07', 'learner07', learn), waiting('acc-03', 'learner03', null)];
  });

  for (const role of ['owner', 'admin'] as const) {
    it(`shows the ${role} each waiting request, oldest first, with plan, kind, price and time`, async () => {
      const fixture = await render(role);
      const root = fixture.nativeElement as HTMLElement;
      expect(text(root.querySelector('.request-count'))).toBe('2 purchase requests waiting');
      const facts = (item: Element) => [...item.querySelectorAll('.request-facts > div')].map((fact) => [text(fact.querySelector('dt')), text(fact.querySelector('dd'))]);
      const items = [...root.querySelectorAll('.request-item')];
      expect(facts(items[0])).toEqual([
        ['Account', 'learner07'], ['Request', 'New plan: Learn'], ['Term', '4 Nov 2026 – 4 Nov 2027'], ['Price', '$69.99'],
        ['Submitted by', 'You'], ['When', '4 Nov 2026, 09:15 UTC'],
      ]);
      // The owner sees who an admin is; an admin sees the role label only.
      expect(facts(items[1])).toEqual([
        ['Account', 'learner12'], ['Request', 'Upgrade: Learn → Advance'], ['Term', '4 Nov 2026 – 4 Nov 2027'], ['Price', '$144.99 (difference $45.00)'],
        ['Submitted by', role === 'owner' ? 'Priya Rao (Admin 2)' : 'Admin 2'], ['When', '4 Nov 2026, 10:30 UTC'],
      ]);
      if (role === 'admin') expect(root.textContent).not.toContain('Priya Rao');
      expect([...items[0].querySelectorAll('.request-actions button')].map((button) => [text(button), button.className])).toEqual([
        ['Approve (mock payment)', 'action-button'], ['Decline', 'action-link'],
      ]);
    });
  }

  it('approves with the exact body; the card goes at once, the page reloads and the result shows the ways to verify it', async () => {
    const fixture = await render('admin');
    const root = fixture.nativeElement as HTMLElement;
    const panel = panelOf(fixture);
    buttons(root.querySelector('.request-item[data-purchase="pur-1"]')!, 'Approve (mock payment)')[0].click();
    await settle(fixture);
    await settle(fixture);
    expect(request).toHaveBeenCalledWith('/admin/test-accounts', { purchaseDecision: { purchaseId: 'pur-1', decision: 'approve' } });
    expect(fixture.componentInstance.reloads).toBe(1);
    // DLV-969 (owner, DEV test 2026-11-04): the approved request's card is gone; the other one stays.
    expect(root.querySelector('.request-item[data-purchase="pur-1"]')).toBeNull();
    expect(root.querySelectorAll('.request-item')).toHaveLength(1);
    expect(text(root.querySelector('.request-count'))).toBe('1 purchase request waiting');
    const done = root.querySelector('.decision-result')!;
    expect(done.getAttribute('role')).toBe('status');
    expect(text(done.querySelector('p'))).toBe(
      'Mock payment successful — Learner07 now has Learn. To verify it, switch to Learner07 and open Manage account → Membership from the account menu.');
    expect(text(done.querySelector('strong'))).toBe('Mock payment successful — Learner07 now has Learn.');
    expect([...done.querySelectorAll('.actions button')].map((button) => [text(button), button.className])).toEqual([
      ['Switch to Learner07', 'action-button'], ['Switch to another test account', 'action-link'],
    ]);
    expect(text(done.querySelector('.result-close button'))).toBe('Close');
    expect(document.activeElement).toBe(done);
    expect(root.querySelector('[role="alert"]')).toBeNull();
    // The card stays gone even if the page's rows still carry the request (the Domain answered before its own refresh).
    fixture.componentInstance.rows.set([waiting('acc-07', 'learner07', learn)]);
    fixture.detectChanges();
    expect(root.querySelector('.request-item')).toBeNull();
    expect(text(root.querySelector('.request-count'))).toBe('No purchase requests waiting');
    buttons(done, 'Close')[0].click();
    fixture.detectChanges();
    expect(root.querySelector('.decision-result')).toBeNull();
    expect(panel.result()).toBeNull();
  });

  it('keeps the card on a failed Approve and says why inside it', async () => {
    const fixture = await render('admin');
    const root = fixture.nativeElement as HTMLElement;
    decisionFailure = new MembershipRequestError('Request body is not valid JSON', 400);
    buttons(root.querySelector('.request-item[data-purchase="pur-1"]')!, 'Approve (mock payment)')[0].click();
    await settle(fixture);
    await settle(fixture);
    const card = root.querySelector('.request-item[data-purchase="pur-1"]')!;
    expect(card).not.toBeNull();
    expect(card.classList).toContain('failed');
    expect(text(card.querySelector('[role="alert"]'))).toBe('Request body is not valid JSON Approval was not confirmed. Refresh and retry.');
    // Only that card carries the message, and nothing else changed.
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(root.querySelector('.decision-result')).toBeNull();
    expect(fixture.componentInstance.reloads).toBe(0);
    // A retry that works clears it.
    decisionFailure = null;
    buttons(card, 'Approve (mock payment)')[0].click();
    await settle(fixture);
    await settle(fixture);
    expect(root.querySelector('.request-item[data-purchase="pur-1"]')).toBeNull();
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('declines only after its one-click confirmation; on success the card and its confirmation go', async () => {
    const fixture = await render('owner');
    const root = fixture.nativeElement as HTMLElement;
    const panel = panelOf(fixture);
    const item = panel.purchaseRequests().find((entry) => entry.request.purchaseId === 'pur-2')!;
    // Without the confirmation, Decline sends nothing.
    await panel.decide(item, 'decline');
    expect(decisions()).toHaveLength(0);
    buttons(root.querySelector('.request-item[data-purchase="pur-2"]')!, 'Decline')[0].click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.decline-panel')).toHaveLength(1);
    expect(text(root.querySelector('.decline-panel h4'))).toBe('Decline learner12’s request (Upgrade: Learn → Advance)?');
    // One confirmation at a time: another card's Decline moves it there.
    buttons(root.querySelector('.request-item[data-purchase="pur-1"]')!, 'Decline')[0].click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.decline-panel')).toHaveLength(1);
    expect(root.querySelector('.request-item[data-purchase="pur-1"] .decline-panel')).not.toBeNull();
    buttons(root, 'Cancel')[0].click();
    fixture.detectChanges();
    expect(root.querySelector('.decline-panel')).toBeNull();
    buttons(root.querySelector('.request-item[data-purchase="pur-2"]')!, 'Decline')[0].click();
    fixture.detectChanges();
    buttons(root, 'Confirm decline')[0].click();
    await settle(fixture);
    await settle(fixture);
    expect(request).toHaveBeenCalledWith('/admin/test-accounts', { purchaseDecision: { purchaseId: 'pur-2', decision: 'decline' } });
    expect(root.querySelector('.request-item[data-purchase="pur-2"]')).toBeNull();
    expect(root.querySelector('.decline-panel')).toBeNull();
    const done = root.querySelector('.decision-result')!;
    expect(text(done.querySelector('p'))).toBe('Declined — Learner12 keeps its current plan.');
    expect(done.classList).toContain('declined');
    expect(text(done)).not.toContain('Manage account');
    expect([...done.querySelectorAll('button')].map(text)).toEqual(['Switch to Learner12', 'Switch to another test account', 'Close']);
    expect(text(root.querySelector('.request-count'))).toBe('1 purchase request waiting');
  });

  it('keeps the card and its Decline confirmation open on failure, with the message inside', async () => {
    const fixture = await render('admin');
    const root = fixture.nativeElement as HTMLElement;
    buttons(root.querySelector('.request-item[data-purchase="pur-2"]')!, 'Decline')[0].click();
    fixture.detectChanges();
    decisionFailure = new Error('');
    buttons(root, 'Confirm decline')[0].click();
    await settle(fixture);
    await settle(fixture);
    const confirmation = root.querySelector('.request-item[data-purchase="pur-2"] .decline-panel')!;
    expect(confirmation).not.toBeNull();
    expect(text(confirmation.querySelector('[role="alert"]'))).toBe('Decline was not confirmed. Refresh and retry.');
    expect(root.querySelector('.decision-result')).toBeNull();
    // Cancel closes it and its message.
    buttons(confirmation, 'Cancel')[0].click();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('says a refusal in the server’s words', async () => {
    const fixture = await render('admin');
    const panel = panelOf(fixture);
    const item = panel.purchaseRequests()[0];
    decisionFailure = new MembershipRequestError('Only the owner or an admin can approve purchase requests.', 403, 'PURCHASE_APPROVAL_FORBIDDEN');
    await panel.decide(item, 'approve');
    expect(panel.failureOf(item)).toBe('Only the owner or an admin can approve purchase requests.');
    expect(panel.failureOf(panel.purchaseRequests()[1])).toBe('');
    decisionFailure = new Error('Network down');
    await panel.decide(item, 'approve');
    expect(panel.failureOf(item)).toBe('Network down Approval was not confirmed. Refresh and retry.');
    panel.startDecline(item);
    expect(panel.failureOf(item)).toBe('');
  });

  it('Switch to the test account goes to its home when the request was opened directly', async () => {
    const fixture = await render('owner');
    const root = fixture.nativeElement as HTMLElement;
    const use = vi.spyOn(TestBed.inject(TestSessions), 'use').mockResolvedValue();
    buttons(root.querySelector('.request-item[data-purchase="pur-1"]')!, 'Approve (mock payment)')[0].click();
    await settle(fixture);
    await settle(fixture);
    buttons(root, 'Switch to Learner07')[0].click();
    await settle(fixture);
    expect(use).toHaveBeenCalledExactlyOnceWith(usable[0], '/');
  });

  it('Switch to another test account opens the account menu’s switcher', async () => {
    const fixture = await render('admin');
    const root = fixture.nativeElement as HTMLElement;
    const sessions = TestBed.inject(TestSessions);
    const open = vi.spyOn(sessions, 'open');
    buttons(root.querySelector('.request-item[data-purchase="pur-1"]')!, 'Approve (mock payment)')[0].click();
    await settle(fixture);
    await settle(fixture);
    buttons(root, 'Switch to another test account')[0].click();
    await settle(fixture);
    expect(open).toHaveBeenCalledOnce();
    expect(sessions.pickerOpen()).toBe(true);
  });

  it('switches with the account it knows when the switcher list does not have it, and shows why a switch failed', async () => {
    rows = rows.map((item) => (item.accountId === 'acc-07' ? { ...item, accountId: 'acc-gone' } : item));
    const fixture = await render('owner');
    const root = fixture.nativeElement as HTMLElement;
    const panel = panelOf(fixture);
    const sessions = TestBed.inject(TestSessions);
    const use = vi.spyOn(sessions, 'use').mockImplementation(async () => { sessions.error.set('Your role cannot use this test account.'); });
    buttons(root.querySelector('.request-item[data-purchase="pur-1"]')!, 'Approve (mock payment)')[0].click();
    await settle(fixture);
    await settle(fixture);
    expect(text(root.querySelector('.decision-result strong'))).toBe('Mock payment successful — learner07 now has Learn.');
    buttons(root, 'Switch to learner07')[0].click();
    await settle(fixture);
    expect(use).toHaveBeenCalledExactlyOnceWith({ accountId: 'acc-gone', username: 'learner07', displayName: 'learner07', roles: [], scenario: null }, '/');
    expect(text(root.querySelector('.decision-result [role="alert"]'))).toBe('Your role cannot use this test account.');
    // Without a result nothing switches.
    panel.result.set(null);
    use.mockClear();
    await panel.switchToResult();
    expect(use).not.toHaveBeenCalled();
  });

  it('outside DEV the result has no Switch buttons, only Close', async () => {
    const fixture = await render('owner', { dev: false });
    const root = fixture.nativeElement as HTMLElement;
    buttons(root.querySelector('.request-item[data-purchase="pur-1"]')!, 'Approve (mock payment)')[0].click();
    await settle(fixture);
    await settle(fixture);
    expect([...root.querySelectorAll('.decision-result button')].map(text)).toEqual(['Close']);
    expect(text(root.querySelector('.decision-result strong'))).toBe('Mock payment successful — learner07 now has Learn.');
  });

  describe('opened from a Review request', () => {
    let scroll: ReturnType<typeof vi.fn>;
    const original = Element.prototype.scrollIntoView;
    beforeEach(() => { scroll = vi.fn(); Element.prototype.scrollIntoView = scroll as never; });
    afterEach(() => { Element.prototype.scrollIntoView = original; });

    it('scrolls to, highlights and focuses that request once, and tells the page', async () => {
      const fixture = await render('admin', { review: { purchaseId: 'pur-2', returnTo: '/grow/java/streams', accountId: 'acc-12' } });
      const root = fixture.nativeElement as HTMLElement;
      await settle(fixture);
      const card = root.querySelector<HTMLElement>('.request-item[data-purchase="pur-2"]')!;
      expect(card.classList).toContain('highlighted');
      expect(card.getAttribute('tabindex')).toBe('-1');
      expect(card.getAttribute('aria-current')).toBe('true');
      expect(card.getAttribute('aria-label')).toBe('Request to review: learner12, Upgrade: Learn → Advance');
      expect(root.querySelectorAll('.request-item.highlighted')).toHaveLength(1);
      expect(root.querySelector('.request-item[data-purchase="pur-1"]')!.hasAttribute('tabindex')).toBe(false);
      expect(document.activeElement).toBe(card);
      expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'smooth' });
      expect(fixture.componentInstance.opened).toBe(1);
      // Fresh rows do not open it again.
      fixture.componentInstance.reload();
      await settle(fixture);
      expect(scroll).toHaveBeenCalledOnce();
      expect(fixture.componentInstance.opened).toBe(1);
      expect(panelOf(fixture).notice()).toBe('');
    });

    it('waits for the rows before reading the review', async () => {
      const fixture = await render('admin');
      const host = fixture.componentInstance;
      host.loaded.set(false);
      host.rows.set([]);
      fixture.detectChanges();
      host.review.set({ purchaseId: 'pur-2', returnTo: null, accountId: null });
      fixture.detectChanges();
      await settle(fixture);
      expect(host.opened).toBe(0);
      expect(text(fixture.nativeElement.querySelector('.request-count'))).toBe('Loading purchase requests…');
      host.rows.set(rows);
      host.loaded.set(true);
      await settle(fixture);
      expect(host.opened).toBe(1);
      expect((fixture.nativeElement as HTMLElement).querySelector('.request-item.highlighted')?.getAttribute('data-purchase')).toBe('pur-2');
    });

    it('Switch to the test account after approving goes back to the page the purchase started from', async () => {
      const fixture = await render('owner', { review: { purchaseId: 'pur-2', returnTo: '/grow/java/streams', accountId: 'acc-12' } });
      const root = fixture.nativeElement as HTMLElement;
      await settle(fixture);
      const use = vi.spyOn(TestBed.inject(TestSessions), 'use').mockResolvedValue();
      buttons(root.querySelector('.request-item[data-purchase="pur-2"]')!, 'Approve (mock payment)')[0].click();
      await settle(fixture);
      await settle(fixture);
      expect(text(root.querySelector('.decision-result strong'))).toBe('Mock payment successful — Learner12 now has Advance.');
      expect(root.querySelector('.request-item.highlighted')).toBeNull();
      buttons(root, 'Switch to Learner12')[0].click();
      await settle(fixture);
      expect(use).toHaveBeenCalledExactlyOnceWith(usable[1], '/grow/java/streams');
    });

    it('keeps the return path to its own request, and never goes to an unsafe one', async () => {
      let fixture = await render('owner', { review: { purchaseId: 'pur-2', returnTo: '/grow/java/streams', accountId: 'acc-12' } });
      let root = fixture.nativeElement as HTMLElement;
      await settle(fixture);
      let use = vi.spyOn(TestBed.inject(TestSessions), 'use').mockResolvedValue();
      buttons(root.querySelector('.request-item[data-purchase="pur-1"]')!, 'Approve (mock payment)')[0].click();
      await settle(fixture);
      await settle(fixture);
      buttons(root, 'Switch to Learner07')[0].click();
      await settle(fixture);
      expect(use).toHaveBeenCalledExactlyOnceWith(usable[0], '/');
      TestBed.resetTestingModule();
      rows = [waiting('acc-12', 'learner12', advance)];
      fixture = await render('owner', { review: { purchaseId: 'pur-2', returnTo: '//elsewhere.example', accountId: 'acc-12' } });
      root = fixture.nativeElement as HTMLElement;
      await settle(fixture);
      use = vi.spyOn(TestBed.inject(TestSessions), 'use').mockResolvedValue();
      buttons(root.querySelector('.request-item[data-purchase="pur-2"]')!, 'Approve (mock payment)')[0].click();
      await settle(fixture);
      await settle(fixture);
      buttons(root, 'Switch to Learner12')[0].click();
      await settle(fixture);
      expect(use).toHaveBeenCalledExactlyOnceWith(usable[1], '/');
    });

    it('says so when the request is no longer waiting', async () => {
      const fixture = await render('admin', { review: { purchaseId: 'pur-gone', returnTo: '/learn', accountId: 'acc-07' } });
      const root = fixture.nativeElement as HTMLElement;
      await settle(fixture);
      expect(text(root.querySelector('.notice'))).toBe('That purchase request is no longer waiting. It may already be approved or declined.');
      expect(root.querySelector('.request-item.highlighted')).toBeNull();
      expect(scroll).not.toHaveBeenCalled();
      expect(fixture.componentInstance.opened).toBe(1);
    });
  });

  it('shows an empty state, the singular, and a load failure', async () => {
    rows = [waiting('acc-03', 'learner03', null)];
    let fixture = await render('owner');
    let root = fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('.request-count'))).toBe('No purchase requests waiting');
    expect(root.querySelector('.request-list')).toBeNull();
    fixture.componentInstance.error.set('Purchase requests could not be loaded. Refresh to retry.');
    fixture.detectChanges();
    expect(text(root.querySelector('[role="alert"]'))).toBe('Purchase requests could not be loaded. Refresh to retry.');
    TestBed.resetTestingModule();
    rows = [waiting('acc-07', 'learner07', learn)];
    fixture = await render('owner');
    root = fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('.request-count'))).toBe('1 purchase request waiting');
  });

  for (const role of ['co-author', 'user'] as const) {
    it(`shows a ${role} nothing of purchase requests, even if a row carries one`, async () => {
      const fixture = await render(role);
      const root = fixture.nativeElement as HTMLElement;
      const panel = panelOf(fixture);
      expect(root.querySelector('.purchase-requests')).toBeNull();
      expect(root.textContent).not.toMatch(/Purchase request|Approve \(mock payment\)/);
      expect(panel.purchaseRequests()).toEqual([]);
      await panel.decide({ row: rows[0], request: advance as never, words: '', term: null, price: '', difference: null, by: '', requested: '' }, 'approve');
      expect(decisions()).toHaveLength(0);
    });
  }

  it('reads the viewer’s role, counting authorPreview without a role as the owner', () => {
    expect(viewerRole({ permissions: { feedbackRole: 'admin' } })).toBe('admin');
    expect(viewerRole({ authorPreview: true })).toBe('owner');
    expect(viewerRole({})).toBe('user');
    expect(viewerRole(null)).toBe('user');
  });
});
