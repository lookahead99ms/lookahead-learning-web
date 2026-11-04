import { Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { gatewayLoginUrl } from './account-navigation';
import { AccountMergeClient, isMergeToken, MergeCandidate, MergeDetails } from './account-merge-client';
import { AccountSignInMethod, accountSignInMethods } from './account-settings-client';
import { MergeInboxPanel } from './merge-inbox-panel';
import { PasswordAccountForm } from './password-account-form';

/** The word a person types before the merge runs. */
export const MERGE_WORD = 'MERGE';

export type MergeView =
  | 'loading'
  | 'sign-in'
  | 'choose'
  | 'invalid'
  | 'inbox'
  | 'conflict'
  | 'not-candidate'
  | 'unavailable'
  | 'done';

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function mergeDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : '';
}

export function methodLabel(method: AccountSignInMethod): string {
  return method.provider === 'google' ? 'Google' : 'Email and password';
}

/**
 * "Deleted: 2 study plans, progress since 3 Nov 2026" for an account that is not kept, ending ", and its paid
 * membership" when it has one (the merge ends it).
 */
export function deletedNote(candidate: MergeCandidate): string {
  const count = candidate.studyPlans.length;
  return (
    `Deleted: ${count} study ${count === 1 ? 'plan' : 'plans'}, progress since ${mergeDate(candidate.createdAt)}` +
    (candidate.paidMembership ? ', and its paid membership' : '')
  );
}

/**
 * DLV-969 S36.8: /account/merge?token=… from the email. Signed out, it shows the sign-in step first; the token stays in
 * this page (and its address), never in browser storage. Signed in, the person picks the account to keep.
 */
@Component({
  selector: 'app-account-merge',
  imports: [PlatformHeader, RouterLink, MergeInboxPanel, PasswordAccountForm],
  templateUrl: './account-merge.html',
  styleUrls: ['./account.css', './account-merge.css'],
})
export class AccountMergePage {
  protected readonly store = inject(StudyPlanAccount);
  private readonly client = inject(AccountMergeClient);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  /** Read once: later changes of the address do not change which link this page acts on. */
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly token = this.query.get('token') ?? '';
  /**
   * /account/merge?offer=1: the Gateway sends a Google or managed sign-in here when the Domain reports another account
   * with the same email. A valid token wins over the offer.
   */
  private readonly offer = this.query.get('offer') === '1' && !isMergeToken(this.token);
  protected readonly view = signal<MergeView>('loading');
  protected readonly merge = signal<MergeDetails | null>(null);
  protected readonly keep = signal<string | null>(null);
  protected readonly confirmation = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** The signed-in email for the "Check your inbox" panel; empty when unknown. */
  protected readonly email = signal('');
  /** True when this page already asked for the email; false lets the panel ask once itself (the offer). */
  protected readonly inboxSent = signal(true);
  /** Where "Continue for now" goes in the panel; only the offer has one. */
  protected readonly inboxNext = signal<string | null>(null);
  protected readonly word = MERGE_WORD;
  protected readonly canMerge = computed(
    () =>
      !this.busy() &&
      !!this.keep() &&
      !!this.merge()?.candidates.some((candidate) => candidate.accountId === this.keep()) &&
      this.confirmation().trim() === MERGE_WORD,
  );
  /** After signing in, come back to this same link. */
  protected readonly returnTo =
    '/account/merge' + (this.offer ? '?offer=1' : this.token ? '?token=' + encodeURIComponent(this.token) : '');
  protected readonly googleUrl = gatewayLoginUrl(this.returnTo, 'google');
  protected readonly loginUrl = gatewayLoginUrl(this.returnTo);
  protected readonly date = mergeDate;
  protected readonly methodLabel = methodLabel;
  protected readonly deletedNote = deletedNote;

