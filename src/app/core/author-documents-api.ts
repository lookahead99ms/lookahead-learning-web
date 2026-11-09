import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { AUTHOR_PREVIEWS_BASE_URL } from './author-preview-config';
import { PROTECTED_CONTENT } from '../content/content-delivery';
import {
  AuthorDocument,
  AuthorDocumentDownload,
  AuthorDocumentError,
  AuthorDocumentsClient,
} from './author-documents-client';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';

/** Local workstation: the preview directory stage served by the local previews proxy. */
export const localPublicationRoot = '/bff/author/previews/preview-directory/author-documents/';
/** Protected (cloud) build: the staff section of the Content publication Domain serves. */
export const staffPublicationRoot = '/content/staff/author-documents/';
const publicationRoots = [localPublicationRoot, staffPublicationRoot];
const documentIds = new Set([
  'study-plan-review',
  'operations-reference',
  'local-development',
  'reviewer-guide',
  'screen-names',
  'access-checks',
  'authentication',
  'authentication-walkthrough',
  'contracts',
  'aws-deployment',
  'sign-in-flows',
  'dynamodb-migration',
  'aws-dev-certificates',
  'aws-environment-journey',
  'aws-dev-plan',
  'aws-dev-decisions',
  'aws-dev-operations',
  'aws-dev-permissions',
  'aws-dev-budget',
  'aws-dev-status',
  'aws-dev-setup',
  'aws-dev-workflow',
  'aws-dev-procedures',
  'aws-dev-records',
  'aws-candidate-design',
  'aws-candidate-files',
  'aws-candidate-commands',
  'aws-candidate-updates',
  'runtime-stores',
  'release-gates',
  'production-support',
  'support-runbooks',
]);
// The published procedures reference has 35 sections; keep an explicit navigation limit.
const maxDocumentSections = 48;
// Dated status/record headings produce anchors up to 120 characters.
const maxSectionAnchorLength = 200;
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
    (href.startsWith('/bff/author/previews/') || href.startsWith('/content/staff/')) &&
    !href.includes('%') &&
    !href.split('/').includes('..') &&
    url.origin === 'https://private.invalid';
  const externalLink = href.startsWith('https://') && !url.username && !url.password;
  if (!privateLink && !externalLink) throw new AuthorDocumentError('invalid');
  return { label, href };
}

/**
 * The manifest is one file published under both roots, so a stored href may name either known
 * root; the returned href always uses the root this build reads from.
 */
function publishedHref(stored: unknown, relative: string, root: string): string {
  const href = text(stored, 2000);
  if (!publicationRoots.some((candidate) => href === candidate + relative))
    throw new AuthorDocumentError('invalid');
  return root + relative;
}

function download(value: unknown, root: string): AuthorDocumentDownload {
  const item = object(value),
    filename = text(item['filename'], 100),
    sha256 = hash(item['sha256']),
    bytes = item['bytes'];
  if (!/^[A-Za-z0-9_.-]+$/.test(filename) || filename.startsWith('.'))
    throw new AuthorDocumentError('invalid');
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 5_000_000)
    throw new AuthorDocumentError('invalid');
  const href = publishedHref(item['href'], `downloads/${sha256}/${filename}`, root);
  return { label: text(item['label']), filename, href, bytes };
}

/** Strictly constrain executable documents to the immutable protected publication. */
export function parseAuthorDocument(
  value: unknown,
  id: string,
  root: string = localPublicationRoot,
): AuthorDocument {
  if (!publicationRoots.includes(root)) throw new AuthorDocumentError('invalid');
  if (!documentIds.has(id)) throw new AuthorDocumentError('invalid');
  const manifest = object(value);
  if (manifest['schemaVersion'] !== 1) throw new AuthorDocumentError('invalid');
  // Sub-pages split long references, so the manifest holds more documents than the menu groups.
  const entries = list(manifest['documents'], 40).map(object);
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
  const href = publishedHref(content['href'], `${id}/${htmlSha256}/index.html`, root);
  const sections = list(entry['sections'], maxDocumentSections).map((value) => {
    const item = object(value),
      fragment = text(item['fragment'], maxSectionAnchorLength + 1),
      anchor = fragment.slice(1);
    if (!fragment.startsWith('#')) throw new AuthorDocumentError('invalid');
    text(item['id']);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(anchor)) throw new AuthorDocumentError('invalid');
    return { title: text(item['title']), anchor };
  });
  if (new Set(sections.map((section) => section.anchor)).size !== sections.length)
    throw new AuthorDocumentError('invalid');
  return {
    id,
    htmlSha256,
    sourceSha256,
    href,
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
    downloads: list(entry['downloads'] ?? [], 10).map((item) => download(item, root)),
  };
}

@Injectable({ providedIn: 'root' })
export class AuthorDocumentsApi implements AuthorDocumentsClient {
  private readonly http = inject(HttpClient);
  private readonly accounts = inject(StudyPlanAccount);
  private readonly base = inject(AUTHOR_PREVIEWS_BASE_URL);
  private readonly protectedContent = inject(PROTECTED_CONTENT);
  /** The protected build reads the Content publication; local builds need the previews proxy. */
  private get root(): string {
    return this.protectedContent ? staffPublicationRoot : localPublicationRoot;
  }
  async load(id: string): Promise<AuthorDocument> {
    if (!this.protectedContent && this.base !== '/bff/author/previews/')
      throw new AuthorDocumentError('unpublished');
    const account = this.accounts.account();
    if (!account || this.accounts.sessionExpired()) throw new AuthorDocumentError('unauthorized');
    if (!(account.permissions?.previewDocuments ?? account.authorPreview === true)) throw new AuthorDocumentError('forbidden');
    if (!documentIds.has(id)) throw new AuthorDocumentError('invalid');
    try {
      const value = await firstValueFrom(
        this.http.get<unknown>(this.root + 'manifest.json').pipe(timeout(10000)),
      );
      if (
        this.accounts.sessionExpired() ||
        this.accounts.account()?.accountId !== account.accountId
      )
        throw new AuthorDocumentError('unauthorized');
      if (!(this.accounts.account()?.permissions?.previewDocuments ?? this.accounts.account()?.authorPreview === true))
        throw new AuthorDocumentError('forbidden');
      return parseAuthorDocument(value, id, this.root);
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
