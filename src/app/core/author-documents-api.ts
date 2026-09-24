import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { AUTHOR_PREVIEWS_BASE_URL } from './author-preview-config';
import {
  AuthorDocument,
  AuthorDocumentError,
  AuthorDocumentsClient,
} from './author-documents-client';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';

const publicationRoot = '/bff/author/previews/preview-directory/author-documents/';
const documentIds = new Set(['study-plan-review', 'operations-reference', 'local-development']);
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthorDocumentError('invalid');
  return value as RecordValue;
}
function text(value: unknown, maximum = 300): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new AuthorDocumentError('invalid');
  return value;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new AuthorDocumentError('invalid');
  return value;
}
function hash(value: unknown): string {
  const result = text(value, 64);
  if (!/^[a-f0-9]{64}$/.test(result)) throw new AuthorDocumentError('invalid');
  return result;
}
function reference(value: unknown): { label: string; href: string } {
  const item = object(value),
    label = text(item['label']),
    href = text(item['href'], 2000);
  if (/[\\\s]/.test(href)) throw new AuthorDocumentError('invalid');
  const url = new URL(href, 'https://private.invalid');
  const privateLink =
    href.startsWith('/bff/author/previews/') &&
    !href.includes('%') &&
    !href.split('/').includes('..') &&
    url.origin === 'https://private.invalid';
  const externalLink = href.startsWith('https://') && !url.username && !url.password;
  if (!privateLink && !externalLink) throw new AuthorDocumentError('invalid');
  return { label, href };
}

/** Strictly constrain executable documents to the immutable protected publication. */
export function parseAuthorDocument(value: unknown, id: string): AuthorDocument {
  if (!documentIds.has(id)) throw new AuthorDocumentError('invalid');
  const manifest = object(value);
  if (manifest['schemaVersion'] !== 1) throw new AuthorDocumentError('invalid');
  const entries = list(manifest['documents'], 20).map(object);
  if (new Set(entries.map((entry) => entry['id'])).size !== entries.length)
    throw new AuthorDocumentError('invalid');
  const entry = entries.find((entry) => entry['id'] === id);
  if (!entry) throw new AuthorDocumentError('unpublished');
  const content = object(entry['content']),
    provenance = object(entry['provenance']);
  const themes = object(content['themes']);
  if (
    content['format'] !== 'html' ||
    themes['queryParameter'] !== 'theme' ||
    !list(themes['supported'], 3).includes('light') ||
    !list(themes['supported'], 3).includes('dark')
  )
    throw new AuthorDocumentError('invalid');
  text(provenance['repository']);
  text(provenance['sourcePath'], 1000);
  text(provenance['sourceRevision']);
  const htmlSha256 = hash(content['sha256']);
  const sourceSha256 =
    provenance['sourceSha256'] === undefined ? undefined : hash(provenance['sourceSha256']);
  const relativeHref = `${id}/${htmlSha256}/index.html`;
  const href = text(content['href'], 2000);
  if (href !== publicationRoot + relativeHref) throw new AuthorDocumentError('invalid');
  const sections = list(entry['sections'], 20).map((value) => {
    const item = object(value),
      fragment = text(item['fragment'], 101),
      anchor = fragment.slice(1);
    if (!fragment.startsWith('#')) throw new AuthorDocumentError('invalid');
    text(item['id']);
    if (!/^[a-z][a-z0-9-]*$/.test(anchor)) throw new AuthorDocumentError('invalid');
    return { title: text(item['title']), anchor };
  });
  if (new Set(sections.map((section) => section.anchor)).size !== sections.length)
    throw new AuthorDocumentError('invalid');
  return {
    id,
    htmlSha256,
    sourceSha256,
    href: publicationRoot + relativeHref,
    title: text(entry['title']),
    version: text(entry['version']),
    owningTicket: text(entry['ticket'], 40),
    scope: list(entry['scope'], 30)
      .map((value) => text(value, 1000))
      .join(' · '),
    decisionDependencies: list(entry['decisionDependencies'], 30).map((value) => text(value, 40)),
    remainingDecisions: list(entry['remainingDecisions'] ?? [], 30).map((value) =>
      text(value, 2000),
    ),
    evidence: list(entry['evidence'] ?? [], 50).map(reference),
    sections,
    references: list(entry['links'], 50).map(reference),
  };
}

@Injectable({ providedIn: 'root' })
export class AuthorDocumentsApi implements AuthorDocumentsClient {
  private readonly http = inject(HttpClient);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly base = inject(AUTHOR_PREVIEWS_BASE_URL);
  async load(id: string): Promise<AuthorDocument> {
    if (this.base !== '/bff/author/previews/') throw new AuthorDocumentError('unpublished');
    const account = this.accounts.account();
    if (!account || this.accounts.sessionExpired()) throw new AuthorDocumentError('unauthorized');
    if (account.authorPreview !== true) throw new AuthorDocumentError('forbidden');
    if (!documentIds.has(id)) throw new AuthorDocumentError('invalid');
    try {
      const value = await firstValueFrom(
        this.http.get<unknown>(publicationRoot + 'manifest.json').pipe(timeout(10000)),
      );
      if (
        this.accounts.sessionExpired() ||
        this.accounts.account()?.accountId !== account.accountId
      )
        throw new AuthorDocumentError('unauthorized');
      if (this.accounts.account()?.authorPreview !== true)
        throw new AuthorDocumentError('forbidden');
      return parseAuthorDocument(value, id);
    } catch (error) {
      if (error instanceof AuthorDocumentError) throw error;
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401) throw new AuthorDocumentError('unauthorized');
        if (error.status === 403) throw new AuthorDocumentError('forbidden');
        if (error.status === 404) throw new AuthorDocumentError('unpublished');
      }
      throw new AuthorDocumentError('unavailable');
    }
  }
}
