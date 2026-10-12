import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { AuthorAdminMenu } from '../../core/author-workspace-nav/author-admin-menu';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';

interface Assignment {
  id: string; accountId: string | null; pendingEmail: string | null;
  roles: string[]; topicGrants: string[]; fullCurriculum: boolean; revision: number;
}
interface Recipient { accountId: string; username: string; displayName: string; email: string | null; }

@Component({
  selector: 'app-admin-access',
  imports: [FormsModule, PlatformHeader, AuthorAdminMenu],
  templateUrl: './admin-access.html',
  styles: [`
    main { max-width: 1100px; margin: auto; padding: 32px 24px; }
    .access-layout { display: grid; grid-template-columns: minmax(0,1fr) 240px; gap: 40px; }
    section { min-width: 0; } p { line-height: 1.6; overflow-wrap: anywhere; }
    label { display: block; margin: 12px 0; line-height: 1.5; }
    input[type=text], input[type=email], button { box-sizing: border-box; min-height: 44px;
      padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px; font: inherit;
      color: var(--text-strong); background: var(--surface); }
    input[type=text], input[type=email] { display: block; width: 100%; max-width: 36rem; margin-top: 8px; }
    input[type=checkbox] { accent-color: var(--accent-strong); margin-inline-end: 8px; }
    fieldset { min-width: 0; margin: 24px 0; padding: 16px; border: 1px solid var(--line); }
    legend { padding-inline: 8px; font-weight: 600; }
    button { margin: 8px 12px 8px 0; cursor: pointer; }
    button:hover:not(:disabled) { background: var(--surface-muted); }
    button:disabled { opacity: .65; cursor: not-allowed; }
    button:focus-visible, input:focus-visible { outline: 3px solid var(--accent-focus); outline-offset: 3px; }
    .primary-action { background: var(--accent-strong); color: var(--accent-on-primary); }
    .primary-action:hover:not(:disabled) { background: color-mix(in srgb, var(--accent-strong) 90%, var(--text-strong)); }
    .courses { max-height: 300px; overflow: auto; }
    .assignment { border-bottom: 1px solid var(--line); padding: 16px 0; overflow-wrap: anywhere; }
    @media(max-width: 800px) { .access-layout { grid-template-columns: 1fr; } main { padding: 24px 16px; } }
  `],
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
