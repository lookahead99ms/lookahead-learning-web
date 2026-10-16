import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MembershipApi } from '../../content/membership-api';
import { ContentService } from '../../content/content.service';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { AccessRecord, AccessRecordView, accessRecordView } from '../account/account-membership';
import {
  DirectoryAssignment,
  DirectoryAccount,
  DirectoryRow,
  ROLE_FILTERS,
  directoryRows,
  loadDirectory,
  matchesFilter,
} from './user-directory';

export interface TestAccountRow {
  accountId: string;
  username: string;
  roles: string[];
  revision: number;
  access: { label: string; labels?: string[]; grantedCourseIds?: string[] };
  lastChangedBy: string;
  lastChangedAt: string;
  legacyPresetAvailable: boolean;
  creatorId?: string;
  canDelete?: boolean;
}

type History = { state: 'loading' } | { state: 'error' } | { state: 'ready'; items: AccessRecordView[] };

const changedFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * DLV-961 account lists on People and access, one per tab (user, 2026-10-16): "test" shows the
 * managed Local test accounts with the protected reset; "people" shows every other account the
 * operator may inspect. Both show role, current access and purchase history. Visibility stays
 * server-enforced: test accounts come from `/admin/test-accounts`, the full directory and staff
 * assignments only when the server allows them.
 */
@Component({
  selector: 'app-test-accounts',
  imports: [FormsModule, RouterLink],
  templateUrl: './test-accounts.html',
  styleUrl: './test-accounts.css',
})
export class TestAccounts implements OnInit {
  private readonly api = inject(MembershipApi);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly content = inject(ContentService, { optional: true });
  /** Staff assignments the parent page loaded (owner only); empty for other operators. */
  readonly assignments = input<readonly DirectoryAssignment[]>([]);
  /** Which tab this list fills. */
  readonly view = input<'test' | 'people'>('people');
  /** The owner asked to change this person's roles or course grants. */
  readonly giveAccess = output<DirectoryRow>();
  readonly canGive = computed(
    () => this.accounts.account()?.permissions?.manageAccess ?? this.accounts.account()?.authorPreview === true,
  );
  readonly canReset = computed(
    () =>
      !!this.accounts.account()?.permissions?.manageAccess ||
      !!this.accounts.account()?.permissions?.triageFeedback,
  );
  readonly canCreate = computed(() => ['owner', 'co-author', 'admin'].includes(this.accounts.account()?.permissions?.feedbackRole ?? (this.accounts.account()?.authorPreview ? 'owner' : 'user')));
  readonly allowance = signal<{limit:number;used:number;remaining:number}|null>(null);
  readonly creating = signal(false);
  readonly createKey = signal<string|null>(null);
  readonly deleting = signal<TestAccountRow|null>(null);
  readonly downgradingReal = signal<DirectoryRow | null>(null);
  readonly deletingReal = signal<DirectoryRow | null>(null);
  createPassword = '';
  deleteConfirmation = '';
  realConfirmation = '';
  readonly rows = signal<TestAccountRow[]>([]);
  readonly directoryAccounts = signal<DirectoryAccount[]>([]);
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly loaded = signal(false);
  readonly selected = signal<TestAccountRow | null>(null);
  readonly selectedKey = signal<string | null>(null);
  readonly pending = signal<{
    key: string;
    expectedRevision: number;
    confirmation: string;
    preset: string;
  } | null>(null);
  confirmation = '';
  preset = 'scenario';

  readonly query = signal('');
  readonly role = signal('');
  readonly titles = signal<ReadonlyMap<string, string>>(new Map());
  readonly expanded = signal<string | null>(null);
  readonly history = signal<Record<string, History>>({});

