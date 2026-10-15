import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { AuthorOutlineItem, AuthorWorkspaceNav } from '../../core/author-workspace-nav/author-workspace-nav';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';

interface Assignment {
  id: string; accountId: string | null; pendingEmail: string | null;
  roles: string[]; topicGrants: string[]; fullCurriculum: boolean; revision: number;
}
interface Recipient { accountId: string; username: string; displayName: string; email: string | null; }

@Component({
  selector: 'app-admin-access',
  imports: [FormsModule, RouterLink, PlatformHeader, AuthorAdminMenu, AuthorWorkspaceNav],
  templateUrl: './admin-access.html',
  styleUrl: './admin-access.css',
})
export class AdminAccessPage implements OnInit {
  private readonly transport = inject(ACCOUNT_FETCH);
  private readonly accounts = inject(StudyPlanAccount);
  readonly assignments = signal<Assignment[]>([]);
  readonly topics = signal<string[]>([]);
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly recipient = signal<Recipient | null>(null);
  readonly roleOptions = [
    { id: 'tester', label: 'Tester', description: 'All courses and feedback submission. No admin pages or Delivery Plan.' },
    { id: 'reviewer', label: 'Reviewer', description: 'Admin documents and previews; read the Delivery Plan and mark reviewed stories Done.' },
    { id: 'admin', label: 'Admin', description: 'Triage feedback, read admin documents, create stories and move them to Review.' },
  ];
  private static readonly baseOutline: readonly AuthorOutlineItem[] = [
    { label: 'Choose a person', href: '#choose-person' },
    { label: 'Saved assignments', href: '#saved-assignments' },
  ];
  private static readonly reviewOutline: readonly AuthorOutlineItem[] = [
    AdminAccessPage.baseOutline[0],
    { label: 'Review access', href: '#review-access' },
    AdminAccessPage.baseOutline[1],
  ];
  /** Stable arrays, so the outline only changes when the review section appears or goes. */
  outline(): readonly AuthorOutlineItem[] {
    return this.draft ? AdminAccessPage.reviewOutline : AdminAccessPage.baseOutline;
  }
  query = '';
  pendingEmail = '';
  draft: Assignment | null = null;

  topicLabel(topic: string): string {
    const abbreviations: Record<string, string> = { ai: 'AI', api: 'API', aws: 'AWS', cicd: 'CI/CD', dsa: 'DSA', jvm: 'JVM', oop: 'OOP', sql: 'SQL', nosql: 'NoSQL', solid: 'SOLID', carl: 'CARL', nodejs: 'Node.js' };
    return topic.split(':').map(part => part.split('-').map(word => abbreviations[word] ?? word[0].toUpperCase() + word.slice(1)).join(' ')).join(' · ');
  }
  async ngOnInit() { await this.reload(); }
  async reload() {
    this.busy.set(true);
    try {
      const [assignments, topics] = await Promise.all([
        this.request<Assignment[]>('/admin/access'), this.request<string[]>('/admin/access/catalog'),
      ]);
      this.assignments.set(assignments); this.topics.set(topics.sort());
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
  async save() {
    if (!this.draft || this.busy()) return;
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
