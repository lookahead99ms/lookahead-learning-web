import { Injectable, inject } from '@angular/core';
import { ACCOUNT_FETCH, StudyPlanAccount } from '../study-plan/study-plan-account';
import {
  AuthorReviewBinding,
  AuthorReviewClient,
  AuthorReviewDecision,
  AuthorReviewError,
  AuthorReviewHistory,
  AuthorReviewReceipt,
  AuthorReviewSubmission,
} from './author-review-client';

const root = '/bff/api/v1/author/review-artifacts';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const decisions: Record<AuthorReviewDecision, string> = {
  approve: 'APPROVE',
  decline: 'DECLINE',
  'need-more': 'NEED_MORE',
};
type Data = Record<string, unknown>;
function object(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthorReviewError('unconfirmed');
  return value as Data;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new AuthorReviewError('unconfirmed');
  return value;
}
function identifier(value: unknown): string {
  const result = text(value);
  if (!uuid.test(result)) throw new AuthorReviewError('unconfirmed');
  return result;
}
function matches(binding: AuthorReviewBinding, value: Data): boolean {
  return (
    value['artifactId'] === binding.artifactId &&
    value['artifactVersion'] === binding.artifactVersion &&
    value['contentHash'] === binding.sourceSha256 &&
    value['ticketId'] === binding.owningTicket
  );
}

