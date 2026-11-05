import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TestSessions } from '../test-session/test-sessions';
import { StudyPlanAccount, type StudyAccount } from '../../pages/study-plan/study-plan-account';

/**
 * DLV-969 (owner, 2026-11-05): staff give the owner their GitHub account so the owner can add them to the private
 * repositories and workflows they work on. Saved with the other profile links (`/account/links`); only the owner sees
 * it in People and access. Learners, the owner and test accounts are never asked.
 */

/** GitHub's username rule: 1 to 39 letters, digits or single hyphens, never starting or ending with a hyphen. */
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export type GithubInput = { url: string } | { error: string };

/**
 * Accepts `https://github.com/<login>`, `github.com/<login>`, `@login` or `login` (a trailing slash is fine) and
 * returns `https://github.com/<login>`, or the reason it cannot.
 */
export function normalizeGithub(value: string): GithubInput {
  let text = value.trim();
  if (!text) return { error: 'Enter your GitHub username or the address of your GitHub profile.' };
  text = text.replace(/^https?:\/\//i, '').replace(/^(www\.)?github\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '');
  if (!GITHUB_LOGIN.test(text)) {
    return { error: 'That isn’t a GitHub username. Use letters, digits and single hyphens, up to 39 characters, for example octocat.' };
  }
  return { url: 'https://github.com/' + text };
}

/** "github.com/octocat" for display, or null when the value is not a GitHub profile address. */
export function githubDisplay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^https:\/\/(?:www\.)?github\.com\/([^/?#]+)\/?$/i.exec(value.trim());
  return match && GITHUB_LOGIN.test(match[1]) ? 'github.com/' + match[1] : null;
}

/** Staff who are asked: they can read the staff documentation, and they are not the owner. */
export function asksForGithub(account: StudyAccount | null): boolean {
  const permissions = account?.permissions;
  return !!permissions && permissions.previewDocuments === true && permissions.manageAccess !== true;
}

const DISMISSED = 'lookahead.github.notNow.';
const SHOWN = 'lookahead.github.prompted';

/** "Not now" in this browser for this account. Storage can be blocked; then the card simply shows again. */
export function githubDismissed(accountId: string): boolean {
  try {
    return globalThis.localStorage?.getItem(DISMISSED + accountId) === '1';
  } catch {
    return false;
  }
}

export function dismissGithub(accountId: string): void {
  try {
    globalThis.localStorage?.setItem(DISMISSED + accountId, '1');
  } catch {
    // Blocked storage: the card shows again next time, nothing else depends on it.
  }
}

/** Pages the prompt never interrupts: the Welcome page itself, sign-in and the account pages. */
export function promptSkips(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return path === '/welcome' || path === '/sign-in' || path.startsWith('/sign-in/') || path === '/account' || path.startsWith('/account/');
}

/**
 * Sends a staff member without a GitHub account on file to `/welcome?setup=github&next=<page>` once per browser session.
 * Started from the app shell; does nothing for anyone else, and nothing after Save or Not now.
 */
@Injectable({ providedIn: 'root' })
export class GithubPrompt {
  private readonly accounts = inject(StudyPlanAccount);
  private readonly tests = inject(TestSessions);
  private readonly router = inject(Router);
  /** The account this browser session already checked, so a check runs at most once per account. */
  private checked: string | null = null;
  readonly redirected = signal(false);

  start(): void {
    effect(() => {
      const account = this.accounts.account();
      if (!this.accounts.sessionKnown() || this.accounts.sessionExpired() || !account || this.checked === account.accountId) return;
      this.checked = account.accountId;
      void this.check(account);
    });
  }

  async check(account: StudyAccount): Promise<boolean> {
    if (!asksForGithub(account) || githubDismissed(account.accountId) || this.alreadyPrompted()) return false;
    if (this.tests.status() === null) await this.tests.refresh();
    if (this.tests.active()) return false;
    let github: string | null | undefined;
    try {
      github = (await this.accounts.loadProfile()).links?.github;
    } catch {
      return false; // the profile is unavailable: never block the page over this
    }
    const url = this.router.url;
    if (github || this.accounts.account()?.accountId !== account.accountId || promptSkips(url)) return false;
    this.markPrompted();
    this.redirected.set(true);
    await this.router.navigate(['/welcome'], { queryParams: { setup: 'github', next: url } });
    return true;
  }

  private alreadyPrompted(): boolean {
    try {
      return globalThis.sessionStorage?.getItem(SHOWN) === '1';
    } catch {
      return true; // blocked storage: do not risk sending the person to Welcome on every page load
    }
  }

  private markPrompted(): void {
    try {
      globalThis.sessionStorage?.setItem(SHOWN, '1');
    } catch {
      // see alreadyPrompted
    }
  }
}
