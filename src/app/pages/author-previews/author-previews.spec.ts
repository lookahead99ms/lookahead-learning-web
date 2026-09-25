import { Component, signal } from '@angular/core';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthorPreviewsPage } from './author-previews';
import { ArchitectureDiagramViewer } from './architecture-diagram-viewer';
import { AuthorReviewPacket } from './author-review-packet';
import {
  AUTHOR_PREVIEWS_BASE_URL,
  parsePreviewInventory,
  parsePreviewCollections,
  previewManifestUrl,
} from './preview-inventory';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { StudyPlanAccount } from '../study-plan/study-plan-account';
import { PlatformThemeService } from '../../core/platform-theme';
import { routes } from '../../app.routes';
import { authorGuard } from '../../core/author-access';
import { environment as publicEnvironment } from '../../../environments/environment.production';
import { environment as demoEnvironment } from '../../../environments/environment.demo';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}

@Component({ selector: 'app-author-review-packet', template: 'Study Plan review entry' })
class ReviewPacketStub {}

@Component({
  selector: 'app-architecture-diagram-viewer',
  template: 'Expanded diagram',
  inputs: ['documentHref', 'diagramId'],
})
class DiagramViewerStub {}

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
    for (const path of ['author/previews', 'author/architecture', 'author/api', 'delivery-plan'])
      expect(routes.find((route) => route.path === path)?.canActivate).toContain(authorGuard);
  });
});

