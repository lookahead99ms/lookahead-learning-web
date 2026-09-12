import { StudyLogEntry } from '../../content/study-plan-daily';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { StudyPlanRecoveryPreview } from '../../content/study-plan-recovery';
import { environment } from '../../../environments/environment';
import { StudyPlan } from '../../content/study-plan';

export interface SavedPlan {
  schemaVersion: 'study-plan-local/v1';
  revision: number;
  goal: string;
  rankingVersion: string | null;
  catalogVersion?: string | null;
  snapshot: StudyPlan;
  completedIds: string[];
  studyLog?: StudyLogEntry[];
  shiftedDays: number;
  recovery?: RecoveryMetadata;
  deferredSessions?: StudyPlanRecoveryPreview['deferred'];
  sessionOutcomes?: Record<string, 'attempted' | 'needs-review' | 'completed'>;
  reviewNotes?: Record<string, string>;
  attemptedContentIds?: string[];
  needsReviewContentIds?: string[];
  history: { revision: number; changedAt: string; reason: string }[];
  readyMade?: import('../../content/study-plan-ready-made').ReadyMadePins;
}
export interface StudyAccount {
  accountId: string;
  username: string;
  displayName: string;
  topicGrants: string[];
  contentGrants?: string[];
  authorPreview?: boolean;
}
export interface PlanProvenance {
  origin?: string;
  [key: string]: unknown;
  algorithmVersion: string | null;
  catalogVersion: string | null;
  rankingVersion: string | null;
  template?: import('../../content/study-plan-ready-made').ReadyMadePins;
}
export interface AccountRegistration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  countryCode: string;
}
export interface AccountPlan {
  planId: string;
  versionId: string;
  revision: number;
  goal: string;
  snapshot: StudyPlan;
  provenance: PlanProvenance;
  progress: {
    completedContentIds: string[];
    completedSessionIds: string[];
    attemptedContentIds: string[];
    needsReviewContentIds: string[];
    notes: Record<string, string>;
    sessionOutcomes: NonNullable<SavedPlan['sessionOutcomes']>;
    studyLog?: StudyLogEntry[];
    legacySource?: unknown;
  };
  recovery: RecoveryMetadata;
  createdAt: string;
  updatedAt: string;
}
export interface RecoveryMetadata {
  strategy: 'fixed-window' | 'explicit-extension' | 'none';
  elapsedDays: number;
  deadlineDays: number;
  deferredContentIds: string[];
  deferredSessions?: StudyPlanRecoveryPreview['deferred'];
}
export type PlanActivity =
  | {
      type: 'recordAttempt';
      assignmentId: string;
      canonicalContentId: string;
      outcome: 'attempted' | 'needs-review';
    }
  | { type: 'setSessionCompletion'; assignmentId: string; completed: boolean }
  | { type: 'setContentCompletion'; canonicalContentId: string; completed: boolean }
  | { type: 'setNote'; canonicalContentId: string; text: string };
export interface PlanSummary {
  card?: {
    schemaVersion: 'plan-card/v1';
    metadataStatus: 'available' | 'unavailable';
    selectedTopicIds: string[] | null;
    durationDays: number | null;
    configuredDailyMinutes: number | null;
    completedSessionCount: number | null;
    totalSessionCount: number | null;
    nextScheduledActivity: {
      assignmentId: string;
      sourceContentId: string;
      title: string;
      kind: string;
      minutes: number;
      route: string[];
      studyDay: number;
    } | null;
    lifecycleState: null;
    reservation: null;
  };
  planId: string;
  goal: string;
  revision: number;
  updatedAt: string;
}
interface CatalogPins {
  variationPolicies?: string[];
  studyActivityPolicies?: string[];
  catalogVersion: string;
  algorithmVersions: string[];
  rankingVersions: string[];
  topicIds: string[];
  readyMadePlanPolicies?: string[];
}
export const ACCOUNT_FETCH = new InjectionToken<typeof fetch>('Account API transport', {
  providedIn: 'root',
  factory:
    () =>
    (...args) =>
      fetch(...args),
});
class AccountApiError extends Error {
  constructor(readonly status: number) {
    super(`Account request failed (${status})`);
  }
}