  readonly people = computed<DirectoryRow[]>(() => {
    const account = this.accounts.account();
    const self = account
      ? {
          accountId: account.accountId,
          username: account.username,
          displayName: account.displayName,
          role: account.permissions?.feedbackRole ?? (account.authorPreview ? 'owner' : 'user'),
          topicGrants: account.topicGrants,
          fullCurriculum: account.permissions?.fullCurriculum,
        }
      : null;
    return directoryRows(self, this.assignments(), this.rows(), this.titles(), this.directoryAccounts());
  });
  /** Test accounts on the Test accounts tab; everyone else on People. */
  readonly inView = computed(() => this.people().filter((row) => row.isTest === (this.view() === 'test')));
  /** Only the roles somebody in this list has. */
  readonly roleFilters = computed(() =>
    ROLE_FILTERS.filter((name) => this.inView().some((row) => row.roles.includes(name))),
  );
  readonly visible = computed(() =>
    this.inView().filter((row) => matchesFilter(row, this.query(), this.role())),
  );
  readonly selectedRow = computed(() => this.visible().find((row) => row.key === this.selectedKey()) ?? null);

  ngOnInit() {
    void this.load();
    void this.loadTitles();
  }

  actorName(id: string) {
    if(this.accounts.account()?.accountId===id)return 'You';
    return this.rows().find((row) => row.accountId === id)?.username ?? id;
  }

  changedText(row: DirectoryRow): string {
    if (!row.changedBy || !row.changedAt) return '—';
    const when = new Date(row.changedAt);
    const day = Number.isNaN(when.getTime()) ? row.changedAt : changedFormat.format(when);
    // The seed is the automatic default setup, not a person.
    const who = row.changedBy === 'seed' ? 'Default setup' : this.actorName(row.changedBy);
    return `${who}, ${day}`;
  }

  select(row: TestAccountRow) {
    if (!this.canReset() || this.pending()) return;
    this.selected.set(row);
    this.confirmation = '';
    this.preset = 'scenario';
  }

  choose(row: DirectoryRow) {
    if (this.busy() || this.pending()) return;
    this.selectedKey.set(this.selectedKey() === row.key ? null : row.key);
    this.selected.set(null);
    this.deleting.set(null);
    this.downgradingReal.set(null);
    this.deletingReal.set(null);
    this.realConfirmation = '';
    this.expanded.set(null);
  }

  cancel() {
    this.selected.set(null);
    this.pending.set(null);
  }