  protected readonly heading: Record<MergeView, string> = {
    loading: 'Merge accounts',
    'sign-in': 'Sign in to continue',
    choose: 'Choose one account',
    invalid: 'Link expired',
    inbox: 'Check your inbox',
    conflict: "Can't merge right now",
    'not-candidate': 'Choose again',
    unavailable: 'Try again soon',
    done: 'Accounts merged',
  };

  constructor() {
    void this.start();
  }

  private signedIn(): boolean {
    return !!this.store.account() && !this.store.sessionExpired();
  }

  private async start(): Promise<void> {
    await this.store.initialize();
    if (!this.signedIn()) {
      this.view.set('sign-in');
      return;
    }
    if (this.offer) {
      await this.openOffer();
      return;
    }
    await this.load();
  }

  /** The offer: the panel asks for the email once when it opens, and "Continue for now" goes home. */
  private async openOffer(): Promise<void> {
    this.email.set(await this.signedInEmail());
    this.inboxSent.set(false);
    this.inboxNext.set('/');
    this.view.set('inbox');
  }

  protected async load(): Promise<void> {
    this.error.set('');
    if (!isMergeToken(this.token)) {
      this.view.set('invalid');
      return;
    }
    this.view.set('loading');
    const result = await this.client.loadMerge(this.token);
    switch (result.kind) {
      case 'ready':
        this.merge.set(result.merge);
        this.keep.set(null);
        this.confirmation.set('');
        this.view.set('choose');
        return;
      case 'invalid':
        this.view.set('invalid');
        return;
      case 'conflict':
        this.view.set('conflict');
        return;
      case 'signed-out':
        this.view.set('sign-in');
        return;
      case 'unavailable':
        this.view.set('unavailable');
        return;
    }
  }

  protected async sendNewEmail(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const [result, email] = await Promise.all([this.client.requestMergeEmail(), this.signedInEmail()]);
    this.busy.set(false);
    if (result.kind === 'sent') {
      this.email.set(email);
      this.inboxSent.set(true);
      this.inboxNext.set(null);
      this.view.set('inbox');
    } else if (result.kind === 'signed-out') {
      this.view.set('sign-in');
    } else {
      this.error.set("We couldn't send the email right now. Try again in a minute.");
    }
  }

  protected async submit(): Promise<void> {
    const keep = this.keep();
    if (!this.canMerge() || !keep) return;
    this.busy.set(true);
    this.error.set('');
    const result = await this.client.merge(this.token, keep);
    switch (result.kind) {
      case 'merged':
        // The Domain has ended every sign-in of these accounts. This browser's own sign-out waits for the button:
        // the Gateway's sign-out leaves through Cognito, and this screen would never be seen.
        this.busy.set(false);
        this.view.set('done');
        return;
      case 'invalid':
      case 'conflict':
      case 'not-candidate':
        this.busy.set(false);
        this.view.set(result.kind);
        return;
      case 'signed-out':
        this.busy.set(false);
        this.view.set('sign-in');
        return;
      case 'unavailable':
        this.busy.set(false);
        this.error.set("We couldn't confirm the merge. Try again in a minute.");
        return;
    }
  }

  /** "Sign in again": the existing sign-out, then the sign-in page unless the sign-out already left for Cognito. */
  protected async signInAgain(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    await this.store.logout();
    this.busy.set(false);
    if (!this.store.logoutRedirectPending()) await this.router.navigateByUrl('/sign-in');
  }

  /** After the offer's email is accepted, drop offer=1 from the address so a reload or Back does not send again. */
  protected offerSent(): void {
    if (this.offer) this.location.replaceState('/account/merge');
  }

  protected choose(accountId: string): void {
    this.keep.set(accountId);
  }

  /** The verified email of this session, from the profile; empty when it cannot be read. */
  private async signedInEmail(): Promise<string> {
    try {
      const profile = await this.store.loadProfile();
      return profile.email ?? accountSignInMethods(profile).find((method) => method.email)?.email ?? '';
    } catch {
      return '';
    }
  }
}
