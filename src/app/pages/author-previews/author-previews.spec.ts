import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthorPreviewsPage } from './author-previews';
import {
  AUTHOR_PREVIEWS_BASE_URL,
  parsePreviewInventory,
  parsePreviewCollections,
  previewManifestUrl,
} from './preview-inventory';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { routes } from '../../app.routes';
import { authorGuard } from '../../core/author-access';
import { environment as publicEnvironment } from '../../../environments/environment.production';
import { environment as demoEnvironment } from '../../../environments/environment.demo';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

const base = '/bff/author/previews/';
const manifestUrl = `${base}preview-directory/manifest.json`;
const entry = (id = 'mock', group = 'Interview practice') => ({
  id,
  group,
  title: id === 'mock' ? 'Mock Interview' : 'Platform architecture',
  status: 'Proposed',
  note: 'Preserved review',
  available: true,
  links: [
    { label: 'Light', href: `../${id}/index.html?theme=light&layout=shared` },
    { label: 'Dark', href: `../${id}/index.html?theme=dark&layout=shared` },
  ],
});
const manifest = (entries: unknown[] = [entry(), entry('architecture', 'Architecture')]) => ({
  schemaVersion: 'author-previews/v1',
  urlBase: 'manifest-directory',
  entries,
  collections: entries.map((raw, index) => {
    const item = raw as ReturnType<typeof entry>;
    return {
      id: item.id,
      title: item.group,
      order: index + 1,
      summary: 'Design history',
      featuredReason: 'Current review focus',
      featuredEntryId: item.id,
      historyEntryIds: [] as string[],
      chronology: { basis: 'curated-review-order', note: 'Order is independent of approval.' },
    };
  }),
});

describe('private preview inventory contract', () => {
  it('orders curated collections and rejects lost or duplicate history membership', () => {
    const data = manifest();
    data.collections[0].order = 10;
    const entries = parsePreviewInventory(data, base);
    expect(parsePreviewCollections(data, entries).map((collection) => collection.id)).toEqual([
      'architecture',
      'mock',
    ]);
    data.collections[0].historyEntryIds = ['architecture'];
    expect(() => parsePreviewCollections(data, entries)).toThrow();
    data.collections = [];
    expect(() => parsePreviewCollections(data, entries)).toThrow();
  });
  it('rebases private-root links and preserves already gateway-prefixed links', () => {
    for (const href of [
      '/focus-studio/index.html?theme=dark#workspace',
      '/bff/author/previews/focus-studio/index.html?theme=dark#workspace',
    ]) {
      const item = entry();
      item.links = [{ label: 'Open', href }];
      expect(parsePreviewInventory(manifest([item]), base)[0].links[0].href).toBe(
        '/bff/author/previews/focus-studio/index.html?theme=dark#workspace',
      );
    }
  });
  it('preserves sibling paths and query strings under the configured mount', () => {
    expect(parsePreviewInventory(manifest(), base)[0].links[0].href).toBe(
      '/bff/author/previews/mock/index.html?theme=light&layout=shared',
    );
  });
  it('rejects external, script, traversal, and encoded traversal URLs', () => {
    for (const href of [
      'https://other.test/a',
      '//other.test/a',
      'javascript:alert(1)',
      '../../account',
      '../%252e%252e/account',
      '../%2faccount',
    ]) {
      const item = entry();
      item.links = [{ label: 'Open', href }];
      expect(() => parsePreviewInventory(manifest([item]), base)).toThrow();
    }
  });
  it('rejects incompatible schemas, malformed entries, and duplicate identifiers', () => {
    expect(() => parsePreviewInventory({}, base)).toThrow();
    expect(() => parsePreviewInventory(manifest([entry(), entry()]), base)).toThrow();
    expect(() => parsePreviewInventory(manifest([{ ...entry(), title: null }]), base)).toThrow();
  });
  it('keeps unavailable entries visible without actionable links', () => {
    expect(
      parsePreviewInventory(manifest([{ ...entry(), available: false }]), base)[0].links,
    ).toEqual([]);
  });
  it('disables invalid configuration and public/demo previews', () => {
    for (const value of ['', '//other.test/', 'https://other.test/', '/a/../', '/a/?q=x'])
      expect(previewManifestUrl(value)).toBeNull();
    expect(publicEnvironment.authorPreviewsBaseUrl).toBe('');
    expect(demoEnvironment.authorPreviewsBaseUrl).toBe('');
  });
  it('uses the server-capability guard on both author routes', () => {
    for (const path of ['author/previews', 'author/architecture', 'delivery-plan'])
      expect(routes.find((route) => route.path === path)?.canActivate).toContain(authorGuard);
  });
});

