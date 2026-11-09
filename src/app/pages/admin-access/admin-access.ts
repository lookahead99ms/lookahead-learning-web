import { Component, DestroyRef, ElementRef, afterRenderEffect, inject, signal, computed, OnInit, viewChild } from '@angular/core';
import { REJECT_TEXT, REMOVAL_TEXT } from './removal-text';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { AuthorOutlineItem, AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';

import { TestAccountRow, TestAccounts } from './test-accounts';
import { PurchaseRequestsPanel, canDecidePurchases } from './purchase-requests-panel';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { DirectoryAccount, DirectoryRow, accountName, loadDirectory, personLines, sameEmailCount, sameEmailText, signInLabels } from './user-directory';
import { AccountSignInMethod } from '../account/account-settings-client';
import { isProviderUsername } from '../study-plan/study-plan-account';
import { AdminMemberships } from './admin-memberships';
import { RequestReview, REVIEW_PARAMS, REVIEW_PATH, REVIEW_TAB, REVIEW_VIEW, REVIEW_VIEW_PARAM, pendingPurchaseOf, requestReviewOf } from '../../content/purchase-requests';
import { PLATFORM_REVIEW_CLIENT, PlatformReviewError } from '../admin-reviews/platform-review.model';
import { jobsRanLine } from '../admin-feedback/feedback-backlog';

export interface Assignment {
  id: string; accountId: string | null; pendingEmail: string | null;
  /** DLV-969: a co-author gets the role label, never the account id or invitation email. */
  label?: string; pending?: boolean;
  roles: string[]; topicGrants: string[]; fullCurriculum: boolean; revision: number;
}
/** DLV-969 (2026-11-02): one account that signed in but is not admitted yet (`GET /admin/access/waiting`). */
export interface WaitingRow {
  accountId: string; username: string; displayName: string; email: string | null; requestedAt: string; expiresAt: string;
  /** DLV-969 account linking, owner only; absent from an older Domain. */
  signInMethods?: AccountSignInMethod[]; sameEmailAccounts?: number;
}
/**
 * Owner, 2026-11-08: three tabs. People is the roster (Manage access on a row opens the person); Review requests holds
 * the DEV gate, prepared access and the purchase requests; Test accounts is the page co-authors and admins open.
 */
export type AccessTab = 'people' | 'waiting' | 'test';
const TAB_LABELS: Record<AccessTab, string> = { people: 'People', waiting: 'Review requests', test: 'Test accounts' };
/** Addresses from before 2026-11-08 (`?tab=assign`, `?tab=saved`) land on People, where that work lives now. */
const RETIRED_TABS: Record<string, AccessTab> = { assign: 'people', saved: 'people' };
/**
 * Owner, 2026-11-08: Review requests has its own tab bar. DEV admissions (people at the gate) and Invites sent (emails
 * with prepared access, last) are the owner's; Purchase requests is the owner's and the admins'.
 */
export type WaitingView = 'access' | 'purchases' | 'invites';
const WAITING_LABELS: Record<WaitingView, string> = { access: 'DEV admissions', purchases: 'Purchase requests', invites: 'Invites sent' };
/** Requested and expiry times, in UTC so every operator reads the same clock: "2 Nov 2026, 14:05 UTC". */
const timeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });

/** The person open in the panel: an account from a row, or an email with prepared access and no account yet. */
export interface Person {
  accountId: string | null; pendingEmail: string | null; name: string; email: string | null; username: string | null; isTest: boolean;
}
/** What the Manage DEV admission card says and offers; built from the owner's directory row for the account. */
export interface Admission {
  state: 'admitted' | 'disabled' | 'prepared' | 'test' | 'unknown';
  label: string; methods: string[]; sameEmail: string;
  canDisable: boolean; canEnable: boolean; canDowngrade: boolean;
  /** The Domain route Delete uses: `remove` for a DEV sign-in account, `delete` for a Local learner; null when neither is allowed. */
  deletePath: 'remove' | 'delete' | null;
}
/**
 * Owner, 2026-11-08: the person panel is four tabs so each part can use the whole column; a test account never passes
 * the DEV gate, so it has three.
 */
export type PersonTab = 'admission' | 'roles' | 'courses' | 'plans' | 'review';
const PERSON_LABELS: Record<PersonTab, string> = { admission: 'DEV admission', roles: 'Roles', courses: 'Course access', plans: 'Plans and purchases', review: 'Review & confirm' };
/** One line of Review & confirm: what the save adds or takes away. */
export interface Change { kind: 'Role' | 'Curriculum' | 'Course'; text: string; added: boolean; }
type AdmissionAction = 'disable' | 'delete';

