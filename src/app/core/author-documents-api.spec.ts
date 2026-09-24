import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthorDocumentsApi, parseAuthorDocument } from './author-documents-api';
import { AUTHOR_PREVIEWS_BASE_URL } from './author-preview-config';
import { StudyPlanAccount } from '../pages/study-plan/study-plan-account';

const sha = 'a'.repeat(64);
const root = '/bff/author/previews/preview-directory/author-documents/';
function manifest() {
  return {
    schemaVersion: 1,
    documents: [
      {
        id: 'operations-reference',
        title: 'Operations reference',
        version: 'operations/test.1',
        ticket: 'DLV-922',
        scope: ['Read-only local reference'],
        decisionDependencies: [],
        provenance: {
          repository: 'private-content',
          sourcePath: 'docs/operations.md',
          sourceRevision: 'test-revision',
          sourceSha256: 'b'.repeat(64),
        },
        content: {
          format: 'html',
          sha256: sha,
          href: `${root}operations-reference/${sha}/index.html`,
          themes: { supported: ['light', 'dark'], queryParameter: 'theme', default: 'system' },
        },
        sections: [{ id: 'repositories', title: 'Repositories', fragment: '#repositories' }],
        links: [{ label: 'Repository', href: 'https://example.test/repository', external: true }],
      },
    ],
  };
}

describe('Private author-document boundary', () => {
  it('resolves only the immutable protected document path', () => {
    const value = parseAuthorDocument(manifest(), 'operations-reference');
    expect(value.href).toBe(`${root}operations-reference/${sha}/index.html`);
    const absolute = manifest();
    absolute.documents[0].content.href = value.href;
    expect(parseAuthorDocument(absolute, 'operations-reference')).toEqual(value);
  });
  it('accepts the immutable Local setup document in the protected manifest', () => {
    const publication = manifest();
    publication.documents[0].id = 'local-development';
    publication.documents[0].content.href = `${root}local-development/${sha}/index.html`;
    expect(parseAuthorDocument(publication, 'local-development').href).toBe(
      `${root}local-development/${sha}/index.html`,
    );
  });
  it.each([
    'https://outside.test/index.html',
    '//outside.test/index.html',
    `operations-reference/${sha}/../index.html`,
    `operations-reference/${sha}/%2e%2e/index.html`,
    `operations-reference/${sha}/index.html?redirect=outside`,
    `study-plan-review/${sha}/index.html`,
    `operations-reference/${'c'.repeat(64)}/index.html`,
  ])('rejects an executable document outside its exact ID/hash path: %s', (href) => {
    const value = manifest();
    value.documents[0].content.href = href;
    expect(() => parseAuthorDocument(value, 'operations-reference')).toThrow();
  });
  it.each([
    'javascript:alert(1)',
    '//outside.test',
    '/api/v1/account',
    '/bff/author/previews/../private',
    'https://user:pass@example.test',
  ])('rejects unsafe reference links: %s', (href) => {
    const value = manifest();
    value.documents[0].links[0].href = href;
    expect(() => parseAuthorDocument(value, 'operations-reference')).toThrow();
  });
  it('rejects duplicate IDs, invalid hashes and missing versions', () => {
    const duplicate = manifest();
    duplicate.documents.push(duplicate.documents[0]);
    expect(() => parseAuthorDocument(duplicate, 'operations-reference')).toThrow();
    const malformed = manifest();
    malformed.documents[0].content.sha256 = 'unversioned';
    expect(() => parseAuthorDocument(malformed, 'operations-reference')).toThrow();
    const missing = manifest();
    missing.documents[0].version = '';
    expect(() => parseAuthorDocument(missing, 'operations-reference')).toThrow();
  });
});

describe('Author-document transport', () => {
  const account = signal<any>({ accountId: 'author', authorPreview: true });
  const sessionExpired = signal(false);
  beforeEach(() => {
    account.set({ accountId: 'author', authorPreview: true });
    sessionExpired.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StudyPlanAccount, useValue: { account, sessionExpired } },
        { provide: AUTHOR_PREVIEWS_BASE_URL, useValue: '/bff/author/previews/' },
      ],
    });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('loads only after server-provided author access', async () => {
    const result = TestBed.inject(AuthorDocumentsApi).load('operations-reference');
    const request = TestBed.inject(HttpTestingController).expectOne(root + 'manifest.json');
    expect(request.request.method).toBe('GET');
    request.flush(manifest());
    expect((await result).id).toBe('operations-reference');
  });
  it.each([null, { accountId: 'learner', authorPreview: false }])(
    'makes no request without capability: %s',
    async (value) => {
      account.set(value);
      await expect(
        TestBed.inject(AuthorDocumentsApi).load('operations-reference'),
      ).rejects.toBeDefined();
      TestBed.inject(HttpTestingController).expectNone(root + 'manifest.json');
    },
  );
  it('makes no request from the public demo', async () => {
    TestBed.overrideProvider(AUTHOR_PREVIEWS_BASE_URL, { useValue: '' });
    await expect(
      TestBed.inject(AuthorDocumentsApi).load('operations-reference'),
    ).rejects.toMatchObject({
      kind: 'unpublished',
    });
    TestBed.inject(HttpTestingController).expectNone(root + 'manifest.json');
  });
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'unpublished'],
    [503, 'unavailable'],
  ])('preserves HTTP %s meaning', async (status, kind) => {
    const result = TestBed.inject(AuthorDocumentsApi).load('operations-reference');
    TestBed.inject(HttpTestingController)
      .expectOne(root + 'manifest.json')
      .flush(null, { status: status as number, statusText: 'Failure' });
    await expect(result).rejects.toMatchObject({ kind });
  });
  it('discards an in-flight response when the account changes', async () => {
    const result = TestBed.inject(AuthorDocumentsApi).load('operations-reference');
    account.set({ accountId: 'another', authorPreview: true });
    TestBed.inject(HttpTestingController)
      .expectOne(root + 'manifest.json')
      .flush(manifest());
    await expect(result).rejects.toMatchObject({ kind: 'unauthorized' });
  });
});
