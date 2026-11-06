import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ScrollLock } from '../scroll-lock/scroll-lock';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import { TestSessions, UsableTestAccount, scenarioDetail, scenarioPlan } from './test-sessions';
import { switcherUpgradeLine, switcherUpgradeOf } from '../../content/upgrade-markers';

/**
 * DLV-969 (owner, 2026-11-04): "Switch to a test account" from the account menu. One dialog: find by name or scenario,
 * and a plan filter. Choosing an account reloads the platform as it. The Domain lists only the accounts this person's
 * role may use. Since 2026-11-06 (owner) every test account is a learner, so there are no Learners / Co-authors /
 * Admins tabs any more.
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
  protected readonly plan = signal<string | null>(null);
  protected readonly detail = scenarioDetail;
  protected readonly planOf = scenarioPlan;
  /** "Upgraded by Admin 2 · Grow", "Upgraded by you · Grow"; null when nobody upgraded it. */
  protected upgradeOf(account: UsableTestAccount): string | null {
    const marker = switcherUpgradeOf(account);
    return marker ? switcherUpgradeLine(marker) : null;
  }

  private readonly all = computed(() => this.sessions.accounts() ?? []);
  /** Search covers every account; the plan filter narrows what is left. */
  private readonly found = computed(() => {
    const words = this.query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.all().filter((account) => {
      const text = [account.displayName, account.username, account.scenario ?? ''].join(' ').toLowerCase();
      return words.every((word) => text.includes(word));
    });
  });
  /** The plans the learners in this list start on, in the order plans are sold. */
  protected readonly plans = computed(() => {
    const present = new Set(this.found().map(scenarioPlan).filter(Boolean));
    return PLAN_ORDER.filter((name) => present.has(name)).concat([...present].filter((name): name is string => !!name && !PLAN_ORDER.includes(name)));
  });
  protected readonly shown = computed(() => this.found().filter((account) => !this.plan() || scenarioPlan(account) === this.plan()));
  protected readonly currentId = computed(() => (this.sessions.active() ? this.accounts.account()?.accountId ?? null : null));
  protected readonly holder = computed(() => this.sessions.status()?.holderName ?? null);

  constructor() {
    effect(() => {
      const element = this.dialog()?.nativeElement;
      if (!element) return;
      if (this.sessions.pickerOpen() && !element.open) {
        untracked(() => {
          this.query.set('');
          this.plan.set(null);
        });
        element.showModal?.();
      } else if (!this.sessions.pickerOpen() && element.open) {
        element.close();
      }
    });
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
