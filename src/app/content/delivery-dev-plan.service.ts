import { inject, Injectable } from '@angular/core';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../pages/study-plan/study-plan-account';
import { DeliveryPlan, DeliveryWorkItem } from './delivery-plan.models';
import { DeliveryWorkItemInput } from './delivery-editor.service';

/** The Domain's answer to a write: the plan's new version and the ticket as stored. */
export interface DeliveryPlanWrite {
  version: number;
  item: DeliveryWorkItem;
}

/**
 * DLV-971 inbox sync: what the Domain did with an uploaded or already-stored inbox file. `synced` false leaves the plan
 * as it was and `reason` says why (for example "no inbox file"); `counts` is filled when a merge ran.
 */
export interface DeliveryInboxSync {
  synced: boolean;
  version: number;
  reason: string | null;
  counts: {
    added: number;
    takenLocal: number;
    keptDev: number;
    conflicts: number;
    unchanged: number;
    deletedOnDev: number;
  } | null;
}

/** A failed call; `code` is the Domain's error code when the body carried one (DELIVERY_PLAN_MISSING, VERSION_CONFLICT). */
export class DeliveryPlanApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message?: string,
  ) {
    super(message ?? code ?? `delivery plan request failed (${status})`);
  }
  get planMissing(): boolean {
    return this.status === 404 && this.code === 'DELIVERY_PLAN_MISSING';
  }
  get versionConflict(): boolean {
    return this.status === 409;
  }
}

/**
 * DLV-971 runtime stores (owner, 2026-11-06): on DEV the Domain serves and edits the delivery plan from the assets
 * bucket (`delivery/plan.json`). Same session and CSRF handling as the platform reviews: the Gateway session cookie, the
 * `/auth/csrf` token on writes and an Idempotency-Key per write. Every write carries the plan version the page last saw;
 * a 409 VERSION_CONFLICT means the plan changed since, so the page reloads and the user applies the change again.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryDevPlanService {
  private readonly transport = inject(ACCOUNT_FETCH);
  private readonly accounts = inject(StudyPlanAccount);

  load(): Promise<DeliveryPlan> {
    return this.json('/delivery/plan');
  }

  create(expectedVersion: number, item: DeliveryWorkItemInput): Promise<DeliveryPlanWrite> {
    return this.write('/delivery/plan/work-items', { expectedVersion, item });
  }

  update(
    id: string,
    expectedVersion: number,
    item: DeliveryWorkItemInput,
  ): Promise<DeliveryPlanWrite> {
    return this.write(
      `/delivery/plan/work-items/${encodeURIComponent(id)}`,
      { expectedVersion, item },
      'PUT',
    );
  }

  resolveConflict(
    id: string,
    expectedVersion: number,
    keep: 'dev' | 'local',
  ): Promise<DeliveryPlanWrite> {
    return this.write(`/delivery/plan/work-items/${encodeURIComponent(id)}/resolve-conflict`, {
      expectedVersion,
      keep,
    });
  }

  /**
   * Sends the local delivery-plan.json as written (`PUT /delivery/plan/inbox`); the Domain stores it as the inbox and
   * merges it at once. 422 DELIVERY_INBOX_INVALID (not a plan), 422 DELIVERY_INBOX_BASE_UNKNOWN (its base version is
   * neither the DEV plan nor an archived one), 413 DELIVERY_PLAN_TOO_LARGE.
   */
  uploadInbox(fileText: string): Promise<DeliveryInboxSync> {
    return this.send('/delivery/plan/inbox', 'PUT', fileText);
  }

  /** Merges an inbox file already placed in `delivery/inbox/` on DEV (`synced: false, reason: "no inbox file"` when none). */
  syncInbox(): Promise<DeliveryInboxSync> {
    return this.send('/delivery/plan/inbox/sync', 'POST');
  }

  private write<T>(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
    return this.send(path, method, JSON.stringify(body));
  }

  /** Every write: the CSRF token and an Idempotency-Key; the body, when there is one, goes as JSON text verbatim. */
  private async send<T>(path: string, method: 'POST' | 'PUT', body?: string): Promise<T> {
    return this.json(path, {
      method,
      headers: {
        ...(await this.csrf()),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'Idempotency-Key': crypto.randomUUID(),
      },
      ...(body === undefined ? {} : { body }),
    });
  }

  private async csrf(): Promise<Record<string, string>> {
    const response = await this.request(this.accounts.apiPath('/auth/csrf'));
    const data = (await response.json())?.data;
    if (typeof data?.token !== 'string' || typeof data?.headerName !== 'string')
      throw new DeliveryPlanApiError(0, null, 'The CSRF token could not be read.');
    return { [data.headerName]: data.token };
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(this.accounts.apiPath(path), init);
    try {
      return (await response.json()).data as T;
    } catch {
      throw new DeliveryPlanApiError(
        response.status,
        null,
        'The delivery plan answer could not be read.',
      );
    }
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.accounts.account() || this.accounts.sessionExpired())
      throw new DeliveryPlanApiError(401, null);
    let response: Response;
    try {
      response = await this.transport(url, {
        ...init,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new DeliveryPlanApiError(0, null, 'The delivery plan service could not be reached.');
    }
    if (response.ok) return response;
    let code: string | null = null;
    let message: string | undefined;
    try {
      const body = await response.json();
      const error = body?.error && typeof body.error === 'object' ? body.error : body;
      if (typeof error?.code === 'string') code = error.code;
      else if (typeof body?.error === 'string') code = body.error;
      if (typeof error?.message === 'string') message = error.message;
    } catch {
      // A status-only failure keeps the generic message.
    }
    throw new DeliveryPlanApiError(response.status, code, message);
  }
}
