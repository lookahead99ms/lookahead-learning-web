import { Component, DestroyRef, ElementRef, afterRenderEffect, inject, signal, computed, OnInit, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { AuthorOutlineItem, AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';

import { TestAccounts } from './test-accounts';
import { DirectoryRow, accountName, loadDirectory } from './user-directory';
import { AdminMemberships } from './admin-memberships';

interface Assignment {
  id: string; accountId: string | null; pendingEmail: string | null;
  /** DLV-969: a co-author gets the role label, never the account id or invitation email. */
  label?: string; pending?: boolean;
  roles: string[]; topicGrants: string[]; fullCurriculum: boolean; revision: number;
}
interface Recipient { accountId: string; username: string; displayName: string; email: string | null; }
/** DLV-969 (2026-11-02): one account that signed in but is not admitted yet (`GET /admin/access/waiting`). */
export interface WaitingRow { accountId: string; username: string; displayName: string; email: string | null; requestedAt: string; expiresAt: string; }
/** Page tabs (user, 2026-10-16): giving access first, the account lists only when asked for. */
type AccessTab = 'assign' | 'saved' | 'waiting' | 'test' | 'people';
const TAB_LABELS: Record<AccessTab, string> = { assign: 'Give access', saved: 'Saved assignments', waiting: 'Waiting for access', test: 'Test accounts', people: 'People' };
/** Requested and expiry times, in UTC so every operator reads the same clock: "2 Nov 2026, 14:05 UTC". */
const timeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });

