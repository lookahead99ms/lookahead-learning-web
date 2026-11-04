import { inject, Injectable } from '@angular/core';
import { ACCOUNT_FETCH } from '../study-plan/study-plan-account';
import { AccountSignInMethod, readSignInMethods } from './account-settings-client';

/**
 * DLV-969 S36.8: merging accounts that share one verified email (contract s36-merge-flow-contract.md).
 * The Gateway passes these routes through to the Domain under the existing account routes.
 */
export interface MergeStudyPlan {
  id: string;
  title: string;
  /** 0 to 100. */
  progressPercent: number;
}

export interface MergeCandidate {
  accountId: string;
  displayName: string;
  signInMethods: AccountSignInMethod[];
  admitted: boolean;
  createdAt: string;
  /** Null when the account has never signed in. */
  lastSignInAt: string | null;
  studyPlans: MergeStudyPlan[];
  /** The account has a paid membership; the merge ends it for an account that is not kept (nothing is refunded). */
  paidMembership: boolean;
}

export interface MergeDetails {
  email: string;
  expiresAt: string;
  candidates: MergeCandidate[];
}

/** The request always answers 202, so "sent" never says whether an email went out. */
export type MergeRequestResult = { kind: 'sent' } | { kind: 'signed-out' } | { kind: 'unavailable' };

export type MergeLoadResult =
  | { kind: 'ready'; merge: MergeDetails }
  /** 404 MERGE_TOKEN_INVALID: unknown, used, expired, or this session is not a candidate. */
  | { kind: 'invalid' }
  /** 409 MERGE_CONFLICT: an account in the group is disabled, or fewer than two remain. */
  | { kind: 'conflict' }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' };

export type MergeResult =
  | { kind: 'merged'; keptAccountId: string }
  | { kind: 'invalid' }
  /** 409 MERGE_CONFLICT: a candidate changed since the page loaded, is disabled, or fewer than two remain. */
  | { kind: 'conflict' }
  /** 422: the chosen account is not one of the candidates. */
  | { kind: 'not-candidate' }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' };

/** The Domain's token: 43 URL-safe characters. Anything else is never sent. */
export function isMergeToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** "priya@gmail.com" → "p•••a@gmail.com": first and last letter of the name, the domain in full. */
export function maskMergeEmail(email: string): string {
  const value = email.trim();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return '';
  const name = Array.from(value.slice(0, at));
  return name[0] + '•••' + (name.length > 1 ? name[name.length - 1] : '') + value.slice(at);
}

type Answer = { status: number; code: string; data: any } | null;

@Injectable({ providedIn: 'root' })
export class AccountMergeClient {
  private readonly transport = inject(ACCOUNT_FETCH);

  async requestMergeEmail(): Promise<MergeRequestResult> {
    const answer = await this.send('/account/merge/request', { method: 'POST', body: {} });
    if (!answer) return { kind: 'unavailable' };
    // The Domain answers 202 even when nothing was sent; a rate limit reads the same on screen.
    if ((answer.status >= 200 && answer.status < 300) || answer.status === 429) return { kind: 'sent' };
    if (signedOut(answer)) return { kind: 'signed-out' };
    return { kind: 'unavailable' };
  }

  async loadMerge(token: string): Promise<MergeLoadResult> {
    if (!isMergeToken(token)) return { kind: 'invalid' };
    const answer = await this.send('/account/merge/' + encodeURIComponent(token));
    if (!answer) return { kind: 'unavailable' };
    if (answer.status === 200) {
      const merge = details(answer.data);
      return merge ? { kind: 'ready', merge } : { kind: 'unavailable' };
    }
    if (answer.status === 404) return { kind: 'invalid' };
    if (answer.status === 409) return { kind: 'conflict' };
    if (signedOut(answer)) return { kind: 'signed-out' };
    return { kind: 'unavailable' };
  }

