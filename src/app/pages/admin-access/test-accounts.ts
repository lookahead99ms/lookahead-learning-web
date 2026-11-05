import { Component, computed, effect, inject, input, OnInit, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MembershipApi, MembershipRequestError } from '../../content/membership-api';
import { ContentService } from '../../content/content.service';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { DevSession } from '../../core/dev-session-notice/dev-session';
import { AccessRecord, AccessRecordView, accessRecordView } from '../account/account-membership';
import { approvedLine, canResetOf, resetReserved, upgradeLine, upgradeMarkerOf } from '../../content/upgrade-markers';
import { PendingPurchase, pendingPurchaseOf } from '../../content/purchase-requests';
import { viewerRole } from './purchase-requests-panel';
import { githubDisplay } from '../../core/github-account/github-account';
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
  /**
   * withoutPlan (DLV-969 S37): ready learners whose scenario has a study plan they don't have yet. changed (owner,
   * 2026-11-04): ready roster accounts that differ from their scenario, so Reset all has something to do; absent from an
   * older Domain, which keeps Reset all available.
   */
  roster?: { total: number; ready: number; deleted: number; withoutPlan?: number; changed?: number } | null;
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
  /** DLV-969 (owner, 2026-11-04): a DEV purchase waiting for approval; sent to the owner and admins only. */
  pendingPurchase?: PendingPurchase | null;
  /** DLV-969 (owner, 2026-11-04): who upgraded it through an approved request (read by upgradeMarkerOf). */
  upgradedBy?: unknown;
  /** Whether this viewer may reset it (the upgrade marker reserves Reset); absent from an older Domain. */
  canReset?: boolean;
}