@Component({
  selector: 'app-admin-access',
  imports: [TestAccounts, AdminMemberships, FormsModule, RouterLink, PlatformHeader, AuthorAdminMenu, AuthorWorkspaceNav],
  templateUrl: './admin-access.html',
  styleUrl: './admin-access.css',
})
export class AdminAccessPage implements OnInit {
  private readonly transport = inject(ACCOUNT_FETCH);
  private readonly accounts = inject(StudyPlanAccount);
  readonly canManage = computed(() => this.accounts.account()?.permissions?.manageAccess ?? this.accounts.account()?.authorPreview === true);
  readonly canReadAssignments = computed(() => this.canManage() || this.accounts.account()?.permissions?.feedbackRole === 'co-author');
  readonly assignments = signal<Assignment[]>([]);
  /** Account ID to username, so saved assignments show who they are for (user, 2026-10-16). */
  readonly names = signal<ReadonlyMap<string, string>>(new Map());
  /** Saved assignments by role (Co-author, Admin, Reviewer, Tester, course access only), then name; pending last. */
  readonly sortedAssignments = computed(() => {
    const order = ['co-author', 'admin', 'reviewer', 'tester'];
    const rank = (row: Assignment) => row.pendingEmail ? order.length + 1
      : Math.min(order.length, ...row.roles.map(role => order.includes(role) ? order.indexOf(role) : order.length));
    return [...this.assignments()].sort((left, right) => rank(left) - rank(right)
      || this.nameOf(left).localeCompare(this.nameOf(right), 'en', { numeric: true }));
  });
  readonly topics = signal<string[]>([]);
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly recipient = signal<Recipient | null>(null);
  readonly roleOptions = [
    { id: 'co-author', label: 'Co-author', description: 'Read all curriculum, admin documents, previews, Delivery Plan and People and access. Cannot publish, change roles or reset accounts.' },
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
  private static readonly choose: AuthorOutlineItem = { label: 'Choose a person', href: '#choose-person' };
  private static readonly outlines: Record<AccessTab | 'review', readonly AuthorOutlineItem[]> = {
    assign: [AdminAccessPage.choose],
    review: [AdminAccessPage.choose, { label: 'Review access', href: '#review-access' }],
    saved: [{ label: 'Saved assignments', href: '#saved-assignments' }],
    waiting: [{ label: 'Waiting for access', href: '#waiting-for-access' }],
    test: [{ label: 'Test accounts', href: '#test-accounts' }],
    people: [{ label: 'People', href: '#people' }],
  };
  /** Stable arrays, so the outline only changes with the tab or when the review section appears or goes. */
  outline(): readonly AuthorOutlineItem[] {
    const tab = this.tab();
    return AdminAccessPage.outlines[tab === 'assign' && this.draft ? 'review' : tab];
  }
  /**
   * Give access needs the saved assignments, which only the owner and co-authors may read. Waiting
   * for access is the owner's: first, with a count, while someone waits; after Saved assignments otherwise.
   */
  readonly tabs = computed(() => {
    // Give access finds people by email or username, so it is the owner's alone (DLV-969, 2026-11-03).
    const base: readonly AccessTab[] = this.canManage() ? ['assign', 'saved', 'test', 'people']
      : this.canReadAssignments() ? ['saved', 'test', 'people'] : ['test', 'people'];
    const count = this.waiting().length;
    const ids = !this.canManage() ? base : count ? ['waiting' as const, ...base] : [...base.slice(0, 2), 'waiting' as const, ...base.slice(2)];
    return ids.map(id => ({ id, label: id === 'waiting' && count ? `${TAB_LABELS[id]} · ${count}` : TAB_LABELS[id] }));
  });
  private readonly location = inject(Location, { optional: true });
  /** `/admin/access?tab=test` opens that tab, so documentation can link straight to it. */
  private readonly chosenTab = signal<AccessTab | null>(
    ((tab: string | null | undefined) => (tab && tab in TAB_LABELS ? (tab as AccessTab) : null))(
      inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap.get('tab')),
  );
  readonly tab = computed<AccessTab>(() => {
    const chosen = this.chosenTab();
    return this.tabs().find(tab => tab.id === chosen)?.id ?? this.tabs()[0].id;
  });
  selectTab(tab: AccessTab) {
    this.chosenTab.set(tab);
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
    // After each render that changes the tabs (the waiting count moves Waiting first), keep the chosen tab in view.
    afterRenderEffect(() => { this.tabs(); this.revealTab(this.tab()); });
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
  /** "Give access" on a Test accounts or People row opens that person's assignment on Give access. */
  async giveAccessTo(row: DirectoryRow) {
    if (!this.canManage() || !row.accountId) return;
    this.selectTab('assign');
    this.notice.set('');
    const saved = this.assignments().find(item => item.accountId === row.accountId);
    if (saved) {
      this.recipient.set({ accountId: row.accountId, username: row.name, displayName: row.name, email: null });
      this.edit(saved);
    } else {
      this.query = row.name;
      await this.find();
    }
    this.showReview();
  }
  /** "Review assignment" on the Saved assignments tab opens it on Give access. */
  review(assignment: Assignment) {
    this.recipient.set(null);
    this.edit(assignment);
    this.selectTab('assign');
    this.showReview();
  }
  private showReview() {
    if (this.draft) setTimeout(() => requestAnimationFrame(() => document.getElementById('review-access')?.scrollIntoView({ block: 'start' })));
  }
  query = '';
  pendingEmail = '';
  draft: Assignment | null = null;

  topicLabel(topic: string): string {
    const abbreviations: Record<string, string> = { ai: 'AI', api: 'API', aws: 'AWS', cicd: 'CI/CD', dsa: 'DSA', jvm: 'JVM', oop: 'OOP', sql: 'SQL', nosql: 'NoSQL', solid: 'SOLID', carl: 'CARL', nodejs: 'Node.js' };
    return topic.split(':').map(part => part.split('-').map(word => abbreviations[word] ?? word[0].toUpperCase() + word.slice(1)).join(' ')).join(' · ');
  }
  async ngOnInit() { await this.reload(); }
  /** Pending email, username, or a short account ID when no list could name the account. */
  nameOf(row: Pick<Assignment, 'accountId' | 'pendingEmail' | 'label'>): string {
    return row.label ?? row.pendingEmail ?? (row.accountId ? accountName(row.accountId, this.names()) : '');
  }
  /** Usernames from the test accounts, the owner directory and the signed-in account. Names are a nicety: failures leave short IDs. */
  async loadNames() {
    const names = new Map<string, string>();
    try {
      for (const row of await this.request<{ accountId: string; username: string }[]>('/admin/test-accounts')) names.set(row.accountId, row.username);
    } catch { /* short IDs */ }
    if (this.accounts.account()?.permissions?.manageAccess) {
      try {
        for (const row of await loadDirectory(path => this.request(path))) names.set(row.accountId, row.username);
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
    try {
      const data = await this.request<{ waiting?: WaitingRow[]; expiryHours?: number }>('/admin/access/waiting');
      this.waiting.set(data.waiting ?? []);
      if (typeof data.expiryHours === 'number') this.expiryHours.set(data.expiryHours);
    } catch (error) { this.notice.set(this.message(error)); }
  }
  /** Admits one waiting account with the chosen role (none = Learner); the row leaves the list and Saved assignments reloads. */
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
      // Stay on this tab even when the list empties and it moves back behind Saved assignments.
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
  async find() {
    this.busy.set(true); this.notice.set(''); this.draft = null; this.recipient.set(null);
    try {
      const recipient = await this.request<Recipient>('/admin/access/lookup', { query: this.query });
      this.recipient.set(recipient);
      const saved = this.assignments().find(row => row.accountId === recipient.accountId);
      this.edit(saved ?? this.fresh(recipient.accountId, null));
    } catch (error) { this.notice.set(this.message(error)); }
    finally { this.busy.set(false); }
  }
  invite() {
    this.notice.set(''); this.recipient.set(null);
    const email = this.pendingEmail.trim().toLowerCase();
    if (!email) { this.notice.set('Enter an email address.'); return; }
    this.edit(this.assignments().find(row => row.pendingEmail === email) ?? this.fresh(null, email));
  }
  edit(assignment: Assignment) { this.draft = structuredClone(assignment); }
  toggle(field: 'roles' | 'topicGrants', value: string, checked: boolean) {
    if (!this.draft) return;
    this.draft[field] = checked ? [...new Set([...this.draft[field], value])] : this.draft[field].filter(item => item !== value);
    // Admins get the entire curriculum by default (user, 2026-10-15). It is saved as an explicit
    // grant through the existing contract and can be cleared before saving.
    if (field === 'roles' && value === 'admin' && checked) this.draft.fullCurriculum = true;
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
  async save() {
    if (!this.canManage() || !this.draft || this.busy()) return;
    this.busy.set(true); this.notice.set('');
    try {
      const saved = await this.request<Assignment>('/admin/access', this.draft);
      this.draft = saved;
      this.assignments.update(rows => [saved, ...rows.filter(row => row.id !== saved.id)]);
      this.notice.set(saved.accountId ? 'Access saved. It applies to the recipient’s next request.' : 'Pending access saved. A verified sign-in must claim it; no email has been sent.');
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
    if (!response.ok) throw new Error(messages[response.status] ?? (response.status === 409 ? 'Access changed since you loaded it. Reload the list and select the recipient again.'
      : response.status === 404 ? 'No enabled account matches that exact email or username.'
      : response.status === 403 ? 'Only the owner can manage access.'
      : response.status === 422 ? 'Check the recipient, roles and course selection.' : 'Access service is unavailable. Retry shortly.'));
    return (await response.json()).data as T;
  }
}