describe('Author previews page', () => {
  const account = signal<any>({ authorPreview: true });
  const sessionExpired = signal(false);
  const selectedTheme = signal<'light' | 'dark'>('light');
  beforeEach(() => {
    account.set({ authorPreview: true });
    sessionExpired.set(false);
    selectedTheme.set('light');
    TestBed.configureTestingModule({
      imports: [AuthorPreviewsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AUTHOR_PREVIEWS_BASE_URL, useValue: base },
        { provide: StudyPlanAccount, useValue: { account, sessionExpired } },
        { provide: PlatformThemeService, useValue: { selected: selectedTheme } },
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      ],
    }).overrideComponent(AuthorPreviewsPage, {
      remove: { imports: [PlatformHeader, AuthorReviewPacket] },
      add: { imports: [HeaderStub, ReviewPacketStub] },
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

  it('destroys the viewer and disconnects its source when author capability is revoked', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { architectureOnly: true } } },
    });
    TestBed.overrideComponent(AuthorPreviewsPage, {
      remove: { imports: [ArchitectureDiagramViewer] },
      add: { imports: [DiagramViewerStub] },
    });
    const port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      start: vi.fn(),
      close: vi.fn(),
    };
    vi.stubGlobal(
      'MessageChannel',
      class {
        port1 = port;
        port2 = {};
      },
    );
    try {
      const fixture = await loaded();
      const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
      vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
      frame.dispatchEvent(new Event('load'));
      port.onmessage!({
        data: { type: 'lookahead:architecture:expand', version: 1, diagramId: 'content-model' },
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-architecture-diagram-viewer')).not.toBeNull();
      account.set({ authorPreview: false });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-architecture-diagram-viewer')).toBeNull();
      expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
      expect(port.close).toHaveBeenCalled();
      port.onmessage!({
        data: { type: 'lookahead:architecture:expand', version: 1, diagramId: 'repo-flow' },
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-architecture-diagram-viewer')).toBeNull();
      fixture.destroy();
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
  it('loads grouped previews with explicit new-tab links and filters by title/category', async () => {
    const fixture = await loaded();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.preview-group')).toHaveLength(2);
    expect(root.querySelector('.architecture-layout')).toBeNull();
    expect(root.querySelector('.open-document')).toBeNull();
    expect(root.textContent).toContain('Mock Interview');
    const link = root.querySelector('.preview-links a')!;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('aria-label')).toContain('opens in a new tab');
    for (const card of root.querySelectorAll('.featured-preview')) {
      expect(card.querySelectorAll('[data-card-primary]')).toHaveLength(1);
      const primary = card.querySelector('[data-card-primary]')!;
      expect(primary.getAttribute('href')).toContain('theme=light');
      const dark = card.querySelector('a[href*="theme=dark"]')!;
      expect(dark.hasAttribute('data-card-primary')).toBe(false);
      expect(primary.contains(dark)).toBe(false);
    }
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
    fixture.nativeElement.querySelector('.state-panel button').click();
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
    const outlineLink = fixture.nativeElement.querySelector(
      '.heading-outline a',
    ) as HTMLAnchorElement;
    expect(outlineLink.getAttribute('href')).toBe('/author/architecture#platform-panel');
    expect(outlineLink.getAttribute('target')).toBeNull();
    expect(fixture.nativeElement.classList.contains('architecture-page')).toBe(true);
    const fullPageLink = fixture.nativeElement.querySelector(
      '.reference-toolbar a',
    ) as HTMLAnchorElement;
    expect(fullPageLink.getAttribute('href')).toBe(
      '/bff/author/previews/architecture/index.html?theme=light',
    );
    expect(fullPageLink.getAttribute('target')).toBe('_blank');
    expect(fullPageLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(fullPageLink.textContent).toContain('new tab');

    selectedTheme.set('dark');
    fixture.detectChanges();
    expect(frame.getAttribute('src')).toBe(
      '/bff/author/previews/architecture/index.html?theme=dark&layout=shared',
    );
    expect(fullPageLink.getAttribute('href')).toBe(
      '/bff/author/previews/architecture/index.html?theme=dark',
    );

    account.set({ authorPreview: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('.reference-toolbar')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Author access required');
  });
  it('uses only a bounded height report from the active Architecture frame', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { architectureOnly: true } } },
    });
    const fixture = await loaded();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    const report = (origin: string, source: MessageEventSource | null, height: number) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin,
          source,
          data: { type: 'lookahead:architecture:height', version: 1, height },
        }),
      );
      fixture.detectChanges();
    };
    report('null', window, 2400);
    report('https://outside.test', frame.contentWindow, 2400);
    report('null', frame.contentWindow, 150_000);
    expect(frame.style.height).toBe('');
    report('null', frame.contentWindow, 2400.2);
    expect(frame.style.height).toBe('2401px');
    sessionExpired.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });
  it('preserves canonical query parameters and anchors and hides document actions on expiry', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { architectureOnly: true } } },
    });
    const fixture = create();
    const architecture = entry('architecture', 'Architecture');
    architecture.links[0].href = '../architecture/index.html?layout=standalone&view=model#schema';
    TestBed.inject(HttpTestingController)
      .expectOne(manifestUrl)
      .flush(manifest([architecture]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.reference-toolbar a').getAttribute('href')).toBe(
      '/bff/author/previews/architecture/index.html?layout=standalone&view=model&theme=light#schema',
    );
    expect(fixture.nativeElement.querySelector('iframe').getAttribute('src')).toBe(
      '/bff/author/previews/architecture/index.html?layout=shared&view=model&theme=light#schema',
    );
    sessionExpired.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('.reference-toolbar')).toBeNull();
  });
  it('embeds the real manifest URL in shared layout while keeping the full-page document standalone', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { architectureOnly: true } } },
    });
    const fixture = create();
    const architecture = entry('architecture', 'Architecture');
    architecture.links[0].href = '../architecture/index.html';
    TestBed.inject(HttpTestingController)
      .expectOne(manifestUrl)
      .flush(manifest([architecture]));
    await fixture.whenStable();
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('iframe');
    const link = fixture.nativeElement.querySelector('.reference-toolbar a');
    expect(frame.getAttribute('src')).toBe(
      '/bff/author/previews/architecture/index.html?theme=light&layout=shared',
    );
    expect(link.getAttribute('href')).toBe(
      '/bff/author/previews/architecture/index.html?theme=light',
    );
    selectedTheme.set('dark');
    fixture.detectChanges();
    expect(frame.getAttribute('src')).toBe(
      '/bff/author/previews/architecture/index.html?theme=dark&layout=shared',
    );
    expect(link.getAttribute('href')).toBe(
      '/bff/author/previews/architecture/index.html?theme=dark',
    );
  });
});
