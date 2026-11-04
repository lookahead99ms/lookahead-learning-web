import { Component, computed, effect, inject, input, OnInit, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MembershipApi } from '../../content/membership-api';
import { ContentService } from '../../content/content.service';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { DevSession } from '../../core/dev-session-notice/dev-session';
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

/** GET /admin/test-accounts/allowance; DLV-969 S35 adds the scenarios and, for the owner in DEV, the roster. */
export interface TestAccountAllowance {
  limit: number;
  used: number;
  remaining: number;
  /** withoutPlan (DLV-969 S37): ready learners whose scenario has a study plan they don't have yet. */
  roster?: { total: number; ready: number; deleted: number; withoutPlan?: number } | null;
  scenarios?: { id: string; label: string; roles: string[] }[] | null;
}

export interface TestAccountRow {
  accountId: string;
  username: string;
  roles: string[];
  revision: number;
  access: { label: string; labels?: string[]; grantedCourseIds?: string[] };
  lastChangedBy: string;
  lastChangedAt: string;
  legacyPresetAvailable: boolean;
  /** 'created' for a single created account; a roster account carries its preset ('scenario' in DEV). */
  initialization?: string;
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
  /** DLV-969: select this account once the list has it (Saved assignments → "Disable or delete"). */
  readonly focusAccount = input<string | null>(null);
  private readonly focusing = effect(() => {
    const id = this.focusAccount();
    const row = id ? this.inView().find(item => item.accountId === id) : undefined;
    if (row) untracked(() => this.selectedKey.set(row.key));
  });
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
  readonly allowance = signal<TestAccountAllowance|null>(null);
  private readonly devSession = inject(DevSession);
  /** DLV-969 S35: DEV test accounts have no sign-in of their own; staff use them from the sign-in page. */
  readonly dev = computed(() => this.devSession.status() !== null || this.devSession.gated());
  /** The scenario a new test account starts from (DLV-969 S35); the first is a free learner without a plan. */
  createScenario = 'learner01';
  /** The owner's DEV roster progress while it is being created. */
  readonly rosterBusy = signal(false);
  readonly roster = computed(() => {
    const status = this.allowance()?.roster;
    return status ? { ...status, remaining: Math.max(0, status.total - status.ready - status.deleted) } : null;
  });
  /** DLV-969 (owner, 2026-11-04): Reset all, typed once; done counts the resets sent so far. */
  readonly rosterReset = signal<{ open: boolean; done: number; total: number } | null>(null);
  rosterResetConfirmation = '';
  /** The DEV roster's accounts in the list: every test account except single created ones. */
  readonly rosterRows = computed(() => this.rows().filter((row) => !!row.creatorId && row.initialization !== 'created'));
  readonly creating = signal(false);
  readonly createKey = signal<string|null>(null);
  readonly deleting = signal<TestAccountRow|null>(null);
  readonly downgradingReal = signal<DirectoryRow | null>(null);
  readonly deletingReal = signal<DirectoryRow | null>(null);
  /** DLV-969: the owner's Disable or Delete for a DEV sign-in account, waiting for its typed confirmation. */
  readonly removing = signal<{ row: DirectoryRow; action: 'disable' | 'remove' } | null>(null);
  /** Shown beside each button and as its hover text (user, 2026-11-03). Disable is the strongest. */
  readonly removalText = {
    disable: 'Strongest. Blocks every sign-in, with email or Google, and closes their open DEV session within 5 minutes. They cannot ask for access again until you enable them.',
    enable: 'Lets them sign in again with the same account, roles and progress.',
    remove: 'Removes them from sign-in and erases their plans and progress. If they sign in again with the same email or Google account, they appear in Waiting for access as a new person.',
  } as const;
  removalConfirmation = '';
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
    this.closeConfirmations();
    this.selected.set(row);
    this.preset = 'scenario';
  }

  // DLV-969 (2026-11-04): one confirmation at a time; opening one closes any other.
  startDelete(row: TestAccountRow) {
    if (this.pending()) return;
    this.closeConfirmations();
    this.deleting.set(row);
  }

  startDowngrade(row: DirectoryRow) {
    this.closeConfirmations();
    this.downgradingReal.set(row);
  }

  startRealDelete(row: DirectoryRow) {
    this.closeConfirmations();
    this.deletingReal.set(row);
  }

  choose(row: DirectoryRow) {
    if (this.busy() || this.pending()) return;
    this.selectedKey.set(this.selectedKey() === row.key ? null : row.key);
    this.closeConfirmations();
    this.expanded.set(null);
  }

  private closeConfirmations() {
    this.selected.set(null);
    this.deleting.set(null);
    this.downgradingReal.set(null);
    this.deletingReal.set(null);
    this.removing.set(null);
    if (!this.rosterReset()?.done) this.rosterReset.set(null);
    this.confirmation = '';
    this.deleteConfirmation = '';
    this.realConfirmation = '';
    this.removalConfirmation = '';
  }

  cancel() {
    this.selected.set(null);
    this.pending.set(null);
  }

  async load() {
    if (this.busy()) return;
    this.busy.set(true);
    this.selectedKey.set(null);
    this.notice.set('');
    try {
      // Test accounts and the owner's People directory load independently (DLV-969, 2026-11-03): in DEV test accounts
      // stay switched off until their IAM grant (S28), and that must not hide the directory's names or Disable/Delete.
      try {
        this.rows.set(await this.api.request<TestAccountRow[]>('/admin/test-accounts'));
        if(this.view()==='test' && this.canCreate())this.allowance.set(await this.api.request('/admin/test-accounts/allowance'));
      } catch {
        this.rows.set([]);
        if (this.view() === 'test') this.notice.set('Test account maintenance is unavailable in this environment.');
      }
      this.directoryAccounts.set([]);
      if (this.accounts.account()?.permissions?.manageAccess) {
        try {
          this.directoryAccounts.set(await loadDirectory((path) => this.api.request(path)));
        } catch {
          this.notice.set('The full People directory could not be loaded. Only existing assignments and test accounts are shown. Refresh to retry.');
        }
      }
    } finally {
      this.busy.set(false);
      this.loaded.set(true);
    }
  }


  mayDelete(row: TestAccountRow): boolean {
    return row.canDelete === true;
  }

  /** DEV needs no password (the account never signs in); Local still sets one for the Local Identity service. */
  mayCreate(): boolean {
    return this.canCreate() && !this.busy() && !!this.createScenario && (this.dev() || this.createPassword.length >= 15);
  }

  async create() {
    if(!this.mayCreate())return;
    const key=this.createKey()??crypto.randomUUID();this.createKey.set(key);this.busy.set(true);
    const dev=this.dev();
    try {
      const created=await this.api.request<{username:string}>('/admin/test-accounts',dev?{key,scenario:this.createScenario}:{key,password:this.createPassword,scenario:this.createScenario});
      this.createKey.set(null);this.createPassword='';this.creating.set(false);
      this.busy.set(false);await this.load();
      this.notice.set(dev
        ? `${created.username} created. To use it, choose Switch to a test account in your account menu.`
        : `${created.username} created. Share its password through your local test setup.`);
    } catch {
      this.notice.set(dev ? 'Creation was not confirmed. Retry; the same request key is reused.' : 'Creation was not confirmed. Retry with the same password and request key.');
    } finally {this.busy.set(false);}
  }

  /**
   * DLV-969 S35 (owner, DEV): creates Local's 35-account roster, a few accounts per call, until every one exists.
   * A failed call stops with a message; Create again continues where it stopped.
   */
  async createRoster() {
    if(!this.dev()||!this.roster()||this.busy()||this.rosterBusy())return;
    this.rosterBusy.set(true);this.notice.set('');
    try {
      for(let calls=0;calls<20;calls++){
        const status=await this.api.request<{total:number;ready:number;deleted:number;withoutPlan?:number}>('/admin/test-accounts',{roster:true});
        this.allowance.update((quota)=>quota?{...quota,roster:status}:quota);
        if(status.total-status.ready-status.deleted<=0)break;
      }
      this.rosterBusy.set(false);await this.load();
      this.notice.set('The test roster is ready. To use an account, choose Switch to a test account in your account menu.');
    } catch(failure) {
      this.notice.set(reason(failure)+'The roster stopped part way. Create again to continue.');
    } finally {this.rosterBusy.set(false);}
  }

  openRosterReset() {
    this.closeConfirmations();
    this.rosterResetConfirmation = '';
    this.rosterReset.set({ open: true, done: 0, total: this.rosterRows().length });
  }

  /**
   * DLV-969 (owner, 2026-11-04): every roster account back to its scenario, one reset request each, so learners
   * created before the study plans were published get theirs. A refusal is named and the rest carry on.
   */
  async resetRoster() {
    const rows = this.rosterRows();
    if (!this.dev() || !this.roster() || this.busy() || !rows.length || this.rosterResetConfirmation !== 'RESET ALL') return;
    this.busy.set(true);
    this.notice.set('');
    const refused: string[] = [];
    this.rosterReset.set({ open: true, done: 0, total: rows.length });
    for (const row of rows) {
      try {
        await this.api.request('/admin/test-accounts/' + row.accountId + '/reset', {
          key: crypto.randomUUID(),
          expectedRevision: row.revision,
          confirmation: row.username,
          preset: 'scenario',
        });
      } catch (failure) {
        refused.push(row.username + (reason(failure) ? ' (' + reason(failure).trim() + ')' : ''));
      }
      this.rosterReset.update((progress) => progress && { ...progress, done: progress.done + 1 });
    }
    this.rosterReset.set(null);
    this.rosterResetConfirmation = '';
    this.busy.set(false);
    await this.load();
    this.history.set({});
    this.notice.set(
      refused.length
        ? `${rows.length - refused.length} of ${rows.length} reset. Not reset: ${refused.join(', ')}. Reset all again to retry.`
        : `All ${rows.length} roster accounts are back to their scenarios.`,
    );
  }

  async deleteAccount() {
    const row=this.deleting();
    if(!row||!this.mayDelete(row)||this.busy()||this.deleteConfirmation!==row.username)return;
    this.busy.set(true);
    try {
      await this.api.remove(`/admin/test-accounts/${row.accountId}`);
      this.deleting.set(null);this.deleteConfirmation='';this.busy.set(false);await this.load();
      this.notice.set(`${row.username} deleted. Its login and test data are gone; the creator's lifetime count remains.`);
    } catch (failure) {this.notice.set(reason(failure)+'Deletion was not confirmed. Retry the same account.');}
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

  startRemoval(row: DirectoryRow, action: 'disable' | 'remove') {
    this.closeConfirmations(); this.removing.set({ row, action }); this.notice.set('');
  }
  /** Disable needs DISABLE typed, Delete needs DELETE; Enable is one click because it only gives back what was there. */
  async confirmRemoval() {
    const pending = this.removing(), word = pending?.action === 'disable' ? 'DISABLE' : 'DELETE';
    if (!pending?.row.accountId || pending.row.isSelf || this.removalConfirmation !== word || this.busy()) return;
    const { row, action } = pending;
    if (action === 'disable' ? !row.canDisable : !row.canRemove) return;
    this.busy.set(true);
    try {
      await this.api.request(`/admin/accounts/${row.accountId}/${action}`, { confirmation: word });
      this.removing.set(null); this.removalConfirmation = ''; this.busy.set(false); await this.load();
      this.notice.set(action === 'disable'
        ? `${row.name} is disabled. Every sign-in is blocked and their open session closes within 5 minutes.`
        : `${row.name} is deleted. If they sign in again, they appear in Waiting for access as a new person.`);
    } catch { this.notice.set(action === 'disable' ? 'Disable was not confirmed. Refresh and retry.' : 'Deletion was not confirmed. Refresh and retry the same account.'); }
    finally { this.busy.set(false); }
  }
  async enable(row: DirectoryRow) {
    if (!row.accountId || !row.canEnable || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.request(`/admin/accounts/${row.accountId}/enable`, {});
      this.busy.set(false); await this.load();
      this.notice.set(`${row.name} can sign in again.`);
    } catch { this.notice.set('Enable was not confirmed. Refresh and retry.'); }
    finally { this.busy.set(false); }
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
    } catch (failure) {
      this.notice.set(
        reason(failure) + 'Reset was not confirmed. Retry the same reset, or cancel and refresh before another change.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}

/** DLV-969: the server's own reason ("Confirm the exact test username…") leads the notice, so a refusal says why. */
function reason(failure: unknown): string {
  return failure instanceof Error && failure.message ? failure.message + ' ' : '';
}
