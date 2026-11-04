import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ScrollLock } from '../scroll-lock/scroll-lock';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { TestSessions, UsableTestAccount, roleLabel, scenarioDetail, scenarioPlan } from './test-sessions';
import { switcherUpgradeLine, switcherUpgradeOf } from '../../content/upgrade-markers';

type Tab = 'learners' | 'co-authors' | 'admins';

/**
 * DLV-969 (owner, 2026-11-04): "Switch to a test account" from the account menu. One dialog: find by name or scenario,
 * Learners / Co-authors / Admins, and for learners a plan filter. Choosing an account reloads the platform as it.
 * The Domain lists only the accounts this person's role may use, so a tab with none of them is not shown: a learner
 * sees Learners alone, an admin Learners and Admins.
 */
@Component({
  selector: 'app-test-account-switcher',
  imports: [ScrollLock],
  templateUrl: './test-account-switcher.html',
  styleUrl: './test-account-switcher.css',
})
export class TestAccountSwitcher {
  protected readonly sessions = inject(TestSessions);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly query = signal('');
  /** The tab last chosen; `tab` is the one shown, which falls back to the first visible tab. */
  private readonly chosen = signal<Tab>('learners');
  protected readonly plan = signal<string | null>(null);
  private readonly allTabs: { id: Tab; title: string }[] = [
    { id: 'learners', title: 'Learners' },
    { id: 'co-authors', title: 'Co-authors' },
    { id: 'admins', title: 'Admins' },
  ];
  protected readonly label = roleLabel;
  protected readonly detail = scenarioDetail;
  protected readonly planOf = scenarioPlan;
  /** "Upgraded by Admin 2 · Grow", "Upgraded by you · Grow"; null when nobody upgraded it. */
  protected upgradeOf(account: UsableTestAccount): string | null {
    const marker = switcherUpgradeOf(account);
    return marker ? switcherUpgradeLine(marker) : null;
  }

  private readonly all = computed(() => this.sessions.accounts() ?? []);
  /** Tabs holding at least one account this person may use, before any search; none while loading or empty. */
  protected readonly tabs = computed(() => {
    const present = new Set(this.all().map(tabOf));
    return this.allTabs.filter((item) => present.has(item.id));
  });
  protected readonly tab = computed<Tab>(() => {
    const visible = this.tabs();
    return visible.some((item) => item.id === this.chosen()) ? this.chosen() : (visible[0]?.id ?? this.chosen());
  });
  /** Search covers every tab; the tab and plan filter narrow what is left. */
  private readonly found = computed(() => {
    const words = this.query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.all().filter((account) => {
      const text = [account.displayName, account.username, account.scenario ?? '', roleLabel(account)].join(' ').toLowerCase();
      return words.every((word) => text.includes(word));
    });
  });
  protected readonly counts = computed(() => {
    const counts: Record<Tab, number> = { learners: 0, 'co-authors': 0, admins: 0 };
    for (const account of this.found()) counts[tabOf(account)]++;
    return counts;
  });
  /** The plans the learners in this list start on, in the order plans are sold. */
  protected readonly plans = computed(() => {
    const present = new Set(this.found().filter((account) => tabOf(account) === 'learners').map(scenarioPlan).filter(Boolean));
    return PLAN_ORDER.filter((name) => present.has(name)).concat([...present].filter((name): name is string => !!name && !PLAN_ORDER.includes(name)));
  });
  protected readonly shown = computed(() =>
    this.found().filter((account) => tabOf(account) === this.tab() && (this.tab() !== 'learners' || !this.plan() || scenarioPlan(account) === this.plan())),
  );
  protected readonly currentId = computed(() => (this.sessions.active() ? this.accounts.account()?.accountId ?? null : null));
  protected readonly holder = computed(() => this.sessions.status()?.holderName ?? null);

  constructor() {
    effect(() => {
      const element = this.dialog()?.nativeElement;
      if (!element) return;
      if (this.sessions.pickerOpen() && !element.open) {
        untracked(() => {
          // Start where the current test account is, or on Learners.
          const current = this.all().find((account) => account.accountId === this.currentId());
          this.chosen.set(current ? tabOf(current) : 'learners');
          this.query.set('');
          this.plan.set(null);
        });
        element.showModal?.();
      } else if (!this.sessions.pickerOpen() && element.open) {
        element.close();
      }
    });
  }

  protected chooseTab(tab: Tab): void {
    this.chosen.set(tab);
    this.plan.set(null);
  }

  /** Arrow keys move between the visible tabs, as in any tab list. */
  protected tabKey(event: KeyboardEvent, index: number): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const visible = this.tabs();
    if (!step || !visible.length) return;
    event.preventDefault();
    const next = visible[(index + step + visible.length) % visible.length];
    this.chooseTab(next.id);
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#switcher-tab-${next.id}`)?.focus();
  }

  protected initials(account: UsableTestAccount): string {
    const number = account.displayName.match(/(\d+)$/)?.[1] ?? '';
    return (account.displayName.trim()[0] ?? '?').toUpperCase() + number;
  }

  protected use(account: UsableTestAccount): void {
    if (account.accountId === this.currentId()) return;
    void this.sessions.use(account);
  }
}

const PLAN_ORDER = ['Free', 'Promo', 'Learn', 'Grow', 'Advance'];

function tabOf(account: UsableTestAccount): Tab {
  if (account.roles.includes('co-author')) return 'co-authors';
  if (account.roles.includes('admin')) return 'admins';
  return 'learners';
}