/** The test-account list's tabs, as in the account menu's switcher (owner, 2026-11-04). */
export type ListTab = 'learners' | 'co-authors' | 'admins';
const LIST_TABS: readonly { id: ListTab; title: string }[] = [
  { id: 'learners', title: 'Learners' },
  { id: 'co-authors', title: 'Co-authors' },
  { id: 'admins', title: 'Admins' },
];
/** A co-author or admin test account goes under its role; every other one is a learner, as in the switcher. */
export function listTabOf(row: Pick<DirectoryRow, 'roles'>): ListTab {
  if (row.roles.includes('Co-author')) return 'co-authors';
  if (row.roles.includes('Admin')) return 'admins';
  return 'learners';
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
  /** DLV-969 (owner, 2026-11-04): Restore and Reset all are the owner's alone. */
  readonly isOwner = computed(() => viewerRole(this.accounts.account()) === 'owner');
  /**
   * DLV-969 (owner, 2026-11-04): the owner and admins see which test accounts have a purchase request waiting (the
   * requests themselves are on Waiting for access → Purchase requests); co-authors and everyone else see nothing of them.
   */
  readonly canDecide = computed(() => ['owner', 'admin'].includes(viewerRole(this.accounts.account())));
  readonly canCreate = computed(() => ['owner', 'co-author', 'admin'].includes(viewerRole(this.accounts.account())));
  readonly allowance = signal<TestAccountAllowance|null>(null);
  private readonly devSession = inject(DevSession);
  /** DLV-969 S35: DEV test accounts have no sign-in of their own; staff use them from the sign-in page. */
  readonly dev = computed(() => this.devSession.status() !== null || this.devSession.gated());
  /** The scenario a new test account starts from (DLV-969 S35); the first is a free learner without a plan. */
  createScenario = 'learner01';
  /**
   * DLV-969 (owner, 2026-11-04): Create test account makes learners only, for every role, the owner included. Staff test
   * accounts come from the fixed roster, so scenarios with a staff role are never offered (the Domain refuses them too).
   */
  readonly learnerScenarios = computed(() =>
    (this.allowance()?.scenarios ?? []).filter((scenario) => !scenario.roles.some((role) => STAFF_ROLES.includes(role))),
  );
  /** The owner's DEV roster progress while it is being created. */
  readonly rosterBusy = signal(false);
  readonly roster = computed(() => {
    const status = this.allowance()?.roster;
    return status ? { ...status, remaining: Math.max(0, status.total - status.ready - status.deleted) } : null;
  });
  /** DLV-969 (owner, 2026-11-04): Reset all, typed once; done counts the resets sent so far. */
  readonly rosterReset = signal<{ open: boolean; done: number; total: number } | null>(null);
  rosterResetConfirmation = '';
  /** DLV-969 (owner, 2026-11-04): Restore brings deleted roster accounts back with their scenarios, typed once. */
  readonly rosterRestore = signal<{ total: number } | null>(null);
  rosterRestoreConfirmation = '';
  /** Deleted roster accounts the owner can bring back; 0 for anyone else. */
  readonly restorable = computed(() => (this.isOwner() ? this.roster()?.deleted ?? 0 : 0));
  /** The owner's Restore and Reset all, in DEV with the roster status (owner, 2026-11-04). */
  readonly ownerRoster = computed(() => this.isOwner() && this.dev() && !!this.roster());
  /**
   * Reset all has something to do: roster accounts listed, and the Domain's `changed` count is not 0. An older Domain
   * without `changed` keeps it available.
   */
  readonly resettable = computed(() => this.rosterRows().length > 0 && this.roster()?.changed !== 0);
  /**
   * Why Reset all is greyed out, as a line under its own line and as its hover text (owner, 2026-11-04). Restore is not
   * shown at all when nothing is deleted: the status line says so.
   */
  readonly rosterHints = computed(() => {
    if (!this.ownerRoster() || this.resettable()) return { reset: '' };
    return { reset: this.rosterRows().length ? 'Nothing to reset: every roster account is at its scenario' : 'Nothing to reset' };
  });
  /**
   * DLV-969 (owner, DEV test 2026-11-04): why the open confirmation's action failed, shown inside that panel. One panel is
   * open at a time, so one message serves them all; opening or closing a panel clears it.
   */
  readonly panelError = signal('');
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
  /** The test-account list's tab, Learners first; `listTab` falls back to the first tab that has accounts. */
  private readonly chosenListTab = signal<ListTab>('learners');
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
  /** Only the roles somebody in this list has (People's Role menu). */
  readonly roleFilters = computed(() =>
    ROLE_FILTERS.filter((name) => this.inView().some((row) => row.roles.includes(name))),
  );
  /** Test accounts tab (owner, 2026-11-04): Learners, Co-authors and Admins with at least one account, as in the switcher. */
  readonly listTabs = computed(() => {
    if (this.view() !== 'test') return [];
    const present = new Set(this.inView().map(listTabOf));
    return LIST_TABS.filter((tab) => present.has(tab.id));
  });
  readonly listTab = computed<ListTab>(() => {
    const tabs = this.listTabs();
    return tabs.some((tab) => tab.id === this.chosenListTab()) ? this.chosenListTab() : (tabs[0]?.id ?? this.chosenListTab());
  });
  /** How many accounts in each tab match the search, so a match on another tab is easy to find. */
  readonly listCounts = computed(() => {
    const counts: Record<ListTab, number> = { learners: 0, 'co-authors': 0, admins: 0 };
    for (const row of this.inView()) if (matchesFilter(row, this.query(), '')) counts[listTabOf(row)]++;
    return counts;
  });
  /** The rows the search works on: the chosen tab on Test accounts, everyone on People. */
  readonly inTab = computed(() => (this.view() === 'test' && this.listTabs().length ? this.inView().filter((row) => listTabOf(row) === this.listTab()) : this.inView()));
  readonly visible = computed(() =>
    this.inTab().filter((row) => matchesFilter(row, this.query(), this.view() === 'test' ? '' : this.role())),
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

  /**
   * DLV-969 (owner, 2026-11-04): the row says whether this viewer may reset it (the upgrade marker reserves it for the
   * owner and the person who upgraded it); an older Domain without `canReset` keeps today's rule.
   */
  mayReset(row: TestAccountRow | null | undefined): boolean {
    return !!row && (canResetOf(row) ?? this.canReset());
  }

  /** "Upgraded by Admin 2 · Grow · 4 Nov" and, when someone else approved it, "approved by Admin 3"; null without a marker. */
  upgradeOf(row: TestAccountRow | null | undefined): { line: string; approved: string | null } | null {
    const marker = row ? upgradeMarkerOf(row) : null;
    return marker ? { line: upgradeLine(marker, this.isOwner()), approved: approvedLine(marker, this.isOwner()) } : null;
  }

  select(row: TestAccountRow) {
    if (!this.mayReset(row) || this.pending()) return;
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

  /** Learners, Co-authors or Admins; a selection on the tab left behind is dropped with its confirmations. */
  chooseListTab(tab: ListTab) {
    if (this.busy() || this.pending() || tab === this.listTab()) return;
    this.chosenListTab.set(tab);
    this.selectedKey.set(null);
    this.expanded.set(null);
    this.closeConfirmations();
  }

  /** Arrow keys, Home and End move between the list's tabs (WAI-ARIA tabs pattern). */
  listTabKey(event: KeyboardEvent) {
    const ids = this.listTabs().map((tab) => tab.id), index = ids.indexOf(this.listTab());
    const next = ({ ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ids.length - 1 } as Record<string, number>)[event.key];
    if (next === undefined || !ids.length) return;
    event.preventDefault();
    const id = ids[(next + ids.length) % ids.length];
    this.chooseListTab(id);
    (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('#list-tab-' + id)?.focus();
  }

  /** Create test account opens its panel under the button row, closing any other confirmation. */
  openCreate() {
    if (!this.canCreate() || this.busy()) return;
    this.closeConfirmations();
    this.creating.set(true);
  }

  /** Every confirmation closes the same way: no panel, no typed words, no message left behind. */
  closeConfirmations() {
    this.panelError.set('');
    this.creating.set(false);
    this.selected.set(null);
    this.deleting.set(null);
    this.downgradingReal.set(null);
    this.deletingReal.set(null);
    this.removing.set(null);
    if (!this.rosterReset()?.done) this.rosterReset.set(null);
    this.rosterRestore.set(null);
    this.rosterRestoreConfirmation = '';
    this.confirmation = '';
    this.deleteConfirmation = '';
    this.realConfirmation = '';
    this.removalConfirmation = '';
  }

  cancel() {
    this.selected.set(null);
    this.pending.set(null);
    this.panelError.set('');
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
    const scenarios = this.allowance()?.scenarios;
    const learner = !scenarios?.length || this.learnerScenarios().some((scenario) => scenario.id === this.createScenario);
    return this.canCreate() && !this.busy() && !!this.createScenario && learner && (this.dev() || this.createPassword.length >= 15);
  }

  async create() {
    if(!this.mayCreate())return;
    const key=this.createKey()??crypto.randomUUID();this.createKey.set(key);this.busy.set(true);
    const dev=this.dev();this.panelError.set('');
    try {
      const created=await this.api.request<{username:string}>('/admin/test-accounts',dev?{key,scenario:this.createScenario}:{key,password:this.createPassword,scenario:this.createScenario});
      this.createKey.set(null);this.createPassword='';this.creating.set(false);
      this.busy.set(false);await this.load();
      this.notice.set(dev
        ? `${created.username} created. To use it, choose Switch to a test account in your account menu.`
        : `${created.username} created. Share its password through your local test setup.`);
    } catch (failure) {
      // The panel stays open with the reason inside it. A refusal (403 TEST_ACCOUNT_LEARNER_ONLY: "Only learner test
      // accounts can be created…") is said in the server's words, and the next try is a new request.
      if (failure instanceof MembershipRequestError && failure.status === 403) {
        this.createKey.set(null);
        this.panelError.set(failure.message);
      } else {
        this.panelError.set(reason(failure) + (dev ? 'Creation was not confirmed. Retry; the same request key is reused.' : 'Creation was not confirmed. Retry with the same password and request key.'));
      }
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
    if (!this.resettable()) return;
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
    this.panelError.set('');
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
    if (refused.length === rows.length) {
      // Nothing was reset: the panel stays, with the reasons inside it.
      this.rosterReset.set({ open: true, done: 0, total: rows.length });
      this.busy.set(false);
      this.panelError.set(`None reset. Not reset: ${refused.join(', ')}. Refresh and retry.`);
      return;
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

  openRosterRestore() {
    if (!this.restorable()) return;
    this.closeConfirmations();
    this.rosterRestore.set({ total: this.restorable() });
  }

  /**
   * DLV-969 (owner, 2026-11-04): one request brings every deleted roster account back with its scenario. The Domain
   * checks the typed word and the owner again; an older Domain without the endpoint answers 404.
   */
  async restoreRoster() {
    const pending = this.rosterRestore();
    if (!pending || !this.dev() || !this.restorable() || this.busy() || this.rosterRestoreConfirmation !== 'RESTORE') return;
    this.busy.set(true);
    this.notice.set('');
    this.panelError.set('');
    try {
      // The route the Gateway already forwards (its allowlist is in a pinned file), as roster creation does with roster: true.
      const result = await this.api.request<{ restored?: number } | null>('/admin/test-accounts', { restoreRoster: true, confirm: 'RESTORE' });
      const restored = typeof result?.restored === 'number' ? result.restored : pending.total;
      this.rosterRestore.set(null);
      this.rosterRestoreConfirmation = '';
      this.busy.set(false);
      await this.load();
      this.history.set({});
      this.notice.set(`Restored ${restored} roster account${restored === 1 ? '' : 's'}.`);
    } catch (failure) {
      // The panel stays open with the reason inside it (owner, DEV test 2026-11-04).
      this.panelError.set(
        failure instanceof MembershipRequestError && failure.status === 404
          ? 'Restore needs the newer Domain release.'
          : reason(failure) + 'Restore was not confirmed. Refresh and retry.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async deleteAccount() {
    const row=this.deleting();
    if(!row||!this.mayDelete(row)||this.busy()||this.deleteConfirmation!==row.username)return;
    this.busy.set(true);this.panelError.set('');
    try {
      await this.api.remove(`/admin/test-accounts/${row.accountId}`);
      this.deleting.set(null);this.deleteConfirmation='';this.busy.set(false);await this.load();
      this.notice.set(`${row.username} deleted. Its login and test data are gone; the creator's lifetime count remains.`);
    } catch (failure) {this.panelError.set(reason(failure)+'Deletion was not confirmed. Retry the same account.');}
    finally {this.busy.set(false);}
  }

  async downgradeReal() {
    const row=this.downgradingReal();
    if(!row?.accountId||row.isTest||row.isSelf||row.canDowngrade!==true||this.realConfirmation!=='DOWNGRADE'||this.busy())return;
    this.busy.set(true);this.panelError.set('');
    try {
      await this.api.request(`/admin/accounts/${row.accountId}/downgrade`,{confirmation:'DOWNGRADE'});
      this.downgradingReal.set(null);this.realConfirmation='';this.busy.set(false);await this.load();
      this.notice.set(`${row.name} now has free learner access. Purchase history remains.`);
    } catch (failure) {this.panelError.set(reason(failure)+'Downgrade was not confirmed. Refresh and retry.');}
    finally {this.busy.set(false);}
  }

  async deleteReal() {
    const row=this.deletingReal();
    if(!row?.accountId||row.isTest||row.isSelf||row.canDelete!==true||this.realConfirmation!=='DELETE'||this.busy())return;
    this.busy.set(true);this.panelError.set('');
    try {
      await this.api.request(`/admin/accounts/${row.accountId}/delete`,{confirmation:'DELETE'});
      this.deletingReal.set(null);this.realConfirmation='';this.busy.set(false);await this.load();
      this.notice.set(`${row.name} deleted. Sign-in and learner plans are gone; purchase audit remains.`);
    } catch (failure) {this.panelError.set(reason(failure)+'Deletion was not confirmed. Refresh and retry the same account.');}
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
    this.busy.set(true);this.panelError.set('');
    try {
      await this.api.request(`/admin/accounts/${row.accountId}/${action}`, { confirmation: word });
      this.removing.set(null); this.removalConfirmation = ''; this.busy.set(false); await this.load();
      this.notice.set(action === 'disable'
        ? `${row.name} is disabled. Every sign-in is blocked and their open session closes within 5 minutes.`
        : `${row.name} is deleted. If they sign in again, they appear in Waiting for access as a new person.`);
    } catch (failure) { this.panelError.set(reason(failure) + (action === 'disable' ? 'Disable was not confirmed. Refresh and retry.' : 'Deletion was not confirmed. Refresh and retry the same account.')); }
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

  /** DLV-969 (owner, 2026-11-05): the row whose GitHub address was just copied, for a short "Copied" on its button. */
  readonly copiedGithub = signal<string | null>(null);
  protected readonly githubLabel = githubDisplay;

  /** Copies the person's GitHub address for the repository invitation. The clipboard may be refused; then the link stays to select. */
  async copyGithub(row: DirectoryRow): Promise<void> {
    if (!row.github) return;
    try {
      await navigator.clipboard.writeText(row.github);
      this.copiedGithub.set(row.key);
      setTimeout(() => { if (this.copiedGithub() === row.key) this.copiedGithub.set(null); }, 2000);
    } catch {
      this.copiedGithub.set(null);
    }
  }

  /** True when this test account has a request the viewer may decide; drives the row's badge. */
  hasRequest(row: TestAccountRow | null): boolean {
    return !!row && this.canDecide() && pendingPurchaseOf(row) !== null;
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
    if (!row || !this.mayReset(row) || this.busy() || this.confirmation !== row.username) return;
    const request = this.pending() ?? {
      key: crypto.randomUUID(),
      expectedRevision: row.revision,
      confirmation: row.username,
      preset: this.preset,
    };
    this.pending.set(request);
    this.busy.set(true);this.panelError.set('');
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
      // 403 RESET_RESERVED: "Only the owner or Admin 2, who upgraded this account, can reset it." Retrying cannot help, so
      // the same reset is not offered again; the panel stays with the reason inside it.
      if (resetReserved(failure)) {
        this.pending.set(null);
        this.panelError.set((failure as Error).message);
      } else {
        this.panelError.set(
          reason(failure) + 'Reset was not confirmed. Retry the same reset, or cancel and refresh before another change.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}

/** Roles that make a scenario a staff one; Create test account never offers those (DLV-969, owner 2026-11-04). */
const STAFF_ROLES: readonly string[] = ['owner', 'co-author', 'admin', 'reviewer', 'tester'];

/** DLV-969: the server's own reason ("Confirm the exact test username…") leads the notice, so a refusal says why. */
function reason(failure: unknown): string {
  return failure instanceof Error && failure.message ? failure.message + ' ' : '';
}
