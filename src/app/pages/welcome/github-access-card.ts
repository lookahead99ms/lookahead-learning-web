import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { dismissGithub, normalizeGithub } from '../../core/github-account/github-account';
import { sameSitePath } from '../../core/test-session/same-site-path';
import { AccountSettingsError } from '../account/account-settings-client';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

/**
 * DLV-969 (owner, 2026-11-05): the Welcome page asks staff for their GitHub account. Save stores it with the other
 * profile links (the other three stay as they are); Not now is remembered in this browser. Either way the person goes
 * on to `next`, the page they were opening, when it is a path on this site.
 */
@Component({
  selector: 'app-github-access-card',
  imports: [FormsModule, RouterLink],
  templateUrl: './github-access-card.html',
  styleUrl: './github-access-card.css',
})
export class GithubAccessCard {
  readonly accountId = input.required<string>();
  readonly next = input<string | null>(null);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly router = inject(Router);
  protected value = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal<'saved' | 'later' | null>(null);
  protected readonly continueTo = computed(() => sameSitePath(this.next()));

  async save(): Promise<void> {
    if (this.busy()) return;
    const parsed = normalizeGithub(this.value);
    if ('error' in parsed) {
      this.error.set(parsed.error);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const current = await this.accounts.loadProfile();
      const links = current.links ?? { github: null, linkedin: null, x: null, website: null };
      await this.accounts.updateProfileLinks({ ...links, github: parsed.url });
      this.done.set('saved');
      await this.continue();
    } catch (error) {
      this.error.set(
        error instanceof AccountSettingsError && error.kind === 'invalid-link'
          ? 'Use an https://github.com/… address for GitHub.'
          : error instanceof AccountSettingsError && error.kind === 'session-expired'
            ? 'Your session expired. Sign in again, then add your GitHub account in Account settings.'
            : 'We couldn’t save it just now. Retry, or add it later in Account settings.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async later(): Promise<void> {
    dismissGithub(this.accountId());
    this.done.set('later');
    await this.continue();
  }

  private async continue(): Promise<void> {
    const next = this.continueTo();
    if (next) await this.router.navigateByUrl(next);
  }
}
