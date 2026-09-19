import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthorApiPage } from './author-api';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PlatformThemeService } from '../../core/platform-theme';
import { AUTHOR_PREVIEWS_BASE_URL, apiReferencePreviewUrl } from '../../core/author-preview-config';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

const base = '/bff/author/previews/';
const manifestUrl = `${base}preview-directory/manifest.json`;
const reference = () => ({
  id: 'api-reference',
  group: 'Platform reference',
  title: 'Backend API reference',
  status: 'Reference',
  available: true,
  links: [
    { label: 'Open reference', href: 'api/index.html' },
    { label: 'Identity OpenAPI (JSON)', href: 'api/identity.openapi.json' },
    { label: 'Identity HTTP examples', href: 'api/http/identity.http' },
    { label: 'Credential guidance (Markdown)', href: 'api/credentials.md' },
  ],
});
const manifest = (entries: unknown[] = [reference()]) => ({
  schemaVersion: 'author-previews/v1',
  urlBase: 'manifest-directory',
  entries,
});

describe('Author API reference', () => {
  const account = signal<any>({ authorPreview: true });
  const sessionExpired = signal(false);
  const theme = signal<'light' | 'dark'>('light');

  beforeEach(() => {
    account.set({ authorPreview: true });
    sessionExpired.set(false);
    theme.set('light');
    TestBed.configureTestingModule({
      imports: [AuthorApiPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AUTHOR_PREVIEWS_BASE_URL, useValue: base },
        { provide: StudyPlanAccount, useValue: { account, sessionExpired } },
        { provide: PlatformThemeService, useValue: { selected: theme } },
      ],
    }).overrideComponent(AuthorApiPage, {
      remove: { imports: [PlatformHeader] },
      add: { imports: [HeaderStub] },
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function create() {
    const fixture = TestBed.createComponent(AuthorApiPage);
    fixture.detectChanges();
    return fixture;
  }

  async function loaded(entries: unknown[] = [reference()]) {
    const fixture = create();
    TestBed.inject(HttpTestingController).expectOne(manifestUrl).flush(manifest(entries));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('embeds only the fixed private document with scripts-only sandbox and current theme', async () => {
    const fixture = await loaded();
    const root: HTMLElement = fixture.nativeElement;
    const frame = root.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe(
      `${base}preview-directory/api/index.html?theme=light&layout=shared`,
    );
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.title).toBe('Backend API reference');
    const fullPage = root.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(fullPage.getAttribute('href')).toBe(
      `${base}preview-directory/api/index.html?theme=light`,
    );
    expect(fullPage.rel).toBe('noopener noreferrer');
    expect(fullPage.textContent).toContain('(new tab)');
    theme.set('dark');
    fixture.detectChanges();
    expect(frame.getAttribute('src')).toBe(
      `${base}preview-directory/api/index.html?theme=dark&layout=shared`,
    );
  });

  it('keeps downloads in the authenticated parent and within the API directory', async () => {
    const entry = reference();
    entry.links.push(
      { label: 'Other preview', href: 'architecture/data.openapi.json' },
      { label: 'HTML page', href: 'api/other.html' },
      { label: 'Query link', href: 'api/identity.openapi.json?outside=1' },
      { label: 'Unpublished notes', href: 'api/private-notes.md' },
      { label: 'Different environment', href: 'api/postman/secrets.postman_environment.json' },
    );
    const fixture = await loaded([entry]);
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('a[download]'),
    ) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `${base}preview-directory/api/identity.openapi.json`,
      `${base}preview-directory/api/http/identity.http`,
      `${base}preview-directory/api/credentials.md`,
    ]);
    expect(fixture.nativeElement.querySelector('details').open).toBe(false);
  });

  it('groups the complete client kit and preserves all existing reference downloads', async () => {
    const entry = reference();
    entry.links.push(
      { label: 'Gateway contract', href: 'api/gateway-bff.openapi.json' },
      { label: 'Gateway HTTP inventory', href: 'api/http/gateway-bff.http' },
      { label: 'Domain contract', href: 'api/domain-api.openapi.json' },
      { label: 'Domain HTTP inventory', href: 'api/http/domain-api.http' },
      { label: 'README', href: 'api/README.md' },
      { label: 'Planned staff model', href: 'api/access-model.md' },
      { label: 'Local testing guide', href: 'api/local-testing.md' },
      { label: 'JetBrains workflow', href: 'api/http/local-jetbrains.http' },
      { label: 'VS Code workflow', href: 'api/http/local-vscode.http' },
      { label: 'Postman environment', href: 'api/postman/local.postman_environment.json' },
      {
        label: 'Identity Postman collection',
        href: 'api/postman/identity.postman_collection.json',
      },
      {
        label: 'Gateway Postman collection',
        href: 'api/postman/gateway-bff.postman_collection.json',
      },
      {
        label: 'Domain Postman collection',
        href: 'api/postman/domain-api.postman_collection.json',
      },
    );
    const fixture = await loaded([entry]);
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('a[download]')).toHaveLength(16);
    expect(
      [...root.querySelectorAll('.download-groups section')].map((section) => ({
        title: section.querySelector('h2')?.textContent?.trim(),
        count: section.querySelectorAll('a[download]').length,
      })),
    ).toEqual([
      { title: 'Start testing', count: 4 },
      { title: 'Identity', count: 3 },
      { title: 'Gateway BFF', count: 3 },
      { title: 'Domain API', count: 3 },
      { title: 'Reference', count: 3 },
    ]);
    const environment = root.querySelector<HTMLAnchorElement>(
      'a[href$="/postman/local.postman_environment.json"]',
    )!;
    expect(environment.getAttribute('href')).toBe(
      `${base}preview-directory/api/postman/local.postman_environment.json`,
    );
    expect(environment.hasAttribute('download')).toBe(true);
    account.set({ authorPreview: false });
    fixture.detectChanges();
    expect(root.querySelector('.download-groups')).toBeNull();
  });

  it.each(['revoked', 'expired'] as const)(
    'removes the iframe and downloads when access is %s',
    async (reason) => {
      const fixture = await loaded();
      if (reason === 'revoked') account.set({ authorPreview: false });
      else sessionExpired.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
      expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Author access required');
    },
  );

  it('does not fetch private inventory for a learner or anonymous account', () => {
    for (const value of [null, { authorPreview: false }]) {
      account.set(value);
      const fixture = create();
      TestBed.inject(HttpTestingController).expectNone(manifestUrl);
      expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
      fixture.destroy();
    }
  });

  it('discards a pending inventory response after access expires', async () => {
    const fixture = create();
    const request = TestBed.inject(HttpTestingController).expectOne(manifestUrl);
    sessionExpired.set(true);
    request.flush(manifest());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
  });

  it('keeps disconnected configurations inactive', () => {
    TestBed.overrideProvider(AUTHOR_PREVIEWS_BASE_URL, { useValue: '' });
    const fixture = create();
    TestBed.inject(HttpTestingController).expectNone(manifestUrl);
    expect(fixture.nativeElement.textContent).toContain('API reference is not connected');
    for (const value of ['', '//outside.test/', 'https://outside.test/', '/unsafe/../'])
      expect(apiReferencePreviewUrl(value)).toBeNull();
  });

  it.each(['absent', 'unavailable', 'wrong-document'] as const)(
    'shows an honest unavailable state for %s inventory',
    async (reason) => {
      const entry = reference();
      if (reason === 'unavailable') entry.available = false;
      if (reason === 'wrong-document') entry.links[0].href = 'architecture/index.html';
      const fixture = await loaded(reason === 'absent' ? [] : [entry]);
      expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('API reference is not available yet');
    },
  );

  it('rejects an external document and supports retry after a failed inventory request', async () => {
    const entry = reference();
    entry.links[0].href = 'https://outside.test/index.html';
    const fixture = await loaded([entry]);
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    fixture.nativeElement.querySelector('.state-panel button').click();
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne(manifestUrl)
      .flush(null, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    fixture.nativeElement.querySelector('.state-panel button').click();
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(manifestUrl).flush(manifest());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).not.toBeNull();
  });
});