@Component({
  host: { class: 'admin-surface' },
  selector: 'app-admin-access',
  imports: [TestAccounts, PurchaseRequestsPanel, AdminMemberships, FormsModule, RouterLink, PlatformHeader, AuthorAdminMenu, AuthorWorkspaceNav],
  templateUrl: './admin-access.html',
  styleUrl: './admin-access.css',
})
export class AdminAccessPage implements OnInit {
  private readonly transport = inject(ACCOUNT_FETCH);
  private readonly accounts = inject(StudyPlanAccount);
  readonly canManage = computed(() => this.accounts.account()?.permissions?.manageAccess ?? this.accounts.account()?.authorPreview === true);
  /** The page's own name follows the menu entry: People & Access for the owner, Test Accounts for admins and co-authors (owner, 2026-11-06). */
  protected readonly pageLabel = computed(() => (this.canManage() ? 'People & Access' : 'Test Accounts'));
  readonly canReadAssignments = computed(() => this.canManage() || this.accounts.account()?.permissions?.feedbackRole === 'co-author');
  /** DLV-969 (owner, 2026-11-04): the owner and admins approve or decline DEV purchase requests; nobody else sees them. */
  readonly canDecide = computed(() => canDecidePurchases(this.accounts.account()));
  private readonly devSession = inject(DevSession);
  readonly dev = computed(() => this.devSession.status() !== null || this.devSession.gated());
  /** `GET /admin/test-accounts` for the purchase requests, loaded for the owner and admins only. */
  readonly purchaseRows = signal<TestAccountRow[]>([]);
  readonly purchasesLoaded = signal(false);
  readonly purchasesBusy = signal(false);
  readonly purchasesError = signal('');
  /** Purchase requests waiting: part of the count on Review requests. */
  readonly purchaseCount = computed(() => (this.canDecide() ? this.purchaseRows().filter(row => pendingPurchaseOf(row) !== null).length : 0));
  /** Purchase requests exist in DEV; in Local a purchase completes at once, so the section shows only if one waits. */
  readonly showPurchases = computed(() => this.canDecide() && (this.dev() || this.purchaseCount() > 0));
  readonly assignments = signal<Assignment[]>([]);
  /** Account ID to username, so names stand in for ids wherever a list could name the account. */
  readonly names = signal<ReadonlyMap<string, string>>(new Map());
  /** Assignments by role (Co-author, Admin, Reviewer, Tester, course access only), then name; prepared emails last. */
  readonly sortedAssignments = computed(() => {
    const order = ['co-author', 'admin', 'reviewer', 'tester'];
    const rank = (row: Assignment) => row.pendingEmail ? order.length + 1
      : Math.min(order.length, ...row.roles.map(role => order.includes(role) ? order.indexOf(role) : order.length));
    return [...this.assignments()].sort((left, right) => rank(left) - rank(right)
      || this.nameOf(left).localeCompare(this.nameOf(right), 'en', { numeric: true }));
  });
  /** Owner, 2026-11-08: prepared access (an email, no account yet) is listed under Review requests → Invites sent, not among People. */
  readonly prepared = computed(() => (this.canManage() ? this.sortedAssignments().filter(row => !!row.pendingEmail) : []));
  /** The sub-tabs this person has, each with its count: the owner all three, an admin Purchase requests alone. */
  readonly waitingViews = computed(() => {
    const views: WaitingView[] = this.canManage() ? ['access'] : [];
    if (this.showPurchases()) views.push('purchases');
    if (this.canManage()) views.push('invites');
    return views.map(id => ({ id, label: WAITING_LABELS[id], count: id === 'access' ? this.waiting().length : id === 'purchases' ? this.purchaseCount() : this.prepared().length }));
  });
  readonly topics = signal<string[]>([]);
  readonly notice = signal('');
  readonly busy = signal(false);
  /**
   * Owner, 2026-11-07: Clean up admissions on Review requests runs the Domain's 4-hour admissions job now (waiting
   * rows older than 48 hours removed). DEV only, never PROD: the page's `dev` gate. The review client carries the job;
   * the route provides it, a page without it shows no button.
   */
  private readonly reviewClient = inject(PLATFORM_REVIEW_CLIENT, { optional: true });
  readonly canCleanUp = computed(() => this.canManage() && this.dev() && this.reviewClient !== null);
  readonly cleaningUp = signal(false);
  /** The line under the section note after a run: what the job did, or why it did not run. */
  readonly cleanupLine = signal<{ text: string; failed: boolean } | null>(null);
  async cleanUpAdmissions() {
    if (!this.canCleanUp() || this.cleaningUp()) return;
    this.cleaningUp.set(true);
    try {
      const result = await this.reviewClient!.runSweeps('admissions');
      this.cleanupLine.set({ text: jobsRanLine(result), failed: false });
      await this.loadWaiting();
    } catch (error) {
      const localOnly = error instanceof PlatformReviewError && error.kind === 'conflict';
      this.cleanupLine.set({
        text: localOnly ? 'The admission cleanup runs only on DEV.' : `Clean up admissions failed: ${error instanceof Error && error.message ? error.message : 'unknown error'}`,
        failed: !localOnly,
      });
    } finally { this.cleaningUp.set(false); }
  }
  readonly roleOptions = [
    { id: 'co-author', label: 'Co-author', description: 'Read all curriculum, admin documents, previews, Delivery Plan and the test accounts. Cannot publish, change roles or reset accounts.' },
    { id: 'tester', label: 'Tester', description: 'All courses and feedback submission. No admin pages or Delivery Plan.' },
    { id: 'reviewer', label: 'Reviewer', description: 'Admin documents and previews; read the Delivery Plan and mark reviewed stories Done.' },
    { id: 'admin', label: 'Admin', description: 'Triage feedback, read admin documents, create stories and move them to Review.' },
  ];
  /**
   * DLV-969 (2026-11-02): accounts waiting for admission, owner only. Learner (no staff role) is the
   * default at admission; the staff roles are the ones this page already knows, in the Admit menu's order.
   */
  readonly waiting = signal<WaitingRow[]>([]);
  /** How long a request waits before the server removes it; the server's value replaces the default. */
  readonly expiryHours = signal(48);
  readonly admitRoleOptions = ['co-author', 'admin', 'reviewer', 'tester'].map(id => this.roleOptions.find(option => option.id === id)!);
  /** The role chosen in each waiting row's Admit menu, by account ID ('' = Learner). */
  admitRole: Record<string, string> = {};
  /**
   * DLV-971 (owner, 2026-11-06): Reject on a waiting row offers the same two choices as Manage admission on a person, Disable or
   * Delete, with the same typed confirmation; the Domain treats a request the way an expired one is treated on Delete.
   */
  readonly rejectText = REJECT_TEXT;
  readonly rejecting = signal<{ row: WaitingRow; action: 'disable' | 'remove' | null } | null>(null);
  rejectConfirmation = '';
  startReject(row: WaitingRow) {
    if (!this.canManage()) return;
    this.admitting.set(null);
    this.rejecting.set({ row, action: null }); this.rejectConfirmation = ''; this.notice.set('');
  }
  chooseReject(action: 'disable' | 'remove') {
    const pending = this.rejecting();
    if (pending) { this.rejecting.set({ row: pending.row, action }); this.rejectConfirmation = ''; }
  }
  cancelReject() { this.rejecting.set(null); this.rejectConfirmation = ''; }
  /** Disable needs DISABLE typed, Delete needs DELETE; the row leaves the list once the Domain confirms. */
  async confirmReject() {
    const pending = this.rejecting(), word = pending?.action === 'disable' ? 'DISABLE' : 'DELETE';
    if (!pending?.action || !this.canManage() || this.busy() || this.rejectConfirmation !== word) return;
    const { row, action } = pending;
    this.busy.set(true); this.notice.set('');
    try {
      await this.request(`/admin/accounts/${row.accountId}/${action}`, { confirmation: word }, {
        404: 'This request was already removed. Refresh the list.',
        409: `${row.displayName} was already deleted.`,
        422: `Type ${word} exactly to confirm.`,
        403: 'Only the owner can reject people.',
      });
      this.chosenTab.set('waiting');
      this.waiting.update(rows => rows.filter(item => item.accountId !== row.accountId));
      delete this.admitRole[row.accountId];
      this.rejecting.set(null); this.rejectConfirmation = '';
      this.notice.set(action === 'disable'
        ? `${row.displayName} is disabled. They cannot sign in or ask for access again until you enable them on People.`
        : `${row.displayName}'s request is deleted. If they sign in again, they appear here as a new person.`);
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
  }
  private static readonly outlines: Record<AccessTab | 'person', readonly AuthorOutlineItem[]> = {
    people: [{ label: 'People', href: '#people' }],
    waiting: [{ label: 'Review requests', href: '#waiting-for-access' }],
    test: [{ label: 'Test accounts', href: '#test-accounts' }],
    person: [{ label: 'Manage access', href: '#person-panel' }],
  };
  /** Stable arrays, so the outline only changes with the tab or the open person. */
  outline(): readonly AuthorOutlineItem[] {
    return AdminAccessPage.outlines[this.person() ? 'person' : this.tab()];
  }
  /** The decisions waiting on Review requests: people at the DEV gate and purchase requests. Prepared access waits on nobody. */
  readonly reviewCount = computed(() => (this.canManage() ? this.waiting().length : 0) + (this.showPurchases() ? this.purchaseCount() : 0));
  /**
   * The owner: People, Review requests, Test accounts. A co-author: Test accounts, then People read-only. An admin: Test
   * accounts, and Review requests for the purchase requests when there are any to decide (DEV, or one waiting).
   */
  readonly tabs = computed(() => {
    const ids: AccessTab[] = this.canManage() ? ['people', 'waiting', 'test']
      : this.canReadAssignments() ? ['test', 'people']
      : this.showPurchases() ? ['test', 'waiting'] : ['test'];
    const count = this.reviewCount();
    return ids.map(id => ({ id, label: id === 'waiting' && count ? `${TAB_LABELS[id]} · ${count}` : TAB_LABELS[id] }));
  });
  private readonly location = inject(Location, { optional: true });
  private readonly address = inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap;
  /**
   * DLV-969 (owner, 2026-11-04): `?tab=waiting&view=purchases&request=<purchaseId>&return=<path>&account=<id>` from a
   * test account's Go to Review requests (DEV checkout screen); the older `?tab=test&request=…` form lands in the same
   * place. Read once: Review requests opens on that request, and the values leave the address so a reload does not repeat it.
   */
  readonly requestReview = signal<RequestReview | null>(this.address ? requestReviewOf(this.address) : null);
  /** `/admin/access?tab=test` opens that tab, so documentation can link straight to it; a review always opens Review requests. */
  private readonly chosenTab = signal<AccessTab | null>(
    this.requestReview() ? REVIEW_TAB : ((tab: string | null | undefined) => (tab ? (tab in TAB_LABELS ? (tab as AccessTab) : RETIRED_TABS[tab] ?? null) : null))(this.address?.get('tab')),
  );
  /** `&view=purchases` (or `access`, `invites`) opens that sub-tab of Review requests; a review always opens Purchase requests. */
  private readonly chosenView = signal<WaitingView | null>(
    this.requestReview() ? REVIEW_VIEW : ((view: string | null | undefined) => (view && view in WAITING_LABELS ? (view as WaitingView) : null))(this.address?.get(REVIEW_VIEW_PARAM)),
  );
  /** The sub-tab shown: the chosen one when this person has it; else DEV admissions, or Purchase requests when only they wait. */
  readonly waitingView = computed<WaitingView>(() => {
    const ids = this.waitingViews().map(view => view.id), chosen = this.chosenView();
    if (chosen && ids.includes(chosen)) return chosen;
    if (ids.includes('access') && ids.includes('purchases') && !this.waiting().length && this.purchaseCount()) return 'purchases';
    return ids[0] ?? 'access';
  });
  selectWaitingView(view: WaitingView) {
    this.chosenView.set(view);
    this.chosenTab.set('waiting');
    this.closePerson();
    this.location?.replaceState('/admin/access', `tab=waiting&${REVIEW_VIEW_PARAM}=${view}`);
  }
  /** Arrow keys, Home and End move between the sub-tabs (WAI-ARIA tabs pattern). */
  onWaitingKey(event: KeyboardEvent) {
    const ids = this.waitingViews().map(view => view.id), index = ids.indexOf(this.waitingView());
    const next = ({ ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ids.length - 1 } as Record<string, number>)[event.key];
    if (next === undefined || !ids.length) return;
    event.preventDefault();
    const id = ids[(next + ids.length) % ids.length];
    this.selectWaitingView(id);
    (document.getElementById('waiting-tab-' + id) as HTMLElement | null)?.focus();
  }
  readonly tab = computed<AccessTab>(() => {
    const chosen = this.chosenTab();
    return this.tabs().find(tab => tab.id === chosen)?.id ?? this.tabs()[0].id;
  });
  selectTab(tab: AccessTab) {
    this.chosenTab.set(tab);
    this.closePerson();
    // Keep the address shareable without a navigation: the page stays where it is.
    this.location?.replaceState('/admin/access', tab === this.tabs()[0].id ? '' : `tab=${tab}`);
  }
  /** The tab row scrolls when it is wider than the column; a chevron shows only on an edge that hides tabs. */
  readonly moreBefore = signal(false);
  readonly moreAfter = signal(false);
  private readonly tabList = viewChild<ElementRef<HTMLElement>>('tabList');
  private tabResize?: ResizeObserver;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.tabResize?.disconnect());
    // After each render that changes the tabs (a count arrives), keep the chosen tab in view.
    afterRenderEffect(() => { this.tabs(); this.revealTab(this.tab()); });
    // The review values leave the address (the tab stays), so a reload does not open the review again. The older
    // `tab=test&request=` form is redirected to Review requests → Purchase requests.
    const chosen = this.chosenTab();
    if (this.address && Object.values(REVIEW_PARAMS).some(name => this.address!.has(name))) {
      this.location?.replaceState(REVIEW_PATH, this.requestReview() ? `tab=${REVIEW_TAB}&${REVIEW_VIEW_PARAM}=${REVIEW_VIEW}` : chosen ? `tab=${chosen}` : '');
    }
  }
  /** Scroll the tab row, never the page, so the chosen tab is fully in view and clear of the edge chevrons. */
  private revealTab(tab: AccessTab) {
    const list = this.tabList()?.nativeElement, button = list?.ownerDocument.getElementById('access-tab-' + tab);
    if (!list || !button) return;
    const Observer = list.ownerDocument.defaultView?.ResizeObserver;
    if (!this.tabResize && Observer) { this.tabResize = new Observer(() => this.updateTabEdges()); this.tabResize.observe(list); }
    const chevron = 48, start = button.offsetLeft - list.offsetLeft, end = start + button.offsetWidth;
    if (start - chevron < list.scrollLeft) list.scrollLeft = Math.max(0, start - chevron);
    else if (end + chevron > list.scrollLeft + list.clientWidth) list.scrollLeft = end + chevron - list.clientWidth;
    this.updateTabEdges();
  }
  updateTabEdges() {
    const list = this.tabList()?.nativeElement;
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    this.moreBefore.set(list.scrollLeft > 2);
    this.moreAfter.set(max > 2 && list.scrollLeft < max - 2);
  }
  scrollTabs(direction: 1 | -1) {
    const list = this.tabList()?.nativeElement;
    if (!list) return;
    list.scrollLeft += direction * list.clientWidth * 0.7;
    this.updateTabEdges();
  }
  /** Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern). */
  onTabKey(event: KeyboardEvent) {
    const ids = this.tabs().map(tab => tab.id), index = ids.indexOf(this.tab());
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ids.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = ids[(next + ids.length) % ids.length];
    this.selectTab(id);
    (document.getElementById('access-tab-' + id) as HTMLElement | null)?.focus();
  }

  // ---- The person panel (owner, 2026-11-08): Manage access on a row opens it in place of the tab's list. ----

  /** The person whose access is open, or null while a tab's list shows. */
  readonly person = signal<Person | null>(null);
  /**
   * The panel's tabs: DEV admission first, except for a test account, which never passes the gate; Review & confirm
   * last, carrying the count of changes, where Save access lives (owner, 2026-11-08).
   */
  readonly personTabs = computed(() => {
    const ids: PersonTab[] = this.person()?.isTest ? ['roles', 'courses', 'plans', 'review'] : ['admission', 'roles', 'courses', 'plans', 'review'];
    const pending = this.changes().length;
    return ids.map(id => ({ id, label: id === 'review' && pending ? `${PERSON_LABELS[id]} · ${pending}` : PERSON_LABELS[id] }));
  });
  private readonly chosenPersonTab = signal<PersonTab | null>(null);
  readonly personTab = computed<PersonTab>(() => {
    const ids = this.personTabs().map(tab => tab.id), chosen = this.chosenPersonTab();
    return chosen && ids.includes(chosen) ? chosen : ids[0];
  });
  selectPersonTab(tab: PersonTab) { this.chosenPersonTab.set(tab); }
  /** The tab after the open one, for the Continue button (like the study plan builder); null on the last. */
  readonly nextPersonTab = computed(() => {
    const tabs = this.personTabs(), index = tabs.findIndex(tab => tab.id === this.personTab());
    return tabs[index + 1] ?? null;
  });
  readonly previousPersonTab = computed(() => {
    const tabs = this.personTabs(), index = tabs.findIndex(tab => tab.id === this.personTab());
    return tabs[index - 1] ?? null;
  });
  continuePerson() { const next = this.nextPersonTab(); if (next) this.selectPersonTab(next.id); }
  backPerson() { const previous = this.previousPersonTab(); if (previous) this.selectPersonTab(previous.id); }
  /** Arrow keys, Home and End move between the panel's tabs (WAI-ARIA tabs pattern). */
  onPersonKey(event: KeyboardEvent) {
    const ids = this.personTabs().map(tab => tab.id), index = ids.indexOf(this.personTab());
    const next = ({ ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ids.length - 1 } as Record<string, number>)[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = ids[(next + ids.length) % ids.length];
    this.selectPersonTab(id);
    (document.getElementById('person-tab-' + id) as HTMLElement | null)?.focus();
  }
  /** The tab the panel came from; Back and a finished action return there. */
  readonly fromTab = signal<AccessTab>('people');
  /** The open assignment as it is being edited. Signal-backed, so the panel re-renders on every change; `toggle` and
   *  `setFullCurriculum` replace the object rather than mutate it. */
  private readonly draftState = signal<Assignment | null>(null);
  get draft(): Assignment | null { return this.draftState(); }
  set draft(value: Assignment | null) { this.draftState.set(value); }
  /** The assignment as it was when the panel opened: Review & confirm lists the differences from it. */
  private original: Assignment | null = null;
  /**
   * "Manage access" on a People or Test accounts row opens that person. The row already names the account, so no
   * lookup runs: a row shows the display name, which is not the email or username a lookup matches (owner, 2026-11-07).
   */
  async giveAccessTo(row: DirectoryRow) {
    if (!this.canManage() || !row.accountId) return;
    const account = this.people().get(row.accountId);
    this.openPerson({ accountId: row.accountId, pendingEmail: null, name: row.name, email: account?.email ?? null,
      username: account?.username ?? null, isTest: row.isTest },
      this.assignments().find(item => item.accountId === row.accountId) ?? this.fresh(row.accountId, null));
  }
  /** "Manage access" on an Invites sent row under Review requests. */
  reviewPrepared(assignment: Assignment) {
    if (!this.canManage() || !assignment.pendingEmail) return;
    this.openPerson({ accountId: null, pendingEmail: assignment.pendingEmail, name: assignment.pendingEmail, email: assignment.pendingEmail, username: null, isTest: false }, assignment);
  }
  /** Add by email on People: the address someone will sign in with, prepared before their first sign-in. */
  invite(pendingEmail: string) {
    this.notice.set('');
    const email = pendingEmail.trim().toLowerCase();
    if (!email) { this.notice.set('Enter an email address.'); return; }
    this.openPerson({ accountId: null, pendingEmail: email, name: email, email, username: null, isTest: false },
      this.assignments().find(row => row.pendingEmail === email) ?? this.fresh(null, email));
  }
  private openPerson(person: Person, assignment: Assignment) {
    this.fromTab.set(this.tab());
    this.person.set(person);
    this.chosenPersonTab.set(null);
    this.edit(assignment);
    this.closeDialogs();
    this.notice.set('');
    setTimeout(() => requestAnimationFrame(() => document.getElementById('person-panel')?.scrollIntoView?.({ block: 'start' })));
  }
  /** Back, Discard, or a finished action: the list the panel came from shows again. */
  closePerson() {
    this.person.set(null); this.draft = null; this.original = null;
    this.closeDialogs();
  }
  private closeDialogs() {
    this.admissionDialog.set(null); this.admissionConfirmation = '';
    this.downgrading.set(false); this.downgradeConfirmation = '';
  }
  /** What the Manage DEV admission card says for the open person, from the owner's directory row. */
  readonly admission = computed<Admission>(() => {
    const person = this.person();
    const account = person?.accountId ? this.people().get(person.accountId) : undefined;
    const none: Admission = { state: 'unknown', label: 'Account', methods: [], sameEmail: '', canDisable: false, canEnable: false, canDowngrade: false, deletePath: null };
    if (!person) return none;
    if (person.isTest) return { ...none, state: 'test', label: 'Test account' };
    if (!person.accountId) return { ...none, state: 'prepared', label: 'Prepared' };
    if (!account) return none;
    const disabled = account.signIn === 'disabled';
    return {
      state: disabled ? 'disabled' : 'admitted', label: disabled ? 'Disabled' : 'Admitted',
      methods: signInLabels(account.signInMethods),
      sameEmail: sameEmailCount(account.sameEmailAccounts) ? sameEmailText(sameEmailCount(account.sameEmailAccounts), account.email) : '',
      canDisable: account.canDisable === true, canEnable: account.canEnable === true, canDowngrade: account.canDowngrade === true,
      deletePath: account.canRemove === true ? 'remove' : account.canDelete === true ? 'delete' : null,
    };
  });
  /**
   * Owner, 2026-11-08: the admission card has one button, Manage admission. Its dialog offers what the account allows:
   * Enable (one click), Disable and Delete (one is chosen, then its word is typed).
   */
  readonly admissionText = REMOVAL_TEXT;
  readonly admissionDialog = signal<{ action: AdmissionAction | null } | null>(null);
  admissionConfirmation = '';
  /** The card offers Manage admission when the directory allows anything for this account. */
  readonly canManageAdmission = computed(() => {
    const admission = this.admission();
    return !!this.person()?.accountId && (admission.canDisable || admission.canEnable || !!admission.deletePath);
  });
  openAdmission() {
    if (!this.canManage() || !this.canManageAdmission()) return;
    this.admissionDialog.set({ action: null }); this.admissionConfirmation = ''; this.notice.set('');
  }
  chooseAdmission(action: AdmissionAction) {
    if (this.admissionDialog()) { this.admissionDialog.set({ action }); this.admissionConfirmation = ''; }
  }
  cancelAdmission() { this.admissionDialog.set(null); this.admissionConfirmation = ''; }
  /** Disable needs DISABLE typed, Delete needs DELETE; the person leaves the panel once the Domain confirms. */
  async confirmAdmission() {
    const pending = this.admissionDialog(), person = this.person(), admission = this.admission();
    const word = pending?.action === 'disable' ? 'DISABLE' : 'DELETE';
    if (!pending?.action || !person?.accountId || !this.canManage() || this.busy() || this.admissionConfirmation !== word) return;
    if (pending.action === 'disable' ? !admission.canDisable : !admission.deletePath) return;
    const path = pending.action === 'disable' ? 'disable' : admission.deletePath!;
    this.busy.set(true); this.notice.set('');
    try {
      await this.request(`/admin/accounts/${person.accountId}/${path}`, { confirmation: word }, {
        404: `${person.name} is no longer on this build. Refresh the list.`,
        409: `${person.name} was already deleted.`,
        422: `Type ${word} exactly to confirm.`,
        403: 'Only the owner can manage admission.',
      });
      this.busy.set(false);
      await this.loadNames();
      const back = this.fromTab();
      this.closePerson();
      this.chosenTab.set(back);
      this.notice.set(pending.action === 'disable'
        ? `${person.name} is disabled. Every sign-in is blocked and their open session closes within 5 minutes.`
        : `${person.name} is deleted. If they sign in again, they appear in Review requests as a new person.`);
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
  }
  /** Enable is one click because it only gives back what was there; the dialog closes and the panel shows the new state. */
  async enable() {
    const person = this.person();
    if (!person?.accountId || !this.admission().canEnable || this.busy()) return;
    this.busy.set(true); this.notice.set('');
    try {
      await this.request(`/admin/accounts/${person.accountId}/enable`, {}, { 403: 'Only the owner can enable people.' });
      this.busy.set(false);
      await this.loadNames();
      this.cancelAdmission();
      this.notice.set(`${person.name} can sign in again.`);
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
  }
  /** Withdraw prepared access: the entry is saved with nothing ticked, which cancels it on the Domain. */
  async withdraw() {
    const person = this.person();
    if (!person?.pendingEmail || !this.draft || !this.canManage() || this.busy()) return;
    this.draft = { ...this.draft, roles: [], topicGrants: [], fullCurriculum: false };
    this.busy.set(true); this.notice.set('');
    try {
      await this.request<Assignment>('/admin/access', this.draft);
      this.busy.set(false);
      await this.reload();
      const back = this.fromTab();
      this.closePerson();
      this.chosenTab.set(back);
      this.notice.set(`The invite for ${person.pendingEmail} is withdrawn. Nothing was sent to them.`);
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
  }
  /** Downgrade to free, on the Plans and purchases card: staff roles, grants and paid access go; the account stays. */
  readonly downgrading = signal(false);
  downgradeConfirmation = '';
  startDowngrade() {
    if (!this.canManage() || !this.person()?.accountId || !this.admission().canDowngrade) return;
    this.downgrading.set(true); this.downgradeConfirmation = ''; this.notice.set('');
  }
  cancelDowngrade() { this.downgrading.set(false); this.downgradeConfirmation = ''; }
  async confirmDowngrade() {
    const person = this.person();
    if (!this.downgrading() || !person?.accountId || !this.admission().canDowngrade || this.busy() || this.downgradeConfirmation !== 'DOWNGRADE') return;
    this.busy.set(true); this.notice.set('');
    try {
      await this.request(`/admin/accounts/${person.accountId}/downgrade`, { confirmation: 'DOWNGRADE' }, { 403: 'Only the owner can downgrade people.' });
      this.downgrading.set(false); this.downgradeConfirmation = '';
      this.busy.set(false);
      await Promise.all([this.reload(), this.loadNames()]);
      this.edit(this.assignments().find(item => item.accountId === person.accountId) ?? this.fresh(person.accountId, null));
      this.notice.set(`${person.name} now has free learner access. Purchase history remains.`);
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
  }
  /** Review & confirm: the lines that differ between the open draft and the saved assignment. */
  changes(): Change[] {
    const draft = this.draft, was = this.original;
    if (!draft || !was) return [];
    const lines: Change[] = [];
    for (const role of this.roleOptions) {
      const before = was.roles.includes(role.id), after = draft.roles.includes(role.id);
      if (before !== after) lines.push({ kind: 'Role', text: role.label, added: after });
    }
    if (was.fullCurriculum !== draft.fullCurriculum) lines.push({ kind: 'Curriculum', text: 'Entire curriculum', added: draft.fullCurriculum });
    for (const topic of [...new Set([...was.topicGrants, ...draft.topicGrants])].sort()) {
      const before = was.topicGrants.includes(topic), after = draft.topicGrants.includes(topic);
      if (before !== after) lines.push({ kind: 'Course', text: this.topicLabel(topic), added: after });
    }
    return lines;
  }

  topicLabel(topic: string): string {
    const abbreviations: Record<string, string> = { ai: 'AI', api: 'API', aws: 'AWS', cicd: 'CI/CD', dsa: 'DSA', jvm: 'JVM', oop: 'OOP', sql: 'SQL', nosql: 'NoSQL', solid: 'SOLID', carl: 'CARL', nodejs: 'Node.js' };
    return topic.split(':').map(part => part.split('-').map(word => abbreviations[word] ?? word[0].toUpperCase() + word.slice(1)).join(' ')).join(' · ');
  }
  async ngOnInit() { await Promise.all([this.reload(), this.loadPurchases()]); }
  /**
   * DLV-969 (owner, 2026-11-04): the test accounts' waiting purchase requests, for the owner and admins only (the Domain
   * sends `pendingPurchase` to them alone). The owner-only waiting-people list is never asked for here.
   */
  async loadPurchases() {
    if (!this.canDecide()) return;
    this.purchasesBusy.set(true);
    try {
      this.purchaseRows.set(await this.request<TestAccountRow[]>('/admin/test-accounts'));
      this.purchasesError.set('');
    } catch {
      this.purchasesError.set('Purchase requests could not be loaded. Refresh to retry.');
    } finally {
      this.purchasesBusy.set(false);
      this.purchasesLoaded.set(true);
    }
  }
  /** Pending email, username, or a short account ID when no list could name the account. */
  nameOf(row: Pick<Assignment, 'accountId' | 'pendingEmail' | 'label'>): string {
    return row.label ?? row.pendingEmail ?? (row.accountId ? accountName(row.accountId, this.names()) : '');
  }
  /** The owner sees a person's email (a Google account's Gmail) under their name; others never get one. */
  emailOf(row: Pick<Assignment, 'accountId'>): string | null {
    const person = row.accountId ? this.people().get(row.accountId) : undefined;
    return person?.email && person.email !== this.nameOf({ accountId: row.accountId, pendingEmail: null }) ? person.email : null;
  }
  /** "Google", "Password" for a waiting row; empty when the Domain sends none. */
  methodLabels(row: WaitingRow): string[] { return signInLabels(row.signInMethods); }
  /** "Same Gmail as 1 other account" when other accounts share this row's verified email, else ''. */
  sameEmail(row: WaitingRow): string {
    const count = sameEmailCount(row.sameEmailAccounts);
    return count ? sameEmailText(count, row.email) : '';
  }
  /** Cognito's name for a Google account, never shown to a person. */
  internalName(username: string): boolean { return isProviderUsername(username); }
  /** The owner's directory accounts by id: names, emails, sign-in state and the Disable/Enable/Delete permissions. */
  readonly people = signal<ReadonlyMap<string, DirectoryAccount>>(new Map());
  /** Usernames from the test accounts, the owner directory and the signed-in account. Names are a nicety: failures leave short IDs. */
  async loadNames() {
    const names = new Map<string, string>();
    try {
      for (const row of await this.request<{ accountId: string; username: string }[]>('/admin/test-accounts')) names.set(row.accountId, row.username);
    } catch { /* short IDs */ }
    if (this.accounts.account()?.permissions?.manageAccess) {
      try {
        const directory = await loadDirectory(path => this.request(path));
        for (const row of directory) names.set(row.accountId, personLines(row).name);
        this.people.set(new Map(directory.map(row => [row.accountId, row])));
      } catch { /* short IDs */ }
    }
    const self = this.accounts.account();
    if (self?.accountId && self.username) names.set(self.accountId, self.username);
    this.names.set(names);
  }
  async reload() {
    if (!this.canReadAssignments()) return;
    this.busy.set(true);
    try {
      const [assignments, topics] = await Promise.all([
        this.request<Assignment[]>('/admin/access'), this.request<string[]>('/admin/access/catalog'),
      ]);
      this.assignments.set(assignments); this.topics.set(topics.sort());
      void this.loadNames();
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
    if (this.canManage()) await this.loadWaiting();
  }
  /** DLV-969: the waiting list is the owner's; when it cannot load, the rest of the page still works. */
  async loadWaiting() {
    if (!this.canManage()) return;
    try {
      const data = await this.request<{ waiting?: WaitingRow[]; expiryHours?: number }>('/admin/access/waiting');
      this.waiting.set(data.waiting ?? []);
      if (typeof data.expiryHours === 'number') this.expiryHours.set(data.expiryHours);
    } catch (error) { this.notice.set(this.message(error)); }
  }
  /** Owner, 2026-11-08: Admit asks for confirmation in a dialog first, naming the person and the role. */
  readonly admitting = signal<WaitingRow | null>(null);
  startAdmit(row: WaitingRow) {
    if (!this.canManage() || this.busy()) return;
    this.rejecting.set(null); this.rejectConfirmation = '';
    this.admitting.set(row); this.notice.set('');
  }
  cancelAdmit() { this.admitting.set(null); }
  async confirmAdmit() {
    const row = this.admitting();
    if (!row) return;
    await this.admit(row);
    if (this.notice().endsWith('It applies to their next sign-in.')) this.admitting.set(null);
  }
  /** Admits one waiting account with the chosen role (none = Learner); the row leaves the list and the assignments reload. */
  async admit(row: WaitingRow) {
    if (!this.canManage() || this.busy()) return;
    const role = this.admitRole[row.accountId] ?? '';
    this.busy.set(true); this.notice.set('');
    try {
      await this.request('/admin/access/admit', { accountId: row.accountId, roles: role ? [role] : [] }, {
        404: 'This request was already removed. Refresh the list.',
        409: `${row.displayName} is already admitted.`,
        422: 'Choose a known role.',
        403: 'Only the owner can admit people.',
      });
      // Stay on this tab even when the list empties.
      this.chosenTab.set('waiting');
      this.waiting.update(rows => rows.filter(item => item.accountId !== row.accountId));
      delete this.admitRole[row.accountId];
      this.busy.set(false);
      await this.reload();
      this.notice.set(`${row.displayName} admitted as ${this.admitLabel(role)}. It applies to their next sign-in.`);
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
  }
  /** "Learner" for no staff role, else the role's label. */
  admitLabel(role: string): string { return role ? this.roleNames([role]) : 'Learner'; }
  /** "2 Nov 2026, 14:05 UTC", or a dash when the server sent no usable time. */
  timeText(iso: string): string {
    const time = Date.parse(iso);
    return Number.isFinite(time) ? timeFormat.format(time) : '—';
  }
  /** "in 31 h" while the request waits; the date when that is far off; "Due for removal" once it has passed. */
  expiresText(row: Pick<WaitingRow, 'expiresAt'>, now = Date.now()): string {
    const hours = (Date.parse(row.expiresAt) - now) / 3_600_000;
    if (!Number.isFinite(hours)) return '—';
    if (hours <= 0) return 'Due for removal';
    if (hours < 1) return 'in less than 1 h';
    return hours < 72 ? `in ${Math.round(hours)} h` : this.timeText(row.expiresAt);
  }
  edit(assignment: Assignment) { this.draft = structuredClone(assignment); this.original = structuredClone(assignment); }
  toggle(field: 'roles' | 'topicGrants', value: string, checked: boolean) {
    const draft = this.draft;
    if (!draft) return;
    const next = { ...draft, [field]: checked ? [...new Set([...draft[field], value])] : draft[field].filter(item => item !== value) };
    // Admins get the entire curriculum by default (user, 2026-10-15). It is saved as an explicit
    // grant through the existing contract and can be cleared before saving.
    if (field === 'roles' && value === 'admin' && checked) next.fullCurriculum = true;
    this.draft = next;
  }
  setFullCurriculum(value: boolean) {
    if (this.draft) this.draft = { ...this.draft, fullCurriculum: value };
  }
  /** "Admin, Reviewer", or "No staff role". */
  roleNames(roles: readonly string[]): string {
    return roles.map(role => this.roleOptions.find(option => option.id === role)?.label ?? role).join(', ') || 'No staff role';
  }
  /** "Entire curriculum", "1 selected course", "3 selected courses" or "No course access". */
  courseText(row: Pick<Assignment, 'fullCurriculum' | 'roles' | 'topicGrants'>): string {
    if (row.fullCurriculum || row.roles.includes('tester')) return 'Entire curriculum';
    const count = row.topicGrants.length;
    return count ? `${count} selected course${count === 1 ? '' : 's'}` : 'No course access';
  }
  /** Save access, from Review & confirm: on success the list the panel came from shows again, with the notice. */
  async save() {
    if (!this.canManage() || !this.draft || this.busy()) return;
    this.busy.set(true); this.notice.set('');
    try {
      const saved = await this.request<Assignment>('/admin/access', this.draft);
      this.assignments.update(rows => [saved, ...rows.filter(row => row.id !== saved.id)]);
      const person = this.person(), back = this.fromTab();
      this.closePerson();
      this.chosenTab.set(back);
      this.notice.set(saved.accountId
        ? `Access saved for ${person?.name ?? this.nameOf(saved)}. It applies to their next request.`
        : `Access prepared for ${saved.pendingEmail}. The first time this email signs in on DEV, the person is admitted with it. No email has been sent.`);
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
  }
  private fresh(accountId: string | null, pendingEmail: string | null): Assignment {
    return { id: crypto.randomUUID(), accountId, pendingEmail, roles: [], topicGrants: [], fullCurriculum: false, revision: 0 };
  }
  private message(error: unknown) { return error instanceof Error ? error.message : 'Access service is unavailable. Retry shortly.'; }
  /** GET without a body, POST with one; `messages` lets a call name what a status means for it. */
  private async request<T>(path: string, body?: unknown, messages: Partial<Record<number, string>> = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      const csrf = await this.transport(this.accounts.apiPath('/auth/csrf'), { credentials: 'same-origin', cache: 'no-store' });
      if (!csrf.ok) throw new Error('Sign in again before changing access.');
      const token = (await csrf.json()).data;
      if (typeof token?.headerName !== 'string' || typeof token?.token !== 'string') throw new Error('Cannot verify this session. Reload and try again.');
      headers[token.headerName] = token.token; headers['Content-Type'] = 'application/json';
    }
    const response = await this.transport(this.accounts.apiPath(path), {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok) throw new Error(messages[response.status] ?? (response.status === 409 ? 'Access changed since you loaded it. Reload the list and open the person again.'
      // A 404 a call did not name is a build without that part.
      : response.status === 404 ? 'That part of People & Access is not available on this build.'
      : response.status === 403 ? 'Only the owner can manage access.'
      : response.status === 422 ? 'Check the roles and course selection.' : 'Access service is unavailable. Retry shortly.'));
    return (await response.json()).data as T;
  }
}
