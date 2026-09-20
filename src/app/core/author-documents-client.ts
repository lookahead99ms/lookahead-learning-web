import { InjectionToken } from '@angular/core';

/** Normalized metadata from the capability-protected private publication. */
export interface AuthorDocument {
  id: string;
  title: string;
  version: string;
  sourceSha256?: string;
  htmlSha256: string;
  href: string;
  owningTicket: string;
  scope: string;
  decisionDependencies: string[];
  remainingDecisions: string[];
  evidence: { label: string; href: string }[];
  sections: { title: string; anchor: string }[];
  references: { label: string; href: string }[];
}

export type AuthorDocumentFailure =
  'unauthorized' | 'forbidden' | 'unpublished' | 'unavailable' | 'invalid';
export class AuthorDocumentError extends Error {
  constructor(readonly kind: AuthorDocumentFailure) {
    super(kind);
  }
}
export interface AuthorDocumentsClient {
  load(id: string): Promise<AuthorDocument>;
}
export const AUTHOR_DOCUMENTS_CLIENT = new InjectionToken<AuthorDocumentsClient>(
  'Private author documents',
);