  async merge(token: string, keepAccountId: string): Promise<MergeResult> {
    if (!isMergeToken(token)) return { kind: 'invalid' };
    const answer = await this.send('/account/merge/' + encodeURIComponent(token), {
      method: 'POST',
      body: { keepAccountId },
    });
    if (!answer) return { kind: 'unavailable' };
    if (answer.status === 200) {
      const kept = answer.data?.keptAccountId;
      return typeof kept === 'string' && kept ? { kind: 'merged', keptAccountId: kept } : { kind: 'unavailable' };
    }
    if (answer.status === 404) return { kind: 'invalid' };
    if (answer.status === 409) return { kind: 'conflict' };
    if (answer.status === 422) return { kind: 'not-candidate' };
    // 400 INVALID_MERGE_REQUEST (a body the Domain could not read) reads like a lost answer: try again.
    if (answer.status === 400) return { kind: 'unavailable' };
    if (signedOut(answer)) return { kind: 'signed-out' };
    return { kind: 'unavailable' };
  }

  /** One request; null when the network or the CSRF step failed. Never throws. */
  private async send(path: string, options: { method?: 'POST'; body?: unknown } = {}): Promise<Answer> {
    try {
      const headers: Record<string, string> = {};
      if (options.method === 'POST') {
        const csrf = await this.csrf();
        if (!csrf) return null;
        headers[csrf.headerName] = csrf.token;
        headers['Content-Type'] = 'application/json';
      }
      const response = await this.transport('/api/v1' + path, {
        ...(options.method ? { method: options.method, body: JSON.stringify(options.body) } : {}),
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      let payload: any = null;
      try {
        payload = response.status === 204 ? null : await response.json();
      } catch {
        payload = null;
      }
      return {
        status: response.status,
        code: typeof payload?.code === 'string' ? payload.code : '',
        data: payload?.data,
      };
    } catch {
      return null;
    }
  }

  private async csrf(): Promise<{ token: string; headerName: string } | null> {
    const response = await this.transport('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data = (await response.json())?.data;
    return typeof data?.token === 'string' &&
      data.token &&
      typeof data?.headerName === 'string' &&
      /^[A-Za-z0-9-]+$/.test(data.headerName)
      ? { token: data.token, headerName: data.headerName }
      : null;
  }
}

function signedOut(answer: NonNullable<Answer>): boolean {
  return answer.status === 401 || answer.code === 'CSRF_INVALID';
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value));
}

/** Keeps the answer only when every candidate is well formed; two or more are needed to merge. */
function details(data: any): MergeDetails | null {
  if (!data || typeof data.email !== 'string' || !Array.isArray(data.candidates)) return null;
  const candidates: MergeCandidate[] = [];
  for (const value of data.candidates as any[]) {
    const candidate = candidateOf(value);
    if (!candidate) return null;
    candidates.push(candidate);
  }
  if (candidates.length < 2 || new Set(candidates.map((c) => c.accountId)).size !== candidates.length) return null;
  return { email: data.email, expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '', candidates };
}

function candidateOf(value: any): MergeCandidate | null {
  if (
    !value ||
    typeof value.accountId !== 'string' ||
    !value.accountId ||
    typeof value.displayName !== 'string' ||
    typeof value.admitted !== 'boolean' ||
    !validDate(value.createdAt) ||
    !(value.lastSignInAt === null || value.lastSignInAt === undefined || validDate(value.lastSignInAt)) ||
    !Array.isArray(value.studyPlans)
  )
    return null;
  const studyPlans: MergeStudyPlan[] = [];
  for (const plan of value.studyPlans as any[]) {
    if (!plan || typeof plan.id !== 'string' || typeof plan.title !== 'string' || typeof plan.progressPercent !== 'number')
      return null;
    studyPlans.push({
      id: plan.id,
      title: plan.title,
      progressPercent: Math.round(Math.min(100, Math.max(0, plan.progressPercent))),
    });
  }
  return {
    accountId: value.accountId,
    displayName: value.displayName,
    signInMethods: readSignInMethods(value.signInMethods),
    admitted: value.admitted,
    createdAt: value.createdAt,
    lastSignInAt: value.lastSignInAt ?? null,
    studyPlans,
    // Optional in the answer; absent means none.
    paidMembership: value.paidMembership === true,
  };
}
