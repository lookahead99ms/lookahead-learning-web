import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { AuthorOperationsPage } from './author-operations';
import {
  AUTHOR_DOCUMENTS_CLIENT,
  AuthorDocument,
  AuthorDocumentError,
} from '../../core/author-documents-client';
import { PlatformHeader } from '../../core/platform-header/platform-header';
import { PlatformThemeService } from '../../core/platform-theme';
import { StudyPlanAccount } from '../study-plan/study-plan-account';

@Component({ selector: 'app-platform-header', template: '' })
class HeaderStub {}
const reference: AuthorDocument = {
  id: 'operations-reference',
  title: 'Operations reference',
  version: 'operations/test.1',
  sourceSha256: 'b'.repeat(64),
  htmlSha256: 'a'.repeat(64),
  href: `/bff/author/previews/preview-directory/author-documents/operations-reference/${'a'.repeat(64)}/index.html`,
  owningTicket: 'DLV-922',
  scope: 'Read-only reference',
  decisionDependencies: [],
  remainingDecisions: [],
  evidence: [{ label: 'Evidence', href: 'https://example.test/evidence' }],
  sections: [{ title: 'Repositories & Runbooks', anchor: 'repositories-runbooks' }],
  references: [
    { label: 'Repository', href: 'https://github.com/example/repository' },
    {
      label: 'Startup runbook',
      href: 'https://github.com/example/infra/blob/main/docs/startup.md',
    },
  ],  downloads: [],
};
describe('Operations author view', () => {
  const account = signal<any>({ accountId: 'author', authorPreview: true });
  const sessionExpired = signal(false),
    theme = signal<'light' | 'dark'>('light');
  let load: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    account.set({ accountId: 'author', authorPreview: true });
    sessionExpired.set(false);
    theme.set('light');
    load = vi.fn().mockResolvedValue(reference);
    TestBed.configureTestingModule({
      imports: [AuthorOperationsPage],
      providers: [
        provideRouter([]),
        { provide: AUTHOR_DOCUMENTS_CLIENT, useValue: { load } },
        { provide: StudyPlanAccount, useValue: { account, sessionExpired } },
        { provide: PlatformThemeService, useValue: { selected: theme } },
      ],
    }).overrideComponent(AuthorOperationsPage, {
      remove: { imports: [PlatformHeader] },
      add: { imports: [HeaderStub] },
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(AuthorOperationsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('embeds the immutable reference in a scripts-only sandbox and follows theme changes', async () => {
    const fixture = await create();
    const frame = fixture.nativeElement.querySelector('iframe');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('src')).toBe(reference.href + '?theme=light&layout=shared');
    theme.set('dark');
    fixture.detectChanges();
    expect(frame.getAttribute('src')).toBe(reference.href + '?theme=dark&layout=shared');
    expect(fixture.nativeElement.textContent).toContain('not live service health');
    expect(fixture.nativeElement.textContent).toContain('Published reference');
    expect(fixture.nativeElement.textContent).toContain('Version operations/test.1');
    expect(
      fixture.nativeElement.querySelector('.reference-actions').getAttribute('aria-label'),
    ).toBe('Operations reference actions');
    expect(fixture.nativeElement.querySelector('.reference-toolbar a').textContent).toContain(
      'Open full reference (new tab)',
    );
    expect(fixture.nativeElement.querySelectorAll('.workspace-content button')).toHaveLength(0);
  });
  it('loads the dedicated Local setup document through the same protected reader', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { authorDocument: 'local-development' } } },
    });
    const localReference = {
      ...reference,
      id: 'local-development',
      href: reference.href.replaceAll('operations-reference', 'local-development'),
    };
    load.mockResolvedValue(localReference);
    const fixture = await create();
    expect(load).toHaveBeenCalledWith('local-development');
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Local setup & development');
    expect(fixture.nativeElement.querySelector('iframe').getAttribute('src')).toBe(
      localReference.href + '?theme=light&layout=shared',
    );
    expect(
      fixture.nativeElement.querySelector(
        'a[href="/admin/local-development"][aria-current="page"]',
      ),
    ).not.toBeNull();
  });
  it('opens with a hero and keeps the published version in a footer below the document', async () => {
    const fixture = await create();
    const content = fixture.nativeElement.querySelector('.workspace-content') as HTMLElement;
    const hero = content.querySelector('app-author-doc-hero') as HTMLElement;
    expect(content.firstElementChild).toBe(hero);
    expect(hero.querySelector('h2')!.textContent).toBe('Operations');
    expect(hero.querySelector('.hero-group')!.textContent).toContain('Run and release');
    expect(hero.textContent).toContain('For administrators');
    const footer = content.querySelector('footer.reference-toolbar') as HTMLElement;
    expect(footer.textContent).toContain('Version operations/test.1');
    const panel = content.querySelector('.document-panel')!;
    expect(panel.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(content.lastElementChild).toBe(footer);
  });
  it('names inline guide links plainly outside Operations', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { authorDocument: 'local-development' } } },
    });
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('#runbooks-heading').textContent).toBe(
      'Links in this guide',
    );
  });
  it('shows no setup card outside Local setup', async () => {
    load.mockResolvedValue({
      ...reference,
      downloads: [{ label: 'Script', filename: 'lookahead_setup.py', href: '/x', bytes: 10 }],
    });
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('.setup-card')).toBeNull();
  });
  it('offers the setup script in a collapsed card on Local setup', async () => {
    const setup = {
      label: 'One-command setup script',
      filename: 'lookahead_setup.py',
      href: `/bff/author/previews/preview-directory/author-documents/downloads/${'c'.repeat(64)}/lookahead_setup.py`,
      bytes: 22_000,
    };
    load.mockResolvedValue({ ...reference, downloads: [setup] });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { data: { authorDocument: 'local-development' } } },
    });
    const fixture = await create();
    const card = fixture.nativeElement.querySelector('details.setup-card') as HTMLDetailsElement;
    expect(card.open).toBe(false);
    expect(card.querySelector('summary')!.textContent).toContain('One-command setup');
    const link = card.querySelector('a.setup-download') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(setup.href);
    expect(link.getAttribute('download')).toBe('lookahead_setup.py');
    expect(link.textContent).toContain('21 KB');
    expect(
      [...fixture.nativeElement.querySelectorAll('.heading-outline a')][0].getAttribute('href'),
    ).toBe('/admin/local-development#one-command-setup');
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      const copy = card.querySelector('.setup-commands button') as HTMLButtonElement;
      copy.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(writeText).toHaveBeenCalledWith('python3 lookahead_setup.py');
      expect(copy.textContent!.trim()).toBe('Copied');
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
  it('keeps a section deep link on the protected parent page', async () => {
    const previousUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/admin/operations#repositories-runbooks');
    try {
      const fixture = await create();
      expect(fixture.nativeElement.querySelector('iframe').getAttribute('src')).toBe(
        reference.href + '?theme=light&layout=shared',
      );
      const link = fixture.nativeElement.querySelector('.heading-outline a');
      expect(link.getAttribute('href')).toBe('/admin/operations#repositories-runbooks');
      expect(link.getAttribute('target')).toBeNull();
    } finally {
      history.replaceState(null, '', previousUrl);
    }
  });
  it('sends an outline selection to the embedded document without opening another window', async () => {
    const previousUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', '/admin/operations');
    try {
      const fixture = await create();
      const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
      const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
      const link = fixture.nativeElement.querySelector('.heading-outline a') as HTMLAnchorElement;
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'lookahead:author-document:anchor-request',
          version: 1,
          documentId: 'operations-reference',
          anchor: 'repositories-runbooks',
        },
        '*',
      );
    } finally {
      history.replaceState(null, '', previousUrl);
    }
  });
  it('keeps external references in the trusted parent with explicit new-tab labels', async () => {
    const fixture = await create();
    const link = fixture.nativeElement.querySelector('a[href$="/docs/startup.md"]');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toContain('(new tab)');
    expect(fixture.nativeElement.querySelector('#runbooks-links')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="https://github.com/example/repository"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#runbooks-heading').textContent).toBe(
      'Source repositories and runbooks',
    );
    expect(fixture.nativeElement.querySelector('#supporting-references')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="/admin/operations#runbooks-links"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="/admin/operations#supporting-references"]'),
    ).toBeNull();
  });
  it('sizes the shared document from a validated sandbox message', async () => {
    const fixture = await create();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    const sendHeight = (
      origin: string,
      data: unknown,
      source: MessageEventSource | null = frame.contentWindow,
    ) => {
      window.dispatchEvent(new MessageEvent('message', { origin, source, data }));
      fixture.detectChanges();
    };
    const height = {
      type: 'lookahead:author-document:height',
      version: 1,
      documentId: 'operations-reference',
      height: 1824.2,
    };
    sendHeight('null', height, window);
    sendHeight('https://example.test', height);
    sendHeight('null', { ...height, documentId: 'other-document' });
    sendHeight('null', { ...height, height: 60_001 });
    expect(frame.style.height).toBe('');
    sendHeight('null', height);
    expect(frame.style.height).toBe('1825px');
    sendHeight('null', { ...height, height: 41_066 });
    expect(frame.style.height).toBe('41066px');
    account.set({ accountId: 'author', authorPreview: false });
    fixture.detectChanges();
    sendHeight('null', { ...height, height: 2500 });
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });
  it.each(['expired', 'revoked'] as const)(
    'removes the iframe and links when access is %s',
    async (reason) => {
      const fixture = await create();
      if (reason === 'expired') sessionExpired.set(true);
      else account.set({ accountId: 'author', authorPreview: false });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
      expect(fixture.nativeElement.querySelector('a[target="_blank"]')).toBeNull();
    },
  );
  it('does not fetch private documents for learners', async () => {
    account.set({ accountId: 'learner', authorPreview: false });
    const fixture = await create();
    expect(load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Admin access required');
  });
  it('shows missing publication honestly and retries only on request', async () => {
    load.mockRejectedValueOnce(new AuthorDocumentError('unpublished'));
    const fixture = await create();
    expect(load).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('not published yet');
    fixture.nativeElement.querySelector('.workspace-content button').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('iframe')).not.toBeNull();
  });
});