describe('Author previews page', () => {
  const account = signal<any>({ authorPreview: true });
  const sessionExpired = signal(false);
  beforeEach(() => {
    account.set({ authorPreview: true });
    sessionExpired.set(false);
    TestBed.configureTestingModule({
      imports: [AuthorPreviewsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AUTHOR_PREVIEWS_BASE_URL, useValue: base },
        { provide: StudyPlanAccount, useValue: { account, sessionExpired } },
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      ],
    }).overrideComponent(AuthorPreviewsPage, {
      remove: { imports: [PlatformHeader] },
      add: { imports: [HeaderStub] },
    });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  function create() {
    const fixture = TestBed.createComponent(AuthorPreviewsPage);
    fixture.detectChanges();
    return fixture;
  }
  async function loaded() {
    const fixture = create();
    TestBed.inject(HttpTestingController).expectOne(manifestUrl).flush(manifest());
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('loads grouped previews with explicit new-tab links and filters by title/category', async () => {
    const fixture = await loaded();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.preview-group')).toHaveLength(2);
    expect(root.textContent).toContain('Mock Interview');
    const link = root.querySelector('.preview-links a')!;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('aria-label')).toContain('opens in a new tab');
    const search = root.querySelector('input')!;
    search.value = 'missing';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.textContent).toContain('No previews match your search.');
    search.value = '';
    search.dispatchEvent(new Event('input'));
    const select = root.querySelector('select')!;
    select.value = 'Architecture';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelectorAll('.preview-group')).toHaveLength(1);
    expect(root.textContent).not.toContain('Mock Interview');
  });
  it('shows one featured card per collection and compact collapsed version history', async () => {
    const fixture = create();
    const data = manifest([entry(), entry('prior')]);
    data.collections = [{ ...data.collections[0], historyEntryIds: ['prior'] }];
    TestBed.inject(HttpTestingController).expectOne(manifestUrl).flush(data);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.featured-preview')).toHaveLength(1);
    expect(root.querySelectorAll('.collection-history li')).toHaveLength(1);
    expect((root.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    expect(root.textContent).toContain('Featured means current review focus');
    expect(root.textContent).toContain('Selection: Proposed');
    const search = root.querySelector('input')!;
    search.value = 'Platform architecture';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect((root.querySelector('details') as HTMLDetailsElement).open).toBe(true);
  });
  it('shows a retry state after outage and recovers', async () => {
    const fixture = create();
    const http = TestBed.inject(HttpTestingController);
    expect(fixture.nativeElement.textContent).toContain('Loading author previews');
    http.expectOne(manifestUrl).flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Previews are unavailable',
    );
    fixture.nativeElement.querySelector('button').click();
    http.expectOne(manifestUrl).flush(manifest());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Mock Interview');
  });
  it('does not request the service when disabled', () => {
    TestBed.overrideProvider(AUTHOR_PREVIEWS_BASE_URL, { useValue: '' });
    expect(create().nativeElement.textContent).toContain('Previews are not connected');
    TestBed.inject(HttpTestingController).expectNone(manifestUrl);
  });
  it('does not load or render private previews without the server capability', () => {
    account.set({ displayName: 'Author', username: 'author' });
    expect(create().nativeElement.textContent).toContain('Author access required');
    TestBed.inject(HttpTestingController).expectNone(manifestUrl);
  });
  it('removes displayed inventory after session expiry', async () => {
    const fixture = await loaded();
    sessionExpired.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Author access required');
    expect(fixture.nativeElement.querySelector('.preview-links')).toBeNull();
  });
  it('keeps Architecture separate while using the same configured inventory', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { architectureOnly: true } } },
    });
    const fixture = await loaded();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Architecture');
    expect(fixture.nativeElement.textContent).not.toContain('Mock Interview');
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    const frame = fixture.nativeElement.querySelector(
      'iframe[title="Canonical content model and platform architecture"]',
    ) as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toBe(
      '/bff/author/previews/architecture/index.html?theme=light&layout=shared',
    );
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  });
});