@Injectable({ providedIn: 'root' })
export class AuthorReviewApi implements AuthorReviewClient {
  private readonly transport = inject(ACCOUNT_FETCH);
  private readonly accounts = inject(StudyPlanAccount);
  private owner(): string {
    if (!this.accounts.enabled || !this.accounts.account() || this.accounts.sessionExpired())
      throw new AuthorReviewError('unauthorized');
    if (this.accounts.account()?.authorPreview !== true) throw new AuthorReviewError('forbidden');
    return this.accounts.account()!.accountId;
  }
  private path(binding: AuthorReviewBinding): string {
    if (
      !/^[a-z][a-z0-9-]{0,99}$/.test(binding.artifactId) ||
      !binding.artifactVersion ||
      !binding.owningTicket ||
      !/^[a-f0-9]{64}$/.test(binding.sourceSha256)
    )
      throw new AuthorReviewError('version-changed');
    return `${root}/${binding.artifactId}/events`;
  }
  private parseEvent(value: unknown, artifactId: string, owner: string): AuthorReviewReceipt {
    const event = object(value);
    const decision = Object.entries(decisions).find(
      ([, wire]) => wire === event['decision'],
    )?.[0] as AuthorReviewDecision | undefined;
    if (
      event['artifactId'] !== artifactId ||
      event['actorId'] !== owner ||
      !decision ||
      typeof event['comment'] !== 'string' ||
      [...event['comment']].length > 2000 ||
      !/^[a-f0-9]{64}$/.test(text(event['contentHash'])) ||
      !Number.isFinite(Date.parse(text(event['recordedAt'])))
    )
      throw new AuthorReviewError('unconfirmed');
    return {
      recordId: identifier(event['eventId']),
      artifactId,
      artifactVersion: text(event['artifactVersion']),
      owningTicket: text(event['ticketId']),
      sourceSha256: text(event['contentHash']),
      decision,
      comment: event['comment'],
      idempotencyKey: identifier(event['idempotencyKey']),
      supersedesEventId:
        event['supersedesEventId'] === null ? null : identifier(event['supersedesEventId']),
      recordedAt: text(event['recordedAt']),
      recordedBy: 'Your account',
    };
  }
  async load(binding: AuthorReviewBinding, cursor?: string): Promise<AuthorReviewHistory> {
    const owner = this.owner(),
      path = this.path(binding);
    if (cursor !== undefined && !uuid.test(cursor)) throw new AuthorReviewError('invalid');
    const artifacts = await this.request(root, owner);
    if (!Array.isArray(artifacts)) throw new AuthorReviewError('unconfirmed');
    const matching = artifacts
      .map(object)
      .filter((value) => value['artifactId'] === binding.artifactId);
    if (matching.length !== 1 || !matches(binding, matching[0]))
      throw new AuthorReviewError('version-changed');
    const page = object(
      await this.request(`${path}?limit=50${cursor ? '&cursor=' + cursor : ''}`, owner),
    );
    if (!Array.isArray(page['entries']) || page['entries'].length > 50)
      throw new AuthorReviewError('unconfirmed');
    const entries = page['entries'].map((value) =>
      this.parseEvent(value, binding.artifactId, owner),
    );
    if (new Set(entries.map((entry) => entry.recordId)).size !== entries.length)
      throw new AuthorReviewError('unconfirmed');
    return {
      entries,
      nextCursor: page['nextCursor'] === null ? null : identifier(page['nextCursor']),
    };
  }
  async record(submission: AuthorReviewSubmission): Promise<AuthorReviewReceipt> {
    const owner = this.owner(),
      path = this.path(submission);
    if (
      !uuid.test(submission.idempotencyKey) ||
      (submission.supersedesEventId !== null && !uuid.test(submission.supersedesEventId)) ||
      !decisions[submission.decision] ||
      [...submission.comment].length > 2000 ||
      (submission.decision !== 'approve' && !submission.comment.trim())
    )
      throw new AuthorReviewError('invalid');
    const csrf = object(await this.request('/bff/api/v1/auth/csrf', owner));
    if (
      csrf['headerName'] !== 'X-CSRF-TOKEN' ||
      typeof csrf['token'] !== 'string' ||
      !csrf['token']
    )
      throw new AuthorReviewError('unconfirmed');
    const result = object(
      await this.request(path, owner, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf['token'],
          'Idempotency-Key': submission.idempotencyKey,
        },
        body: JSON.stringify({
          artifactVersion: submission.artifactVersion,
          contentHash: submission.sourceSha256,
          ticketId: submission.owningTicket,
          decision: decisions[submission.decision],
          comment: submission.comment,
          supersedesEventId: submission.supersedesEventId,
        }),
      }),
    );
    if (
      result['reconciliationStatus'] !== 'PENDING_MAIN_RECONCILIATION' ||
      typeof result['replayed'] !== 'boolean'
    )
      throw new AuthorReviewError('unconfirmed');
    const receipt = this.parseEvent(result['event'], submission.artifactId, owner);
    if (
      [
        'artifactId',
        'artifactVersion',
        'owningTicket',
        'sourceSha256',
        'decision',
        'comment',
        'idempotencyKey',
        'supersedesEventId',
      ].some(
        (key) =>
          receipt[key as keyof AuthorReviewReceipt] !==
          submission[key as keyof AuthorReviewSubmission],
      )
    )
      throw new AuthorReviewError('unconfirmed');
    return receipt;
  }
  private async request(path: string, owner: string, options: RequestInit = {}): Promise<unknown> {
    if (this.owner() !== owner) throw new AuthorReviewError('unauthorized');
    try {
      const response = await this.transport(path, {
        ...options,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (this.owner() !== owner) throw new AuthorReviewError('unauthorized');
      if (response.status === 401) throw new AuthorReviewError('unauthorized');
      if (response.status === 403) throw new AuthorReviewError('forbidden');
      let body: Data;
      try {
        body = object(await response.json());
      } catch {
        throw new AuthorReviewError('unconfirmed');
      }
      if (!response.ok) {
        if (response.status === 401) throw new AuthorReviewError('unauthorized');
        if (response.status === 403) throw new AuthorReviewError('forbidden');
        if (body['code'] === 'REVIEW_ARTIFACT_STALE')
          throw new AuthorReviewError('version-changed');
        if (body['code'] === 'REVIEW_IDEMPOTENCY_CONFLICT')
          throw new AuthorReviewError('idempotency-conflict');
        if (body['code'] === 'REVIEW_SUPERSESSION_CONFLICT')
          throw new AuthorReviewError('supersession-conflict');
        if (response.status === 422) throw new AuthorReviewError('invalid');
        if (response.status === 404) throw new AuthorReviewError('not-found');
        throw new AuthorReviewError('unconfirmed');
      }
      return body['data'];
    } catch (error) {
      if (error instanceof AuthorReviewError) throw error;
      throw new AuthorReviewError('unconfirmed');
    }
  }
}
