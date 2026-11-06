import { Injectable, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
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

/**
 * Both marks live in session storage and are cleared when the browser sees the person signed out, so every sign-in
 * asks again until a GitHub account is on file (owner, 2026-11-05). Storage can be blocked; then the dialog simply
 * shows again.
 */
export function githubDismissed(accountId: string): boolean {
  try {
    return globalThis.sessionStorage?.getItem(DISMISSED + accountId) === '1';
  } catch {
    return false;
  }
}

export function dismissGithub(accountId: string): void {
  try {
    globalThis.sessionStorage?.setItem(DISMISSED + accountId, '1');
  } catch {
    // Blocked storage: the dialog shows again next time, nothing else depends on it.
  }
}

/** Pages the dialog never interrupts: sign-in, the Welcome page and the account pages (the field is there anyway). */
export function promptSkips(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return path === '/welcome' || path === '/sign-in' || path.startsWith('/sign-in/') || path === '/account' || path.startsWith('/account/');
}

/**
 * Opens the GitHub dialog for a staff member without a GitHub account on file, once per sign-in, on whatever page they
 * are on (owner, 2026-11-06: a dialog, not a card on the Welcome page, so it is seen after every sign-in). Started from
 * the app shell; does nothing for anyone else, and nothing after Save or Not now until the next sign-in.
 */
@Injectable({ providedIn: 'root' })
export class GithubPrompt {
  private readonly accounts = inject(StudyPlanAccount);
  private readonly tests = inject(TestSessions);
  private readonly router = inject(Router);
  /** The account this app instance already checked, so a check runs at most once per account. */
  private checked: string | null = null;
  /** An eligible account that was on a page the dialog skips; it opens on the next page that is not skipped. */
  private waiting: string | null = null;
  /** The account the dialog is open for, or null. */
  readonly open = signal<string | null>(null);

  start(): void {
    effect(() => {
      const account = this.accounts.account();
      if (!this.accounts.sessionKnown() || this.accounts.sessionExpired()) return;
      if (!account) {
        this.forget();
        return;
      }
      if (this.checked === account.accountId) return;
      this.checked = account.accountId;
      void this.check(account);
    });
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd && this.waiting && !promptSkips(event.urlAfterRedirects)) this.show(this.waiting);
    });
  }

  /** True when the dialog opened (or will open on the next page that allows it). */
  async check(account: StudyAccount): Promise<boolean> {
    if (!asksForGithub(account) || githubDismissed(account.accountId) || this.alreadyPrompted(account.accountId)) return false;
    if (this.tests.status() === null) await this.tests.refresh();
    if (this.tests.active()) return false;
    let github: string | null | undefined;
    try {
      github = (await this.accounts.loadProfile()).links?.github;
    } catch {
      return false; // the profile is unavailable: never block the page over this
    }
    if (github || this.accounts.account()?.accountId !== account.accountId) return false;
    if (promptSkips(this.router.url)) {
      this.waiting = account.accountId;
      return true;
    }
    this.show(account.accountId);
    return true;
  }

  /** Save or Not now closed the dialog; Not now is remembered for this sign-in. */
  close(outcome: 'saved' | 'later'): void {
    const accountId = this.open();
    if (accountId && outcome === 'later') dismissGithub(accountId);
    this.open.set(null);
  }

  private show(accountId: string): void {
    this.waiting = null;
    this.markPrompted(accountId);
    this.open.set(accountId);
  }

  private alreadyPrompted(accountId: string): boolean {
    try {
      return globalThis.sessionStorage?.getItem(SHOWN) === accountId;
    } catch {
      return true; // blocked storage: do not risk opening the dialog on every page load
    }
  }

  private markPrompted(accountId: string): void {
    try {
      globalThis.sessionStorage?.setItem(SHOWN, accountId);
    } catch {
      // see alreadyPrompted
    }
  }

  /** Signed out: the next sign-in asks again. */
  private forget(): void {
    const previous = this.checked;
    this.checked = null;
    this.waiting = null;
    this.open.set(null);
    try {
      globalThis.sessionStorage?.removeItem(SHOWN);
      if (previous) globalThis.sessionStorage?.removeItem(DISMISSED + previous);
    } catch {
      // Blocked storage holds nothing to clear.
    }
  }
}
