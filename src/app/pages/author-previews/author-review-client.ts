import { InjectionToken } from '@angular/core';

/** UI-facing interface. A Domain adapter must supply durable recording/readback. */
export type AuthorReviewDecision = 'approve' | 'decline' | 'need-more';
export interface AuthorReviewSubmission {
  artifactId: string;
  artifactVersion: string;
  owningTicket: string;
  sourceSha256: string;
  decision: AuthorReviewDecision;
  comment: string;
  idempotencyKey: string;
  supersedesEventId: string | null;
}
export interface AuthorReviewReceipt extends AuthorReviewSubmission {
  recordId: string;
  recordedAt: string;
  recordedBy: string;
}
export type AuthorReviewBinding = Pick<
  AuthorReviewSubmission,
  'artifactId' | 'artifactVersion' | 'owningTicket' | 'sourceSha256'
>;
export interface AuthorReviewHistory {
  entries: AuthorReviewReceipt[];
  nextCursor: string | null;
}
export class AuthorReviewError extends Error {
  constructor(
    readonly kind:
      | 'invalid'
      | 'unconfirmed'
      | 'unauthorized'
      | 'forbidden'
      | 'version-changed'
      | 'idempotency-conflict'
      | 'supersession-conflict'
      | 'not-found',
  ) {
    super(kind);
  }
}
export interface AuthorReviewClient {
  load(binding: AuthorReviewBinding, cursor?: string): Promise<AuthorReviewHistory>;
  record(submission: AuthorReviewSubmission): Promise<AuthorReviewReceipt>;
}
// No default provider: unavailable recording is explicit until the Domain contract is connected.
export const AUTHOR_REVIEW_CLIENT = new InjectionToken<AuthorReviewClient>(
  'Durable author review recording',
);
