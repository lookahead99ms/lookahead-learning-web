import { inject, Injectable } from '@angular/core';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  ActiveSignIn,
  ActiveSignInInventory,
  ActiveSignInsClient,
  SignInManagementError,
} from './active-sign-ins-client';
import { SignInChallenge, SignInChallengeClient } from './sign-in-challenge-client';

function entry(value: any): ActiveSignIn {
  if (
    !value ||
    typeof value.signInId !== 'string' ||
    !value.signInId ||
    typeof value.current !== 'boolean' ||
    !(value.label === null || typeof value.label === 'string') ||
    typeof value.clientDescription !== 'string' ||
    !value.clientDescription ||
    !validDate(value.createdAt) ||
    !validDate(value.lastActiveAt)
  )
    throw new SignInManagementError('unconfirmed');
  return {
    id: value.signInId,
    current: value.current,
    label: value.label,
    clientDescription: value.clientDescription,
    createdAt: value.createdAt,
    lastActiveAt: value.lastActiveAt,
  };
}
function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
function inventory(value: any): ActiveSignInInventory {
  if (value?.limit !== 2 || !Array.isArray(value.entries) || value.entries.length > 2)
    throw new SignInManagementError('unconfirmed');
  const signIns = value.entries.map(entry);
  if (new Set(signIns.map((signIn: ActiveSignIn) => signIn.id)).size !== signIns.length)
    throw new SignInManagementError('unconfirmed');
  return { limit: value.limit, signIns, labelsEditable: true };
}

@Injectable({ providedIn: 'root' })
export class SignInManagementApi implements ActiveSignInsClient, SignInChallengeClient {
  private readonly transport = inject(ACCOUNT_FETCH);
  private readonly accounts = inject(StudyPlanAccount);

  async load(): Promise<ActiveSignInInventory> {
    const owner = this.owner();
    const result = inventory(await this.request('/account/sign-ins'));
    this.verifyOwner(owner);
    return result;
  }

  async rename(id: string, label: string): Promise<ActiveSignInInventory> {
    const owner = this.owner();
    // Identity only edits the caller's current sign-in; no target ID is submitted.
    const result = entry(await this.post('/account/sign-ins/label', { label }));
    this.verifyOwner(owner);
    if (!result.current || result.id !== id) throw new SignInManagementError('unconfirmed');
    return this.afterMutation();
  }

  async revoke(id: string): Promise<{ signedOut: boolean; inventory?: ActiveSignInInventory }> {
    const owner = this.owner();
    const result = await this.post('/account/sign-ins/revoke', { signInId: id });
    this.verifyOwner(owner);
    if (result?.reauthenticationRequired === true) {
      this.accounts.clearAfterSignOut(owner);
      return { signedOut: true };
    }
    if (result?.reauthenticationRequired !== false) throw new SignInManagementError('unconfirmed');
    return { signedOut: false, inventory: await this.afterMutation() };
  }

  async revokeOthers(): Promise<ActiveSignInInventory> {
    const owner = this.owner();
    const result = await this.post('/account/sign-ins/revoke-others', {});
    this.verifyOwner(owner);
    if (result?.reauthenticationRequired !== false) throw new SignInManagementError('unconfirmed');
    return this.afterMutation();
  }

  async reauthenticate(password: string): Promise<void> {
    const owner = this.owner();
    const username = this.accounts.account()!.username;
    const csrf = await this.csrf();
    let result;
    try {
      result = await this.request('/auth/login', {
        method: 'POST',
        headers: { [csrf.headerName]: csrf.token },
        body: new URLSearchParams({ username, password }),
      });
    } catch (error) {
      if (error instanceof SignInManagementError && error.kind === 'expired')
        throw new SignInManagementError('reauthentication-rejected');
      throw error;
    }
    this.verifyOwner(owner);
    if (result?.accountId !== owner) throw new SignInManagementError('unconfirmed');
    await this.csrf();
  }

  async loadChallenge(): Promise<SignInChallenge> {
    const result = await this.request('/auth/sign-in-challenge');
    const list = inventory(result);
    if (!validDate(result?.expiresAt)) throw new SignInManagementError('unconfirmed');
    return { limit: list.limit, signIns: list.signIns, expiresAt: result.expiresAt };
  }

  async replace(signInId: string): Promise<{ oauth: boolean }> {
    const result = await this.post('/auth/sign-in-challenge/replace', { signInId });
    if (typeof result?.accountId !== 'string' || !result.accountId)
      throw new SignInManagementError('unconfirmed');
    await this.csrf();
    await this.accounts.loadAuthOptions();
    if (this.accounts.authOptions()?.oauth !== true) throw new SignInManagementError('unconfirmed');
    // Only the ensuing BFF OAuth exchange may populate the protected learner account.
    return { oauth: true };
  }

  async cancelChallenge(): Promise<void> {
    const result = await this.post('/auth/sign-in-challenge/cancel', {});
    if (result?.cancelled !== true) throw new SignInManagementError('unconfirmed');
  }

  private async afterMutation(): Promise<ActiveSignInInventory> {
    try {
      return await this.load();
    } catch {
      throw new SignInManagementError('unconfirmed');
    }
  }
  private owner(): string {
    const account = this.accounts.account();
    if (!this.accounts.enabled || !account || this.accounts.sessionExpired())
      throw new SignInManagementError('expired');
    return account.accountId;
  }
  private verifyOwner(owner: string): void {
    if (this.accounts.account()?.accountId !== owner || this.accounts.sessionExpired())
      throw new SignInManagementError('expired');
  }
  private async csrf(): Promise<{ token: string; headerName: string }> {
    const csrf = await this.request('/auth/csrf');
    if (typeof csrf?.token !== 'string' || !csrf.token || csrf.headerName !== 'X-CSRF-TOKEN')
      throw new SignInManagementError('unconfirmed');
    return csrf;
  }
  private async post(path: string, body: unknown): Promise<any> {
    const csrf = await this.csrf();
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token },
      body: JSON.stringify(body),
    });
  }
  private async request(path: string, options: RequestInit = {}): Promise<any> {
    if (!this.accounts.enabled) throw new SignInManagementError('unavailable');
    const response = await this.transport('/api/v1' + path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    let body: any;
    try {
      body = await response.json();
    } catch {
      throw new SignInManagementError('unconfirmed');
    }
    if (!response.ok) {
      const kind =
        body?.code === 'RECENT_AUTHENTICATION_REQUIRED'
          ? 'reauthentication-required'
          : body?.code === 'SIGN_IN_CHALLENGE_INVALID' || response.status === 401
            ? 'expired'
            : body?.code === 'INVALID_SIGN_IN_LABEL'
              ? 'invalid-label'
              : body?.code === 'INVALID_SIGN_IN_REQUEST'
                ? 'changed'
                : response.status === 429
                  ? 'rate-limited'
                  : response.status === 503
                    ? 'unavailable'
                    : 'unconfirmed';
      throw new SignInManagementError(kind);
    }
    return body?.data;
  }
}
