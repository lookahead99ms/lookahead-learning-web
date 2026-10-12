import { effect, inject, Injectable, untracked } from '@angular/core';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';
import { PlatformThemeService, ThemePreference } from './platform-theme';

/**
 * Keeps the color theme with the learner's account (DLV-932). After sign-in the account's saved
 * theme replaces this browser's; a change made while signed in is saved to the account. Signed
 * out, the theme stays a browser preference.
 */
@Injectable({ providedIn: 'root' })
export class AccountThemePreference {
  private readonly theme = inject(PlatformThemeService);
  private readonly accounts = inject(StudyPlanAccount);
  private syncedOwner: string | null = null;

  constructor() {
    effect(() => {
      const account = this.accounts.account();
      const owner = account && !this.accounts.sessionExpired() ? account.accountId : null;
      if (owner === this.syncedOwner) return;
      this.syncedOwner = owner;
      if (owner) untracked(() => void this.restore(owner));
    });
  }

  /** Applies the theme now and, when signed in, saves it to the account. Resolves false if that save failed. */
  async choose(preference: ThemePreference): Promise<boolean> {
    this.theme.setTheme(preference);
    if (!this.signedIn()) return true;
    try {
      await this.accounts.updateThemePreference(preference);
      return true;
    } catch {
      return false;
    }
  }

  private signedIn(): boolean {
    return this.accounts.enabled && !!this.accounts.account() && !this.accounts.sessionExpired();
  }

  private async restore(owner: string): Promise<void> {
    const saved = await this.accounts.loadThemePreference();
    if (saved && this.syncedOwner === owner) this.theme.setTheme(saved);
  }
}