/** Account state stays in memory; anonymous browser storage is never repurposed. */
@Injectable({ providedIn: 'root' })
export class StudyPlanAccount {
  readonly enabled = environment.accountPlansEnabled;
  private readonly transport = inject(ACCOUNT_FETCH);
  readonly account = signal<StudyAccount | null>(null);
  readonly plans = signal<PlanSummary[]>([]);
  readonly active = signal<AccountPlan | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly errorStatus = signal<number | null>(null);
  readonly sessionExpired = signal(false);
  readonly pending = signal(false);
  readonly catalog = signal<CatalogPins | null>(null);
  readonly authOptions = signal<{ registration: boolean; google: boolean; oauth?: boolean } | null>(
    null,
  );
  private csrf: { token: string; headerName: string } | null = null;
  private mutation: { path: string; body: unknown; key: string; owner: string } | null = null;
  private initialization: Promise<void> | null = null;

  async loadAuthOptions(): Promise<void> {
    if (!this.enabled) return;
    try {
      this.authOptions.set(await this.request('/auth/options', {}, true));
    } catch {
      this.authOptions.set(null);
    }
  }

  async register(details: AccountRegistration): Promise<boolean> {
    if (!this.enabled || this.busy() || this.pending()) return false;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.refreshCsrf(true);
      const account = await this.request<StudyAccount>(
        '/auth/register',
        {
          method: 'POST',
          headers: { ...this.csrfHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(details),
        },
        true,
      );
      this.active.set(null);
      this.plans.set([]);
      this.catalog.set(null);
      this.account.set(this.authOptions()?.oauth ? null : account);
      this.sessionExpired.set(false);
      if (this.authOptions()?.oauth) return true;
      try {
        await this.refreshCsrf();
        await this.loadAccount();
      } catch (error) {
        this.showError(error);
      }
      return true;
    } catch (error) {
      const status = error instanceof AccountApiError ? error.status : 0;
      this.error.set(
        status === 409
          ? 'We could not create an account with those details. If you already have an account, sign in.'
          : status === 422 || status === 400
            ? 'Check your name, email, matching passwords, and country selection.'
            : status === 429
              ? 'Too many attempts. Please wait a few minutes before trying again.'
              : 'Registration could not be confirmed. Try signing in with your details before creating another account.',
      );
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  initialize(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.initialization ??= this.restoreSession();
    return this.initialization;
  }
  private async restoreSession(): Promise<void> {
    this.busy.set(true);
    try {
      await this.loadAuthOptions();
      this.account.set(await this.request<StudyAccount>('/auth/me'));
      await this.loadAccount();
    } catch (error) {
      // Only the initial identity check may mean signed out. A later catalog or
      // plan-list failure must not masquerade as an account with no saved plans.
      if (this.account() || !(error instanceof AccountApiError && error.status === 401))
        this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }
  async login(username: string, password: string): Promise<boolean> {
    if (!this.enabled || this.busy() || this.pending()) return false;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.refreshCsrf(true);
      const account = await this.request<StudyAccount>(
        '/auth/login',
        {
          method: 'POST',
          body: new URLSearchParams({ username, password }),
          headers: this.csrfHeaders(),
        },
        true,
      );
      this.active.set(null);
      this.plans.set([]);
      this.catalog.set(null);
      this.account.set(this.authOptions()?.oauth ? null : account);
      this.sessionExpired.set(false);
      if (this.authOptions()?.oauth) return true;
      try {
        await this.refreshCsrf();
        await this.loadAccount();
      } catch (error) {
        this.showError(error);
      }
      return true;
    } catch (error) {
      this.showError(error, true);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  async logout(): Promise<boolean> {
    if (this.busy() || this.pending()) return false;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.refreshCsrf();
      const result = await this.request<{ logoutUrl?: string } | undefined>('/auth/logout', {
        method: 'POST',
        headers: this.csrfHeaders(),
      });
      this.clearAccount();
      if (this.authOptions()?.oauth && result?.logoutUrl) {
        const target = new URL(result.logoutUrl);
        if (target.origin !== window.location.origin || target.pathname !== '/connect/logout')
          throw new Error('Invalid logout destination');
        window.location.assign(target.href);
      }
      return true;
    } catch (error) {
      if (error instanceof AccountApiError && error.status === 401) {
        this.clearAccount();
        return true;
      }
      this.showError(error);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  private clearAccount(): void {
    this.account.set(null);
    this.active.set(null);
    this.plans.set([]);
    this.catalog.set(null);
    this.csrf = null;
    this.sessionExpired.set(false);
  }
  private async loadAccount(): Promise<void> {
    this.catalog.set(await this.request<CatalogPins>('/account-catalog'));
    await this.refreshPlans();
  }
  private async refreshPlans(): Promise<void> {
    // Follow server pagination: no account plan silently disappears after the first page.
    const plans: PlanSummary[] = [];
    let cursor: string | null = null;
    do {
      const result: { plans: PlanSummary[]; nextCursor: string | null } = await this.request(
        '/plans?limit=100' + (cursor ? '&after=' + encodeURIComponent(cursor) : ''),
      );
      plans.push(...result.plans);
      cursor = result.nextCursor;
    } while (cursor);
    this.plans.set(plans);
  }
  async open(planId: string): Promise<AccountPlan | null> {
    if (this.busy() || this.pending()) return null;
    this.busy.set(true);
    this.error.set('');
    try {
      const plan = await this.request<AccountPlan>('/plans/' + encodeURIComponent(planId));
      this.active.set(plan);
      return plan;
    } catch (error) {
      this.showError(error);
      return null;
    } finally {
      this.busy.set(false);
    }
  }
  newPlan(): void {
    if (!this.busy() && !this.pending()) this.active.set(null);
  }
  importLocal(saved: SavedPlan): Promise<AccountPlan | null> {
    return this.mutate('/plans/imports', {
      sourceSchemaVersion: saved.schemaVersion,
      localSnapshot: saved,
      provenance: this.provenance(saved),
    });
  }
  save(
    saved: SavedPlan,
    reason: 'update-plan' | 'recovery' | 'extend-deadline' = 'update-plan',
    recovery?: RecoveryMetadata,
  ): Promise<AccountPlan | null> {
    const active = this.active();
    const body = {
      goal: saved.goal,
      snapshot: saved.snapshot,
      provenance: active && reason !== 'update-plan' ? active.provenance : this.provenance(saved),
    };
    return active
      ? this.mutate(`/plans/${active.planId}/versions`, {
          ...body,
          expectedRevision: active.revision,
          reason,
          recovery: recovery ?? {
            strategy: 'none',
            elapsedDays: active.recovery?.elapsedDays ?? 0,
            deadlineDays: saved.snapshot.config.days,
            deferredContentIds: [],
          },
        })
      : this.mutate('/plans', body);
  }
  activity(operations: PlanActivity[], studyDay?: number): Promise<AccountPlan | null> {
    const active = this.active();
    if (!active) return Promise.resolve(null);
    return this.mutate(`/plans/${active.planId}/activity`, {
      expectedRevision: active.revision,
      versionId: active.versionId,
      operations,
      ...(studyDay !== undefined &&
      this.catalog()?.studyActivityPolicies?.includes('completion-day-v1')
        ? { studyDay }
        : {}),
    });
  }
  provenance(saved: SavedPlan): PlanProvenance {
    return {
      algorithmVersion: saved.snapshot.schedulingVersion ?? null,
      catalogVersion: saved.catalogVersion ?? null,
      rankingVersion: saved.rankingVersion ?? null,
      ...(saved.readyMade
        ? { origin: 'ready-made-template' as const, template: saved.readyMade }
        : { origin: 'generated' as const }),
    };
  }
  private async mutate(path: string, body: unknown): Promise<AccountPlan | null> {
    const owner = this.account()?.accountId;
    if (!owner || this.busy() || this.pending()) return null;
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 8 * 1024 * 1024) {
      this.error.set(
        'This plan is too large to save in one request. Choose a smaller focus or window; your existing saved plan is unchanged.',
      );
      return null;
    }
    this.mutation = { path, body: structuredClone(body), key: crypto.randomUUID(), owner };
    this.pending.set(true);
    return this.retry();
  }
  async retry(): Promise<AccountPlan | null> {
    const mutation = this.mutation;
    if (!mutation || this.busy() || mutation.owner !== this.account()?.accountId) return null;
    this.busy.set(true);
    this.error.set('');
    this.errorStatus.set(null);
    try {
      await this.refreshCsrf();
      const result = await this.request<AccountPlan>(mutation.path, {
        method: 'POST',
        headers: {
          ...this.csrfHeaders(),
          'Content-Type': 'application/json',
          'Idempotency-Key': mutation.key,
        },
        body: JSON.stringify(mutation.body),
      });
      this.active.set(result);
      this.mutation = null;
      this.pending.set(false);
      // A list refresh failure must not turn an acknowledged save into an uncertain mutation.
      this.plans.update((plans) => [
        {
          planId: result.planId,
          goal: result.goal,
          revision: result.revision,
          updatedAt: result.updatedAt,
        },
        ...plans.filter((p) => p.planId !== result.planId),
      ]);
      return result;
    } catch (error) {
      this.showError(error);
      return null;
    } finally {
      this.busy.set(false);
    }
  }
  discardPending(): void {
    if (this.busy()) return;
    this.mutation = null;
    this.pending.set(false);
    this.error.set('');
    this.errorStatus.set(null);
  }
  private async refreshCsrf(identity = false): Promise<void> {
    this.csrf = await this.request('/auth/csrf', {}, identity);
  }
  private csrfHeaders(): Record<string, string> {
    return this.csrf ? { [this.csrf.headerName]: this.csrf.token } : {};
  }
  apiPath(path: string): string {
    return (this.authOptions()?.oauth ? '/bff/api/v1' : '/api/v1') + path;
  }
  private async request<T>(path: string, options: RequestInit = {}, identity = false): Promise<T> {
    const response = await this.transport(identity ? '/api/v1' + path : this.apiPath(path), {
      ...options,
      headers: {
        ...options.headers,
        ...(path.startsWith('/plans') && this.account()
          ? { 'X-LookAhead-Account': this.account()!.accountId }
          : {}),
      },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new AccountApiError(response.status);
    return response.status === 204 ? (undefined as T) : (await response.json()).data;
  }
  private showError(error: unknown, login = false): void {
    const status = error instanceof AccountApiError ? error.status : 0;
    this.errorStatus.set(status);
    if (status === 401 && !login) this.sessionExpired.set(true);
    this.error.set(
      status === 401
        ? login
          ? 'Sign-in failed. Check your account credentials.'
          : 'Your session expired. Discard the pending request and sign in again to reload saved work.'
        : status === 409
          ? 'This plan changed elsewhere. Reload the saved version before making another change.'
          : status === 403
            ? 'This change is not permitted with your current account access.'
            : status === 413
              ? 'This plan exceeds the account service request limit. Your existing saved plan is unchanged.'
              : status === 400 || status === 422
                ? 'The server could not accept this plan. Your previously saved plan is unchanged.'
                : 'The account service could not confirm this request. Retry safely, or reload the saved version. Your browser plan is preserved.',
    );
  }
}

export function savedAccountPlan(plan: AccountPlan): SavedPlan {
  return {
    schemaVersion: 'study-plan-local/v1',
    revision: plan.revision,
    goal: plan.goal,
    rankingVersion: plan.provenance.rankingVersion,
    catalogVersion: plan.provenance.catalogVersion,
    snapshot: plan.snapshot,
    recovery: plan.recovery,
    deferredSessions: plan.recovery?.deferredSessions,
    completedIds: [
      ...new Set([...plan.progress.completedContentIds, ...plan.progress.completedSessionIds]),
    ],
    shiftedDays: Math.max(
      0,
      (plan.recovery?.deadlineDays ?? plan.snapshot.config.days) - plan.snapshot.config.days,
    ),
    sessionOutcomes: plan.progress.sessionOutcomes,
    studyLog: plan.progress.studyLog,
    reviewNotes: plan.progress.notes,
    attemptedContentIds: plan.progress.attemptedContentIds,
    needsReviewContentIds: plan.progress.needsReviewContentIds,
    history: [
      {
        revision: plan.revision,
        changedAt: plan.updatedAt,
        reason: 'Loaded account plan; prior snapshots are retained by the account service',
      },
    ],
    ...(plan.provenance.template ? { readyMade: plan.provenance.template } : {}),
  };
}
