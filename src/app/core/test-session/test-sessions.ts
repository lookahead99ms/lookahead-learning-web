import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { MembershipApi } from '../../content/membership-api';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';
import type { SwitcherUpgrade } from '../../content/upgrade-markers';
import { sameSitePath } from './same-site-path';

export { sameSitePath };

/** One test account the gate holder may use (Domain DevTestSessions.Usable). */
export interface UsableTestAccount {
  accountId: string;
  username: string;
  displayName: string;
  /** Always empty since 2026-11-06 (owner): test accounts are learners only; kept because the Domain still sends it. */
  roles: string[];
  scenario: string | null;
  /** DLV-969 (owner, 2026-11-04): who upgraded this account through an approved request; null or absent when nobody did. */
  upgradedBy?: SwitcherUpgrade | null;
}

/**
 * GET /auth/test-session: is this a test session, and can it go back to its staff sign-in. `holderName` is the staff name
 * this tab remembered when it switched (only ever your own name, in your own browser).
 */
export interface TestSessionStatus {
  active: boolean;
  canReturn: boolean;
  holderName: string | null;
}

const HOLDER_KEY = 'lookahead.testSession.holder';

/**
 * DLV-969 (owner, 2026-11-04): staff switch to a DEV test account from the account menu and come back without signing
 * out. The Gateway keeps the staff sign-in aside while the test account is in use; the Domain decides, on every call,
 * which test accounts the person who opened DEV may use, so this only shows what it is told.
 */
@Injectable({ providedIn: 'root' })
export class TestSessions {
  private readonly api = inject(MembershipApi);
  private readonly document = inject(DOCUMENT);
  private readonly signedIn = inject(StudyPlanAccount);
  readonly status = signal<TestSessionStatus | null>(null);
  readonly accounts = signal<UsableTestAccount[] | null>(null);
  readonly pickerOpen = signal(false);
  readonly starting = signal<string | null>(null);
  readonly returning = signal(false);
  readonly error = signal('');
  readonly active = computed(() => this.status()?.active === true);

  async refresh(): Promise<void> {
    try {
      const answer = await this.api.request<Partial<TestSessionStatus>>('/auth/test-session');
      const active = answer?.active === true;
      if (!active) this.remember(null);
      this.status.set({ active, canReturn: active && answer?.canReturn === true, holderName: active ? this.remembered() : null });
      if (this.active() && this.accounts() === null) await this.load();
    } catch {
      this.status.set(null);
    }
  }

  async open(): Promise<void> {
    this.error.set('');
    this.pickerOpen.set(true);
    if (this.accounts() === null) await this.load();
  }

  close(): void {
    if (!this.starting()) this.pickerOpen.set(false);
  }

  async load(): Promise<void> {
    try {
      const list = await this.api.request<UsableTestAccount[]>('/auth/test-accounts');
      this.accounts.set(Array.isArray(list) ? list : []);
    } catch (failure) {
      this.accounts.set([]);
      this.error.set(message(failure, 'Test accounts could not be loaded. Close and try again.'));
    }
  }

  /** The test account in use, as the list describes it (scenario and role); null outside a test session. */
  current(accountId: string | null | undefined): UsableTestAccount | null {
    if (!this.active() || !accountId) return null;
    return this.accounts()?.find((account) => account.accountId === accountId) ?? null;
  }

  /**
   * Opens the platform as this test account. `next` (DLV-969, owner 2026-11-04), when it is a same-site path, is where
   * to land instead of the Gateway's answer: Switch to Learner06 after a review goes back to the page the purchase
   * started from.
   */
  async use(account: UsableTestAccount, next?: string | null): Promise<void> {
    if (this.starting() || this.returning()) return;
    this.starting.set(account.accountId);
    this.error.set('');
    // Switching from your own account: remember your name for "you are …" while the test account is in use.
    if (!this.active()) this.remember(this.signedIn.account()?.displayName ?? null);
    try {
      const started = await this.api.request<{ next?: string }>('/auth/test-session', { accountId: account.accountId });
      this.go(sameSitePath(next) ?? started?.next);
    } catch (failure) {
      this.error.set(message(failure, 'The test account could not be opened. Try again.'));
      this.starting.set(null);
    }
  }

  /**
   * Back to the staff sign-in this test session started from; the Gateway sends the sign-in page if it expired. `next`,
   * when it is a same-site path, overrides the Gateway's answer (Go to People and access on the DEV checkout screen lands there).
   */
  async back(next?: string | null): Promise<void> {
    if (this.returning() || this.starting()) return;
    this.returning.set(true);
    this.error.set('');
    try {
      const ended = await this.api.request<{ next?: string }>('/auth/test-session/end', {});
      this.go(sameSitePath(next) ?? ended?.next);
    } catch (failure) {
      this.error.set(message(failure, 'Could not go back to your account. Try again.'));
      this.returning.set(false);
    }
  }

  private remembered(): string | null {
    try {
      const name = this.document.defaultView?.sessionStorage.getItem(HOLDER_KEY)?.trim();
      return name || null;
    } catch {
      return null;
    }
  }

  private remember(name: string | null): void {
    try {
      const storage = this.document.defaultView?.sessionStorage;
      if (name?.trim()) storage?.setItem(HOLDER_KEY, name.trim());
      else storage?.removeItem(HOLDER_KEY);
    } catch {
      // Private windows may refuse storage; the menu then just says "Test account".
    }
  }

  private go(next: string | undefined): void {
    // Only a same-site path: never an address the answer could point elsewhere.
    this.document.defaultView?.location.assign(sameSitePath(next) ?? '/');
  }
}


function message(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message ? failure.message : fallback;
}

/** The plan word a learner scenario starts with ("Learn · active · …" → "Learn"); null for a created account. */
export function scenarioPlan(account: UsableTestAccount): string | null {
  if (!account.scenario) return null;
  const first = account.scenario.split(' · ')[0]?.trim();
  return first || null;
}

/** The rest of a scenario after its plan word, for the line under the name. */
export function scenarioDetail(account: UsableTestAccount): string {
  if (!account.scenario) return 'Created test account';
  return account.scenario.split(' · ').slice(1).join(' · ');
}
