import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
  roles: string[]; topicGrants: string[]; fullCurriculum: boolean; revision: number;
}
interface Recipient { accountId: string; username: string; displayName: string; email: string | null; }
/** Page tabs (user, 2026-10-16): giving access first, the account lists only when asked for. */
type AccessTab = 'assign' | 'saved' | 'test' | 'people';
const TAB_LABELS: Record<AccessTab, string> = { assign: 'Give access', saved: 'Saved assignments', test: 'Test accounts', people: 'People' };

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
  private static readonly choose: AuthorOutlineItem = { label: 'Choose a person', href: '#choose-person' };
  private static readonly outlines: Record<AccessTab | 'review', readonly AuthorOutlineItem[]> = {
    assign: [AdminAccessPage.choose],
    review: [AdminAccessPage.choose, { label: 'Review access', href: '#review-access' }],
    saved: [{ label: 'Saved assignments', href: '#saved-assignments' }],
    test: [{ label: 'Test accounts', href: '#test-accounts' }],
    people: [{ label: 'People', href: '#people' }],
  };
  /** Stable arrays, so the outline only changes with the tab or when the review section appears or goes. */
  outline(): readonly AuthorOutlineItem[] {
    const tab = this.tab();
    return AdminAccessPage.outlines[tab === 'assign' && this.draft ? 'review' : tab];
  }
  /** Give access needs the saved assignments, which only the owner and co-authors may read. */
  readonly tabs = computed(() =>
    (this.canReadAssignments() ? (['assign', 'saved', 'test', 'people'] as const) : (['test', 'people'] as const))
      .map(id => ({ id, label: TAB_LABELS[id] })));
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
  nameOf(row: Pick<Assignment, 'accountId' | 'pendingEmail'>): string {
    return row.pendingEmail ?? (row.accountId ? accountName(row.accountId, this.names()) : '');
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
  private async request<T>(path: string, body?: unknown): Promise<T> {
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
    if (!response.ok) throw new Error(response.status === 409 ? 'Access changed since you loaded it. Reload the list and select the recipient again.'
      : response.status === 404 ? 'No enabled account matches that exact email or username.'
      : response.status === 403 ? 'Only the owner can manage access.'
      : response.status === 422 ? 'Check the recipient, roles and course selection.' : 'Access service is unavailable. Retry shortly.');
    return (await response.json()).data as T;
  }
}
