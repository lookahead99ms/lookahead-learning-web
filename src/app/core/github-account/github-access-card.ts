import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { normalizeGithub } from './github-account';
import { AccountSettingsError } from '../../pages/account/account-settings-client';
import { StudyPlanAccount } from '../../pages/study-plan/study-plan-account';

/**
 * DLV-969 (owner, 2026-11-05): asks staff for their GitHub account. Save stores it with the other profile links (the
 * other three stay as they are). Save and Not now report `finished`; what to do next is the dialog's business.
 */
@Component({
  selector: 'app-github-access-card',
  imports: [FormsModule, RouterLink],
  templateUrl: './github-access-card.html',
  styleUrl: './github-access-card.css',
})
export class GithubAccessCard {
  readonly accountId = input.required<string>();
  readonly finished = output<'saved' | 'later'>();
  private readonly accounts = inject(StudyPlanAccount);
  protected value = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal<'saved' | 'later' | null>(null);

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
      this.finished.emit('saved');
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

  later(): void {
    this.done.set('later');
    this.finished.emit('later');
  }
}