  async load() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      this.rows.set(await this.api.request<TestAccountRow[]>('/admin/test-accounts'));
      this.selectedKey.set(null);
      if(this.view()==='test' && this.canCreate())this.allowance.set(await this.api.request('/admin/test-accounts/allowance'));
      this.notice.set('');
      this.directoryAccounts.set([]);
      if (this.accounts.account()?.permissions?.manageAccess) {
        try {
          this.directoryAccounts.set(await loadDirectory((path) => this.api.request(path)));
        } catch {
          this.notice.set('The full People directory could not be loaded. Only existing assignments and test accounts are shown. Refresh to retry.');
        }
      }
    } catch {
      this.notice.set('Test account maintenance is unavailable in this environment.');
    } finally {
      this.busy.set(false);
      this.loaded.set(true);
    }
  }

  mayDelete(row: TestAccountRow): boolean {
    return row.canDelete === true;
  }

  async create() {
    if(!this.canCreate()||this.busy()||this.createPassword.length<15)return;
    const key=this.createKey()??crypto.randomUUID();this.createKey.set(key);this.busy.set(true);
    try {
      const created=await this.api.request<{username:string}>('/admin/test-accounts',{key,password:this.createPassword});
      this.createKey.set(null);this.createPassword='';this.creating.set(false);
      this.busy.set(false);await this.load();this.notice.set(`${created.username} created. Share its password through your local test setup.`);
    } catch {
      this.notice.set('Creation was not confirmed. Retry with the same password and request key.');
    } finally {this.busy.set(false);}
  }

  async deleteAccount() {
    const row=this.deleting();
    if(!row||!this.mayDelete(row)||this.busy()||this.deleteConfirmation!==row.username)return;
    this.busy.set(true);
    try {
      await this.api.remove(`/admin/test-accounts/${row.accountId}`);
      this.deleting.set(null);this.deleteConfirmation='';this.busy.set(false);await this.load();
      this.notice.set(`${row.username} deleted. Its login and test data are gone; the creator's lifetime count remains.`);
    } catch {this.notice.set('Deletion was not confirmed. Retry the same account.');}
    finally {this.busy.set(false);}
  }

  async downgradeReal() {
    const row=this.downgradingReal();
    if(!row?.accountId||row.isTest||row.isSelf||row.canDowngrade!==true||this.realConfirmation!=='DOWNGRADE'||this.busy())return;
    this.busy.set(true);
    try {
      await this.api.request(`/admin/accounts/${row.accountId}/downgrade`,{confirmation:'DOWNGRADE'});
      this.downgradingReal.set(null);this.realConfirmation='';this.busy.set(false);await this.load();
      this.notice.set(`${row.name} now has free learner access. Purchase history remains.`);
    } catch {this.notice.set('Downgrade was not confirmed. Refresh and retry.');}
    finally {this.busy.set(false);}
  }

  async deleteReal() {
    const row=this.deletingReal();
    if(!row?.accountId||row.isTest||row.isSelf||row.canDelete!==true||this.realConfirmation!=='DELETE'||this.busy())return;
    this.busy.set(true);
    try {
      await this.api.request(`/admin/accounts/${row.accountId}/delete`,{confirmation:'DELETE'});
      this.deletingReal.set(null);this.realConfirmation='';this.busy.set(false);await this.load();
      this.notice.set(`${row.name} deleted. Sign-in and learner plans are gone; purchase audit remains.`);
    } catch {this.notice.set('Deletion was not confirmed. Refresh and retry the same account.');}
    finally {this.busy.set(false);}
  }

  /** Course titles from the public catalogs, for "Java Foundations (Learn)". */
  async loadTitles() {
    if (!this.content) return;
    const titles = new Map<string, string>();
    for (const path of ['learn', 'grow', 'blaze']) {
      try {
        for (const item of await firstValueFrom(this.content.getCatalog(path))) {
          if (item.id) titles.set(`${path}:${item.id}`, item.title);
        }
      } catch {
        // Titles are a nicety; ids are prettified when a catalog cannot load.
      }
    }
    this.titles.set(titles);
  }

  /** Opens or closes an account's purchase history (current, scheduled, expired, replaced). */
  async toggle(row: DirectoryRow) {
    const id = row.accountId;
    if (!id) return;
    if (this.expanded() === row.key) {
      this.expanded.set(null);
      return;
    }
    this.expanded.set(row.key);
    if (this.history()[id]?.state === 'ready') return;
    this.history.update((all) => ({ ...all, [id]: { state: 'loading' } }));
    try {
      const records = await this.api.request<AccessRecord[]>(`/admin/accounts/${id}/access-records`);
      const items = records.map(accessRecordView).filter((view): view is AccessRecordView => view !== null);
      this.history.update((all) => ({ ...all, [id]: { state: 'ready', items } }));
    } catch {
      this.history.update((all) => ({ ...all, [id]: { state: 'error' } }));
    }
  }

  historyOf(row: DirectoryRow): History | undefined {
    return row.accountId ? this.history()[row.accountId] : undefined;
  }

  async reset() {
    const row = this.selected();
    if (!row || !this.canReset() || this.busy() || this.confirmation !== row.username) return;
    const request = this.pending() ?? {
      key: crypto.randomUUID(),
      expectedRevision: row.revision,
      confirmation: row.username,
      preset: this.preset,
    };
    this.pending.set(request);
    this.busy.set(true);
    try {
      await this.api.request('/admin/test-accounts/' + row.accountId + '/reset', request);
      this.cancel();
      this.busy.set(false);
      await this.load();
      this.history.update((all) => {
        const next = { ...all };
        delete next[row.accountId];
        return next;
      });
      this.notice.set(row.username + ' reset.');
    } catch {
      this.notice.set(
        'Reset was not confirmed. Retry the same reset, or cancel and refresh before another change.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
